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
  expose itself: admin login retrieval, admin password rotation, and full
  wallet management (create / load / info / import private key / import
  descriptor) — all driven through the elektrond RPC the faucet is already
  configured with.

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
any time you want to change them.

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
| Wallet Name | `faucet` (matches what we create in step 4) |

Save.

### Step 4 — Create or import a wallet on elektrond

elektron-net-startos exposes the wallet RPC but does **not** ship a UI to
create or import wallets — this faucet wrapper provides those actions
instead, since it already holds the RPC credentials.

Pick the path that matches your situation:

#### A) Fresh wallet from scratch

`Elektron Net Faucet → Actions → Create Wallet on Elektron Net`

- Wallet Name: `faucet`
- Encryption Passphrase: optional (leave blank for an unencrypted hot
  wallet — fine for a faucet where the operating balance is small)
- Descriptor Wallet: **on** (recommended)

Then run **Wallet Info** with *Also fetch a fresh receiving address*
turned on. Copy the address it prints — that goes into **Sender Address**
in the admin panel (next step).

#### B) Migrate from an existing descriptor wallet

If you already have a wallet elsewhere (Bitcoin Core, another node, …):

1. On the source wallet, run `listdescriptors true` via its CLI. Copy the
   private descriptor string **including the `#checksum`**, e.g.
   `wpkh(xprv9.../84h/0h/0h/0/*)#abcd1234`.
2. On the faucet StartOS package, run **Create Wallet on Elektron Net**
   first (with *Descriptor Wallet* on, **no** passphrase) so a target
   wallet exists.
3. Run **Import Descriptor**:
   - Descriptor: paste from step 1
   - Range End: `1000` (or higher if you used the source wallet beyond
     address #1000)
   - Treat as new key: leave **off** to rescan history
4. Run **Wallet Info** to confirm the balance.

> elektron-net prunes blocks older than 137 days, so a rescan past that
> window will not recover historical UTXOs from before the cutoff.

#### C) Migrate from a legacy wallet.dat

A `wallet.dat` file is a Berkeley-DB/SQLite file inside elektrond's data
directory. Container filesystems are isolated, so **the faucet container
cannot push wallet.dat into the elektrond container** — there is no RPC
that uploads a wallet file. Two workable approaches:

1. **Dump the keys, re-import via RPC** (works for any wallet):
   - On the machine that holds wallet.dat, run `bitcoin-wallet dump
     -wallet=wallet.dat` or, with the wallet loaded in any compatible
     Bitcoin Core, call the `dumpwallet` RPC.
   - For each WIF line in the dump, run **Import Private Key (WIF)** on
     the faucet package (one key per run). On a fresh descriptor wallet
     you'll need to create a *legacy* wallet first (Create Wallet with
     *Descriptor Wallet* turned **off**).
2. **Replace elektrond's wallet file directly** (advanced):
   - SSH into the StartOS host, stop the elektrond package, drop your
     wallet.dat into the elektrond volume under `wallets/faucet/wallet.dat`,
     start the package, then call **Load Wallet** here with name `faucet`.
   - This bypasses StartOS's normal abstractions; only do it if you are
     comfortable with the elektrond data layout.

#### D) Existing wallet, just point the faucet at it

If the wallet is already loaded on elektrond and you only need the faucet
to use it:

- Set **Wallet Name** in the admin panel to match the loaded wallet.
- Run **Load Wallet** if elektrond was restarted (wallets don't reload
  automatically).
- Run **Wallet Info** to confirm.

### Step 5 — Set Sender Address & faucet settings

Back in **/admin.php → Settings**:

- **Sender Address** — paste the address from Wallet Info. This is the
  address payouts come from **and** the address the homepage donation card
  points at.
- **Faucet Title / Message / Per-claim Amount / Hourly Budget / Daily
  Budget / Cooldowns** — adjust to taste. Sensible defaults are seeded
  on first start (mirroring the upstream `install.php` defaults).
- **hCaptcha Site/Secret Keys** — optional but recommended for a public
  faucet.
- **Explorer URL** — optional; populates txid links on the claim result.

Save. The **donation card on the homepage now appears automatically**
because Sender Address is set. It pulls the live donor list from elektrond
via `listtransactions`, so no extra wiring is needed.

### Step 6 — Fund the wallet

Send some ELEK from your existing wallet to the Sender Address. As soon
as the first confirmation lands, claims start succeeding.

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
  always stored on the volume), or *Reset Admin Password* to set a new one.
- **Want to wipe the DB and start over** → uninstall + reinstall the
  package; the next start will regenerate everything from scratch.

### RPC scope

This wrapper's wallet actions only call wallet RPCs that elektrond exposes
(`createwallet`, `loadwallet`, `getwalletinfo`, `getbalance`,
`getnewaddress`, `importprivkey`, `importdescriptors`). All of them
authenticate with the RPC credentials saved in the faucet admin panel —
keep them in sync with elektrond's `rpcauth` entries.
