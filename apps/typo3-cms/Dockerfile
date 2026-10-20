# AstroTYPO3 TYPO3 13 instance.
# Build context is the repository root (Coolify). The TYPO3 project lives in
# apps/typo3-cms and mirrors the repository layout, because its composer.json
# uses a path repository for the extension: ../../packages/typo3-extension,
# plus packages/shared-contract at runtime.
FROM php:8.3-apache

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    TYPO3_CONTEXT=Production \
    TYPO3_APP_DIR=/var/www/apps/typo3-cms \
    ASTRO_BUILDER_SHARED_CONTRACT_PATH=/var/www/packages/shared-contract

RUN apt-get update && apt-get install -y --no-install-recommends \
      libzip-dev libicu-dev libpng-dev libjpeg-dev libfreetype6-dev \
      libxml2-dev libsqlite3-dev libonig-dev sqlite3 unzip git imagemagick \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd intl zip pdo_mysql pdo_sqlite mbstring xml opcache exif \
    && pecl install apcu \
    && docker-php-ext-enable apcu \
    && printf 'apc.enable_cli=1\nmemory_limit=512M\nmax_execution_time=240\nmax_input_vars=1500\npost_max_size=100M\nupload_max_filesize=100M\n' > /usr/local/etc/php/conf.d/typo3.ini \
    && a2enmod rewrite headers \
    && printf 'RedirectMatch 301 ^/typo3$ https://typo3.woodwolfdigital.com/typo3/\nAllowEncodedSlashes NoDecode\n' > /etc/apache2/conf-available/typo3-redirect.conf \
    && a2enconf typo3-redirect \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

# Apache serves the TYPO3 public directory.
RUN sed -ri -e 's!/var/www/html!/var/www/apps/typo3-cms/public!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!/var/www/apps/typo3-cms/public!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf 2>/dev/null || true

WORKDIR /var/www
COPY apps/typo3-cms/ ./apps/typo3-cms/
COPY packages/typo3-extension/ ./packages/typo3-extension/
COPY packages/shared-contract/ ./packages/shared-contract/

WORKDIR /var/www/apps/typo3-cms
RUN if [ -f composer.lock ]; then \
      composer install --no-dev --no-interaction --optimize-autoloader; \
    else \
      composer update --no-dev --no-interaction --optimize-autoloader; \
    fi \
    && mkdir -p var/sqlite var/transient var/cache var/log public/fileadmin public/uploads \
    && chown -R www-data:www-data /var/www/apps/typo3-cms /var/www/packages \
    && chmod +x deploy/entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/var/www/apps/typo3-cms/deploy/entrypoint.sh"]
