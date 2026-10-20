# TYPO3 Deployment

Date: 20 October 2026. Scope: deployment of the TYPO3 13 backend of the
AstroTYPO3 product on Coolify, with live verification. No em dashes are
used in this document.

## 1. Architecture

TYPO3 is the headless backend engine of this product, and nothing more:

- The native TYPO3 backend is used as-is for administration: pages,
  media (FAL), users and permissions. No custom builder interface,
  backend module or dashboard is built inside the TYPO3 backend by this
  project.
- The visual builder (GrapesJS, ADR 0005) lives in the Astro app at
  https://astrotypo3.woodwolfdigital.com, outside TYPO3.
- The product connects to TYPO3 purely through the versioned REST API
  of the `astro_builder` extension (`packages/typo3-extension`), which
  exposes pages and `tt_content` core content elements, media and
  element type information, guarded by TYPO3 backend user authentication
  and permissions plus the preview token mechanism for drafts.
- Astro renders the public website. It never runs inside PHP, and TYPO3
  never renders the public frontend in production use; the TYPO3
  frontend of this staging instance only serves a minimal root page
  that exists so the instance is a valid TYPO3 site.

Live endpoints of this deployment:

- TYPO3 backend and frontend: https://typo3.woodwolfdigital.com
- Astro app (unchanged by this deployment):
  https://astrotypo3.woodwolfdigital.com

## 2. Coolify resources

- Project: astrotypo3 (`kdygvgpt7khbtfnqqsxtqyct`), environment
  production, server Woodwolf (`qxuacajpe7gcho750znadloc`),
  destination `ipnwqkrebha1mfmj3hfpzka1`.
- Application: astrotypo3-typo3, UUID `yersmlnb8mvivtuyd04fcqib`.
- Build pack: dockerfile, Dockerfile location
  `/apps/typo3-cms/Dockerfile`, build context is the repository root,
  exposed port 80, domain https://typo3.woodwolfdigital.com.

Persistent storages attached to the application (Coolify volumes):

| Name | Mount path inside the container |
|---|---|
| typo3-var | /var/www/apps/typo3-cms/var |
| typo3-config | /var/www/apps/typo3-cms/config |
| typo3-fileadmin | /var/www/apps/typo3-cms/public/fileadmin |

The SQLite database, caches and settings therefore survive redeploys.
Verified indirectly: the installation, admin user, root page and
TypoScript template seeded on the first successful boot were still
present after two further redeploys (firstboot logged "already exists"
for each).

## 3. Source layout

Everything lives in `apps/typo3-cms` in this repository:

- `composer.json`: individual TYPO3 13.4 system extensions (chosen over
  `typo3/cms-base-distribution` because the project must mirror the
  repository layout for its path repository, and the base distribution
  is a project root template). Requires `crayonwebstudio/astro-builder`
  and previously a small site package, both via Composer path
  repositories with `symlink: false`. The site package was removed on
  20 October 2026: HTTP routing for the API belongs to the extension
  itself (its `ApiMiddleware`), and a second dispatch layer in the
  deployment would have conflicted with it. Update (polish pass,
  20 October 2026): a `composer.lock` is now committed (TYPO3 13.4.36,
  generated with Composer 2.10.3 on PHP 8.3), so the image build runs
  `composer install` from the lock instead of `composer update`.
- `public/index.php`, `public/typo3/index.php`: standard TYPO3 13
  composer mode entry points.
- `public/.htaccess`: existing files and directories are served
  directly, everything else goes to the frontend entry point.
- `config/sites/main/config.yaml`: site "main", root page 1, base
  https://typo3.woodwolfdigital.com/, one English language.
- `config/system/additional.php`: trusted hosts pattern, reverse proxy
  handling (Coolify terminates TLS, Apache sees HTTP), errors hidden.
  A copy is kept in `deploy-seed/` because the persistent config volume
  shadows the image `config` directory on first boot; the entrypoint
  seeds missing files from there.
- `Dockerfile`: `php:8.3-apache`, system libraries for gd (png, jpeg,
  freetype), intl (icu), zip, sqlite and oniguruma, PHP extensions gd,
  intl, zip, pdo_mysql, pdo_sqlite, mbstring, xml, opcache, exif, APCu
  via PECL, Composer from the `composer:2` image. Apache document root
  is rewritten to the app `public` directory. A server level Apache
  snippet (`typo3-redirect.conf`) redirects the bare `/typo3` to
  `/typo3/` (a per-directory rewrite rule produced a Location header
  containing the filesystem path) and sets
  `AllowEncodedSlashes NoDecode` (see the limitation in section 7).

## 4. Entrypoint and first boot flow

`deploy/entrypoint.sh`:

1. Creates writable runtime directories.
2. Seeds the site configuration and `additional.php` from `deploy-seed`
   if the persistent volumes shadowed them.
3. Runs `deploy/firstboot.php`.
4. Fixes ownership for `www-data` and starts `apache2-foreground`.

