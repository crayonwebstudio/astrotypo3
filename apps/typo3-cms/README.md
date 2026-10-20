# AstroTYPO3 TYPO3 instance

TYPO3 13 (composer mode) for the AstroTYPO3 product, deployed on Coolify at
https://typo3.woodwolfdigital.com.

Role of this instance: API backend only. TYPO3 is the headless backend
engine. Its native backend is used as-is for admin (pages, media, users);
there is no custom builder interface inside the TYPO3 backend from this
project. The visual builder (GrapesJS) lives in the Astro app, and all
product functionality connects to TYPO3 through the versioned REST API of
the `astro_builder` extension (`packages/typo3-extension` in this
repository), which exposes pages, tt_content core content elements, media
(FAL) and element type information with TYPO3 backend user authentication
and permissions.

Layout notes:

- The project mirrors the repository layout inside the image
  (`/var/www/apps/typo3-cms` next to `/var/www/packages/...`) because
  `composer.json` uses a path repository with a relative URL for the
  extension.
- Runtime state (SQLite database, caches, settings) lives in `var/` and
  `config/`; on Coolify these are persistent volumes.
- First boot installation is handled by `deploy/entrypoint.sh` and
  `deploy/firstboot.php`; see `docs/TYPO3_DEPLOYMENT.md` in the repository
  root for the full story, environment variables and verification results.
