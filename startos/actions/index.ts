import { sdk } from '../sdk'
import { showAdmin } from './show-admin'
import { resetAdmin } from './reset-admin'

export const actions = sdk.Actions.of()
  .addAction(showAdmin)
  .addAction(resetAdmin)
