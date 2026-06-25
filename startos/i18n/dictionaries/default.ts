export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'MariaDB is ready': 1,
  'MariaDB is not ready': 2,
  'PHP-FPM is ready': 3,
  'PHP-FPM is not ready': 4,
  'The web interface is ready': 5,
  'The web interface is not ready': 6,
  'Database': 7,
  'PHP Application': 8,
  'Web Interface': 9,

  // interfaces.ts
  'Web UI': 100,
  'Web user interface for the Elektron Net Faucet': 101,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
