import { sdk } from './sdk'
import { uiPort } from './utils'
import { i18n } from './i18n'

const IMAGE = { imageId: 'elektron-net-faucet' as const }

// Three daemons share the same image but get their own SubContainer so each
// has an isolated filesystem layer + lifecycle. MariaDB owns the persistent
// data dir; PHP-FPM owns the generated config.php and app credentials;
// nginx is pure proxy.
//
// Shared bind sockets (mysqld.sock, php-fpm.sock) cannot cross subcontainer
// boundaries, so MariaDB + PHP-FPM + nginx are mounted into a single
// SubContainer for runtime IPC. Persistent state lives in the `main`
// volume.
export const main = sdk.setupMain(async ({ effects }) => {
  console.info('Starting Elektron Net Faucet!')

  const depResult = await sdk.checkDependencies(effects)
  depResult.throwIfNotSatisfied()

  const sharedMounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: 'mysql',
      mountpoint: '/var/lib/mysql',
      readonly: false,
    })
    .mountVolume({
      volumeId: 'main',
      subpath: 'config',
      mountpoint: '/etc/elektron-faucet',
      readonly: false,
    })

  const mariadbSub = await sdk.SubContainer.of(
    effects,
    IMAGE,
    sharedMounts,
    'mariadb',
  )

  const phpSub = await sdk.SubContainer.of(
    effects,
    IMAGE,
    sharedMounts,
    'php-fpm',
  )

  const nginxSub = await sdk.SubContainer.of(
    effects,
    IMAGE,
    sdk.Mounts.of(),
    'nginx',
  )

  return sdk.Daemons.of(effects)
    .addDaemon('mariadb', {
      subcontainer: mariadbSub,
      exec: {
        command: ['/usr/local/bin/start-mariadb.sh'],
      },
      ready: {
        display: i18n('Database'),
        gracePeriod: 30_000,
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, 3306, {
            successMessage: i18n('MariaDB is ready'),
            errorMessage: i18n('MariaDB is not ready'),
          }),
      },
      requires: [],
    })
    .addDaemon('php-fpm', {
      subcontainer: phpSub,
      exec: {
        command: ['/usr/local/bin/start-php-fpm.sh'],
      },
      ready: {
        display: i18n('PHP Application'),
        gracePeriod: 30_000,
        fn: async () => ({
          message: i18n('PHP-FPM is ready'),
          result: 'success',
        }),
      },
      requires: ['mariadb'],
    })
    .addDaemon('nginx', {
      subcontainer: nginxSub,
      exec: {
        command: ['/usr/local/bin/start-nginx.sh'],
      },
      ready: {
        display: i18n('Web Interface'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, uiPort, {
            successMessage: i18n('The web interface is ready'),
            errorMessage: i18n('The web interface is not ready'),
          }),
      },
      requires: ['php-fpm'],
    })
})
