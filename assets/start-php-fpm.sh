#!/bin/sh
set -eu
mkdir -p /var/log/elektron-faucet
chown www-data:www-data /var/log/elektron-faucet
/usr/local/bin/setup-db.sh
exec /usr/sbin/php-fpm8.2 --nodaemonize --fpm-config /etc/php/8.2/fpm/php-fpm.conf
