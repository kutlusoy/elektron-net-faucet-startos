import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  wallet_name: Value.text({
    name: 'Wallet Name (override)',
    description:
      'Leave blank to use the wallet configured in the admin panel.',
    required: false,
    default: null,
    placeholder: '',
    maxLength: 64,
  }),
  privkey: Value.text({
    name: 'Private Key (WIF)',
    description:
      'WIF-encoded private key (starts with K, L or 5). Only works on legacy (non-descriptor) wallets. Use the Import Descriptor action for descriptor wallets.',
    required: true,
    default: '',
    placeholder: 'KxFC1jmwwCoACiCAWZ3eXa96mBM6tb3TYzGmf6YwgdGWZgawvrtJ',
    masked: true,
  }),
  label: Value.text({
    name: 'Label',
    description: 'Optional label for the imported address.',
    required: false,
    default: 'imported',
    placeholder: 'imported',
    maxLength: 64,
  }),
  rescan: Value.toggle({
    name: 'Rescan the blockchain',
    description:
      'Rescan to pick up historical UTXOs for this key. On a freshly synced node this can take a while; safe to disable if you only want to use the key for new payouts.',
    default: true,
  }),
})

// Re-importing a private key into a fresh wallet on elektrond is the
// closest practical equivalent to "importing wallet.dat" — wallet.dat
// itself is a file inside elektrond's data dir and cannot be transferred
// over RPC. Dump the keys from the source wallet (`bitcoin-wallet dump`
// or `dumpwallet` RPC), then feed the WIF keys to this action one at a
// time.
export const walletImportKey = sdk.Action.withInput(
  'wallet-import-privkey',

  async () => ({
    name: 'Import Private Key (WIF)',
    description:
      'Import a single WIF private key into the currently configured elektrond wallet. Use this to migrate funds from an existing wallet without sharing wallet.dat.',
    warning:
      'The key is sent in cleartext to the elektrond RPC. It is also stored permanently in the elektrond wallet. Only use keys you intend to keep on this node.',
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({
    wallet_name: null,
    privkey: '',
    label: 'imported',
    rescan: true,
  }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-import-privkey',
    )
    try {
      const w = input.wallet_name?.trim() || undefined
      const out = await rpcExec(
        sub,
        'importprivkey',
        [input.privkey, input.label ?? '', input.rescan],
        w,
      )
      if (out.exitCode !== 0) {
        throw new Error(out.stderr.trim() || 'importprivkey failed')
      }
      return {
        version: '1' as const,
        title: 'Private key imported',
        message:
          `importprivkey RPC succeeded. The address derived from this key is now part of the wallet.\n\n` +
          `Next: run Wallet Info to see the address + balance, then paste the address into\n` +
          `Sender Address in the faucet admin panel.\n\n` +
          `RPC output: ${out.stdout || '(empty)'}`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
