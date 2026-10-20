=== ROUTES ===
/                HTTP 200  7331 bytes
/about           HTTP 200  3792 bytes
/builder         HTTP 200  25288 bytes
/templates       HTTP 200  13477 bytes
/audit           HTTP 200  4094 bytes
/sitemap.xml     HTTP 200  234 bytes
/robots.txt      HTTP 200  122 bytes
/no-such-page    HTTP 404 (expected 404)

=== HOMEPAGE CONTENT CHECK ===
<title>AstroTYPO3: TYPO3 and Astro Visual Builder</title>
hero mentions: 2
<title>Visual builder: AstroTYPO3</title>
<title>Template library: AstroTYPO3</title>

=== CONTENT API (published) ===
{"id":"page-home","slug":"home","title":"Home","status":"published","locale":"en","seo":{"title":"AstroTYPO3: TYPO3 and Astro Visual Builder","description":"AI powered visual website builder with a TYPO3 extension and an Astro frontend, connected by a shared content contract.","canonical":"https://astrotypo3.woodwolfdigital.com/"},"elements":[{"id":"el-header","componentId":"navigation.header","pr

=== DRAFT API PROTECTION ===
no token:  HTTP 401 (expected 401)
with token: HTTP 200
{"id":"page-draft-home","slug":"home","title":"Home (draft)","status":"draft","locale":"en","seo":{"title":"Draft Home: AstroTYPO3","description":"Draft version used to demonstrate protected preview.","canonical":""},"elements":[{"id":"el-draft-hero"

=== PREVIEW PAGE ===
no token:  HTTP 401 (expected 401)
with token: HTTP 200, DRAFT badge: 1

=== AI GENERATE (mock provider, labelled) ===
{"provider":"mock","mock":true,"plan":{"summary":"Mock plan with 2 operation(s). Review before applying.","operations":[{"type":"add_element","element":{"id":"el-ai-hero-3-mvgiytdy","componentId":"section.hero","props":{"heading":"A new page from the mock provider","subheading":"This structure was generated deterministically for the demo.","ctaLabel":"Get started","ctaHref":"/builder"}}},{"type":"add_element","element":{"id":"el-ai-features-4-mvgiytdy","componentId":"section.feature-grid","props

=== AI EDIT (mock) ===
{"provider":"mock","mock":true,"plan":{"summary":"Mock edit plan. Review before applying.","operations":[{"type":"update_element_props","elementId":"el-hero","componentId":"section.hero","props":{"subheading":"Edited by the mock provider. Review before applying."}}]},"validation":{"valid":true,"errors":[]}}

=== BUILDER SAVE ===
valid:   HTTP 200
{"status":"saved","demoMode":true,"fileSaved":true,"notice":"Demo mode: saved as a draft in the demo store only. In production this save goes to TYPO3 with editor authentication.","page":{"id":"page-x","slug":"home","title":"Home","status":"draft","locale":"en","seo":{"title":"t","description":"d","
invalid: HTTP 422 (expected 422)

=== PUBLISH (no webhook configured, must fail honestly) ===
{"status":"error","jobId":"publish-f9592747-62c0-4546-a5ba-f98d0522d239","message":"No publish webhook configured. Set PUBLISH_WEBHOOK_URL to enable publishing. Nothing was published.","demoMode":true}
HTTP 502

