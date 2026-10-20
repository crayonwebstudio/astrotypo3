# AstroTYPO3: AI Powered Visual Website Builder

Two packages that work as one product:

1. TYPO3 extension in `packages/typo3-extension/` (key: `astro_builder`). TYPO3 manages pages, structured content, permissions, revisions, the content API, preview tokens, AI orchestration and publishing.
2. Astro frontend in `apps/astro-frontend/`. Astro renders the public site, the protected draft preview, the GrapesJS visual builder (external to TYPO3, API only, see `docs/adr/0005-grapesjs-builder.md`), the template browser and the audit page.

They are separate applications. Astro does not run inside PHP. A versioned shared contract in `packages/shared-contract/` connects them: component registry, templates, JSON schemas and a validator implemented in both TypeScript/JavaScript and PHP.

Live demo target: https://astrotypo3.woodwolfdigital.com (Astro app, served by the root Dockerfile on Coolify, port 4321).

## Quick start (Astro demo, no TYPO3 required)

```bash
cd apps/astro-frontend
npm install
npm run dev
```

Open http://localhost:4321 for the fixture powered homepage, `/builder` for the visual builder, `/templates` for the template browser, `/audit` for deterministic SEO and accessibility checks, and `/preview/home?token=demo` for the token gated draft preview demo. The demo preview token is a local demo shortcut documented in `docs/SECURITY.md`. Production preview uses HMAC tokens issued by TYPO3.

Run checks:

```bash
npm run build
npm test
```

## With TYPO3

See `docs/INSTALLATION.md`. In short: install TYPO3 13.4 LTS on PHP 8.2 or higher, install the extension with Composer path repositories, configure a preview secret and a content API token, then set `TYPO3_CONTENT_API_URL` in the Astro app.

## AI in this repository

The default AI provider is a mock. It is labelled as mock in every response and in the UI. It produces deterministic, schema validated change plans so the full review and apply flow can be tested without paid API calls. A real OpenAI compatible provider adapter is included server side for TYPO3, and the Astro API routes document how to swap the mock for a server side provider. Keys are never exposed to the browser.

## Publishing in this repository

The default publishing adapter is a demo adapter. When no publish webhook is configured it reports failure honestly instead of claiming success. Configure `PUBLISH_WEBHOOK_URL` and `PUBLISH_WEBHOOK_SECRET` to enable the webhook adapter.

## Documentation

Start with `docs/PROJECT_DISCOVERY.md`, `docs/ARCHITECTURE.md`, `docs/CONTENT_API.md`, `docs/IMPLEMENTATION_STATUS.md` and `docs/FINAL_REPORT.md`.
