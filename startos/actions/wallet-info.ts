import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

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
  new_address: Value.toggle({
    name: 'Also fetch a fresh receiving address',
    description:
      'Calls getnewaddress so you can paste the result directly into Sender Address.',
    default: true,
  }),
})

export const walletInfo = sdk.Action.withInput(
  'wallet-info',

  async () => ({
    name: 'Wallet Info',
    description:
      'Show the current wallet info, balance and (optionally) a fresh receiving address from the elektrond node.',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({ wallet_name: null, new_address: true }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-info',
    )
    try {
      const w = input.wallet_name?.trim() || undefined

      const info = await rpcExec(sub, 'getwalletinfo', [], w)
      if (info.exitCode !== 0) {
        throw new Error(info.stderr.trim() || 'getwalletinfo failed')
      }
      const bal = await rpcExec(sub, 'getbalance', [], w)
      const addrOut = input.new_address
        ? await rpcExec(sub, 'getnewaddress', ['faucet'], w)
        : null

      const sections = [
        `--- getwalletinfo ---\n${info.stdout}`,
        `--- getbalance ---\n${bal.stdout || '(no balance)'}`,
      ]
      if (addrOut) {
        const addr = addrOut.stdout.replace(/^"|"$/g, '').trim()
        sections.push(
          `--- getnewaddress ("faucet" label) ---\n${addr}\n\n` +
            `Paste the address above into the faucet admin panel\n` +
            `(Settings → Sender Address) to use it for payouts and to\n` +
            `unlock the public donation card.`,
        )
      }

      return {
        version: '1' as const,
        title: 'Wallet status',
        message: sections.join('\n\n'),
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
