import { sdk } from '../sdk'

// Reads the admin username + password the bootstrap created (or that the
// operator last set via reset-admin-password) and surfaces them to the
// StartOS UI. Cleartext on purpose: this is the only way for the operator
// to recover the credentials between password resets without snooping the
// volume.
export const showAdmin = sdk.Action.withoutInput(
  'show-admin-credentials',

  async ({ effects }) => ({
    name: 'Show Admin Credentials',
    description:
      'Display the username and password for the upstream faucet admin panel (/admin.php). Generated automatically on first start; updatable via the Reset Admin Password action.',
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      { imageId: 'elektron-net-faucet' },
      sdk.Mounts.of().mountVolume({
        volumeId: 'main',
        subpath: 'config',
        mountpoint: '/etc/elektron-faucet',
        readonly: true,
      }),
      'show-admin-credentials',
    )

    try {
      const user = (
        await sub.exec(['cat', '/etc/elektron-faucet/admin_username'])
      ).stdout
        .toString()
        .trim()
      const pass = (
        await sub.exec(['cat', '/etc/elektron-faucet/admin_password'])
      ).stdout
        .toString()
        .trim()

      return {
        version: '1' as const,
        title: 'Faucet admin credentials',
        message:
          `Use these to log in at /admin.php.\n\n` +
          `Username: ${user || '(missing — start the service once)'}\n` +
          `Password: ${pass || '(missing — start the service once)'}\n\n` +
          `Run "Reset Admin Password" to rotate.`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
