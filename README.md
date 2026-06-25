# Elektron Net Faucet — StartOS wrapper

[![Sideload build](https://github.com/kutlusoy/elektron-net-faucet-startos/actions/workflows/sideload.yml/badge.svg)](https://github.com/kutlusoy/elektron-net-faucet-startos/actions/workflows/sideload.yml)

StartOS package for [Elektron Net Faucet](https://github.com/kutlusoy/elektron-net-faucet)
— a self-hosted faucet web app for the Elektron Net network.

This wrapper bundles three components into a single StartOS service:

- **nginx** — serves `/opt/faucet/public` and proxies `*.php` to PHP-FPM.
- **PHP-FPM 8.2** — runs the faucet PHP code, talks to MariaDB.
- **MariaDB** — stores claims, admin users, audit log and settings.

All state lives in the package's `main` volume so it's encrypted and
included in StartOS backups.

## Tags & releases

Pushing a tag matching `v*` triggers `.github/workflows/sideload.yml`, which
builds the `.s9pk` for `x86_64` and creates a GitHub Release titled
"Elektron Net Faucet StartOS Release v…". Bump the StartOS package version
(including the `:N` revision suffix) in
[`startos/versions/current.ts`](startos/versions/current.ts) before tagging.

## Local development

```bash
npm install
npm run build      # transpile startos/ -> javascript/
make               # build the .s9pk
make install       # send to a StartOS host configured in ~/.startos/config.yaml
```

See [`instructions.md`](instructions.md) for end-user setup.
