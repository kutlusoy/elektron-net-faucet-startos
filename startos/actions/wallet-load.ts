import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  wallet_name: Value.text({
    name: 'Wallet Name',
    description:
      'Name of an existing wallet on the elektrond node to load. elektrond does not auto-load wallets between restarts.',
    required: true,
    default: 'faucet',
    placeholder: 'faucet',
    maxLength: 64,
  }),
})

export const walletLoad = sdk.Action.withInput(
  'wallet-load',

  async () => ({
    name: 'Load Wallet on Elektron Net',
    description:
      'Call loadwallet on the configured elektrond RPC. Use after a node restart or if Wallet Info reports "Wallet file not specified".',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({ wallet_name: 'faucet' }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-load',
    )
    try {
      const out = await rpcExec(sub, 'loadwallet', [input.wallet_name, true])
      if (out.exitCode !== 0) {
        throw new Error(out.stderr.trim() || 'loadwallet failed')
      }
      return {
        version: '1' as const,
        title: 'Wallet loaded',
        message: `loadwallet RPC succeeded:\n\n${out.stdout}`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
