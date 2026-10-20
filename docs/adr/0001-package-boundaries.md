# ADR 0001: Package boundaries

Status: Accepted, October 2026.

TYPO3 extension and Astro frontend are separate deployable packages. TYPO3 owns content and governance. Astro owns rendering and the editing surface. Neither embeds the other runtime. Consequence: an API contract is required, and preview needs explicit coordination, both accepted costs.
