# Elektron Net Faucet

A self-hosted [Elektron Net Faucet](https://github.com/kutlusoy/elektron-net-faucet)
ported to StartOS. Gives small ELEK payouts to visitors of a public web page,
funded by a wallet you control, and optionally accepts donations into the
same wallet.

## What you get on StartOS

- **Web UI** — the public faucet page (`/`) and the admin panel (`/admin.php`).
- Bundled **nginx + PHP-FPM + MariaDB** — no external database needed; all
  state lives in the encrypted StartOS volume and is included in backups.
- Built-in StartOS **actions** for everything elektron-net-startos does not
  expose itself: admin credential management, full wallet management (create
  / load / info / import private key / import descriptor / import full
  dumpwallet) and a one-click "generate-and-set Sender Address" — all
  driven through the elektrond RPC the faucet is already configured with.

---

## Complete first-run How-To

### Step 1 — Install and start

1. Install **Elektron Net Faucet** on StartOS.
2. Install **[Elektron Net](https://github.com/kutlusoy/elektron-net-startos)**
   on the same StartOS (recommended). The faucet talks to it over the
   internal Docker network at `elektrond.startos:8332`.
3. Start both services.

### Step 2 — Get the admin credentials

`Elektron Net Faucet → Actions → Show Admin Credentials`

The action returns:

```
Username: admin
Password: <24-char random hex>
```

The bootstrap created these on first start. Run **Reset Admin Password**
any time you want to change them — it now writes the new hash to MariaDB
**and** verifies the write by reading the row back before reporting
success, so the printed credentials are guaranteed to log you in.

### Step 3 — Set up the elektrond RPC

In **Elektron Net (the elektrond package) → Actions**:

1. **Generate RPC User** → pick a username (e.g. `faucet`) → a password is
   generated. Note both values.
2. Restart Elektron Net so the new `rpcauth` takes effect.

In **Elektron Net Faucet → Web UI → `/admin.php`**, log in and open
**Settings**. Fill in:

| Field | Value |
| --- | --- |
| RPC Host | `elektrond.startos` |
| RPC Port | `8332` |
| RPC User | the username from step 1 |
| RPC Password | the password from step 1 |
| Wallet Name | `faucet` (matches what we create / import in step 4) |

Save. Use **Test RPC** and **Test Unlock** to confirm; both buttons now
report status inline next to themselves — no more URL leaking like
`?_ok=1&_msg=…` into the address bar.

### Step 4 — Create or import a wallet on elektrond

elektron-net-startos exposes the wallet RPC but does **not** ship a UI to
create or import wallets — this faucet wrapper provides those actions
instead, since it already holds the RPC credentials.

Pick the path that matches your situation.

#### A) Fresh wallet from scratch

`Elektron Net Faucet → Actions → Create Wallet on Elektron Net`

- Wallet Name: `faucet`
- Encryption Passphrase: optional (leave blank for an unencrypted hot
  wallet — fine for a faucet where the operating balance is small)
- Descriptor Wallet: **on** (recommended)

Then run **Generate Address & Set as Sender**:

- Wallet Name (override): leave blank
- Address Label: `faucet`
- Address Type: `bech32`

The action calls `getnewaddress` and writes the new address straight into
`Settings → Sender Address` for you. The donation card on the homepage
goes live the moment it sees a `sender_addr` row.

#### B) Migrate from an existing wallet.dat on a Windows / desktop node — full walkthrough

This is the scenario you are most likely in if you've been running an
**existing wallet (e.g. `wallet.dat` on Windows)** and now want the
faucet to use that same wallet. Read the whole section before you start —
the order of steps matters.

##### What `wallet.dat` actually is, and why you can't upload it

`wallet.dat` is a Berkeley-DB binary file inside the source node's
**data directory** (`%APPDATA%\ElektronNet\wallets\<name>\wallet.dat` on
Windows). Two reasons it can never be uploaded into StartOS as a file:

1. The faucet container is sandboxed away from the elektrond container's
   filesystem — StartOS subcontainers do not share `/root/.elektron-net/`.
2. The elektrond RPC has no method that accepts a binary wallet file
   over the wire.

The workable approach is to **export the keys as text on the source
node**, paste that text into a StartOS action, and let the action call
`importprivkey` for every key. Bitcoin / elektrond both ship the
`dumpwallet` RPC for exactly this; it produces a plain text file with
all WIF private keys, all derivation metadata, and label information.
The receiving wallet rebuilds itself from those keys and is functionally
identical to the source.

##### Step-by-step from a Windows node

> Before you begin: **make a fresh backup of your source wallet.dat**
> (e.g. File → Backup Wallet…) and store it offline. Everything below
> is non-destructive, but key migrations always carry the risk of an
> operator mistake, and a known-good backup is the cheapest insurance.

1. **Open the debug console on the source node.**
   In Bitcoin Core / Elektron Net Core (Windows): `Window → Console`.
   You should see a prompt that lets you type RPC commands.

2. **Choose a file path for the dump.**
   Anywhere you can write is fine. Example: `C:\Users\you\faucet-dump.txt`.
   Keep the path short and inside your own user directory — Bitcoin Core
   rejects paths it cannot write to.

3. **Run dumpwallet in the console.**
   Type literally (with the quotes and double-backslashes):

   ```
   dumpwallet "C:\\Users\\you\\faucet-dump.txt"
   ```

   Press Enter. The console prints `{ "filename": "C:\\Users\\you\\faucet-dump.txt" }`
   on success. If your wallet is encrypted, run `walletpassphrase
   "<your-passphrase>" 120` first to unlock it for 120 seconds.

4. **Open `faucet-dump.txt`** in Notepad (or any editor). It looks
   like this:

   ```
   # Wallet dump created by Elektron Net …
   # * Created on 2026-06-26T08:00:00Z
   # extended private masterkey: xprv9s21…

   KxAbc…ZyW 2024-12-01T10:11:12Z label=savings # addr=be1qclm3…wkc3h4x hdkeypath=m/0'/0'/0
   L1Def…XyZ 2025-04-08T14:20:00Z label=tips    # addr=be1q…        hdkeypath=m/0'/0'/1
   …
   ```

   Each non-comment line is one address. The first column is the WIF
   private key. The trailing `addr=…` is the address the same key
   produces on the source network.

5. **Select all (Ctrl + A), copy (Ctrl + C).**
   You'll paste the whole text — comments and all — into the StartOS
   action in the next step. Comment lines are ignored automatically; you
   do not need to clean the file up.

6. **Create a LEGACY wallet on StartOS** to receive the keys.
   `Elektron Net Faucet → Actions → Create Wallet on Elektron Net`:

   - Wallet Name: `faucet`
   - Encryption Passphrase: blank
   - **Descriptor Wallet: OFF** ← important. `importprivkey` only works
     on legacy wallets; descriptor wallets reject WIFs and require the
     `Import Descriptor` action instead.

   Save. The action returns `{ "name": "faucet" }`.

7. **Import the dump.**
   `Elektron Net Faucet → Actions → Import Wallet from dumpwallet`:

   - Wallet Name (override): blank (uses `faucet`)
   - **dumpwallet output**: paste the text you copied in step 5
   - Default Label: `imported` (or anything you like)
   - Rescan the blockchain: **on** (recovers any UTXOs within the
     ~137-day prune horizon)
   - **Update Sender Address after import: ON** ← this is the flip you
     wanted: as soon as all keys are in, the action calls `getnewaddress`
     and writes the resulting `be1q…` address straight into `settings.sender_addr`
     — the same row the admin panel's *Sender Address* field reads
     from. No copy-paste step.

   Click *Submit*. The action loops through every WIF in the dump and
   calls `importprivkey` per key, only rescanning on the last one to
   avoid `n × rescan-from-genesis` overhead. When it finishes you
   see a summary like:

   ```
   Imported 12/12 keys into wallet "faucet".
   Blockchain rescan was performed on the last key — UTXOs newer than the
   ~137-day prune horizon are now visible. Run Wallet Info to confirm balance.

   ✓ Sender Address set to:
     be1qclm3g723n69ydy7j44as8f625rskhqfwkc3h4x
     (faucet admin Settings → Sender Address; donation card on the homepage now points here.)
   ```

8. **Verify in the admin panel.**
   Reload `/admin.php → Settings`. *Sender Address* should already be
   populated with the new `be1q…` address. *Wallet Balance* (top KPI
   row) should reflect anything the rescan found.

##### What if the source is a **descriptor** wallet?

Descriptor wallets (modern Bitcoin Core 23+ default) don't have
exportable WIFs in the dumpwallet sense — they store output
descriptors. Use this path instead:

1. On the source node, run `listdescriptors true` in the console. Copy
   the **private** descriptor string (the one starting with `wpkh(xprv…)`
   or similar) including the `#abcd1234` checksum at the end.
2. On StartOS, create a wallet with **Descriptor Wallet: ON** (the
   default).
3. Run `Import Descriptor`:
   - paste the descriptor string into *Descriptor*
   - leave *Range End* at `1000` (raise it only if you used the source
     wallet past address index #1000)
   - *Treat as new key*: **off** so a rescan recovers UTXOs
4. Run `Generate Address & Set as Sender` afterwards to populate
   `sender_addr`.

#### C) A single key, not a whole wallet

Use `Actions → Import Private Key (WIF)`. Paste a single WIF, click
Submit, then run `Generate Address & Set as Sender` to point the faucet
at the imported key.

#### D) Existing wallet, just point the faucet at it

If the wallet is already loaded on elektrond and you only need the faucet
to use it:

- Set **Wallet Name** in the admin panel to match the loaded wallet.
- Run **Load Wallet** if elektrond was restarted (wallets don't reload
  automatically).
- Run **Generate Address & Set as Sender** to populate `sender_addr`,
  or paste an existing address into the admin panel by hand.

### Step 5 — Tune faucet settings

In **/admin.php → Settings**:

- **Faucet Title / Message / Per-claim Amount / Hourly Budget / Daily
  Budget / Cooldowns** — adjust to taste. Sensible defaults are seeded
  on first start (mirroring the upstream `install.php` defaults).
- **hCaptcha Site/Secret Keys** — optional but recommended for a public
  faucet.
- **Explorer URL** — optional; populates txid links on the claim result.

Click **Save Settings**. The button is wired through AJAX with triple
redundancy (URL `?ajax=1` + `X-Requested-With` header + `_ajax=1` form
field), so the request reaches the JSON path even if a reverse proxy
strips one of the signals. You'll see a green toast — no more redirect
URL with `?_ok=1&_msg=…` in the address bar.

### Step 6 — Fund the wallet

Send some ELEK from your existing wallet to the Sender Address. As soon
as the first confirmation lands, claims start succeeding.

---

## Actions reference

| Action | What it does |
| --- | --- |
| **Show Admin Credentials** | Reads `/etc/elektron-faucet/admin_{username,password}` and prints them. Always reflects the last successful Reset. |
| **Reset Admin Password** | Hashes the new password with `password_hash(…, PASSWORD_BCRYPT)`, upserts the row in `admin_users`, re-reads it to verify, and only THEN persists the cleartext copies on disk. If any step fails the operator sees the stderr instead of an empty "Password: " line. |
| **Create Wallet on Elektron Net** | `createwallet` RPC. Pick descriptor (default) or legacy. Legacy is required if you want to import WIFs via `dumpwallet`. |
| **Load Wallet on Elektron Net** | `loadwallet` RPC. Needed after every elektrond restart — wallets don't auto-load. |
| **Wallet Info** | `getwalletinfo` + `getbalance` + optional `getnewaddress`. Read-only sanity check. |
| **Import Private Key (WIF)** | Single-key `importprivkey`. Legacy wallets only. |
| **Import Descriptor** | `importdescriptors` with one entry — modern equivalent for descriptor wallets. |
| **Import Wallet from dumpwallet** | Parses a full `dumpwallet` text dump, calls `importprivkey` for every WIF (rescan only on the last one), optionally generates a fresh address and writes it into `settings.sender_addr`. |
| **Generate Address & Set as Sender** | `getnewaddress` + UPSERT into `settings.sender_addr`. The one-click action for rotating the public donation/payout address. |

All wallet actions authenticate with the RPC credentials saved in the
faucet admin panel — keep them in sync with elektrond's `rpcauth` entries.

---

## Operational notes

### Where state lives

- MariaDB data dir: `/var/lib/mysql` (mounted from the package's `main`
  volume).
- Generated `config.php`, app key, DB credentials, and the cleartext copy
  of the admin password: `/etc/elektron-faucet/` (also in the volume).
- Faucet PHP source: `/opt/faucet` — read-only image content, replaced on
  package upgrade.

### Backups

The whole `main` volume is included in StartOS backups, so claim history,
admin users, admin password, settings, and the MariaDB data round-trip a
backup/restore. Your **elektrond wallet** is backed up separately by the
elektrond package — back up both.

### Resetting things

- **Forgot the admin password** → run *Show Admin Credentials* (it's
  always stored on the volume), or *Reset Admin Password* to set a new
  one. The reset action now verifies the write round-trip before
  returning, so the displayed password is guaranteed to log you in.
- **Want to wipe the DB and start over** → uninstall + reinstall the
  package; the next start will regenerate everything from scratch.

### Why the admin AJAX buttons used to leak `?_ok=1&_msg=…`

The upstream admin panel previously detected AJAX only via the
`X-Requested-With` header. Some reverse-proxy setups strip that header,
in which case the server fell back to a redirect URL that exposed the
operation outcome as query parameters. The fix runs in three layers:

1. The form posts to `admin.php?ajax=1` (URL-level flag).
2. It still sends `X-Requested-With: XMLHttpRequest` (header-level flag).
3. It includes a hidden `_ajax=1` form field (body-level flag).

Any one of those three is enough to keep the response on the JSON path.
The non-AJAX fallback now redirects to a clean `admin.php` URL, so even
in a worst-case misdetection scenario the address bar stays clean.

All non-submit admin buttons additionally carry `type="button"`, so even
if JavaScript fails to bind they cannot accidentally trigger a form
submission.

### RPC scope

This wrapper's wallet actions only call wallet RPCs that elektrond exposes
(`createwallet`, `loadwallet`, `getwalletinfo`, `getbalance`,
`getnewaddress`, `importprivkey`, `importdescriptors`). All of them
authenticate with the RPC credentials saved in the faucet admin panel —
keep them in sync with elektrond's `rpcauth` entries.
