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
