import { sdk } from './sdk'

// The faucet uses an Elektron Net wallet RPC to send payouts. The StartOS-
// native node lives at https://github.com/kutlusoy/elektron-net-startos
// (package id `elektrond`). Declared optional so the faucet can also point
// at a remote node, but if elektrond *is* installed locally StartOS will
// enforce that it is running.
export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  return {
    elektrond: {
      kind: 'running',
      versionRange: '>=0',
      healthChecks: [],
    },
  }
})