`deploy/firstboot.php` is idempotent. "Installed" means all of:
settings.php exists, its database driver is `pdo_sqlite`, and the
database it points at contains the `be_users` table. The database path
is always resolved from settings.php, because TYPO3 13.4 setup creates
the SQLite file under a hashed name (`var/sqlite/cms-<hash>.sqlite`),
not `cms.sqlite`. If settings point at an empty database while a
populated SQLite file from an earlier setup exists, settings are
repointed at the populated file instead of re-running setup on a live
installation (this exact failure happened once during this deployment
and took the frontend offline until fixed; see section 6).

Installation order on a fresh instance:

1. Official CLI: `vendor/bin/typo3 setup` with `--driver=sqlite`
   (TYPO3 13.4 accepts the connection types mysqli, pdoMysql, postgres
   and sqlite; the earlier guess `pdo_sqlite` is rejected). The setup
   creates settings and the full schema. Observed behaviour: the
   command exits non-zero (255) at a late step in this container, but by
   then settings.php and a complete schema exist, and firstboot
   finishes the job, so the end state is a working installation either
   way.
2. Manual fallback (only if step 1 leaves no working sqlite settings):
   writes settings.php directly (Argon2i install tool password hash,
   fresh encryption key) and calls `database:updateschema` twice.
   Known limit of the fallback: on a completely empty database,
   `database:updateschema` cannot bootstrap the schema, because
   extensions query their own tables during that command (observed
   error: `no such table: tx_scheduler_task`). On the final image the
   command is not even registered (`There are no commands defined in
   the "database" namespace`), so the calls are harmless no-ops today;
   the setup CLI is the path that actually creates the schema.
3. Seeding by direct PDO (each step only when missing): backend admin
   user `astro_admin` (admin flag, Argon2i password from the
   environment), root page uid 1 (title Home, slug `/`, site root),
   About page uid 2 (slug `/about`), and a root TypoScript template
   that renders the page title and a note that this instance is the
   API backend for the Astro frontend.
4. The install tool password in settings.php is synced with the
   environment on every boot.
5. `vendor/bin/typo3 cache:flush`.

## 5. Environment variables

Set on the Coolify application (values are secrets and appear nowhere
in this repository or document):

- `TYPO3_ADMIN_PASSWORD`: password of the seeded backend admin.
- `TYPO3_INSTALL_PASSWORD`: TYPO3 install tool password.
- `ASTRO_BUILDER_PREVIEW_SECRET`: HMAC secret for API preview tokens.
- `TYPO3_CONTEXT`: `Production`.

Locally generated copies of the admin and install passwords are stored
only in `~/workspace/astrotypo3-tools/typo3-admin.txt` outside the
repository (file mode 600), together with the backend username
`astro_admin`.

## 6. Deployment attempts

Seven deployments of application `yersmlnb8mvivtuyd04fcqib`. All
failures below are code failures in this project, not infrastructure
failures; the one historical infrastructure problem of this host (SSH
outages on 18 October 2026) did not recur.

1. `aulgz2kzzcw5h21dj6ea3q4d`, failed in the image build: compiling
   mbstring failed because `libonig-dev` (oniguruma) was missing on the
   trixie based PHP image. Fixed in the Dockerfile.
2. `6r2xpvxebgmgutllh78rr6ou`, failed at the Composer step: the path
   repository packages resolved as `dev-main` while the root
   `composer.json` required `*`, a stability mismatch. Fixed by
   requiring `dev-main` and setting `prefer-stable`.
3. `ljkphmbpmoxqol1bcxyimyju`, finished: first complete build. Live
   check showed TYPO3's error page on all routes: the firstboot setup
   call used the invalid driver `pdo_sqlite`, the half written
   settings.php pointed at mysqli, and schema creation failed. This
   build still contained the temporary site dispatch package, which was
   removed the same day (routing belongs to the extension).
4. `rrv4t3ta9w31zsdj0hxrns5r`, finished: fallback settings were written,
   but `database:updateschema` could not bootstrap an empty database
   (see section 4), so no schema existed.
5. `cmsr6shzozluddf29x3ofaf9`, finished: first working installation.
   Setup CLI with `--driver=sqlite` created settings and schema
   (SQLite file `cms-05a5e978.sqlite`), firstboot seeded the admin,
   root page, About page and template; all four `tx_astrobuilder_*`
   tables present. Live: frontend 200, backend login 200, API registry
   and templates 200, draft without token 401. Bare `/typo3` still
   redirected to a filesystem path (fixed in attempt 6), and the pages
   endpoint answered the extension's JSON 404 for the seeded pages (see
   section 7).
6. `o0unfmargm7lmknctr4p8xpm`, finished: bare `/typo3` redirect fixed
   at Apache level. Regression: the frontend returned 404 because
   firstboot, still assuming the database file is named `cms.sqlite`,
   judged the instance uninstalled and re-ran setup against the live
   installation, leaving settings and content pointing at different
   database files.
7. `mv2cazxd3yplbycxwfkmvanv`, finished: firstboot resolves the
   database path from settings.php and repoints instead of re-running
   setup. Final state verified live, see section 7.

## 7. Live verification results (20 October 2026)

All checks by direct HTTPS requests against the deployed instance:

