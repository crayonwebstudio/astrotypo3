# Architecture

## Package boundaries

| Package | Owns | Does not own |
|---|---|---|
| `packages/typo3-extension/` | Page and element records, permissions, revisions via TYPO3, content API, preview tokens, AI orchestration, audit and usage records, publish dispatch | Rendering HTML for the public site |
| `apps/astro-frontend/` | Routes, rendering, design tokens, builder UI, preview and editing bridge, SEO output, demo API endpoints | Source of truth for published content in production |
| `packages/shared-contract/` | Component registry, template library, JSON schemas, validator logic, fixtures | Runtime state |

See ADR 0001 and ADR 0002.

## Data flow

1. Editor creates a page in TYPO3 or in the builder. Content is stored as structured elements that reference registry component IDs and validated props.
2. Astro requests `GET /api/content/v1/pages/{slug}` for published content. Public routes never receive drafts.
3. Draft preview: TYPO3 issues a short lived HMAC preview token. Astro calls the draft endpoint with the token and renders with a DRAFT badge and the editing bridge enabled.
4. Builder saves go through validation on both sides. Invalid props are rejected with field level errors, never silently stored.
5. Publishing in TYPO3 dispatches a signed, idempotent webhook. The receiver tracks job status and reports real build or revalidation results. No false success.

## Builder (GrapesJS, external, API only)

The visual builder is GrapesJS (BSD-3-Clause, ADR 0005) running in the Astro app at `/builder`. There is no builder interface inside the TYPO3 backend; TYPO3 is the backend engine and the builder talks to it through the content API only.

- Component types and blocks are generated from the shared registry at runtime (`apps/astro-frontend/src/lib/grapesRegistry.mjs`): traits come from the props schema, and canvas markup mirrors the Astro renderers for the same props.
- A builder component type is a TYPO3 core content element (CType `astro_builder_<id with dots and dashes as underscores>`), and its traits are the element's `tt_content` fields. Props travel as `data-prop-*` attributes on canvas components, so the canvas serializes back to the page JSON elements array losslessly.
- Persistence is a custom GrapesJS storage type `typo3-api` (`apps/astro-frontend/src/lib/typo3Storage.mjs`): load from `GET /api/content/v1/pages/<slug>`, store by posting page JSON to `POST /api/builder/save`. One constant, `TYPO3_API_BASE`, selects the API host; empty means the same origin demo API in this app.
- Element types are read from and created through `GET` and `POST /api/v1/element-types` (see `docs/CONTENT_API.md`). Created types register into the builder live and, on the TYPO3 side, into `tt_content` via the extension's registry table and TCA override.
- Style Manager edits are canvas presentation only and are not part of the content contract.

## Rendering mode

SSR with the Node adapter (ADR 0003). Public pages could be prerendered later for known slugs, but the demo and first release use server rendering so preview, API routes and builder save work in one deployment.

## Element identity

Every element has a stable string ID. The renderer outputs `data-astro-builder-id` with that ID in preview mode. The editing bridge uses only that ID plus a validated message schema.

## Versioning

The content API is versioned in the path (`/api/content/v1`). The contract files carry `contractVersion`. Breaking contract changes require a new API version and a migration note.
