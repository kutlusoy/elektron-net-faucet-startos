import { sdk } from '../sdk'
import { showAdmin } from './show-admin'
import { resetAdmin } from './reset-admin'
import { walletCreate } from './wallet-create'
import { walletLoad } from './wallet-load'
import { walletInfo } from './wallet-info'
import { walletImportKey } from './wallet-import-key'
import { walletImportDescriptor } from './wallet-import-descriptor'

export const actions = sdk.Actions.of()
  .addAction(showAdmin)
  .addAction(resetAdmin)
  .addAction(walletCreate)
  .addAction(walletLoad)
  .addAction(walletInfo)
  .addAction(walletImportKey)
  .addAction(walletImportDescriptor)