| Request | Result |
|---|---|
| `GET /` | 200, TYPO3 frontend renders the seeded root page (`<h1>Home</h1>` and the API backend note) |
| `GET /typo3` | 301 to https://typo3.woodwolfdigital.com/typo3/ |
| `GET /typo3/` | 200, TYPO3 backend login page, title "TYPO3 CMS Login: New TYPO3 site", served over a valid HTTPS certificate |
| `GET /api/content/v1/registry` | 200 JSON, contract version 1.0.0, all 15 components with their `typo3Ctype` values |
| `GET /api/content/v1/templates` | 200 JSON, presets and templates from the shared contract |
| `GET /api/content/v1/draft/about` without token | 401 JSON `{"error":{"code":"unauthorized",...}}` |
| `GET /api/content/v1/pages/about`, `/pages/home`, `/pages//about` | 404 JSON from the extension (`Published page not found.`), see limitation 2 |
| `GET /api/content/v1/pages/%2Fabout` | 404 from Apache before PHP, see limitation 1 |
| `GET https://astrotypo3.woodwolfdigital.com/` | 200, the Astro app is untouched by this deployment |

Container log evidence for the final boot: firstboot resolved the
database path from settings, found the installation present, seeded
nothing twice, reported the four `tx_astrobuilder_*` tables, and
`cache:flush` exited 0.

## 8. Limitations and remaining work

1. Encoded slash slugs: the root page slug in TYPO3 is `/`, so the
   natural API request is `/api/content/v1/pages/%2F`. The local
   verification (`docs/TYPO3_API_VERIFICATION.md`) proves this works
   over the PHP built-in server. On this deployment Apache still
   answers 404 for `%2F` before PHP runs, despite
   `AllowEncodedSlashes NoDecode` in the server configuration, and
   Traefik in front may normalize the path as well. This is no longer
   a blocker: the slug convention below makes the encoded form
   unnecessary, because clients send the trimmed slug.
2. Page lookup semantics: RESOLVED in the final integration pass
   (20 Oct 2026). The extension now normalizes slugs in one place
   (`PageContentService::normalizeSlug`): the canonical client form is
   `pages/{slug}` with the slug trimmed of slashes, `home` and an
   empty slug mean the root page, and any other value resolves as `/`
   plus the trimmed value against the `pages.slug` column. The fix is
   applied at every slug resolution site (published reads, draft reads
   and token verification, builder save) and is documented in
   `docs/CONTENT_API.md` and `docs/TYPO3_API_VERIFICATION.md` section 4.
   This app was redeployed with the fix (deployment
   `d9deartqcvdr06n2n6xzk77h`, finished); live afterwards:
   `pages/home` 200, `pages/about` 200, unknown page 404 JSON, draft
   without token 401, registry and templates 200, `/typo3/` 200.
3. Astro wiring: DONE in the final integration pass (20 Oct 2026).
   Before wiring, the live instance was seeded with the real content
   through the builder save API (token minted from the production
   preview secret): the home page now holds the 8 fixture elements and
   the about page the 2 fixture elements as `tt_content` records,
   verified by read back with identical component sequences.
   `TYPO3_CONTENT_API_URL` is set to
   `https://typo3.woodwolfdigital.com/api/content/v1` on the Astro
   application (`lbjuhudf3sqn1mrq6qr6u6ji`), which was redeployed
   (deployments `iv8muichwyo3dlsl2ts15zfh` and `88xkjn5d9d5plodbozezjnhf`,
   finished). Live verification: `/`, `/about`, `/builder`,
   `/templates`, `/audit`, `/sitemap.xml` and `/robots.txt` all 200,
   unknown slug 404, and the homepage and about page render the TYPO3
   content (the hero heading and the about sections match the TYPO3
   API responses exactly; page titles come from the TYPO3 page
   records). The Astro demo API routes are unchanged and still answer
   for the builder demo mode. Full audit: `docs/GAP_AUDIT.md`.
4. Closed (polish pass, 20 October 2026): `composer.lock` is committed
   and the image build installs from it (TYPO3 13.4.36); builds no
   longer re-resolve patch versions. A clean local `composer install`
   from the lock was verified before the redeployment
   `uoipzrrpvgwbqocyxhkysnlq` shipped it.
5. The database is SQLite. That is a deliberate staging choice and
   matches the verified local setup; production should move to MySQL
   or MariaDB (the image already ships `pdo_mysql`).
6. `database:updateschema` exits 1 on every boot on this image (the
   command is not registered in this build). It blocks nothing: the
   schema is created by the setup CLI and verified present. It is kept
   in firstboot as a forward compatible no-op and logged honestly.

## 9. Operating notes

- Redeploy: push to GitHub `main`, then trigger the Coolify deployment
  for `yersmlnb8mvivtuyd04fcqib`. Firstboot is safe to run on every
  boot; it changes nothing when the installation is complete.
- Container logs (including the `[firstboot]` lines quoted above) are
  available through the Coolify API application logs endpoint.
- Never commit the files under `apps/typo3-cms/var`, `config` runtime
  state, or any credential. Admin credentials live only in the Coolify
  environment and in the tools file named in section 5.
