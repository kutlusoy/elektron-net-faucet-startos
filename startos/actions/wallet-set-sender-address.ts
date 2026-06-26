import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

// One-click "give me a fresh address and wire it up" action: call
// getnewaddress on the configured wallet, then write the result into the
// faucet's `settings.sender_addr` row. This is the action the operator
// runs after either creating a fresh wallet, importing keys, or wanting
// to rotate the public donation address.

const inputSpec = InputSpec.of({
  wallet_name: Value.text({
    name: 'Wallet Name (override)',
    description:
      'Leave blank to use the wallet configured in the admin panel (Settings → Wallet Name).',
    required: false,
    default: null,
    placeholder: '',
    maxLength: 64,
  }),
  label: Value.text({
    name: 'Address Label',
    description:
      'Label the elektrond wallet records for this address. Useful for accounting in listtransactions output.',
    required: false,
    default: 'faucet',
    placeholder: 'faucet',
    maxLength: 64,
  }),
  address_type: Value.select({
    name: 'Address Type',
    description:
      'Output script type. Native SegWit (bech32) is the modern default; only switch if you have a specific reason.',
    default: 'bech32',
    values: {
      bech32: 'bech32 (native SegWit, be1q…) — recommended',
      'p2sh-segwit': 'p2sh-segwit (wrapped SegWit, 3…)',
      legacy: 'legacy (P2PKH, 1…)',
    },
  }),
})

export const walletSetSenderAddress = sdk.Action.withInput(
  'wallet-set-sender-address',

  async () => ({
    name: 'Generate Address & Set as Sender',
    description:
      'Generate a fresh receive address on the configured elektrond wallet and write it straight into the faucet admin Sender Address setting. Use this after creating or importing a wallet, or to rotate the donation address.',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({
    wallet_name: null,
    label: 'faucet',
    address_type: 'bech32' as const,
  }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-set-sender-address',
    )
    try {
      const w = input.wallet_name?.trim() || undefined
      const label = input.label?.trim() || 'faucet'
      const addrType = input.address_type || 'bech32'

      const addrOut = await rpcExec(
        sub,
        'getnewaddress',
        [label, addrType],
        w,
      )
      if (addrOut.exitCode !== 0) {
        throw new Error(
          addrOut.stderr.trim() ||
            'getnewaddress failed. Make sure the wallet exists and is loaded — try Load Wallet first.',
        )
      }
      const addr = addrOut.stdout.replace(/^"|"$/g, '').trim()
      if (addr === '') {
        throw new Error(
          'getnewaddress returned an empty result. The wallet is loaded but does not seem to be able to derive addresses (locked / blank descriptor wallet?).',
        )
      }

      const writeOut = await sub.exec(['php', '-r', UPSERT_SENDER_ADDR], {
        env: { SENDER_ADDR: addr },
      })
      if ((writeOut.exitCode as number | null) !== 0) {
        throw new Error(
          `Generated ${addr} but failed to write it to MariaDB:\n${(writeOut.stderr ?? '').toString().trim()}`,
        )
      }

      return {
        version: '1' as const,
        title: 'Sender Address updated',
        message:
          `Generated a new receive address and saved it as the faucet Sender Address.\n\n` +
          `Address: ${addr}\n` +
          `Label:   ${label}\n` +
          `Type:    ${addrType}\n\n` +
          `The faucet admin panel (Settings → Sender Address) and the public donation card\n` +
          `on the homepage will pick this up immediately — no restart required.`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)

const UPSERT_SENDER_ADDR = `
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
