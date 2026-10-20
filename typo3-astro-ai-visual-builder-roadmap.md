# Product Roadmap: AI-Powered TYPO3 + Astro Visual Website Builder

**Document type:** Product and technical implementation roadmap  
**Status:** Proposed baseline for Codex-led implementation  
**Date:** 20 October 2026

## 1. Product vision

Build an AI-powered visual website builder around two integrated packages:

1. **TYPO3 extension** — the content-management and editor layer. It manages pages, structured content, assets, permissions, revisions, templates, AI-assisted editing, preview coordination, and publishing integration.
2. **Astro frontend package** — the presentation and rendering layer. It provides the component library, responsive rendering, route resolution, SEO output, and preview/editing bridge.

The packages are separate applications but should feel like one product to editors. The extension must not assume that Astro can execute inside PHP. A documented, versioned contract connects TYPO3 to Astro.

## 2. Product goals

- Editors can create and manage pages using TYPO3.
- Editors can build pages visually with drag-and-drop components.
- Editors can click supported elements in the rendered preview and edit them in context.
- Users can start from predefined elements, component presets, sections, page templates, and full-site starter templates.
- AI can create pages and sections, edit content, suggest design changes, help create schema-driven elements, generate images through configured providers, and audit SEO/accessibility.
- Draft content remains private until authorized publication.
- Developers can extend the component and template libraries without rewriting the core system.
- AI vendors and deployment providers remain replaceable through adapters and configuration.

## 3. Non-goals for the first release

- Executing arbitrary AI-generated PHP, JavaScript, SQL, shell commands, or Astro code during normal editing.
- Replacing TYPO3's native page tree, permission model, file handling, localization, or revision capabilities without a clear need.
- Building a marketplace before the core component/template contract is stable.
- Promising that every hosting target supports every Astro rendering mode.
- Allowing an AI agent to publish, delete, change permissions, or deploy generated code without explicit authorization and safeguards.

## 4. Architecture overview

```text
Editor
  ├── TYPO3 backend: page tree, visual builder, AI assistant, template library
  │       └── TYPO3 extension services
  │             ├── Content/page adapter
  │             ├── Component and template registry
  │             ├── Versioned content API
  │             ├── AI orchestration + provider adapters
  │             ├── Change-plan validation and authorization
  │             ├── Preview coordination
  │             └── Publish/build/revalidation adapter
  │
  └── Astro frontend package
        ├── Route resolution and rendering
        ├── Component renderers and design tokens
        ├── Draft preview mode
        ├── Stable element IDs and editing bridge
        └── SEO, accessibility, media, responsive behavior
```

### Source of truth

TYPO3 owns page records, content, media references, permissions, and publication state. Use TYPO3-native functionality where practical. Astro consumes a versioned content contract and renders the public site or authorized draft preview.

### Rendering modes

Support a configurable deployment integration for static generation, SSR, or hybrid rendering. The first implementation must document exactly which mode it supports. Publishing may trigger a build, cache invalidation, or revalidation depending on the deployment adapter.

### AI safety principle

AI returns structured proposals. Application services validate the proposal, enforce permissions, and apply approved changes. AI output must never bypass normal authorization or validation.

## 5. Core content and component model

Every component definition should include:

- Stable component ID and version
- Category, label, and description
- Validated properties schema and defaults
- Preview thumbnail or example
- Responsive behavior and accessibility expectations
- AI usage guidance and constraints
- Matching Astro renderer
- Compatibility/migration information

Suggested initial IDs:

- `layout.container`
- `layout.columns`
- `content.heading`
- `content.rich-text`
- `content.image`
- `content.button`
- `content.divider`
- `section.hero`
- `section.feature-grid`
- `section.image-text`
- `section.testimonials`
- `section.faq`
- `section.cta`
- `navigation.header`
- `navigation.footer`

Build a small end-to-end set first; do not attempt to create a huge library before the contract is proven.

## 6. Template system

Support four levels:

