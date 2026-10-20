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

## Element types (builder API)

Base path: `/api/v1/element-types`. This is the contract between the GrapesJS builder and TYPO3 for element types (see ADR 0005). Implemented in TYPO3 by `ElementTypeApiController` with `ElementTypeRegistryService`, and mirrored by an Astro demo endpoint with the same shapes.

| Method and path | Auth | Returns |
|---|---|---|
| `GET /api/v1/element-types` | Public | `{ types: [...] }`: the 15 core types from the shared registry (source `core`) plus types created through this API (source `custom`, stored in TYPO3 in `tx_astrobuilder_element_type`; in the Astro demo in a local JSON demo store, labelled `demoMode: true`) |
| `POST /api/v1/element-types` | TYPO3: preview token header `x-preview-token` with the `element-types` scope (401 without). Astro demo: no auth, labelled demo | 201 with the created type including its `ctype`; 422 with `error.details` field level messages on invalid input or a duplicate id |

Element type shape: `{ id, ctype, label, category, description, fields: [{ name, type, required, default, values? }], source }`.

CType mapping rule (same on both sides): `astro_builder_` plus the type id with dots and dashes replaced by underscores, for example `section.hero` becomes `astro_builder_section_hero` and `custom.pricing-table` becomes `astro_builder_custom_pricing_table`. A builder component type is a TYPO3 core content element of this CType, and its fields are `tt_content` fields edited as builder traits.

Field types accepted by the demo validator: `string`, `text`, `richtext`, `number`, `boolean`, `enum`, `image`, `link`, `array`. The TYPO3 service currently accepts `string`, `text`, `number`, `boolean`, `enum`, `image`, `link`, `array`, `object` (richtext folds into `text` there); closing this difference is a known follow up. Enum fields require a non-empty `values` array.

On the TYPO3 side, a created type is listed by the API immediately. It becomes selectable in the backend element wizard after a cache flush, because the `tt_content` TCA override builds the CType items at bootstrap from the registry rows present at that time.

## Media

In production, image props carry TYPO3 FAL public URLs or a documented media reference that TYPO3 resolves to a URL before responding. The demo uses direct URLs and placeholder images.
