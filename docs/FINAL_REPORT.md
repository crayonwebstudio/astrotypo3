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
