#!/bin/sh
set -eu
# Wait for php-fpm TCP listener so the first request after boot doesn't 502.
for i in $(seq 1 60); do
    nc -z 127.0.0.1 9000 2>/dev/null && break
    sleep 1
done
exec /usr/sbin/nginx -g 'daemon off;'
