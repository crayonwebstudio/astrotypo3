# Final Report

## What was built

A monorepo with three packages:

1. `packages/shared-contract/`: component registry with 15 components, template library (4 presets, 4 section templates, 5 page templates, 1 site template), 4 JSON schemas, a dependency free validator in ESM plus TypeScript declarations, and published, about and draft fixtures.
2. `packages/typo3-extension/`: TYPO3 13.4 extension `astro_builder` in PHP 8.2 with strict types: versioned content API controller, builder and AI and publish controller, preview auth middleware, domain models, registry, validation, preview token (HMAC) and publish services, AI provider interface with a labelled mock and an OpenAI compatible adapter, change plan validator, rich text sanitizer, TCA and SQL for element, audit and AI usage tables.
3. `apps/astro-frontend/`: Astro 5 SSR app with the Node adapter: fixture and TYPO3 API content loading, renderers for all 15 components, design tokens, SEO layout, sitemap and robots endpoints, visual builder, template browser, deterministic audit page, token gated draft preview with a validated editing bridge, and API routes for content, draft, AI generate and edit, builder save and publish.

Plus: root Dockerfile for Coolify (port 4321), docker compose for local development with a documented PHP reference service, GitHub Actions CI, and full documentation including 4 ADRs.

## Commands actually run and their results

Working directory: `apps/astro-frontend` unless noted.

| Command | Result |
|---|---|
| `npm install` | Succeeded. 298 packages added. Created `package-lock.json`, so the Dockerfile can use `npm ci`. |
| `npm test` | Passed. 10 tests, 10 passed, 0 failed. Note: the test script uses `node --test tests/*.test.mjs` because passing a bare directory to Node 24 test runner fails to resolve. |
| `npm run build` | Succeeded. Astro server output, Node adapter, client builder bundle built. |
| `node dist/server/entry.mjs` with PORT 4321, then curl checks | See the live results table below. |
| PHP structural smoke check (Python script counting strict types and balanced delimiters over all PHP files) | Passed for 22 PHP files. Documented as a smoke check only. |
| Em dash scan over authored files | No em dashes in authored files. The roadmap file is a byte identical copy of the supplied source, verified with diff. |
| Hardcoded secrets scan | No hardcoded secrets found. |

## Live server verification results

| Check | Expected | Actual |
|---|---|---|
| GET / | 200, hero heading rendered | 200, hero text present |
| GET /about | 200 | 200 |
| GET /nope | 404 | 404 |
| GET /builder | 200 | 200 |
| GET /templates | 200 | 200 |
| GET /audit | 200 | 200 |
| GET /preview/home without token | 401 | 401 |
| GET /preview/home?token=demo | 200 with DRAFT badge | 200, badge present |
| GET /api/content/v1/pages/home | 200 published JSON | 200 |
| GET /api/content/v1/draft/home without token | 401 | 401 |
| GET /api/content/v1/draft/home with demo token header | 200 draft JSON | 200 |
| POST /api/ai/generate (faq prompt) | 200, mock labelled plan | 200, provider mock, mock true |
| POST /api/publish with no webhook configured | Honest failure, 502 | 502 with a clear nothing was published message |
| POST /api/builder/save with a valid page | 200 saved, demo notice | 200 |
| POST /api/builder/save with an unknown component | 422 validation failed | 422 |
| GET /sitemap.xml | 200 XML | 200 |

## Setup instructions

Demo: `cd apps/astro-frontend && npm install && npm run dev`, then open http://localhost:4321.
Production Astro: root Dockerfile, or `npm run build` then `PORT=4321 HOST=0.0.0.0 node dist/server/entry.mjs`.
Full TYPO3 setup: `docs/INSTALLATION.md`.

Environment variables: `TYPO3_CONTENT_API_URL`, `TYPO3_PREVIEW_SECRET`, `PUBLISH_WEBHOOK_URL`, `PUBLISH_WEBHOOK_SECRET` for Astro. For TYPO3: `ASTRO_BUILDER_PREVIEW_SECRET`, `ASTRO_BUILDER_SHARED_CONTRACT_PATH`, `ASTRO_BUILDER_PUBLISH_WEBHOOK_URL`, `ASTRO_BUILDER_PUBLISH_WEBHOOK_SECRET`, and `OPENAI_COMPATIBLE_API_KEY` plus `OPENAI_COMPATIBLE_BASE_URL` only for a real AI provider.

