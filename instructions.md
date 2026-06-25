# Elektron Net Faucet

A self-hosted [Elektron Net Faucet](https://github.com/kutlusoy/elektron-net-faucet)
ported to StartOS. Gives small ELEK payouts to visitors of a public web page,
funded by a wallet you control, and optionally accepts donations into the
same wallet.

## What you get on StartOS

- A **Web UI** interface — the public faucet page (`/`) and the admin panel
  (`/admin.php`).
- A bundled **nginx + PHP-FPM + MariaDB** stack — no external database to set
  up; everything lives in the package's encrypted StartOS volume and is
  included in backups.
- **Show Admin Credentials** action — reveals the auto-generated `admin`
  username and password the package created on first start.
- **Reset Admin Password** action — rotate the admin login from the StartOS
  UI without touching the database.

## First-time setup

1. Install the **Elektron Net Faucet** package and start it.
2. Open **Actions → Show Admin Credentials** and copy the username + password.
   On the very first start the bootstrap inserts a default user `admin` with
   a random 24-character password.
3. Open the **Web UI** and click the *admin* link at the bottom of the
   homepage (or visit `/admin.php` directly). Log in with the credentials
   from step 2.
4. In **Settings** on the admin page, fill in at minimum:
   - **RPC Host / Port / User / Password** — the credentials for your
     Elektron Net wallet RPC. For a StartOS-native
     [Elektron Net](https://github.com/kutlusoy/elektron-net-startos) package
     on the same server, use `elektrond.startos` / `8332` and an `rpcauth`
     entry generated there.
   - **Wallet name** if you use named wallets.
   - **Sender Address** — the faucet's own ELEK address. **Setting this also
     unlocks the donation card on the public homepage** (`/`), so visitors
     can tip the wallet via a `elek:` URI / payment-info block / QR.
   - Faucet title, message, per-claim amount, hourly + daily budget, per-
     address / per-IP cooldowns.

The schema is migrated automatically on every request (idempotent
`CREATE TABLE IF NOT EXISTS`), so you do not have to run the upstream
`install.php` wizard — it is blocked by the bootstrap.

## Donations

The public homepage shows a donation card with payment-info block, copy-able
`elek:` URI and a link to `/donors.php` once **Sender Address** is set in the
admin settings. The card is fed by the live wallet RPC (`listtransactions`),
so no extra setup is needed beyond the RPC credentials.

## Where state lives

- MariaDB data dir: `/var/lib/mysql` (mounted from the package volume).
- Generated `config.php`, app key, DB credentials, and the cleartext copy
  of the admin password used by *Show Admin Credentials*:
  `/etc/elektron-faucet/` (also in the volume — preserved across updates and
  included in backups).
- Faucet source: `/opt/faucet` (read-only image content; updated by package
  upgrades).

## Backups

The full `main` volume is backed up — that includes the MariaDB data
directory and `/etc/elektron-faucet`, so claim history, admin users,
settings and donation history all round-trip a backup/restore.
