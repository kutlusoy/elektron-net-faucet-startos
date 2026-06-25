#!/bin/sh
set -eu
mkdir -p /var/log/elektron-faucet
chown www-data:www-data /var/log/elektron-faucet
/usr/local/bin/setup-db.sh

# --nodaemonize keeps fpm in the foreground; -F forces stderr logging in
# addition to whatever pool.d/www.conf says, so the StartOS service log
# always shows fpm master output.
exec /usr/sbin/php-fpm8.2 \
    --nodaemonize \
    --force-stderr \
    --fpm-config /etc/php/8.2/fpm/php-fpm.conf