1. **Element presets** — configured instances such as a filled button or dark hero variant.
2. **Section templates** — reusable groups such as a feature grid or testimonial section.
3. **Page templates** — starters for home, about, services, contact, or landing pages.
4. **Site templates** — global design tokens, navigation, footer, and multiple page starters.

Templates must be versioned, schema-validated, previewable, and safe to apply. Applying a template must not silently overwrite existing content. Provide clear create, merge, or replace behavior.

## 7. AI feature scope

### Initial AI capabilities

- Generate a page or section using registered components.
- Rewrite, shorten, expand, translate, or change the tone of selected content.
- Generate CTA text, SEO metadata, FAQ drafts, and image alt-text suggestions.
- Apply design-token and component-variant changes within supported controls.
- Explain proposed changes and show a preview/diff before applying.

### Later AI capabilities

- Provider-backed image generation and asset management.
- Site-wide SEO and accessibility audits.
- Multi-page agent workflows.
- Schema-driven element creation, with approval before registration.
- Optional isolated code-generation workflow for new executable components, with tests and explicit human approval.

### AI change-plan operations

Use an allowlisted, validated format for operations such as:

- `create_page`
- `update_page_metadata`
- `add_element`
- `update_element_props`
- `move_element`
- `duplicate_element`
- `remove_element`
- `apply_section_template`
- `apply_page_template`
- `suggest_seo`
- `generate_image_request`

Each operation must be checked for scope, user permissions, valid component ID, valid properties, page state, and allowed destructive behavior. Include an audit trail and a way to recover from changes using the selected TYPO3 revision strategy.

## 8. Phased roadmap

### Phase 0 — Discovery and baseline

**Tasks**
- Inspect the existing repository and identify current TYPO3/PHP and Astro/Node versions.
- Review existing extension structure, conventions, API, tests, build commands, and deployment assumptions.
- Identify reusable code and known failures.
- Decide the smallest end-to-end vertical slice.

**Deliverables**
- `docs/PROJECT_DISCOVERY.md`
- Baseline test/build report
- Confirmed assumptions and open questions

**Exit criteria**
- Existing work is understood before changes begin.
- The actual stack and compatibility constraints are recorded.

### Phase 1 — Architecture and shared contracts

**Tasks**
- Define package boundaries and responsibilities.
- Define a versioned page/content API.
- Define component and template schemas.
- Specify draft preview authentication and publication flow.
- Decide how media references, localization, errors, and API versions are handled.
- Record important decisions as architecture decision records.

**Deliverables**
- `docs/ARCHITECTURE.md`
- `docs/CONTENT_API.md`
- `docs/COMPONENTS_AND_TEMPLATES.md`
- Contract schemas and tests where appropriate

**Exit criteria**
- A page and its component tree can be represented unambiguously.
- Draft and published content are distinct.
- The architecture does not depend on running Astro inside PHP.

### Phase 2 — Minimal end-to-end vertical slice

**Tasks**
- Read a TYPO3-managed page through a versioned endpoint.
- Render it through an Astro route.
- Implement the first component, preferably `section.hero`.
- Add local setup instructions, error handling, and contract tests.

**Deliverables**
- Working TYPO3-to-Astro page rendering
- Local development guide
- Tests for the content contract and renderer

**Exit criteria**
- A developer can run both packages locally.
- A TYPO3-managed page appears in Astro.

### Phase 3 — Component registry and core library

**Tasks**
- Implement registry metadata, property schemas, defaults, and validation.
- Add a small initial library of text, image, button, layout, hero, feature, CTA, FAQ, and testimonial components.
- Implement matching Astro renderers.
- Add safe fallback behavior for unknown component IDs.

**Deliverables**
- Shared component contract
- Initial core library
- Schema and renderer tests

**Exit criteria**
- Registry definitions and renderers stay in sync.
- Invalid properties are rejected or safely handled.

### Phase 4 — TYPO3 page and content integration

**Tasks**
- Use TYPO3-native page tree, permissions, file handling, and revision/workspace mechanisms where practical.
- Map builder structures to TYPO3 records.
- Add page metadata, slug/navigation settings, and SEO fields.
- Implement authorized create/edit/copy/move/delete flows.

