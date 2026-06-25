#!/bin/sh
# Wait for MariaDB to come up over TCP, then ensure the faucet DB, user and
# config.php exist. Idempotent: safe to run on every service start.
#
# Runs in the php-fpm subcontainer so it cannot use the unix socket — the
# data dir + mysqld are in a different subcontainer. We connect via the
# loopback TCP port that mariadb listens on (subcontainers share the
# network namespace but not the filesystem).
set -eu

DB_HOST=127.0.0.1
DB_PORT=3306
CFG=/etc/elektron-faucet/config.php
CRED_DIR=/etc/elektron-faucet
DB_NAME=elek_faucet
DB_USER=elek_faucet

mkdir -p "$CRED_DIR"

# Wait up to 90s for mariadb TCP listener.
for i in $(seq 1 90); do
    if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
        break
    fi
    sleep 1
done

if ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    echo "[setup-db] timed out waiting for mariadb on ${DB_HOST}:${DB_PORT}" >&2
    exit 1
fi

# Generate stable secrets on first run; reuse afterwards.
if [ ! -f "$CRED_DIR/db_root_password" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$CRED_DIR/db_root_password"
    chmod 600 "$CRED_DIR/db_root_password"
fi
if [ ! -f "$CRED_DIR/db_password" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$CRED_DIR/db_password"
    chmod 600 "$CRED_DIR/db_password"
fi
if [ ! -f "$CRED_DIR/app_key" ]; then
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$CRED_DIR/app_key"
    chmod 600 "$CRED_DIR/app_key"
fi

DB_PASS="$(cat "$CRED_DIR/db_password")"
APP_KEY="$(cat "$CRED_DIR/app_key")"
ROOT_PASS="$(cat "$CRED_DIR/db_root_password")"

# Authenticate as root. After mariadb-install-db the root account is
# socket-auth only; on first contact from this subcontainer we cannot use
# the socket, so the mariadb daemon's start-mariadb.sh seeds a root TCP
# password (if missing) and writes it to $CRED_DIR/db_root_password.
MYCNF="$(mktemp)"
trap 'rm -f "$MYCNF"' EXIT
cat > "$MYCNF" <<EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=root
password=${ROOT_PASS}
EOF
chmod 600 "$MYCNF"

mariadb --defaults-extra-file="$MYCNF" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

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

# Skip the public install.php wizard; schema is created idempotently by the
# faucet's own Db::migrate() on every request.
touch /opt/faucet/.installed || true

echo "[setup-db] ready"
