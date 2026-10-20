# TYPO3 Local Verification

Date: 20 October 2026
Scope: first real run of the `astro_builder` extension on a real TYPO3 instance, following milan's architecture decision that TYPO3 is the headless backend engine only, connected via API, with no custom interface inside the TYPO3 backend. Verification therefore prioritised the API surface, extension loading, database schema, and the two-way mapping between builder elements and TYPO3 core content elements (`tt_content`), over any backend UI.

Test instance: `~/workspace/astrotypo3-typo3-test/` (separate from this repository, not deployed anywhere).

## Environment

| Item | Result |
|---|---|
| OS | Ubuntu 24.04, root, apt-get available |
| PHP | 8.3.6 (php8.3-cli), installed via apt with xml, mbstring, intl, gd, zip, curl, sqlite3, mysql, apcu, opcache |
| Composer | 2.10.3 (official installer; the first download attempt via PHP `copy()` failed on SSL through the local proxy, the curl download worked) |
| TYPO3 | CMS 13.4.36, from `typo3/cms-base-distribution:^13.4`, SQLite database at `var/sqlite/cms-87b6349e.sqlite` |
| apt note | The first `apt-get update` hung for several minutes on the configured mirrors and was killed; the retry with explicit HTTP timeouts completed. Install itself then took under a minute. |

## PHP syntax check (replaces the earlier structural smoke check)

`php -l` was run on every PHP file under `packages/typo3-extension`:

- 22 files checked, 22 passed, 0 failed. This result still holds after the two fixes described below.

## Extension installation and activation

- Added to the test project with a Composer path repository pointing at `packages/typo3-extension`, required as `crayonwebstudio/astro-builder:@dev`.
- `vendor/bin/typo3 extension:list` shows: `astro_builder, dev-main, Local, active`. In Composer mode the extension is active once required; the `extension:activate` command does not exist in TYPO3 13 Composer installs.
- `vendor/bin/typo3 extension:setup --extension=astro_builder` result: OK, extension successfully set up.
- The `database:updateschema` command named in older TYPO3 documentation is not available in this distribution's CLI command list; `extension:setup` is the TYPO3 13 command that applies the extension schema.

### Tables created in SQLite (verified with sqlite3)

- `tx_astrobuilder_element` (with the TCA-driven `tstamp` and `crdate` columns added by TYPO3 on top of `ext_tables.sql`, plus an index on `page_uid`)
- `tx_astrobuilder_audit`
- `tx_astrobuilder_ai_usage`

## TYPO3 setup and admin

- `vendor/bin/typo3 setup` ran non-interactively with `--driver=sqlite`, created the database, a root page (uid 1, title "Home", slug `/`, site root) and a site configuration with `rootPageId: 1`, base `http://localhost:8080/`, and empty `routes`.
- Backend admin user `astro_admin` was created for this local test only. Its password is stored only in `~/workspace/astrotypo3-typo3-test/LOCAL_ADMIN.txt` (file mode 600), never in this repository or in any doc. The first generated password was rejected by TYPO3 setup for lacking a special character and was regenerated.
- Serving the test instance with `php -S localhost:8080 -t public public/index.php`: `GET /` returned HTTP 200 with a real TYPO3 frontend page (7,491 bytes). The backend path returned 404 under this single-entry router setup, which is an artifact of using the frontend `index.php` as the router for all paths; backend access was verified through the CLI instead (admin user exists, extension list and site list work).

## Defects found on the real TYPO3 and fixed

Verification on a real TYPO3 found two defects that the earlier structural smoke check could not see. Both fixes are minimal and are in this repository.

