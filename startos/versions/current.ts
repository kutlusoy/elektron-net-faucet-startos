import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.0.0:1',
  releaseNotes: {
    en_US: 'Initial Elektron Net Faucet StartOS release.',
    de_DE: 'Erste Veröffentlichung des Elektron-Net-Faucet auf StartOS.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
