# Gap Audit

Date: 20 October 2026. Scope: every phase of `typo3-astro-ai-visual-builder-roadmap.md` (Phases 0 to 15), the roadmap testing strategy (section 10), the security and governance requirements (section 11), the open decisions (section 13), and the deployment acceptance for the two live applications. Each item is marked Done with evidence, Partial with the missing remainder named, or Blocked-external with the exact input needed. Evidence gathered in the final integration pass and the polish pass of 20 October 2026: local TYPO3 13.4.36 HTTP suite, live checks against https://typo3.woodwolfdigital.com and https://astrotypo3.woodwolfdigital.com, and the repository test suite. No em dashes are used in this document.

## Summary counts

- Roadmap phases: 16 total. Done: 9 (Phases 0, 1, 2, 3, 5, 8, 9, 11, 15). Partial: 7 (Phases 4, 6, 7, 10, 12, 13, 14). Blocked-external as the primary state: 0 phases, but four external inputs block specific remainders inside Partial phases (real AI provider key, image provider, PUBLISH_WEBHOOK_URL, GitHub token workflow scope).
- Cross-cutting gates: deployment and wiring acceptance Done. Testing strategy Partial. Security and governance Partial. Open decisions Done.

## Phase by phase

### Phase 0, Discovery and baseline: Done
Evidence: `docs/PROJECT_DISCOVERY.md`; stack recorded (Node v24.20.0, npm 10.9.4; PHP 8.3.6 and Composer added later and recorded in `docs/TYPO3_LOCAL_VERIFICATION.md`); smallest vertical slice defined and later proven.

### Phase 1, Architecture and shared contracts: Done
Evidence: `docs/ARCHITECTURE.md`, `docs/CONTENT_API.md`, `docs/COMPONENTS_AND_TEMPLATES.md`, 4 JSON schemas in `packages/shared-contract/`, ADR 0001 to 0005 in `docs/adr/`. Versioned API is `/api/content/v1`; draft and published are separate endpoints; Astro never runs inside PHP.

### Phase 2, Minimal end-to-end vertical slice: Done
Evidence: a TYPO3-managed page renders in Astro both locally (`docs/TYPO3_API_VERIFICATION.md`: published page 200 JSON with mapped elements over HTTP) and live: https://astrotypo3.woodwolfdigital.com renders the content served by https://typo3.woodwolfdigital.com/api/content/v1/pages/home (8 elements, component sequence identical to the TYPO3 response; rendered titles come from the TYPO3 page titles). Contract tests: `npm test`, 22 of 22 passing.

### Phase 3, Component registry and core library: Done
Evidence: `packages/shared-contract/registry.json` with 15 components, props schemas, defaults and `typo3Ctype` per component; 15 Astro renderers plus a safe unknown-component fallback; registry and renderer sync covered by the test suite (22 of 22). Live: `GET /api/content/v1/registry` on the TYPO3 host returns all 15 components.

### Phase 4, TYPO3 page and content integration: Partial
Done parts: `ContentElementMapper` maps `tt_content` records to contract elements and back (core CTypes keep native fields, full props in `tx_astrobuilder_element` keyed by `tt_content_uid`); builder save persists through DataHandler with a backend user context (local proof in the final pass: a save created `tt_content` uid 14 on page 1 and read back exactly; live proof: the save API created the 8 home and 2 about elements on the deployed instance, read back with matching component sequences); deletion is conservative (builder managed records only); CType registration via TCA override including API created custom types after a cache flush.
Missing: page-level flows in the builder API (create, copy, move pages) are not implemented; pages are created in the native TYPO3 backend or by the deploy seed, and the save endpoint requires an existing page. SEO and page metadata fields are not mapped into TYPO3 page properties, so API page responses carry `seo: []` and the Astro side falls back to the page title. Permission tests exist as API behavior checks (401, 422, token scopes) rather than a TYPO3 functional test suite.

### Phase 5, Astro rendering, routing, and design system: Done
Evidence: server routes with a real 404 for unknown slugs (verified live), design tokens CSS, BaseLayout with canonical and Open Graph, `sitemap.xml` and `robots.txt` endpoints (all 200 live), SSR documented in `docs/ARCHITECTURE.md`. Draft content is not exposed on public routes (draft endpoints answer 401 without a token on both hosts). Note: pages sourced from TYPO3 currently render without SEO metadata because of the Phase 4 mapping gap, not an Astro defect.

