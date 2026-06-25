#!/bin/sh
# Wait for MariaDB, then ensure the faucet DB/user/config.php/schema and a
# default admin account all exist. Idempotent: safe to run on every start.
#
# Runs in the php-fpm subcontainer so it cannot use the unix socket — the
# mariadb data dir + daemon live in a different subcontainer. We connect
# via the loopback TCP port that mariadb listens on (SubContainers share
# the network namespace but not the filesystem).
set -eu

DB_HOST=127.0.0.1
DB_PORT=3306
CFG=/etc/elektron-faucet/config.php
CRED_DIR=/etc/elektron-faucet
DB_NAME=elek_faucet
DB_USER=elek_faucet
ADMIN_USER_FILE="$CRED_DIR/admin_username"
ADMIN_PASS_FILE="$CRED_DIR/admin_password"
INSTALLED_MARKER=/opt/faucet/.installed

mkdir -p "$CRED_DIR"

# Wait up to 90s for mariadb TCP listener.
for _ in $(seq 1 90); do
    nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null && break
    sleep 1
done
if ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    echo "[setup-db] timed out waiting for mariadb on ${DB_HOST}:${DB_PORT}" >&2
    exit 1
fi

# --- Generate stable secrets on first run; reuse afterwards ---
rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

[ -f "$CRED_DIR/db_root_password" ] || { rand_hex 24 > "$CRED_DIR/db_root_password"; chmod 600 "$CRED_DIR/db_root_password"; }
[ -f "$CRED_DIR/db_password" ]      || { rand_hex 24 > "$CRED_DIR/db_password";      chmod 600 "$CRED_DIR/db_password";      }
[ -f "$CRED_DIR/app_key" ]          || { rand_hex 32 > "$CRED_DIR/app_key";          chmod 600 "$CRED_DIR/app_key";          }
[ -f "$ADMIN_USER_FILE" ]           || { printf 'admin' > "$ADMIN_USER_FILE";        chmod 600 "$ADMIN_USER_FILE";           }
[ -f "$ADMIN_PASS_FILE" ]           || { rand_hex 12 > "$ADMIN_PASS_FILE";           chmod 600 "$ADMIN_PASS_FILE";           }

DB_PASS="$(cat "$CRED_DIR/db_password")"
APP_KEY="$(cat "$CRED_DIR/app_key")"
ROOT_PASS="$(cat "$CRED_DIR/db_root_password")"
ADMIN_USER="$(cat "$ADMIN_USER_FILE")"
ADMIN_PASS="$(cat "$ADMIN_PASS_FILE")"

# --- Connect as root (TCP) — start-mariadb.sh seeds this user on first boot ---
ROOT_CNF="$(mktemp)"
trap 'rm -f "$ROOT_CNF"' EXIT
cat > "$ROOT_CNF" <<EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=root
password=${ROOT_PASS}
EOF
chmod 600 "$ROOT_CNF"

mariadb --defaults-extra-file="$ROOT_CNF" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

# --- Write config.php so upstream Bootstrap finds the DB ---
cat > "$CFG" <<PHP
<?php
return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => '${DB_NAME}',
    'db_user' => '${DB_USER}',
    'db_pass' => '${DB_PASS}',
    'app_key' => '${APP_KEY}',
];
PHP
chown www-data:www-data "$CFG" || true
chmod 0640 "$CFG"

# --- Apply schema (idempotent: CREATE TABLE IF NOT EXISTS throughout) ---
APP_CNF="$(mktemp)"
trap 'rm -f "$ROOT_CNF" "$APP_CNF"' EXIT
cat > "$APP_CNF" <<EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=${DB_USER}
password=${DB_PASS}
database=${DB_NAME}
EOF
chmod 600 "$APP_CNF"

mariadb --defaults-extra-file="$APP_CNF" < /opt/faucet/sql/schema.sql

# --- Seed default settings on first install ---
if [ ! -f "$INSTALLED_MARKER" ]; then
    # Mirrors public/install.php defaults so the user gets a fully populated
    # admin page out of the box. Skipped on subsequent runs so operator edits
    # in the admin panel are not clobbered.
    mariadb --defaults-extra-file="$APP_CNF" <<SQL
INSERT IGNORE INTO settings (\`key\`, \`value\`) VALUES
    ('faucet_title',        'Elektron Net Faucet'),
    ('faucet_message',      'Claim some free ELEK!'),
    ('amount_elek',         '0.001'),
    ('daily_budget',        '1'),
    ('hourly_budget',       '0.1'),
    ('per_addr_cooldown_h', '24'),
    ('per_ip_cooldown_h',   '1'),
    ('rpc_host',            '127.0.0.1'),
    ('rpc_port',            '8332'),
    ('default_lang',        'en');
SQL
fi

# --- Create / upsert the admin user (only resets password if the file was
#     changed since last run — tracked via the .installed marker). The
#     Reset Admin Password StartOS action rewrites $ADMIN_PASS_FILE then
#     deletes $INSTALLED_MARKER so the next start re-syncs the hash. ---
if [ ! -f "$INSTALLED_MARKER" ]; then
    ADMIN_HASH=$(ADMIN_PASS="$ADMIN_PASS" php -r 'echo password_hash(getenv("ADMIN_PASS"), PASSWORD_ARGON2ID);')
    ADMIN_USER="$ADMIN_USER" ADMIN_HASH="$ADMIN_HASH" \
        FAUCET_CONFIG="$CFG" php -r '
            $cfg = require getenv("FAUCET_CONFIG");
            $pdo = new PDO(
                sprintf("mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4",
                    $cfg["db_host"], $cfg["db_port"], $cfg["db_name"]),
                $cfg["db_user"], $cfg["db_pass"],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
            $stmt = $pdo->prepare(
                "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)"
            );
            $stmt->execute([getenv("ADMIN_USER"), getenv("ADMIN_HASH")]);
        '
fi

# --- Mark install complete so the upstream install.php wizard refuses to run
#     (it would otherwise overwrite our config.php and admin user). ---
touch "$INSTALLED_MARKER" || true

echo "[setup-db] ready (admin user: ${ADMIN_USER})"
