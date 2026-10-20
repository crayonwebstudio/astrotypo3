# AI Architecture

## Principle

AI returns structured proposals only. Application services validate every proposal, check permissions, and apply approved changes through the same services a human editor uses. AI output never executes PHP, SQL, shell commands or Astro code in normal editing.

## Layers

1. Provider interface (`AiProviderInterface` in TYPO3, mirrored concept in the Astro demo endpoints). Adapters: `MockProvider` (default, deterministic, labelled mock) and `OpenAiCompatibleProvider` (server side key from environment, timeout, one retry, JSON response handling).
2. Orchestration (`AiOrchestrationService`): assembles context (selected element, page summary, registry, design tokens), calls the provider, parses the change plan, validates it, checks a permission callback, and writes an audit record with the plan summary and outcome.
3. Change plan validation (`ChangePlanValidator`, mirrored in `validate.mjs`): allowlisted operations only, from roadmap section 7: create_page, update_page_metadata, add_element, update_element_props, move_element, duplicate_element, remove_element, apply_section_template, apply_page_template, suggest_seo, generate_image_request. Publish, delete page, permission changes and code execution are forbidden operations. Destructive operations such as remove_element require an explicit approval flag.
4. Schema driven element creation (Phase 11): the AI may propose a component schema. Field types are restricted to string, number, boolean, enum, array and rich text. A human must approve before registration, and approval registers data, not executable code. This workflow is implemented as a validated proposal format and documented approval step. It does not auto register components in the demo.
5. Image generation (Phase 12): represented as the `generate_image_request` operation. No image provider is configured in the demo, so the operation produces a request record, not a fake generated image.

## Usage and safety controls

Server side keys only, rate limiting counter on the demo endpoints, usage records in TYPO3 (`tx_astrobuilder_ai_usage`), audit records for applied plans, timeouts and a single retry in the HTTP adapter, and prompt injection treated as untrusted content: context never grants tools or permissions.

## Demo behaviour

Astro endpoints `/api/ai/generate` and `/api/ai/edit` use a deterministic mock: a prompt containing hero, faq or cta keywords produces matching add_element operations, otherwise a heading plus rich text section. Every response includes `"provider": "mock"` and `"mock": true`.
