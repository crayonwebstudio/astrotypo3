# AstroTYPO3 TYPO3 instance

TYPO3 13 (composer mode) for the AstroTYPO3 product, deployed on Coolify at
https://typo3.woodwolfdigital.com. It carries the `astro_builder` extension
(`packages/typo3-extension` in this repository) plus a small site package
(`packages/astrotypo3-site` here) whose frontend middleware dispatches the
documented GET `/api/content/v1` routes to the extension controllers.

Layout notes:

- The project mirrors the repository layout inside the image
  (`/var/www/apps/typo3-cms` next to `/var/www/packages/...`) because
  `composer.json` uses path repositories with relative URLs.
- Runtime state (SQLite database, caches, settings) lives in `var/` and
  `config/`; on Coolify these are persistent volumes when attached.
- First boot installation is handled by `deploy/entrypoint.sh` and
  `deploy/firstboot.php`; see `docs/TYPO3_DEPLOYMENT.md` in the repository
  root for the full story, environment variables and verification results.
