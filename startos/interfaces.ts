import { sdk } from './sdk'
import { uiPort } from './utils'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const multiHost = sdk.MultiHost.of(effects, 'main')

  const uiMultiOrigin = await multiHost.bindPort(uiPort, {
    protocol: 'http',
  })
  const ui = sdk.createInterface(effects, {
    name: 'Web UI',
    id: 'ui',
    description: 'Web user interface for the Elektron Net Faucet',
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  const uiReceipt = await uiMultiOrigin.export([ui])

  return [uiReceipt]
})
