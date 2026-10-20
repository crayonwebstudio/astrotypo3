#!/bin/bash
# Entrypoint for the AstroTYPO3 TYPO3 container.
# Prepares directories, seeds config if a fresh volume shadows it, runs the
# idempotent first boot installer, fixes ownership, then starts Apache.
set -u

APP_DIR="${TYPO3_APP_DIR:-/var/www/apps/typo3-cms}"
cd "$APP_DIR"

mkdir -p \
  var/sqlite var/transient var/cache var/log var/session \
  public/fileadmin public/uploads \
  config/sites/main config/system

# config/ may be a fresh persistent volume that shadows the image content.
# Seed the site configuration from the baked-in copy if it is missing.
if [ ! -f config/sites/main/config.yaml ]; then
  echo "[entrypoint] seeding site configuration from deploy-seed"
  cp deploy-seed/sites/main/config.yaml config/sites/main/config.yaml
fi
if [ ! -f config/system/additional.php ]; then
  echo "[entrypoint] seeding additional.php from deploy-seed"
  mkdir -p deploy-seed/system
  cp deploy-seed/system/additional.php config/system/additional.php 2>/dev/null || true
fi

php deploy/firstboot.php || echo "[entrypoint] WARNING: firstboot reported problems, continuing to start Apache"

chown -R www-data:www-data var public/fileadmin public/uploads config
find var public/fileadmin -type d -exec chmod 775 {} + 2>/dev/null || true

exec apache2-foreground
