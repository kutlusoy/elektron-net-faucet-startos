import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  wallet_name: Value.text({
    name: 'Wallet Name (override)',
    description:
      'Leave blank to use the wallet configured in the admin panel. Must be a descriptor wallet.',
    required: false,
    default: null,
    placeholder: '',
    maxLength: 64,
  }),
  descriptor: Value.text({
    name: 'Descriptor',
    description:
      'Output descriptor including the checksum, e.g. wpkh(xprv…/84h/0h/0h/0/*)#abcd1234. Run listdescriptors true on the source wallet to grab the descriptor with its checksum.',
    required: true,
    default: '',
    placeholder: 'wpkh(xprv.../84h/0h/0h/0/*)#abcd1234',
    masked: true,
  }),
  range_end: Value.number({
    name: 'Range End',
    description:
      'How many addresses to derive for ranged descriptors (0..N). For a non-ranged descriptor (no /* in the path) leave this at 0.',
    required: true,
    default: 1000,
    min: 0,
    max: 1000000,
    integer: true,
  }),
  timestamp_now: Value.toggle({
    name: 'Treat as new key (skip historical rescan)',
    description:
      'If enabled, sets timestamp="now" so elektrond does NOT rescan history for this descriptor. Disable to rescan from genesis — slower, but picks up historical UTXOs.',
    default: false,
  }),
})

// Imports an output descriptor into the active *descriptor* wallet — the
// modern equivalent of a wallet.dat import. Use the source wallet's
// listdescriptors RPC to get the descriptor string (incl. private keys
// and #checksum).
export const walletImportDescriptor = sdk.Action.withInput(
  'wallet-import-descriptor',

  async () => ({
    name: 'Import Descriptor',
    description:
      'Import a wallet descriptor (modern equivalent of importing wallet.dat) into the elektrond descriptor wallet.',
    warning:
      'Importing a private descriptor copies the spending keys to this node. The source wallet keeps the same keys — do not run both at once or you risk double-spending.',
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({
    wallet_name: null,
    descriptor: '',
    range_end: 1000,
    timestamp_now: false,
  }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-import-descriptor',
    )
    try {
      const w = input.wallet_name?.trim() || undefined
      const desc = input.descriptor.trim()
      const entry: Record<string, unknown> = {
        desc,
        active: true,
        timestamp: input.timestamp_now ? 'now' : 0,
      }
      if (input.range_end > 0) entry.range = [0, input.range_end]

      const out = await rpcExec(sub, 'importdescriptors', [[entry]], w)
      if (out.exitCode !== 0) {
        throw new Error(out.stderr.trim() || 'importdescriptors failed')
      }
      return {
        version: '1' as const,
        title: 'Descriptor imported',
        message:
          `importdescriptors RPC result:\n\n${out.stdout}\n\n` +
          `Next: run Wallet Info to confirm balance, then paste a receiving address into Sender Address in the admin panel.`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
