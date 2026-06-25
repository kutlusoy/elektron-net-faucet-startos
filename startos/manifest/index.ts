import { setupManifest } from '@start9labs/start-sdk'
import { elektrondDescription, long, short } from './i18n'

export const manifest = setupManifest({
  id: 'elektron-net-faucet',
  title: 'Elektron Net Faucet',
  license: 'GPL',
  packageRepo: 'https://github.com/kutlusoy/elektron-net-faucet-startos',
  upstreamRepo: 'https://github.com/kutlusoy/elektron-net-faucet',
  marketingUrl: 'https://elektron-net.org',
  donationUrl: 'https://elektron-net.org',
  description: { short, long },
  volumes: ['main'],
  images: {
    'elektron-net-faucet': {
      source: {
        dockerBuild: {},
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
  dependencies: {
    elektrond: {
      description: elektrondDescription,
      optional: true,
      metadata: {
        title: 'Elektron Net',
        icon: 'https://raw.githubusercontent.com/kutlusoy/elektron-net-startos/main/icon.svg',
      },
    },
  },
})
