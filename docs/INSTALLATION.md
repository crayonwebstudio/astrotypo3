# Installation

## Option A: Astro demo only (fastest)

Requirements: Node 24, npm 10 or higher.

```bash
cd apps/astro-frontend
npm install
npm run dev
```

The demo serves fixture content from `src/data/`. Pages: `/`, `/about`, `/builder`, `/templates`, `/audit`, `/preview/home?token=demo`.

Production build (also used by the root Dockerfile for Coolify):

```bash
npm run build
PORT=4321 HOST=0.0.0.0 node dist/server/entry.mjs
```

Environment variables for the Astro app:

| Variable | Purpose |
|---|---|
| `TYPO3_CONTENT_API_URL` | Base URL of the TYPO3 content API, for example `https://cms.example.com/api/content/v1`. When unset, fixtures are used and the app logs that clearly. |
| `TYPO3_PREVIEW_SECRET` | Shared secret for preview token verification. When set, the demo token shortcut is disabled. |
| `PUBLISH_WEBHOOK_URL` | Optional publish webhook target. |
| `PUBLISH_WEBHOOK_SECRET` | HMAC secret for the publish webhook. |

## Option B: Full TYPO3 plus Astro

Requirements: PHP 8.2 or higher, Composer 2, a database supported by TYPO3 13.4, Node 24.

1. Create a TYPO3 13.4 project: `composer create-project typo3/cms-base-distribution:^13.4 my-site`
2. Add path repositories for `packages/typo3-extension` and require `crayonwebstudio/astro-builder`.
3. Install the extension in the TYPO3 backend, run the database schema update for the `tx_astrobuilder_*` tables.
4. Copy `packages/shared-contract/registry.json` and `templates.json` where the extension setting `sharedContractPath` points (defaults are documented in the extension configuration), or set the path in extension settings.
5. Set environment variables for TYPO3: `ASTRO_BUILDER_PREVIEW_SECRET`, `ASTRO_BUILDER_CONTENT_TOKEN` (optional static token for server to server draft access), `OPENAI_COMPATIBLE_API_KEY` and `OPENAI_COMPATIBLE_BASE_URL` only if a real AI provider is wanted, `ASTRO_BUILDER_PUBLISH_WEBHOOK_URL` and `ASTRO_BUILDER_PUBLISH_WEBHOOK_SECRET` for publishing.
6. Point the Astro app at TYPO3 with `TYPO3_CONTENT_API_URL` and the same preview secret.
7. Create a page in TYPO3, add elements, publish, and load the Astro route.

## Docker

The root `Dockerfile` builds only the Astro app (the Coolify deployment for astrotypo3.woodwolfdigital.com). `docker-compose.yml` adds a PHP reference service for the extension source. A full TYPO3 container stack is intentionally not faked here: use a standard TYPO3 Docker setup for Option B.

## Adding things

1. Component: see `docs/COMPONENTS_AND_TEMPLATES.md`.
2. AI provider: implement the provider interface server side, set its environment variables, keep the mock as the test default.
3. Publishing adapter: implement the publish service contract, return real job status, keep the demo adapter behaviour of failing honestly when unconfigured.