**Deliverables**
- TYPO3 page/content adapter
- Permission and validation tests

**Exit criteria**
- Editors manage pages without bypassing TYPO3 permissions.
- Destructive operations are protected.

### Phase 5 — Astro rendering, routing, and design system

**Tasks**
- Implement route resolution and not-found behavior.
- Add shared design tokens for color, typography, spacing, widths, and breakpoints.
- Add media handling, metadata, canonical URLs, Open Graph basics, and sitemap/robots integration as appropriate.
- Document static, SSR, or hybrid behavior.

**Deliverables**
- Reliable route/rendering layer
- Responsive and accessible component defaults
- Deployment-mode documentation

**Exit criteria**
- Draft content is not exposed publicly.
- Media, routes, and metadata are tested.

### Phase 6 — Visual builder MVP

**Tasks**
- Build component sidebar, canvas, selection outline, and property inspector.
- Support adding, reordering, duplicating, and deleting elements.
- Support nesting only where schemas allow it.
- Add responsive preview, unsaved-change state, undo, and redo.
- Save through validated TYPO3 services.

**Deliverables**
- Usable visual page builder
- Editor interaction tests

**Exit criteria**
- A page can be built, saved, reloaded, and rendered without losing structure or properties.

### Phase 7 — Frontend inline editing and preview

**Tasks**
- Add authenticated draft preview.
- Use stable element IDs and a narrow, validated message protocol between editor and Astro preview.
- Support click-to-select, inline text edits, image replacement, and property inspector integration.
- Validate message origin, schema, session, and permissions.

**Deliverables**
- Frontend editing bridge
- Preview security tests

**Exit criteria**
- Selecting an element maps to the correct content record.
- Draft changes appear in preview but are not published.

### Phase 8 — Template library

**Tasks**
- Define versioned template manifests.
- Build template browser with categories, search, previews, and insertion/apply workflows.
- Add starter templates for an agency/corporate site and landing page.
- Support element presets, sections, pages, and site starters.
- Prevent accidental overwrite and validate template compatibility.

**Deliverables**
- Template library UI and format
- Example template pack

**Exit criteria**
- Templates use supported components and validated properties.
- Applying templates is predictable and reversible where possible.

### Phase 9 — AI foundation

**Tasks**
- Define provider interfaces for structured text generation and image generation.
- Keep API keys server-side.
- Add provider/model configuration, timeouts, retries, rate limits, usage logging, and cost controls.
- Build context assembly from selected element/page, component registry, design tokens, and relevant site content.
- Implement a tool registry that calls normal authorized application services.
- Validate every structured output.

**Deliverables**
- Provider adapter interfaces
- AI orchestration service
- Mocked provider tests
- Usage and error reporting

**Exit criteria**
- Providers can be replaced without changing the content model.
- Invalid AI output cannot be persisted.

### Phase 10 — AI page generation and content editing

**Tasks**
- Add AI actions for rewrite, shorten, expand, tone change, translation, CTA, SEO metadata, FAQ, and alt-text suggestions.
- Generate page and section structures using registered components.
- Allow scope selection: element, section, page, or new page.
- Show change plan/diff and preview before apply.
- Add cancel, retry, regenerate, apply, and revert flows.

**Deliverables**
- AI assistant in the editor
- Structured change-plan format
- Audit and recovery behavior

**Exit criteria**
- AI can create a page from approved components.
- Editing one selected element does not unintentionally change unrelated content.

### Phase 11 — AI element creation and design assistance

**Tasks**
- Generate proposed schemas for new schema-driven elements.
- Restrict field types and capabilities to an allowlist.
- Preview with sample data and require approval before registration.
- Use AI to select existing component variants and design tokens.
- Keep executable code generation separate from ordinary editing.

**Deliverables**
- AI schema-generation workflow
- Approval and versioning mechanism

**Exit criteria**
- Registered elements work with the builder and Astro renderer contract.
- No generated executable code runs in normal editing.