1. DI container failure (blocked setup entirely). The first `typo3 setup` run died with: cannot autowire `AiOrchestrationService`, argument `$provider` references interface `AiProviderInterface` but no such service exists. `Configuration/Services.yaml` never aliased the interface. Fix: alias `AiProviderInterface` to `MockProvider` in `Services.yaml`, matching the documented default (labelled mock provider; a site package can override the alias with `OpenAiCompatibleProvider`). After the fix, setup completed.
2. Content API always returned 404. `PageContentService::findBySlug()` called `createNamedParameter(0, \PDO::PARAM_INT)`. Doctrine DBAL 4, which TYPO3 13 uses, rejects the PDO constant type and throws a TypeError; the service catches `\Throwable` and returns null, so every page lookup silently failed. Fix: use `\TYPO3\CMS\Core\Database\Connection::PARAM_INT`. After the fix, the controller returned the real root page (see API results).

## API surface verification

The controllers were exercised through the real TYPO3 dependency injection container in CLI context, against the real database (script kept in the test project as `verify_extension.php`).

| Call | Result |
|---|---|
| `ContentApiController::pageAction`, slug `/` (before fix) | HTTP 404 `{"error":{"code":"not_found",...}}` for an existing page, defect 2 above |
| `ContentApiController::pageAction`, slug `/` (after fix) | HTTP 200 `{"id":"page-1","slug":"/","title":"Home","status":"published","locale":"en","seo":[],"elements":[]}` |
| `ContentApiController::pageAction`, slug `does-not-exist` | HTTP 404, correct |
| `ContentApiController::draftAction`, slug `/`, no preview token | HTTP 401 `{"error":{"code":"unauthorized","message":"A valid preview token is required for draft content."}}`, correct |
| `ContentApiController::registryAction`, no contract path configured | HTTP 200 with `{"contractVersion":"1.0.0","components":[]}`, see registry note below |
| `ComponentRegistryService` with the shared contract path provided | 15 components loaded: layout.container, layout.columns, content.heading, content.rich-text, content.image, content.button, content.divider, section.hero, section.feature-grid, section.image-text, section.testimonials, section.faq, section.cta, navigation.header, navigation.footer. Templates loaded with keys elementPresets, sectionTemplates, pageTemplates, siteTemplates |

Registry note: the registry and templates are empty when the extension is installed on its own, because `ComponentRegistryService` resolves the contract path only from a constructor argument (never set in `Services.yaml`) or the `ASTRO_BUILDER_SHARED_CONTRACT_PATH` environment variable. With the path set, all 15 components load correctly. Recommended production fix: ship a copy of `registry.json` and `templates.json` inside the extension under `Resources/Private/Data/` as the fallback, or set the argument explicitly in `Services.yaml`.

### HTTP level results and the missing route wiring

- `GET http://localhost:8080/api/content/v1/pages/home` returned TYPO3's HTML 404 page.
- `GET http://localhost:8080/api/content/v1/draft/home` without a token also returned the HTML 404 page, not the middleware 401 JSON.

Reason, verified by inspection: the extension registers no HTTP route to its controllers. There is no `Configuration/Routes`, no frontend plugin (deliberate, see `ext_localconf.php`), and no site route; the test site's `routes` are empty. The comment in `ext_localconf.php` says routes are registered through the site configuration, but no such configuration ships with the extension or the test site. The `PreviewAuthMiddleware` is present in the resolved frontend middleware stack (confirmed in `var/cache/code/core/middlewares_frontend_*.php`, positioned after the site middleware as configured), but for an unknown `/api/...` path the TYPO3 page resolver produces the 404 before the inner middleware and any controller are reached. Conclusion: the controller and middleware logic are verified working at container level; HTTP routing to them is a real, still-open wiring task for the site package (site routes, a page type, or a dedicated API entry point). Until that exists, the PHP API cannot be called over HTTP.

## tt_content: two-way mapping with TYPO3 core elements

This is the mapping milan's architecture depends on: an element created in the external builder must create or register its TYPO3 core content element (a `tt_content` record with a CType), and TYPO3 core elements must load back into the builder as blocks.

### What was verified working (TYPO3 mechanisms, real database)

