# Project Discovery (Phase 0)

## What was inspected

The starting point was an empty repository plus one source document: `typo3-astro-ai-visual-builder-roadmap.md`, copied unchanged to the repository root. There was no existing TYPO3 extension, no Astro app, no tests and no deployment configuration to preserve. Nothing working was replaced.

## Local environment found

| Item | Found |
|---|---|
| Node.js | v24.20.0 |
| npm | 10.9.4 |
| PHP | Not installed locally (`php: command not found`) |
| Composer | Not installed locally |
| Repository | Empty, fresh |

Consequence: the Astro app is built and tested locally with real commands. PHP code is written carefully with strict types and checked with a structural smoke check (strict types declaration present, balanced braces). PHP syntax with `php -l` and a live TYPO3 runtime are documented as unverified locally and are covered by CI (shivammathur setup-php job) and by `docs/INSTALLATION.md`.

## Versions chosen, with compatibility reasoning

| Choice | Reason |
|---|---|
| TYPO3 ^13.4 LTS | Current LTS line. Requires PHP ^8.2. Supported backend, TCA, services and middleware APIs used here match v13 conventions. |
| PHP ^8.2 (CI uses 8.3) | Minimum for TYPO3 13.4, widely available in official php images. |
| Astro 5.x | Current stable major at build time (October 2026 baseline). Works on Node 24. |
| @astrojs/node adapter, standalone mode | The Coolify target serves a long running Node server on port 4321. Static output cannot serve the API routes, preview gating or builder save endpoint, so SSR with the Node adapter is the correct first mode. See ADR 0003. |
| Node 24 | Matches the local runtime and the Docker base image `node:24-alpine`. |
| No frontend framework (no React) | The builder is implemented in vanilla TypeScript in the browser. This keeps the bundle small and avoids a framework dependency for one interactive page. |
| No drag and drop library | HTML5 drag and drop plus button based reordering covers the MVP and avoids license and weight questions raised in the roadmap. |

## Smallest vertical slice (implemented first, then expanded)

TYPO3 contract fixture page, rendered by an Astro route through a component renderer, starting with `section.hero`, then expanded to all 15 registry components, the builder, preview, templates, mock AI and publishing demo adapter.

## Assumptions

1. TYPO3 is the source of truth for pages in production. The Astro demo ships fixtures that follow the same contract so the frontend works before TYPO3 is reachable.
2. The shared contract lives in a dedicated package (ADR 0002), not inside either app.
3. The first deployment target is SSR on Coolify at astrotypo3.woodwolfdigital.com. Static and hybrid modes are documented, not used by the demo.
4. No real AI provider is configured initially. The mock provider is the default (roadmap Phase 9 exit criteria require mocked provider tests).
5. The first publishing adapter is a webhook adapter, with a demo adapter that fails honestly when unconfigured.

## Open questions for the product owner

1. Which real AI provider and model should be enabled first, and what monthly budget cap applies?
2. Is the production TYPO3 a fresh 13.4 install or an upgrade of an existing site?
3. Should published pages be revalidated by webhook only, or is a scheduled full build also wanted?
4. Which rich text editor profile should the TYPO3 backend use for `content.rich-text`?