### Phase 12 — AI images, SEO, and accessibility

**Tasks**
- Add optional provider-backed image generation and asset lifecycle management.
- Store assets through TYPO3 FAL or a documented integration.
- Add deterministic SEO/accessibility checks and AI suggestions.
- Link audit findings to affected elements and allow applying individual fixes.
- Label AI suggestions separately from deterministic findings.

**Deliverables**
- Optional image-generation adapter
- Page audit workflow

**Exit criteria**
- Provider failures do not corrupt content.
- Audits do not falsely claim full compliance based only on AI.

### Phase 13 — Publishing and deployment integration

**Tasks**
- Define draft, preview, publish, unpublish, and rollback behavior.
- Trigger static builds, revalidation, or cache invalidation based on configuration.
- Track job status and actionable errors.
- Secure webhooks and make jobs retryable/idempotent where appropriate.

**Deliverables**
- Publishing adapter interface
- Job status and error reporting

**Exit criteria**
- Drafts remain private.
- Publication status reflects actual build/revalidation results.

### Phase 14 — Security and production hardening

**Tasks**
- Review authentication, authorization, CSRF, XSS, SSRF, uploads, origins, secrets, logging, rate limits, and AI prompt injection risks.
- Add unit, integration, contract, and end-to-end tests.
- Add CI checks for formatting, linting, type checks, tests, and builds.
- Document backups, upgrades, troubleshooting, and a threat model.

**Deliverables**
- Security review
- CI pipeline
- Production readiness checklist

**Exit criteria**
- Critical paths have automated tests.
- Secrets are not committed.
- Remaining risks and limitations are documented.

### Phase 15 — Packaging and developer documentation

**Tasks**
- Document installation and local development.
- Document how to add a component, preset, template, AI schema, provider adapter, and publishing adapter.
- Provide an example site and sample content.
- Document configuration, usage limits, preview, publishing, versioning, and upgrades.

**Deliverables**
- Installation guide
- Component/template authoring guide
- AI/provider configuration guide
- Example project

**Exit criteria**
- A new developer can run the example by following the docs.
- Compatibility and deployment requirements are explicit.

## 9. Recommended delivery milestones

Milestones are capability gates, not calendar promises. Estimate duration after repository discovery.

| Milestone | Includes | Demonstrable outcome |
|---|---|---|
| M0: Discovery complete | Phase 0 | Known stack, risks, baseline, and next steps |
| M1: Integration proven | Phases 1–2 | TYPO3 content renders in Astro |
| M2: Content foundation | Phases 3–5 | Stable components, pages, routing, and design tokens |
| M3: Visual editing | Phases 6–7 | Drag/drop builder and protected frontend editing |
| M4: Reusable design library | Phase 8 | Presets, sections, pages, and site templates |
| M5: AI MVP | Phases 9–10 | AI creates pages and edits content with review/apply flow |
| M6: Advanced AI | Phases 11–12 | Schema-driven element creation, images, SEO/accessibility assistance |
| M7: Publish-ready | Phases 13–15 | Reliable publishing, hardening, packaging, and documentation |

## 10. Testing strategy

- **Unit tests:** component schemas, validators, mapping services, change-plan operations, provider adapters.
- **Contract tests:** TYPO3 API responses against the shared schema; Astro renderers against valid and invalid payloads.
- **Integration tests:** authorization, persistence, media, revisions, preview, and publishing adapters.
- **UI tests:** adding/reordering elements, property editing, undo/redo, template application, AI preview/apply/revert.
- **Security tests:** permission bypass, preview access, cross-origin messaging, malformed AI outputs, upload validation, and webhook authentication.
- **Build checks:** PHP syntax/static analysis and TYPO3 tests where configured; Node lint/type checks/tests/build for Astro.
- **Provider tests:** use mocks in CI; do not require paid AI calls for ordinary test runs.

## 11. Security and governance requirements

