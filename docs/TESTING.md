# Testing

## Astro and shared contract (runs locally and in CI)

```bash
cd apps/astro-frontend
npm test
npm run build
```

The Node test suite (`node:test`, files in `apps/astro-frontend/tests/`) covers:

1. Validator accepts the valid published fixture and the valid draft fixture.
2. Validator rejects invalid props (wrong type, invalid enum, unknown prop, missing required prop).
3. Change plan validator rejects non allowlisted operations and forbidden operations such as publish_page, and rejects remove_element without destructive approval.
4. Registry and renderer sync: every registry component ID has a renderer file.
5. Template validation: all presets, sections, pages and the site template validate against the registry.
6. Preview token logic: token creation and verification, expiry and tamper rejection.
7. Audit checks: deterministic SEO and accessibility checks flag a page with a missing h1 and missing image alt, and pass the fixture home page.

## PHP (CI, and on any machine with PHP)

```bash
find packages/typo3-extension -name "*.php" -print0 | xargs -0 -n1 php -l
```

Locally in this environment PHP is not installed, so a structural smoke check was used instead: every PHP file declares strict types and has balanced braces. That smoke check is documented as a smoke check in `docs/FINAL_REPORT.md`. It is not a substitute for `php -l` or TYPO3 functional tests.

## Not covered yet

1. Live TYPO3 functional tests (require a TYPO3 installation and database).
2. Browser and Playwright tests (no browser automation in this environment). The builder interactions are implemented with standard DOM APIs and the state logic is unit tested through the validator and store modules.
3. Real AI provider calls (by design, tests use the mock provider).
