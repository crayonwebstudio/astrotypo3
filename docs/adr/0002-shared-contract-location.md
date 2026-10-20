# ADR 0002: Shared contract location

Status: Accepted, October 2026.

Component registry, templates, schemas and validator logic live in `packages/shared-contract/` as a dedicated package. Both apps consume it. The Astro app bundles synced copies under `src/data/` and `src/lib/` for a self contained Docker build, and a test guards registry and renderer sync. The PHP registry service reads the same JSON files in a TYPO3 install.