## Verified versus unverified

Verified: Astro build, all unit and contract tests, every live route and API behaviour in the table above, registry and renderer sync, template validation, preview token logic, change plan allowlist enforcement, sanitizer behaviour, PHP file structure (smoke check).

Unverified: anything that needs a running TYPO3 (extension loading, TCA rendering, database queries in `PageContentService`, DataHandler persistence, backend permissions). PHP syntax with `php -l` (no PHP runtime in this environment; CI runs it). Browser interaction tests with Playwright (no browser automation in this environment; builder state logic is covered through module tests and live page loads). Real AI provider calls (mocked by design).

## Known limitations and remaining work

1. TYPO3 element persistence: the builder controller validates and returns the draft, and persistence is delegated to TYPO3 DataHandler in the site integration. A live TYPO3 functional test is still needed.
2. AI element creation is a proposal and approval format only. It does not auto register components.
3. Image generation is only a validated request operation. No provider is configured.
4. Publishing has no persistent job store or rollback UI. Status comes from the webhook receiver response.
5. The Astro builder and save endpoint are demo mode: local storage plus an unauthenticated demo store. Production editing belongs in TYPO3.
6. The demo preview token shortcut (`token=demo`) exists only when no preview secret is configured and is documented in `docs/SECURITY.md`. Set `TYPO3_PREVIEW_SECRET` to disable it.

## Roadmap tasks not completed, with reasons

No phase was skipped silently. Phases 4, 11, 12, 13 and 14 are partial for the reasons in `docs/IMPLEMENTATION_STATUS.md`: they depend on a live TYPO3 instance, a real AI or image provider, or a configured deployment target, none of which exist in this local environment. Everything that could be built and verified without those external systems was built and verified.

## Deployment addendum (2026-10-20, verified live)

- GitHub: https://github.com/crayonwebstudio/astrotypo3 (111 files on main; only .github/workflows/ci.yml is missing because the stored token has no workflow scope, the file remains in the local repo)
- Coolify: project astrotypo3 (kdygvgpt7khbtfnqqsxtqyct), app astrotypo3 (lbjuhudf3sqn1mrq6qr6u6ji) on Woodwolf server, deployment us4st3kgyz7igtauk7whr25a finished 2026-10-20T10:16:03Z, commit b376279
- Live verification at https://astrotypo3.woodwolfdigital.com on 2026-10-20: /, /about, /builder, /templates, /audit, /sitemap.xml all HTTP 200, homepage title correct, content API 200, draft API 401 without token, preview 200 with demo token, AI generate 200 with mock provider labelled
- Local run output: docs/LOCAL_RUN_OUTPUT.md (10/10 tests, build pass, full smoke suite pass on localhost:4321)

## TYPO3 local verification addendum (2026-10-20)

Full detail: `docs/TYPO3_LOCAL_VERIFICATION.md`. Test instance: `~/workspace/astrotypo3-typo3-test/` (local only, not deployed).

