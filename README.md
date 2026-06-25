# Elektron Net Faucet — StartOS wrapper

[![Sideload build](https://github.com/kutlusoy/elektron-net-faucet-startos/actions/workflows/sideload.yml/badge.svg)](https://github.com/kutlusoy/elektron-net-faucet-startos/actions/workflows/sideload.yml)

StartOS package for [Elektron Net Faucet](https://github.com/kutlusoy/elektron-net-faucet)
— a self-hosted faucet web application for the Elektron Net network, with
built-in wallet-management actions because elektron-net-startos does not
ship its own wallet UI.

This wrapper bundles three components into a single StartOS service:

- **nginx** — serves `/opt/faucet/public` and proxies `*.php` to PHP-FPM.
- **PHP-FPM 8.2** — runs the faucet PHP code, talks to MariaDB.
- **MariaDB** — stores claims, admin users, audit log and settings.

All state lives in the `main` volume so it's encrypted and included in
StartOS backups.

## Actions provided

| Action | What it does |
| --- | --- |
| **Show Admin Credentials** | Reveals the auto-generated `admin` username + password the bootstrap created on first start. |
| **Reset Admin Password** | Rotate the admin login from the StartOS UI (optional new username, blank password = random). |
| **Create Wallet on Elektron Net** | `createwallet` RPC against elektrond. Descriptor or legacy, optional passphrase. |
| **Load Wallet on Elektron Net** | `loadwallet` RPC — needed after every elektrond restart. |
| **Wallet Info** | `getwalletinfo` + `getbalance` (+ optional `getnewaddress`) so you can copy a receiving address. |
| **Import Private Key (WIF)** | `importprivkey` — closest practical equivalent to importing a legacy `wallet.dat` (dump it, re-import key by key). |
| **Import Descriptor** | `importdescriptors` — the modern equivalent of a wallet.dat import; works on descriptor wallets. |

All wallet actions use the RPC Host / User / Password the faucet admin
panel saves in its `settings` table. Configure them once in `/admin.php
→ Settings` and every action picks them up automatically.

## How-To

See **[instructions.md](instructions.md)** for a full first-run How-To:

1. install + start
2. fetch the auto-generated admin credentials via *Show Admin Credentials*
3. set up elektrond RPC (Generate RPC User on elektrond, paste into the
   faucet admin panel)
4. **create or import a wallet on elektrond** (fresh / descriptor migration
   / wallet.dat dump / pre-existing wallet)
5. set *Sender Address* in the admin panel — payouts AND donation card
   become live
6. fund the wallet

## Tags & releases

Pushing a tag matching `v*` triggers `.github/workflows/sideload.yml`,
which builds the `.s9pk` for `x86_64` and creates a GitHub Release titled
"Elektron Net Faucet StartOS Release v…". Bump the StartOS package
version (including the `:N` revision suffix) in
[`startos/versions/current.ts`](startos/versions/current.ts) before
tagging.

See [`.github/workflows/README.md`](.github/workflows/README.md) for the
full release process and a note on the start-cli install workaround
(`start9.com/start-cli/install.sh` returns 403 to Actions runners — the
workflow pulls the binary straight from the Start9Labs/start-os release
assets instead).

## Local development

```bash
npm install
npm run build      # transpile startos/ -> javascript/
make               # build the .s9pk
make install       # send to a StartOS host configured in ~/.startos/config.yaml
```
