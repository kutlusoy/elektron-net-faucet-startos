import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

// Imports a complete Bitcoin Core / elektrond wallet from the textual
// output of `dumpwallet` (one WIF key per line). This is the closest
// supported equivalent of "uploading wallet.dat": wallet.dat is a binary
// Berkeley-DB file inside elektrond's data directory, the faucet
// container is sandboxed away from that volume, and elektrond does not
// expose any RPC that accepts a wallet file over the wire. dumpwallet
// converts the same key material to a text format that elektrond can
// re-import via importprivkey, which IS available over RPC.
//
// After importing the keys, the action optionally calls getnewaddress to
// generate a fresh receive address from the imported wallet and writes
// it straight into the faucet's `settings.sender_addr` row, so the
// public donation card and payouts pick it up without the operator
// having to copy/paste anything into /admin.php.

const inputSpec = InputSpec.of({
  wallet_name: Value.text({
    name: 'Wallet Name (override)',
    description:
      'Leave blank to use the wallet configured in the faucet admin panel. Must be a LEGACY (non-descriptor) wallet — use "Create Wallet" with Descriptor Wallet turned OFF to produce one.',
    required: false,
    default: null,
    placeholder: '',
    maxLength: 64,
  }),
  dump: Value.textarea({
    name: 'dumpwallet output',
    description:
      'Paste the ENTIRE text content of the file produced by `dumpwallet "<path>"` on your source node. Bitcoin Core debug console (Window → Console): type `dumpwallet "C:\\\\Users\\\\you\\\\faucet-dump.txt"`, open that .txt file, copy everything (Ctrl+A, Ctrl+C), paste it here. Comment lines (starting with #) are skipped automatically; you do not need to clean the file up.',
    required: true,
    default: null,
    placeholder: '# Wallet dump created by Bitcoin v…\nKx… 2024-… label=… # addr=be1q…',
    minRows: 6,
    maxRows: 12,
  }),
  label: Value.text({
    name: 'Default Label',
    description:
      'Label applied to imported addresses when the dumpwallet line does not carry its own.',
    required: false,
    default: 'imported',
    placeholder: 'imported',
    maxLength: 64,
  }),
  rescan: Value.toggle({
    name: 'Rescan the blockchain',
    description:
      'Have elektrond rescan history for these keys to recover existing UTXOs. Elektron Net prunes blocks older than ~137 days, so anything mined before that cutoff cannot be recovered.',
    default: true,
  }),
  set_sender_addr: Value.toggle({
    name: 'Update Sender Address after import',
    description:
      'Calls getnewaddress on the imported wallet and writes the result into the faucet admin Settings → Sender Address (used as payout source AND donation receive address on the homepage).',
    default: true,
  }),
})