- Environment: PHP 8.3.6 (apt, with xml, mbstring, intl, gd, zip, curl, sqlite3, mysql, apcu), Composer 2.10.3, TYPO3 CMS 13.4.36 from `typo3/cms-base-distribution:^13.4` on SQLite.
- `php -l` on all extension PHP files: 22 checked, 22 passed, 0 failed. This replaces the earlier structural smoke check as the PHP syntax evidence.
- Extension installed via a Composer path repository, listed by TYPO3 as `astro_builder, dev-main, Local, active`; `extension:setup` OK; tables `tx_astrobuilder_element`, `tx_astrobuilder_audit` and `tx_astrobuilder_ai_usage` created in the real database.
- Non-interactive `typo3 setup` created the site (root page uid 1, slug `/`) and a local-only backend admin `astro_admin`; the password lives only in the test project's `LOCAL_ADMIN.txt`, never in this repository. The instance serves its frontend over HTTP 200 on localhost.
- Two real defects were found only because a real TYPO3 ran the code, and both are fixed in this repository: (1) `Services.yaml` had no alias for `AiProviderInterface`, so the DI container failed and TYPO3 setup died; the alias now points to the labelled `MockProvider` default. (2) `PageContentService` used `\PDO::PARAM_INT` with Doctrine DBAL 4, which throws and was silently caught, making every content API page lookup return 404; it now uses `Connection::PARAM_INT`.
- API verified at controller level through the real DI container: published page 200 with the real root page, missing page 404, draft without token 401, registry loads all 15 components and all template groups when the shared contract path is configured (empty registry when it is not, a documented configuration gap).
- tt_content two-way mapping: the native mechanisms are verified (DataHandler created CType `text` and `header` records with 0 errors; QueryBuilder read them back; a `tx_astrobuilder_element` row persisted). The extension itself does not yet map elements: `PageContentService` returns `elements: []`, no CType registration exists, and the builder save action does not persist. Options for registry driven CType registration (TCA overrides plus a mapping in the shared contract) are documented in the verification doc.
- Still unverified or open after this addendum: HTTP routing to the PHP controllers (API paths return TYPO3's 404 page until site routes or an API entry point are added), a deployed TYPO3 staging instance, a real AI provider, and real publishing.

## TYPO3 API verification addendum (2026-10-20, later the same day)

Full detail: `docs/TYPO3_API_VERIFICATION.md`. The gaps left open by the addendum above are now closed and re-verified over HTTP on the same local TYPO3 13.4.36 instance:

- HTTP routing: a new frontend `ApiMiddleware` intercepts the `/api/*` paths before the page resolver (verified position in the resolved middleware stack) and dispatches to the existing controllers. Published page 200 JSON with real elements, missing page 404 JSON, draft 401 without token and 200 with a valid token, wrong method 405 JSON, normal frontend untouched.
- Contract: the shared registry and templates are bundled inside the extension (`Resources/Private/Contract`), so the registry endpoint returns all 15 components with no environment variable set. The env var override still works.
- Element mapping: `ContentElementMapper` maps `tt_content` to page elements and back. Registry components carry `typo3Ctype` in the shared contract and both synced copies. Core CTypes keep native fields; full props live in `tx_astrobuilder_element` keyed by the new `tt_content_uid` column. `PageContentService` returns real elements.
- Builder save persists: DataHandler writes through the API created new `tt_content` records (proof uids 9 and 10 on page 1), updates in place without duplicates, keeps payload order in `sorting`, and deletes only builder managed records (uids 10 and 11 flagged deleted while the 8 unmanaged records stayed untouched).
- Element types: registry table, service and API controller implemented in the extension (they did not exist in the tree before this run, despite an earlier status line implying otherwise; that line is corrected by the evidence here). POST 401 without token, 422 on invalid or duplicate, 201 on create with CType `astro_builder_custom_pricing_table`; content of a custom type persists as a real `tt_content` record (uid 12) and reads back with full props.
- CType registration: TCA override registers the 11 `astro_builder_*` registry CTypes plus API created custom types; a cache flush is required before a new custom CType appears in the backend wizard. TYPO3 forbids the ConnectionPool during TCA loading, so the override reads the type table through plain PDO.
- Three real defects were found and fixed during this run: DBAL 4 `Connection::select()` results are not iterable (three silent empty loops), DataHandler renumbering `sorting` on insert, and a Composer plugin trap in the test instance (root without `COMPOSER_ALLOW_SUPERUSER` drops the TYPO3 autoload includes). All are documented in the verification doc.
- `php -l`: 28 of 28 extension PHP files pass. Astro tests after the registry sync: 22 of 22 pass.
- Still open after this addendum: a deployed TYPO3 staging instance, a real AI provider, real publishing, child elements as separate `tt_content` records, and MySQL runtime verification (SQLite only here).

## TYPO3 Coolify deployment addendum (2026-10-20, later the same day)

Full detail: `docs/TYPO3_DEPLOYMENT.md`. The deployed TYPO3 staging instance left open above now exists.

- Coolify application astrotypo3-typo3 (`yersmlnb8mvivtuyd04fcqib`) on the Woodwolf server, domain https://typo3.woodwolfdigital.com, Dockerfile build from `apps/typo3-cms` in this repo, persistent volumes for var, config and public/fileadmin. TYPO3's role is API backend only: the native backend is used as-is, no custom builder interface exists inside TYPO3, and the GrapesJS builder stays in the Astro app.
- Seven deployments: two build failures (missing libonig-dev for mbstring, Composer stability mismatch on the path repositories), then a chain of firstboot defects found only against real persistent state: invalid setup driver name (`pdo_sqlite` instead of `sqlite`), `database:updateschema` unable to bootstrap an empty database, a bare /typo3 redirect leaking the filesystem path (fixed at Apache level), and firstboot re-running setup on a live installation because TYPO3 13.4 names the SQLite file `cms-<hash>.sqlite`, not `cms.sqlite` (fixed by resolving the database path from settings.php). All failures were code, none infrastructure.
- Final deployment `mv2cazxd3yplbycxwfkmvanv` finished 2026-10-20. Verified live by direct HTTPS requests: `/` 200 with the seeded root page, `/typo3` 301 to `/typo3/`, `/typo3/` 200 backend login over a valid certificate, `/api/content/v1/registry` 200 with all 15 components, `/api/content/v1/templates` 200, `/api/content/v1/draft/about` 401 without a token. The Astro app is untouched and still 200.
- Seeded on the instance by firstboot: backend admin `astro_admin` (credentials only in the Coolify environment and an off-repo tools file, never in this repo), root page uid 1 (slug `/`), About page uid 2 (slug `/about`), root TypoScript template, all four `tx_astrobuilder_*` tables confirmed present in the container log.
- Not wired, deliberately: Astro still renders from its own data. The extension page endpoint returns its JSON 404 for the seeded pages under every slug form that reaches it on this stack, and `%2F` slugs are rejected by Apache before PHP, so pointing `TYPO3_CONTENT_API_URL` at this instance today would return no content. The remaining wiring step is written out in `docs/TYPO3_DEPLOYMENT.md` section 8. Also open: committing a `composer.lock` for the TYPO3 app, and MySQL instead of SQLite for production.

## Final integration addendum (2026-10-20, closing pass)

Full audit: `docs/GAP_AUDIT.md`. This pass re-verified the extension gap work independently, pushed everything, redeployed both applications, seeded the live TYPO3 with real content, and wired Astro to the live TYPO3 API.

- Local re-verification on the TYPO3 13.4.36 test instance: `php -l` 28 of 28 extension files pass. HTTP suite re-run: `pages/home` 200 with mapped elements, `pages/about` 200, unknown page 404 JSON, draft 401 without token and 200 with one, registry and templates 200, element types GET 200. Persistence proof repeated: a builder save appended one new element and created `tt_content` uid 14 on page 1, read back with exact props. Element types: POST create 201 (CType `astro_builder_custom_integration_check`), duplicate 422, no token 401.
- One new defect found and fixed in this pass: a page read from TYPO3 could not be saved back unchanged, because props mapped from native `tt_content` fields violated the component schemas (a stray `heading` prop on rich text, an empty `align` enum value on headings). `ContentElementMapper` now filters native-field props through the declared schemas (`schemaSafeProps`); props stored by the builder are exact and never filtered. Recorded in `docs/TYPO3_API_VERIFICATION.md` section 5.
- Push: GitHub main now holds 147 files including `ApiMiddleware.php`, the updated `PageContentService.php` and `ContentElementMapper.php`, the GrapesJS builder, and `apps/typo3-cms`. Only `.github/workflows/ci.yml` is still missing (the stored token lacks workflow scope).
- TYPO3 redeployed (deployment `d9deartqcvdr06n2n6xzk77h`, finished) and verified live: backend login 200, registry 200, `pages/home` and `pages/about` 200, unknown page 404 JSON, draft 401.
- Seeding: the fixture home and about payloads were saved into the live TYPO3 through the builder save API with tokens minted from the production preview secret. Read back: home 8 elements, about 2 elements, component sequences identical to the fixtures.
- Astro wiring: `TYPO3_CONTENT_API_URL=https://typo3.woodwolfdigital.com/api/content/v1` set on the Astro app and redeployed (deployments `iv8muichwyo3dlsl2ts15zfh` and `88xkjn5d9d5plodbozezjnhf`, finished; the second carries a title fallback fix for TYPO3-sourced pages). Verified live: all main routes 200, unknown slug 404, homepage hero and about sections match the TYPO3 API responses, page titles come from the TYPO3 page records, the GrapesJS bundle is served at `/builder`, and the Astro demo API still answers 200 published and 401 draft. Tests after the Astro change: 22 of 22, build passes.
- Acceptance state per `docs/GAP_AUDIT.md`: Phases 0, 1, 2, 3, 5, 8, 9 and 15 Done; Phases 4, 6, 7, 10, 11, 12, 13 and 14 Partial with named remainders. External inputs still needed: a real AI provider key, an image provider, `PUBLISH_WEBHOOK_URL`, and a GitHub token with workflow scope. No AI key or webhook was set in this pass, and no TYPO3 credentials were changed.

## Polish pass addendum (2026-10-20, builder to live TYPO3)

Full evidence: `docs/TYPO3_API_VERIFICATION.md` section 6 and `docs/GAP_AUDIT.md` (Phases 6, 11, 14). This pass closed the last self-closable gaps: the element-types POST is now proven live, the TYPO3 app builds from a committed lock file, and the builder itself talks to the live TYPO3.

- Live element types: against https://typo3.woodwolfdigital.com with a short lived token minted from the live preview secret (token and secret never printed or stored), `GET /api/v1/element-types` listed 15 core types; `POST` without a token answered 401; `POST` of `custom.live-check` answered 201 with CType `astro_builder_custom_live_check`; the list then held 16 types; a duplicate `POST` answered 422. The type stays registered live as the standing proof.
- Composer lock: `apps/typo3-cms/composer.lock` generated with Composer 2.10.3 on PHP 8.3 (TYPO3 13.4.36, 109 packages) and committed. A clean `composer install` from the lock was verified in a fresh local copy before pushing; the Dockerfile already preferred `composer install` when a lock exists, so no Dockerfile change was needed. The TYPO3 redeployment `uoipzrrpvgwbqocyxhkysnlq` finished with the lock in place and the live endpoints re-verified (`/typo3/`, registry, `pages/home` all 200).
- CORS in the extension: `ApiMiddleware` now answers OPTIONS preflight for API paths with 204 before any auth check and adds CORS headers for an explicit origin allowlist (the Astro production host and localhost dev origins). Verified live: preflight from the Astro origin returns 204 with `Access-Control-Allow-Origin`, allow methods and allow headers; a non-allowlisted origin receives no `Access-Control-Allow-Origin`; tokenless draft still answers 401. `php -l` passes on the changed file.
- Builder wiring: the builder page renders `window.__ASTRO_BUILDER_CONFIG__` server side from `TYPO3_CONTENT_API_URL` (the host root is derived from the content API URL in `typo3Storage.mjs`), and the storage client resolves its base from that config with the previous overrides as fallbacks. On the live Astro app the served builder carries `apiBase: https://typo3.woodwolfdigital.com`, so page loads and element types come from the live TYPO3. Writes go to the versioned TYPO3 endpoints (`/api/builder/v1/save`, `/api/v1/element-types`) and include the editor supplied preview token as the `x-preview-token` header; the token sits in a toolbar password field and is kept in page memory only. Demo behaviour is unchanged when no config is injected. Tests: 24 of 24 pass, including new coverage for config resolution and token header injection; the Astro build passes. Astro redeployment `jv3wgv5qygf5kc5oanzz2hal` finished; `/builder` and `/` verified 200 live with the injected config present.
- Acceptance state per `docs/GAP_AUDIT.md` after this pass: 9 phases Done (0, 1, 2, 3, 5, 8, 9, 11, 15), 7 Partial (4, 6, 7, 10, 12, 13, 14) with named remainders. Not done and stated plainly: saving from the browser UI was not click-tested with automated browser tooling (the wiring is unit tested and the live HTTP contract, including CORS, is verified); no browser or end-to-end UI test suite exists. External inputs still needed, unchanged: a real AI provider key, an image provider, `PUBLISH_WEBHOOK_URL`, a GitHub token with workflow scope, and a production database decision (MySQL or MariaDB instead of staging SQLite).

## Builder startup defect addendum (2026-10-20, GrapesJS storage registration fix)

A real browser test of the live builder at https://astrotypo3.woodwolfdigital.com/builder found the builder broken: the page shell loaded, but the editor never started. The status banner read "Builder failed to start: i.Storage.addType is not a function" (minified), the blocks panel held 0 blocks, the canvas was blank, and no TYPO3 content loaded. All unit tests and all HTTP level checks had passed, so this defect was only visible in a real browser.

Root cause, read from the installed package rather than from memory: in grapesjs 0.23.8 (`apps/astro-frontend/node_modules/grapesjs/dist/index.d.ts`), the `StorageManager` class registers custom storages with `add(type: string, storage: IStorage)` and has no `addType` method at all. `IStorage` is `{ load: (options) => Promise<ProjectData>, store: (data, options) => Promise<any> }`. `addType` does exist on other GrapesJS modules (DomComponents, TraitManager, AssetManager, StyleManager), and the builder's init plugin had pattern-matched that API onto the storage manager: `ed.Storage.addType('typo3-api', ...)`. `ed.Storage` is the StorageManager instance, so the plugin threw during `grapesjs.init`, the bootstrap catch printed the banner, and nothing else in the builder ever ran.

Why the tests missed it: the existing GrapesJS tests are pure-logic tests. They import the mapping and storage modules and exercise them with plain objects and injected fetch functions, but they never construct a real editor, so a wrong method name on a real GrapesJS module could not fail. The HTTP smoke tests only proved the page and bundle were served, not that the editor booted.

Fix: registration now lives in one exported function, `registerGrapesStorage(editor, state, client)` in `apps/astro-frontend/src/lib/typo3Storage.mjs`, which calls `editor.Storage.add(GRAPES_STORAGE_TYPE_ID, createGrapesStorageType(state, client))`. `src/pages/builder.astro` calls that function from its init plugin, so the page and the tests run the exact same code path. All previous behaviour is preserved: API base resolution from `window.__ASTRO_BUILDER_CONFIG__`, the `x-preview-token` header on writes, page JSON conversion, element types loading, and the demo fallback when no config is injected.

Regression coverage: new `apps/astro-frontend/tests/storage-editor.test.mjs` (4 tests) sets up jsdom, imports the real grapesjs package, inits an editor with the builder's storageManager config and the shared registration function, and asserts: the editor constructs without throwing, `StorageManager.get('typo3-api')` returns a storage with `load` and `store` functions and the current type is `typo3-api`, all 15 registry blocks are present in the BlockManager, `editor.store()` POSTs page JSON with the fixture elements in order to the save endpoint path, and the storage `load()` converts the held page back into components. The harness reproduced the exact `addType is not a function` failure before the fix and passes after it. Harness limit, stated plainly: jsdom has no layout engine, so canvas rendering and drag and drop are not covered; editor construction, module registration and the storage round trip are the real package code. Suite totals after the fix: 28 of 28 tests pass (24 baseline plus 4 new), the Astro build passes, the built bundle contains the minified `Storage.add(...)` registration and contains no `addType('typo3-api'` call, and the locally built server serves `/builder` with HTTP 200 and the new bundle.

Deployment of this fix: pushed to GitHub main (typo3Storage.mjs, builder.astro, the new test, package files, docs; only the pre-existing `.github/workflows/ci.yml` push still fails with the known token scope 403). Astro app redeployed on Coolify, deployment `irdyjhxqzv7qlusmwyyt1x4v`, status finished. Live verification after the redeploy: `https://astrotypo3.woodwolfdigital.com/builder` returns HTTP 200, the served page carries `window.__ASTRO_BUILDER_CONFIG__` with the live TYPO3 apiBase, and the served builder bundle is the new fixed build (same content hash as the locally verified build), containing the minified `Storage.add(...)` registration and zero occurrences of the old `addType('typo3-api'` call. A real browser re-test of the live builder remains the parent agent's step; this pass verified editor startup through the jsdom harness against the real grapesjs package, not through a browser.
