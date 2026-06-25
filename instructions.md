# Elektron Net Faucet

A self-hosted [Elektron Net Faucet](https://github.com/kutlusoy/elektron-net-faucet)
ported to StartOS. Gives small ELEK payouts to visitors of a public web page,
funded by a wallet you control.

## What you get on StartOS

- A **Web UI** interface — the faucet front page where visitors enter their
  ELEK address, plus an admin dashboard at `/admin.php`.
- A bundled **nginx + PHP-FPM + MariaDB** stack — no external database to set
  up; everything lives in the package's encrypted StartOS volume and is
  included in backups.
- Automatic, idempotent schema migration on every request — first install just
  works.

## First-time setup

1. Install the **Elektron Net Faucet** package and start it.
2. Open the **Web UI**. The faucet schema is created automatically on first
   request — there is no install wizard to step through.
3. Visit `/admin.php` and create the admin user the first time you're
   prompted (this is the upstream faucet's own admin login).
4. From the admin dashboard, configure:
   - Faucet title, message, payout amount, hourly/daily budget and
     per-address/IP cooldowns.
   - **RPC connection** to your Elektron Net wallet (host + port + RPC user
     and password, plus the wallet name if you use named wallets).
5. The recommended RPC target is the StartOS-native
   [Elektron Net](https://github.com/kutlusoy/elektron-net-startos) package on
   the same server — reachable from this container as
   `http://elektrond.startos:8332`. Generate an `rpcauth` entry there and
   paste the credentials into the faucet admin page.

## Where state lives

- MariaDB data dir: `/var/lib/mysql` (mounted from the package volume).
- Generated `config.php`, app key, and DB credentials:
  `/etc/elektron-faucet/` (also in the volume — preserved across updates and
  included in backups).
- Faucet source: `/opt/faucet` (read-only image content; updated by package
  upgrades).

## Backups

The full `main` volume is backed up — that includes the MariaDB data
directory and `/etc/elektron-faucet`, so claim history, admin users, and
settings all round-trip a backup/restore.