export const walletImportDump = sdk.Action.withInput(
  'wallet-import-dump',

  async () => ({
    name: 'Import Wallet from dumpwallet',
    description:
      'Restore a complete wallet onto the elektrond node from a dumpwallet text dump. Imports every WIF private key in the dump and (optionally) writes a fresh receive address into the faucet Sender Address setting.',
    warning:
      'All keys are sent in cleartext to the elektrond RPC and are persisted in the elektrond wallet on this device. The dumpwallet file on your source node still works — do NOT run both wallets simultaneously or you risk double-spending.',
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({
    wallet_name: null,
    dump: '',
    label: 'imported',
    rescan: true,
    set_sender_addr: true,
  }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-import-dump',
    )
    try {
      const w = input.wallet_name?.trim() || undefined

      const parsed = parseDumpwallet(input.dump ?? '', input.label ?? 'imported')
      if (parsed.length === 0) {
        throw new Error(
          'No WIF keys found in the pasted dump. Expected one key per line in the format produced by `dumpwallet`.',
        )
      }

      let imported = 0
      const failures: string[] = []
      for (const entry of parsed) {
        // The rescan flag is expensive — only enable it on the LAST key,
        // otherwise elektrond would rescan from scratch once per key.
        const isLast = imported + failures.length === parsed.length - 1
        const rescan = input.rescan && isLast
        const out = await rpcExec(
          sub,
          'importprivkey',
          [entry.wif, entry.label, rescan],
          w,
        )
        if (out.exitCode === 0) {
          imported += 1
        } else {
          // Re-importing a key that is already in the wallet is a no-op,
          // not a failure. Treat the corresponding RPC error code (-4
          // "key already there") as success.
          const stderr = out.stderr.trim()
          if (/already in the wallet|-4/.test(stderr)) {
            imported += 1
          } else {
            failures.push(`${entry.wif.slice(0, 8)}…: ${stderr.slice(0, 200)}`)
          }
        }
      }

      let senderLine = ''
      if (input.set_sender_addr) {
        const addrOut = await rpcExec(sub, 'getnewaddress', [input.label ?? 'faucet'], w)
        if (addrOut.exitCode !== 0) {
          senderLine =
            `\n⚠️  Could not derive a fresh address: ${addrOut.stderr.trim()}.\n` +
            `   Open admin.php and paste an address into Sender Address manually.`
        } else {
          const addr = addrOut.stdout.replace(/^"|"$/g, '').trim()
          await writeSenderAddr(sub, addr)
          senderLine =
            `\n✓ Sender Address set to:\n  ${addr}\n` +
            `   (faucet admin Settings → Sender Address; donation card on the homepage now points here.)`
        }
      }

      const failureBlock =
        failures.length === 0
          ? ''
          : `\n\n⚠️  ${failures.length} key(s) failed to import:\n` +
            failures.map((f) => '  - ' + f).join('\n')

      return {
        version: '1' as const,
        title: 'Wallet dump imported',
        message:
          `Imported ${imported}/${parsed.length} keys into ` +
          `${w ? `wallet "${w}"` : 'the configured wallet'}.\n` +
          (input.rescan
            ? `Blockchain rescan was performed on the last key — UTXOs newer than the\n` +
              `~137-day prune horizon are now visible. Run Wallet Info to confirm balance.\n`
            : `Rescan was skipped — only NEW deposits to these keys will be tracked.\n`) +
          senderLine +
          failureBlock,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)

// dumpwallet format (one address per line):
//   <WIF> <ISO-timestamp> label=<label> # addr=<addr> hdkeypath=<path>
// Lines starting with # and blank lines are skipped. Some Bitcoin Core
// versions omit `label=` for the master key line; we fall back to the
// caller-supplied default.
function parseDumpwallet(
  raw: string,
  defaultLabel: string,
): { wif: string; label: string }[] {
  const out: { wif: string; label: string }[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    // WIF keys for mainnet-style networks are 51 or 52 chars of Base58
    // starting with K/L (compressed) or 5 (uncompressed). Network-prefix
    // variants exist (e.g. some altcoins) so we permit a broader leading
    // character set and rely on the RPC to reject anything bogus.
    const m = line.match(/^([1-9A-HJ-NP-Za-km-z]{50,53})\b(.*)$/)
    if (!m) continue
    const wif = m[1]
    const rest = m[2]
    const labelMatch = rest.match(/label=("([^"]*)"|(\S+))/)
    const label = labelMatch
      ? (labelMatch[2] ?? labelMatch[3] ?? defaultLabel)
      : defaultLabel
    out.push({ wif, label })
  }
  return out
}

// Upserts the faucet `sender_addr` setting via the same MariaDB the
// admin panel writes to. Mirrors the shape of wallet-rpc-helper but
// targets the local DB instead of the elektrond RPC.
async function writeSenderAddr(sub: any, addr: string): Promise<void> {
  const php = `
    $cfg = require '/etc/elektron-faucet/config.php';
    $pdo = new PDO(
        sprintf("mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4",
            $cfg["db_host"], $cfg["db_port"], $cfg["db_name"]),
        $cfg["db_user"], $cfg["db_pass"],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $addr = getenv("SENDER_ADDR") ?: "";
    if ($addr === "") { fwrite(STDERR, "empty address\\n"); exit(1); }
    $stmt = $pdo->prepare(
        "INSERT INTO settings (\`key\`, \`value\`) VALUES ('sender_addr', ?)
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)"
    );
    $stmt->execute([$addr]);
  `
  const out = await sub.exec(['php', '-r', php], {
    env: { SENDER_ADDR: addr },
  })
  if ((out.exitCode as number | null) !== 0) {
    throw new Error(
      `Failed to write sender_addr to MariaDB: ${(out.stderr ?? '').toString().trim()}`,
    )
  }
}
