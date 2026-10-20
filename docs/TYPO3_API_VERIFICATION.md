# TYPO3 API Verification

Date: 20 October 2026. Scope: close the gaps found by `docs/TYPO3_LOCAL_VERIFICATION.md` (HTTP routing, bundled contract, tt_content element mapper, persistent builder save, element types API) and re-verify everything over real HTTP against the local TYPO3 instance. No em dashes are used in this document.

Environment, unchanged from the earlier verification: `~/workspace/astrotypo3-typo3-test/`, TYPO3 CMS 13.4.36, PHP 8.3.6, SQLite database `var/sqlite/cms-87b6349e.sqlite`, site root page uid 1 with slug `/`, extension `astro_builder` installed from the repository through a Composer path repository (symlink), so repository edits are live in the test instance. Server used for this run:

```
cd ~/workspace/astrotypo3-typo3-test
php -S localhost:8080 -t public public/index.php
```

## 1. What was implemented

### 1.1 HTTP routing: ApiMiddleware

New file `Classes/Middleware/ApiMiddleware.php`, registered in `Configuration/RequestMiddlewares.php` as `crayonwebstudio/astro-builder/api` with `before: typo3/cms-frontend/page-resolver` and `typo3/cms-frontend/base-redirect-resolver`, `after: typo3/cms-frontend/site`.

Resolved stack position, verified in the compiled middleware list of the test instance (`var/cache/code/core/middlewares_frontend_*.php`, index 0 executes last):

```
0  crayonwebstudio/astro-builder/preview-auth
11 typo3/cms-frontend/page-resolver
14 typo3/cms-frontend/base-redirect-resolver
15 crayonwebstudio/astro-builder/api
21 typo3/cms-frontend/site
```

Execution runs from the highest index down, so the API middleware executes after site resolution and before both the base redirect resolver and the page resolver, which previously turned every API path into the TYPO3 HTML 404 page. It intercepts exactly these paths and passes everything else through untouched (the normal frontend still returns 200 on `/`):

- `GET /api/content/v1/pages/{slug}`: `ContentApiController::pageAction`, slug is the URL decoded remainder of the path, slashes included
- `GET /api/content/v1/draft/{slug}`: `draftAction`, preview token rules stay inside the existing `PreviewAuthMiddleware` and `PreviewTokenService`
- `GET /api/content/v1/registry`, `GET /api/content/v1/templates`
- `GET` and `POST /api/v1/element-types`: `ElementTypeApiController`
- `POST /api/builder/v1/save`: requires a valid preview token for the page slug in the JSON body (checked in the middleware with `PreviewTokenService`), then calls `BuilderApiController::saveAction` with the decoded body as parsed body
- Any other method on these paths returns JSON 405

### 1.2 Contract bundled inside the extension

`packages/shared-contract/registry.json` and `templates.json` were copied to `packages/typo3-extension/Resources/Private/Contract/`. `Configuration/Services.yaml` now passes `Resources/Private/Contract` as the `ComponentRegistryService` path argument, and the service resolves it against the extension root when it is relative. The `ASTRO_BUILDER_SHARED_CONTRACT_PATH` environment variable still wins when set. Result: the registry endpoint returns all 15 components with no environment variable set (verified below).

### 1.3 Content element mapper (two-way core element mapping)

New file `Classes/Service/ContentElementMapper.php`. Every registry component gained a `typo3Ctype` field in `packages/shared-contract/registry.json`, in the bundled extension copy, and in the Astro synced copy `apps/astro-frontend/src/data/registry.json`:

- Core CTypes stay core: heading is `header`, rich-text is `text`, image is `textpic`, divider is `div`
- Builder components use `astro_builder_<component id with dots as underscores>`, for example `section.hero` is `astro_builder_section_hero`
- Reverse fallback map: `bullets` and `table` have no registry component and map to `content.rich-text` (documented fallback), unknown CTypes also fall back to `content.rich-text`

Read path (`elementsForPage`): `tt_content` records with `pid` = page uid, `colPos` 0, ordered by `sorting`, hidden and deleted respected (draft reads include hidden). Element shape matches the content contract: `id` is `ttcontent-<uid>`, `componentId` from the CType, props as follows.

Field mapping split, as designed:

- Native fields for core CTypes: `header` becomes the heading or text prop, `bodytext` becomes `html`, `header_layout` becomes heading level, `header_position` becomes align
- Full props store for everything else: `tx_astrobuilder_element.props` (JSON) keyed by the new `tt_content_uid` column (added in `ext_tables.sql`). When a props row exists it wins over the native mapping, so a builder save round-trips props exactly
- Images: `content.image` resolves the first FAL `sys_file_reference` to a `/fileadmin<identifier>` URL on a best effort basis; when no FAL reference exists the native mapping returns empty image props (documented limit)
- Nested children: stored inside the parent props under `_children` and expanded back into the element `children` array on read. Children are not separate `tt_content` records yet (documented limit)

