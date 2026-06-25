#!/bin/sh
# Boot MariaDB. On first run, initialize the system tables in the volume
# and seed a TCP-accessible root password (php-fpm subcontainer cannot
# share the unix socket, so root has to be reachable via TCP).
set -eu

DATADIR=/var/lib/mysql
RUNDIR=/run/mysqld
CRED_DIR=/etc/elektron-faucet

mkdir -p "$RUNDIR" /var/log/elektron-faucet "$CRED_DIR"
chown -R mysql:mysql "$RUNDIR" "$DATADIR" /var/log/elektron-faucet

FIRSTRUN=0
if [ ! -d "$DATADIR/mysql" ]; then
    echo "[mariadb] initializing data directory at $DATADIR"
    mariadb-install-db --user=mysql --datadir="$DATADIR" --auth-root-authentication-method=socket >/dev/null
    FIRSTRUN=1
fi

if [ ! -f "$CRED_DIR/db_root_password" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$CRED_DIR/db_root_password"
    chmod 600 "$CRED_DIR/db_root_password"
fi
ROOT_PASS="$(cat "$CRED_DIR/db_root_password")"

if [ "$FIRSTRUN" = "1" ]; then
    # Boot mariadbd briefly to seed the root TCP password.
    gosu mysql mariadbd \
        --defaults-file=/etc/mysql/my.cnf \
        --datadir="$DATADIR" \
        --socket="$RUNDIR/mysqld.sock" \
        --skip-networking \
        --skip-log-bin &
    BOOTPID=$!
    for i in $(seq 1 60); do
        [ -S "$RUNDIR/mysqld.sock" ] && mariadb --socket="$RUNDIR/mysqld.sock" -e 'SELECT 1' >/dev/null 2>&1 && break
        sleep 1
    done
    mariadb --socket="$RUNDIR/mysqld.sock" <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '${ROOT_PASS}';
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '${ROOT_PASS}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
DELETE FROM mysql.user WHERE User='';
DROP DATABASE IF EXISTS test;
FLUSH PRIVILEGES;
SQL
    mariadb-admin --socket="$RUNDIR/mysqld.sock" -uroot -p"${ROOT_PASS}" shutdown
    wait "$BOOTPID" || true
fi

exec gosu mysql mariadbd \
    --defaults-file=/etc/mysql/my.cnf \
    --datadir="$DATADIR" \
    --socket="$RUNDIR/mysqld.sock"