### Phase 6, Visual builder MVP: Partial
Done parts: GrapesJS 0.23.8 builder at `/builder` (ADR 0005): sidebar blocks generated from the registry, canvas rendering that mirrors the Astro renderers, property traits generated from props schemas, responsive device switching, unsaved state, undo and redo, validated save. Verified locally on the built server and the GrapesJS bundle (1.17 MB chunk containing the library) is served live at https://astrotypo3.woodwolfdigital.com/builder.
Missing: no automated browser test covers drag and drop interactions.
Closed in the polish pass (20 October 2026): the builder now resolves its API base from `window.__ASTRO_BUILDER_CONFIG__`, rendered server side from `TYPO3_CONTENT_API_URL`, so the deployed builder loads pages and element types from the live TYPO3 host. Writes from the browser go to the TYPO3 endpoints (`/api/builder/v1/save`, `/api/v1/element-types`) with an editor supplied preview token sent as the `x-preview-token` header; the token lives in a toolbar password field, in page memory only. The extension answers CORS preflight for the Astro origin (verified live: 204 with the allow headers; non-allowlisted origins get no `Access-Control-Allow-Origin`). Unit tests cover config resolution and token header injection (`npm test`, 24 of 24). Saving from the actual browser UI was not click-tested by an automated browser; the wiring is verified through the served config, the unit tested client, and the live CORS checks in `docs/TYPO3_API_VERIFICATION.md` section 6.

### Phase 7, Frontend inline editing and preview: Partial
Done parts: token gated preview route (401 without token, 200 with a valid token, DRAFT badge), stable element IDs, click to select, inline heading edits, validated editing bridge with origin and schema checks plus unit tests; on the TYPO3 side the draft endpoint enforces HMAC preview tokens (401 without, 200 with, verified locally; 401 verified live).
Missing: the live Astro preview still runs in demo mode (demo token, fixture drafts). Wiring it to the TYPO3 draft endpoint with the production preview secret is configuration plus a token hand-off flow, not yet done.

### Phase 8, Template library: Done
Evidence: 4 element presets, 4 section templates, 5 page templates, 1 site template in the shared contract; template browser at `/templates` (200 live) with explicit replace confirmation and append mode; template contents validated by the test suite.

### Phase 9, AI foundation: Done
Evidence: provider interface with a labelled `MockProvider` and an `OpenAiCompatibleProvider` (server-side key only, timeout, one retry), orchestration with context assembly, permission callback and audit result, change-plan validator restricted to the roadmap section 7 allowlist, rate limiting on the demo endpoints, `tx_astrobuilder_ai_usage` and `tx_astrobuilder_audit` tables created on real TYPO3 (local and live firstboot log). Providers are replaceable without touching the content model, and invalid AI output cannot pass the validator. A real provider is intentionally not configured; see Phase 10.

### Phase 10, AI page generation and content editing: Partial (Blocked-external for real AI)
Done parts: `/api/ai/generate` and `/api/ai/edit` return validated, mock labelled change plans (verified live: 200 with `provider: "mock"`, operations restricted to the allowlist); the builder AI panel shows the plan and applies only after an explicit click.
Blocked-external: a real AI provider API key (server-side only, to be set as an environment variable on the TYPO3 or Astro host). Until it is provided, all AI output is the mock provider and is labelled as such everywhere.

### Phase 11, AI element creation and design assistance: Done
Done parts: schema proposal format with restricted field types and a mandatory human approval step; no automatic registration from AI, by design. Human driven element type creation is implemented end to end and verified locally and live: TYPO3 `POST /api/v1/element-types` answers 401 without a token, 422 on invalid or duplicate input, 201 with the new CType on success (local TYPO3 proof, including content of a custom type persisting as a real `tt_content` record); the same flow exists in the builder UI (201, duplicate 422, verified locally against the demo API).
Live proof (20 October 2026, polish pass, `docs/TYPO3_API_VERIFICATION.md` section 6): against https://typo3.woodwolfdigital.com with a short lived token minted from the live preview secret, `POST /api/v1/element-types` created `custom.live-check` with 201 and ctype `astro_builder_custom_live_check`; the list went from 15 to 16 types; a duplicate POST answered 422; a POST without a token answered 401. The type stays registered live as the standing proof. By design, AI proposals still require a human to submit the type through the form; that approval step is a product rule, not a gap.

### Phase 12, AI images, SEO, and accessibility: Partial (Blocked-external for image generation)
Done parts: deterministic SEO and accessibility audit at `/audit` (200 live) with unit tests, clearly separated from AI suggestions; findings link to elements.
Blocked-external: image generation exists only as the `generate_image_request` change-plan operation. No image provider is configured and no fake image is produced. Needed input: an image provider choice and its server-side API key, plus a decision on storing generated assets in TYPO3 FAL.

### Phase 13, Publishing and deployment integration: Partial (Blocked-external for the webhook target)
Done parts: publish adapter on both sides (signed webhook, idempotency key, job ID returned, receiver status reported honestly). Verified live: `POST /api/publish` on the Astro host answers 502 with "No publish webhook configured... Nothing was published." Drafts remain private throughout.
Blocked-external: `PUBLISH_WEBHOOK_URL` for a real receiver. Missing regardless: a persistent job store and a rollback UI; TYPO3 workspaces and revisions remain the native rollback mechanism.

