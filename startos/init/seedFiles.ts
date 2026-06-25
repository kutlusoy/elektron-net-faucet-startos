import { sdk } from '../sdk'

export const seedFiles = sdk.setupOnInit(async (effects) => {
  // Nothing to seed: MariaDB data dir, config.php and credentials are
  // initialized lazily on first start by /usr/local/bin/setup-db.sh.
})