- Write direction (builder to TYPO3): using TYPO3's `DataHandler` with the local admin as BE_USER, two `tt_content` records were created on page 1: CType `text` (header "Builder created heading", with bodytext) and CType `header` (header "Second core element"). DataHandler reported 0 errors and assigned uids 1 and 2. This proves the native, permission and revision aware write path the builder API should use.
- Read direction (TYPO3 to builder): the same records were read back with the TYPO3 QueryBuilder (uid, pid, CType, header, colPos, sorting), which is the core mechanism for loading core elements into the builder as blocks.
- Extension table: a `tx_astrobuilder_element` row (component_id `section.hero`, page_uid 1) was inserted and persisted without error.

### What does NOT exist yet in the extension (gaps, stated plainly)

- `PageContentService` reads only the `pages` table (uid, title, slug). It never reads `tt_content` and never reads `tx_astrobuilder_element`; the verified 200 response above contains `"elements":[]` even though both a `tt_content` record set and an extension element row exist for that page. Element loading is an isolated stub, as its own code comment admits.
- The extension contains no reference to `tt_content` anywhere in `Classes/`, `Configuration/` or `ext_localconf.php`, and no `Configuration/TCA/Overrides/` directory. So no builder component is currently registered as a CType, and no core element is currently mapped to a builder block by the extension itself.
- `BuilderApiController::saveAction` validates a page payload and returns it; it does not persist anything (its comment delegates persistence to DataHandler in the site integration, which does not exist yet).

### Dynamic CType registration options (for the mapping implementation)

These are the supported TYPO3 13 mechanisms, noted for the follow-up implementation; they were not implemented in this verification scope:

1. Static registration per component: ship `Configuration/TCA/Overrides/tt_content.php` in the extension. For each builder component that should exist as a core element, add a CType select item with `ExtensionManagementUtility::addTcaSelectItem('tt_content', 'CType', [...])` and define `$GLOBALS['TCA']['tt_content']['types']['<ctype>']` with a `showitem` field list. This is the standard way third-party content elements (for example container or mask elements) appear in the TYPO3 new-element wizard and in DataHandler validation.
2. Registry driven registration: keep one mapping table, either the existing `tx_astrobuilder_element` table extended with a `ctype` column, or a dedicated mapping in the shared contract (`registry.json` entry per component with a `typo3CType` field). A single TCA override file then loops over the registry and registers every mapped CType at bootstrap, so adding a component to the shared registry registers its core element without new PHP. The GrapesJS block id, the registry component id and the CType stay one string.
3. Field mapping: map builder props to core fields (`header`, `bodytext`, `image`, `header_link`, `colPos`, `sorting`) in one mapper service used by both directions: builder save converts a block into a DataHandler data map for `tt_content` (write), and the content API converts `tt_content` rows back into registry components (read). Unmapped custom props can be stored as JSON in the matching `tx_astrobuilder_element` row keyed by the `tt_content` uid.
4. Guard rails: CType registration must happen at extension bootstrap (TCA build time), so a brand new component created in the builder at runtime can only become a selectable CType after a cache flush; the API should say so honestly instead of pretending instant registration. DataHandler already enforces TCA, permissions and workspaces for every write, which is why the mapping should go through it rather than direct SQL.

## Summary

- Extension loads and is active on a real TYPO3 13.4.36, its three tables are created, admin and site setup work, the frontend renders.
- `php -l`: 22 of 22 files pass.
- Two real defects were found and fixed (DI alias, DBAL parameter type). Both fixes are required for the extension to work at all on TYPO3 13.
- Content API logic is verified at controller level (published 200, missing 404, draft 401, registry 15 components with path configured).
- Still open, honestly: HTTP route wiring to the controllers, element loading in `PageContentService` (elements are always empty today), the tt_content two-way mapper and CType registration, and persistence in the builder save action. TYPO3 remains unverified as a deployed staging instance; this verification is a local test instance only.