- Enforce permissions server-side on every content operation.
- Keep provider keys and privileged credentials server-side.
- Validate all content, schemas, API requests, preview messages, and AI proposals.
- Sanitize rich text and safely render URLs/media.
- Protect preview tokens and do not expose drafts to public routes.
- Require explicit approval for publishing, deletion, broad changes, permission changes, and generated code deployment.
- Use rate limits, quotas, timeouts, and cost limits for AI operations.
- Record AI proposals and applied changes without unnecessarily retaining sensitive prompts.
- Treat content from webpages, documents, and user input as untrusted context; do not allow prompt injection to grant tools or permissions.

## 12. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| TYPO3 and Astro content models drift | Versioned shared contract and contract tests |
| Visual editor becomes too complex too early | Prove a small vertical slice and expand gradually |
| AI generates invalid layouts/content | Structured output, schemas, allowlisted operations, preview/apply workflow |
| AI edits the wrong scope | Explicit selected-element/page/site scope and diff review |
| Draft data leaks | Separate draft/public APIs and secure preview credentials |
| Generated components break the site | Schema-first component creation; executable code in separate tested workflow |
| Publishing succeeds in UI but fails in deployment | Track build/revalidation jobs and report confirmed status only |
| Provider cost or outages | Provider abstraction, quotas, timeouts, retries, usage tracking, graceful failures |
| Templates overwrite customer work | Preview, compatibility checks, explicit apply modes, revision recovery |
| Accessibility is overclaimed | Deterministic checks plus clearly labeled AI suggestions and human review |

## 13. Open decisions to resolve during discovery

Do not guess these if the existing repository determines the answer:

- Current TYPO3, PHP, Astro, and Node versions.
- Whether this extends an existing extension or starts from a clean package.
- Where the shared schemas live: extension package, frontend package, or a dedicated shared package.
- Whether the first deployment target is static Astro, SSR, or hybrid.
- Which TYPO3 content-record strategy best fits the current extension and supported TYPO3 version.
- Which AI provider(s) are configured initially.
- Which preview and publishing adapter is needed for the first target environment.
- Which rich-text editor and drag-and-drop library fit the chosen frontend stack and license constraints.

Record decisions in `docs/adr/` and avoid major dependency upgrades without a clear reason.

## 14. Codex working protocol

For each task, Codex must:

1. Confirm the task and its acceptance criteria.
2. Inspect relevant files before editing.
3. Provide a brief plan.
4. Make only the changes required for that task.
5. Run applicable tests, lint, type checks, and builds.
6. Fix regressions caused by the task.
7. Update documentation and `docs/IMPLEMENTATION_STATUS.md`.
8. Report files changed, commands run, results, known gaps, and next recommended task.
9. Stop and wait for explicit instruction before starting the next task.

If a task is too large, split it into smaller subtasks and ask before continuing. Do not claim unimplemented features are complete.

## 15. Implementation checklist

- [ ] Phase 0 — Discovery and baseline
- [ ] Phase 1 — Architecture and shared contracts
- [ ] Phase 2 — Minimal end-to-end vertical slice
- [ ] Phase 3 — Component registry and core library
- [ ] Phase 4 — TYPO3 page and content integration
- [ ] Phase 5 — Astro rendering, routing, and design system
- [ ] Phase 6 — Visual builder MVP
- [ ] Phase 7 — Frontend inline editing and preview
- [ ] Phase 8 — Template library
- [ ] Phase 9 — AI foundation
- [ ] Phase 10 — AI page generation and content editing
- [ ] Phase 11 — AI element creation and design assistance
- [ ] Phase 12 — AI images, SEO, and accessibility
- [ ] Phase 13 — Publishing and deployment integration
- [ ] Phase 14 — Security and production hardening
- [ ] Phase 15 — Packaging and developer documentation

## 16. First Codex instruction

**Execute Phase 0 only.** Inspect the existing repository, identify the actual stack and baseline health, write `docs/PROJECT_DISCOVERY.md`, and propose the smallest end-to-end vertical slice. Do not implement feature code or proceed to Phase 1 until explicitly asked.
