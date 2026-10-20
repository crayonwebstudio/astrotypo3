# Content API (v1)

Base path: `/api/content/v1`. Implemented in TYPO3 (`ContentApiController`) for production and mirrored by Astro endpoints for the demo, using the same contract and fixtures.

## Endpoints

| Method and path | Auth | Returns |
|---|---|---|
| `GET /pages/{slug}` | Public | Published page JSON, or 404 |
| `GET /pages` | Public | List of published page summaries |
| `GET /draft/{slug}` | Preview token header `x-preview-token` | Draft page JSON, or 401 or 404 |
| `GET /registry` | Public | Component registry JSON |
| `GET /templates` | Public | Template library JSON |
| `POST /builder/save` | Editor session in TYPO3, demo mode in Astro | Validates and saves a draft page. Astro demo returns a `demoMode: true` notice |
| `POST /ai/generate` and `POST /ai/edit` | Editor auth in TYPO3, demo in Astro | Mock labelled change plan, validated against the allowlist |
| `POST /publish` | Editor auth | Job status. Demo adapter returns an honest error when no webhook is configured |

## Page JSON

Follows `packages/shared-contract/page.schema.json`: `id`, `slug`, `title`, `status` (`published` or `draft`), `locale`, `seo` and `elements`. Each element has `id`, `componentId`, `props` and optional `children`.

## Errors

Errors are JSON: `{ "error": { "code": "not_found", "message": "..." } }` with a matching HTTP status. Validation errors include a `details` array of field level messages from the shared validator.

## Draft separation

Published and draft are separate endpoints and separate TYPO3 queries filtered by publication state. There is no flag on the public endpoint that can return a draft.

## Media

In production, image props carry TYPO3 FAL public URLs or a documented media reference that TYPO3 resolves to a URL before responding. The demo uses direct URLs and placeholder images.
