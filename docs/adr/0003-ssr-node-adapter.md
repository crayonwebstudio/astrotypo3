# ADR 0003: SSR with the Node adapter

Status: Accepted, October 2026.

The first release uses Astro server output with the Node adapter in standalone mode, served on port 4321. Reason: one deployment must serve public pages, token gated preview, API routes and builder save. Static generation remains a documented future option for public pages.
