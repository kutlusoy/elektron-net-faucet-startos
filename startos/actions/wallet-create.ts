import { sdk } from '../sdk'
import { IMAGE, sharedMounts, rpcExec } from './wallet-rpc-helper'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  wallet_name: Value.text({
    name: 'Wallet Name',
    description:
      'Name for the new wallet on the elektrond node. Will be reachable at the wallet endpoint /wallet/<name>.',
    required: true,
    default: 'faucet',
    placeholder: 'faucet',
    maxLength: 64,
  }),
  passphrase: Value.text({
    name: 'Encryption Passphrase',
    description:
      'Optional. If set, the wallet is created encrypted — you must run "Unlock Wallet" before payouts can be sent. Leave blank for an unencrypted hot wallet.',
    required: false,
    default: null,
    placeholder: '(blank = unencrypted)',
    masked: true,
  }),
  descriptors: Value.toggle({
    name: 'Descriptor Wallet (recommended)',
    description:
      'Use the modern descriptor wallet format. Disable only if you need to import a legacy wallet.dat dump.',
    default: true,
  }),
})

// Calls `createwallet` on the elektrond RPC. The faucet admin panel must
// already have valid RPC Host/User/Password saved in Settings — those are
// the credentials this action uses.
export const walletCreate = sdk.Action.withInput(
  'wallet-create',

  async () => ({
    name: 'Create Wallet on Elektron Net',
    description:
      'Create a fresh wallet on the configured elektrond RPC node. After creation, run "Wallet Info" to grab a receiving address and paste it into Sender Address in the admin panel.',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({ wallet_name: 'faucet', passphrase: null, descriptors: true }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      IMAGE,
      sharedMounts(),
      'wallet-create',
    )
    try {
      // createwallet signature: (wallet_name, disable_private_keys=false,
      // blank=false, passphrase="", avoid_reuse=false, descriptors=true,
      // load_on_startup=null)
      const params = [
        input.wallet_name,
        false,
        false,
        input.passphrase ?? '',
        false,
        input.descriptors,
        true,
      ]
      const out = await rpcExec(sub, 'createwallet', params)
      if (out.exitCode !== 0) {
        throw new Error(out.stderr.trim() || 'createwallet failed')
      }
      return {
        version: '1' as const,
        title: 'Wallet created',
        message:
          `createwallet RPC succeeded:\n\n${out.stdout}\n\n` +
          `Next: open Wallet Info to fetch a receiving address, then paste it into\n` +
          `Sender Address in the faucet admin Settings.`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