### Phase 14, Security and production hardening: Partial (one Blocked-external item)
Done parts: preview tokens are HMAC signed with timing-safe comparison and slug scoping (verified locally and live); rich text sanitizer on both sides; draft and published separation tested; server-side validation on every content operation; `php -l` 28 of 28 extension files passing on PHP 8.3.6; threat model and controls in `docs/SECURITY.md`; no secrets in the repository (TYPO3 credentials exist only in the Coolify environment and an off-repo tools file).
Blocked-external: `.github/workflows/ci.yml` exists locally but cannot be pushed, because the stored GitHub token lacks the workflow scope, so CI does not run on GitHub. Needed input: a GitHub token with workflow scope, or a manual one-time upload of the file.
Missing regardless: no automated browser or end-to-end UI test suite; the deployed database is SQLite (staging choice), production should move to MySQL or MariaDB, which requires a database provisioning decision and credentials.
Closed in the polish pass (20 October 2026): `apps/typo3-cms/composer.lock` is committed (TYPO3 13.4.36, 109 packages, generated with Composer 2.10.3 on PHP 8.3; a clean `composer install` from the lock was verified locally in a fresh copy, and the Dockerfile already prefers `composer install` when a lock exists). The TYPO3 redeployment `uoipzrrpvgwbqocyxhkysnlq` built with the lock in place and finished; live re-verification passed (`/typo3/`, registry, `pages/home` all 200). Image builds no longer re-resolve versions. Note for future extension changes: the lock records a content hash reference for the path repository package, so regenerating the lock after changing `packages/typo3-extension/composer.json` (not its PHP code) remains good practice.

### Phase 15, Packaging and developer documentation: Done
Evidence: README, `docs/INSTALLATION.md`, `docs/TESTING.md`, component and template authoring in `docs/COMPONENTS_AND_TEMPLATES.md`, AI and publishing configuration in `docs/AI_ARCHITECTURE.md` and `docs/CONTENT_API.md`, example fixture site (agency home and about) that is now also the seeded live content.

## Cross-cutting gates

### Deployment and wiring acceptance: Done
Evidence (20 October 2026, final integration pass): TYPO3 redeployed with the slug normalization and mapper fixes (Coolify deployment `d9deartqcvdr06n2n6xzk77h`, finished). Live TYPO3: `/typo3/` 200 login, registry 200, `pages/home` 200 with 8 elements, `pages/about` 200 with 2 elements, unknown page 404 JSON, draft 401 without token. Astro wired with `TYPO3_CONTENT_API_URL=https://typo3.woodwolfdigital.com/api/content/v1` and redeployed (deployments `iv8muichwyo3dlsl2ts15zfh` and `88xkjn5d9d5plodbozezjnhf`, both finished). Live Astro: `/`, `/about`, `/builder`, `/templates`, `/audit`, `/sitemap.xml`, `/robots.txt` all 200; unknown slug 404; homepage and about render the TYPO3 content (hero heading and about sections match the TYPO3 API responses exactly; page titles come from the TYPO3 page records).

### Testing strategy (roadmap section 10): Partial
Done: unit and contract tests for schemas, validators, mapping modules, change plans, the GrapesJS storage round trip, builder config resolution and token header injection (`npm test`, 24 of 24); PHP syntax checks; scripted HTTP integration suites against local and live TYPO3 (persistence, authorization, preview, element types, CORS). Missing: UI tests in a real browser (builder interactions, template application, AI apply and revert), a TYPO3 functional test suite, and CI execution (blocked by the workflow scope item in Phase 14).

### Security and governance (roadmap section 11): Partial
Done: server-side permission and token checks on content writes; provider keys server-side only; validation of content, schemas, API requests and AI proposals; rich text sanitization; drafts never on public routes; explicit approval required for publishing and for AI element registration; AI rate limits and usage logging; audit tables for AI proposals and applied changes. Missing: upload validation is best effort (FAL image resolution only, no dedicated upload endpoint yet), and prompt injection hardening beyond the allowlist validator is documented as a risk in `docs/SECURITY.md` rather than separately tested.

### Open decisions (roadmap section 13): Done
All resolved and recorded: versions (TYPO3 13.4, PHP 8.3, Astro 5, Node 24), clean new extension `astro_builder`, dedicated shared contract package, SSR deployment, `tt_content` plus props store content strategy, mock-first AI with an OpenAI compatible adapter, signed webhook publishing adapter, GrapesJS as the builder library (ADR 0005, BSD-3-Clause). TYPO3 is used as an API backend only; no custom interface exists inside the TYPO3 backend, by the product decision recorded in `docs/TYPO3_DEPLOYMENT.md`.

## External inputs needed, exact list

1. Real AI provider API key (server-side environment variable) to move Phase 10 beyond the labelled mock provider.
2. Image provider choice and API key, plus the FAL storage decision, for Phase 12 image generation.
3. `PUBLISH_WEBHOOK_URL` of a real receiver for Phase 13 publishing.
4. A GitHub token with workflow scope (or manual upload) so `.github/workflows/ci.yml` can be pushed and CI can run.
5. Production database decision and credentials (MySQL or MariaDB) to replace the staging SQLite database. (The `composer.lock` item formerly listed here is closed: the lock is committed, see Phase 14.)