`PageContentService` now uses the mapper, so elements are no longer always empty.

Write path (`persistPageElements`, called by `BuilderApiController::saveAction` after validation):

- Records are written through DataHandler with an explicit backend user context (env `ASTRO_BUILDER_BUILDER_USER`, else the first active admin), the mechanism proven in the earlier verification
- An element whose id is `ttcontent-<uid>` and which belongs to the page is updated in place; new elements are created. Sorting is the payload order times 128, normalized again after the save because DataHandler renumbers sorting of new records with its own small values
- Deletion rule (conservative): a record is deleted (DataHandler delete, so `deleted` flag) only when it belongs to the page, is linked to a props row (builder managed), and is missing from the payload. Records the builder never managed are never touched
- Props rows are upserted per record, including `_children`

Bugs found and fixed during this work, all real and reproduced:

1. DBAL 4 `Connection::select()` returns a `Result` object that is not iterable. Three `foreach` loops over it silently saw zero rows (props reads, managed record detection, existing record detection). All now use `fetchAllAssociative()`. Symptom before the fix: save responses read back generic native props instead of the stored props
2. DataHandler renumbered `sorting` on insert (new records got 0 and 1), scrambling payload order. Fixed by the post-save sorting normalization described above
3. Running `composer dump-autoload` as root without `COMPOSER_ALLOW_SUPERUSER=1` disables Composer plugins in a non-interactive session, which dropped the TYPO3 autoload include files and silently broke composer mode (TYPO3 then scanned a nonexistent `vendor/typo3/sysext` path). Re-running with the variable set restored the instance. This was an environment trap in the test instance, not an extension defect; recorded here so it is not rediscovered the hard way

### 1.4 CType registration

New file `Configuration/TCA/Overrides/tt_content.php`: registers every `astro_builder_*` CType from the bundled registry (11 types: the 15 components minus the 4 that map to core CTypes) with `addTcaSelectItem` in an "Astro Builder" item group, plus a `types` showitem using the generic fields (header, subheader, bodytext). Per-component fields beyond the generic ones live in the props store by design.

Custom element types are registered by the same file. Note: TYPO3 forbids using the `ConnectionPool` during TCA loading (it throws a LogicException, found by debugging this file), so the override reads `tx_astrobuilder_element_type` through a plain PDO connection built from the TYPO3 database configuration in `$GLOBALS['TYPO3_CONF_VARS']`. Guarded by try and catch: when the table does not exist yet, core types still register.

### 1.5 Element types registry and API

The element type workstream had not landed in the extension tree (the controller, service and table did not exist), so a minimal version was implemented as specified:

- Table `tx_astrobuilder_element_type` in `ext_tables.sql` plus TCA in `Configuration/TCA/tx_astrobuilder_element_type.php`
- `Classes/Service/ElementTypeRegistryService.php`: GET list is the 15 registry components (source `core`, fields derived from their props schema) plus custom rows (source `custom`); create validates the id pattern (dotted lowercase), requires a label, checks duplicates, and allows only the field types string, text, number, boolean, enum, image, link, array, object
- `Classes/Controller/ElementTypeApiController.php`: POST requires a preview token minted for the scope slug `element-types` (401 without), validation errors are 422, success is 201 with the type and its CType
- `ValidationService` now also validates elements of custom types against their declared fields, and `ContentElementMapper` resolves custom CTypes back to their type id, so content of a custom type saves and reads correctly end to end
- Cache flush rule: a type created through the API is listed and usable through the API immediately, and content with its CType can be written through DataHandler right away (proven below), but the CType appears in the backend element wizard only after a TYPO3 cache flush, because TCA is compiled

## 2. Commands and results

Setup in the test instance:

```
COMPOSER_ALLOW_SUPERUSER=1 composer dump-autoload     (see bug 3 above)
vendor/bin/typo3 extension:setup --extension=astro_builder   [OK] Extension(s) "astro_builder" successfully set up.
vendor/bin/typo3 cache:flush
```

Schema after setup: table `tx_astrobuilder_element_type` created; column `tt_content_uid` present on `tx_astrobuilder_element` (checked with sqlite3 against `var/sqlite/cms-87b6349e.sqlite`).

Lint and activation:

```
php -l on all extension PHP files: 28 files, 0 failed
vendor/bin/typo3 extension:list: astro_builder, dev-main, Local, active
```

HTTP results (base `http://localhost:8080`, tokens minted through the real `PreviewTokenService` in a CLI helper in the test project):

