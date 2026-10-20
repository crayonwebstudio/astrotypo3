# Security

## Threat model summary

Assets: draft content, editor permissions, AI provider keys, publish webhooks. Attackers: anonymous visitors, malicious content or prompts, compromised editor accounts.

## Controls implemented

1. Draft separation: public endpoints filter to published content only. Draft endpoints require a preview token.
2. Preview tokens: TYPO3 issues HMAC SHA256 tokens over slug, expiry and user id with a server secret, compared with `hash_equals`. The Astro demo mirrors the same construction. Demo shortcut: the literal token `demo` is accepted only by the Astro demo preview page and API when no secret is configured, and the UI labels it as demo mode. Never enable that shortcut in production.
3. Permissions: TYPO3 services check backend user permissions through an injectable permission checker before save, publish and AI apply. The demo builder is local only and labelled demo.
4. Validation: all page, element, template and change plan input passes the shared validator. Unknown props and unknown components are rejected.
5. Rich text: PHP `Sanitizer` and the Astro renderer allow an allowlist of tags (p, strong, em, a with safe href, ul, ol, li, br, h3, h4, blockquote). Script, event handlers and javascript URLs are stripped.
6. Editing bridge: messages must match the expected origin (same origin in the demo), a fixed message type set and a JSON schema. Unknown messages are ignored and logged to the console in preview mode only.
7. Secrets: no keys in the repository. Provider keys and webhook secrets come from environment variables. `.gitignore` excludes `.env`.
8. AI endpoints: rate limit counter per client in the demo, server side provider calls only, usage logging in TYPO3.
9. Publishing webhooks: HMAC signature header, idempotency key per publish job, status tracked, failures reported as failures.
10. Uploads: this demo accepts no uploads. In TYPO3, media goes through FAL with its file type and permission checks. Do not add direct upload endpoints without reusing FAL.

## Known limitations

1. The Astro demo save endpoint persists to memory and a local JSON file. It is not authenticated. It exists to demonstrate the contract and must not be exposed as a production editor backend. Production editing belongs in TYPO3.
2. Browser tests were not run in this environment. Interaction logic is covered by unit tests on the underlying modules and by build verification.
3. PHP code was not executed locally (no PHP runtime in this environment). CI runs `php -l`. A staging TYPO3 install is still required before production use.

## Production checklist

Set strong preview and webhook secrets, put TYPO3 behind its normal backend authentication, disable the demo token shortcut by configuring a secret, configure HTTPS, set AI budget and rate limits, and review audit logs.
