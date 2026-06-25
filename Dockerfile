FROM debian:bookworm-slim AS build

ARG ELEKTRON_FAUCET_REF=main

RUN \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates git && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /build

RUN \
    git clone https://github.com/kutlusoy/elektron-net-faucet.git && \
    cd elektron-net-faucet && \
    git checkout ${ELEKTRON_FAUCET_REF}

# ---- Final image ----
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    nginx \
    mariadb-server mariadb-client \
    php-fpm php-cli \
    php-mysql php-curl php-gd php-mbstring php-bcmath php-xml php-intl \
    gosu netcat-openbsd && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /var/lib/mysql

COPY --from=build /build/elektron-net-faucet /opt/faucet

COPY ./assets/nginx.conf       /etc/nginx/sites-available/default
COPY ./assets/php-fpm-pool.conf /etc/php/8.2/fpm/pool.d/www.conf
COPY ./assets/mariadb.cnf      /etc/mysql/conf.d/elektron-faucet.cnf
COPY ./assets/start-mariadb.sh /usr/local/bin/start-mariadb.sh
COPY ./assets/start-php-fpm.sh /usr/local/bin/start-php-fpm.sh
COPY ./assets/start-nginx.sh   /usr/local/bin/start-nginx.sh
COPY ./assets/setup-db.sh      /usr/local/bin/setup-db.sh

RUN \
    chmod +x /usr/local/bin/start-mariadb.sh \
             /usr/local/bin/start-php-fpm.sh \
             /usr/local/bin/start-nginx.sh \
             /usr/local/bin/setup-db.sh && \
    mkdir -p /run/php /var/log/elektron-faucet /etc/elektron-faucet && \
    chown -R www-data:www-data /opt/faucet /var/log/elektron-faucet /etc/elektron-faucet

EXPOSE 80