| Request | Result |
|---|---|
| `GET /api/content/v1/pages/%2F` (published root page) | 200 JSON, 8 elements on the first run: the `tt_content` records created by the earlier verification (uid 1 to 8), mapped to `content.rich-text` (html from bodytext, heading from header) and `content.heading` (text, level 2) |
| `GET /api/content/v1/pages/does-not-exist` | 404 JSON `{"error":{"code":"not_found",...}}` |
| `GET /api/content/v1/registry` (no env var set) | 200, 15 components, each with `typo3Ctype` |
| `GET /api/content/v1/templates` | 200, keys contractVersion, elementPresets, sectionTemplates, pageTemplates, siteTemplates |
| `GET /api/content/v1/draft/%2F` without token | 401 JSON |
| `GET /api/content/v1/draft/%2F` with valid token | 200 JSON, status draft, elements included |
| `GET /api/content/v1/draft/%2F` with bogus token | 401 |
| `POST /api/content/v1/registry` (wrong method) | 405 JSON |
| `GET /` (normal frontend passthrough) | 200, TYPO3 frontend unaffected |
| `GET /api/v1/element-types` | 200, 15 core types, for example `content.heading` with ctype `header` |
| `POST /api/builder/v1/save` without token | 401 |
| `POST /api/builder/v1/save` with an empty enum prop | 422 with detail `elements[1].props.align: invalid enum value` (validator working over HTTP) |

Builder save persistence proof (SQLite checked directly after each call):

1. Save with two new elements (section.hero, content.heading) returned 200 `{"status":"saved",...}`. `tt_content` count went 8 to 10. New records: uid 9 `astro_builder_section_hero` header "Saved through the builder API", uid 10 `header` "A saved heading", both pid 1, colPos 0. Props rows created, linked by `tt_content_uid`
2. Read back `GET /api/content/v1/pages/%2F`: hero returned with its full stored props (heading, subheading, ctaLabel, ctaHref, imageSrc, imageAlt), heading with align `left`, proving the props store wins over native mapping
3. Second save referencing `ttcontent-9` and `ttcontent-10`, reordered, text changed, plus a new section.cta: count 10 to 11 (updates in place, no duplicates), new record uid 11 `astro_builder_section_cta`, sorting normalized to payload order 128, 256, 384
4. Third save with only the hero element: uid 10 and uid 11 have `deleted = 1`, uid 9 kept, and all 8 unmanaged records (uid 1 to 8) still present with `deleted = 0`, proving the conservative deletion rule
5. Save with a `layout.container` holding one child heading: created uid 13 `astro_builder_layout_container`; read back returned the child inside `children` with its props intact

Element types proof:

| Request | Result |
|---|---|
| `POST /api/v1/element-types` without token | 401 |
| `POST` with token, invalid id and field type | 422 with three precise validation details |
| `POST` with token, `custom.pricing-table` with fields heading (string), plans (array), highlight (boolean) | 201, ctype `astro_builder_custom_pricing_table`, note about the cache flush |
| `GET /api/v1/element-types` after create | 200, 16 types, the custom type listed with its fields |
| `POST` duplicate id | 422 |
| Builder save containing a `custom.pricing-table` element | 200; created `tt_content` uid 12 with CType `astro_builder_custom_pricing_table`; read back returned componentId `custom.pricing-table` with full props |
| TCA after `vendor/bin/typo3 cache:flush` | 12 `astro_builder_*` CTypes registered (11 registry + `astro_builder_custom_pricing_table`), `types` definitions present for hero and the custom type (checked in a CLI script reading `$GLOBALS['TCA']`) |

Final element count on page 1 after all saves: 11 elements returned by the published page endpoint (8 original records, hero, custom pricing table, container).

Astro side, after the `typo3Ctype` additions to the synced registry copy:

```
cd apps/astro-frontend && npm install && npm test
22 tests, 22 passed, 0 failed
```

`node_modules`, `dist` and `.astro` were removed again after the run.

## 3. Remaining gaps, stated honestly

- Children are one level of nesting stored in the parent props; deeply nested structures and child records as separate `tt_content` rows are not implemented
- Image props from FAL are best effort (first reference, `/fileadmin` path); no image processing or absolute URL handling
- Custom element types need a TYPO3 cache flush before the CType is selectable in the backend wizard; the API itself is not blocked by this
- The API middleware dispatches to controllers directly instead of registering Extbase or site routes; this is deliberate for a headless API surface, but it means TYPO3 route enhancers and backend module integration do not apply to these paths
- Verified on SQLite only; the PDO based TCA registration also covers the `pdo_mysql` and `mysqli` configurations, but that path was not executed here
- The test instance helper scripts (`make_tokens.php`, `maptest.php`, `tcatest*.php`, `dbtest.php`) live in the local test project only and are not part of the repository
