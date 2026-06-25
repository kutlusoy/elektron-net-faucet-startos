import { LangDict } from './default'

export default {
  de_DE: {
    // main.ts
    1: 'MariaDB ist bereit',
    2: 'MariaDB ist nicht bereit',
    3: 'PHP-FPM ist bereit',
    4: 'PHP-FPM ist nicht bereit',
    5: 'Die Weboberfläche ist bereit',
    6: 'Die Weboberfläche ist nicht bereit',
    7: 'Datenbank',
    8: 'PHP-Anwendung',
    9: 'Weboberfläche',

    // interfaces.ts
    100: 'Weboberfläche',
    101: 'Weboberfläche für den Elektron-Net-Faucet',
  },
} satisfies Record<string, LangDict>
