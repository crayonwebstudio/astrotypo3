# ADR 0005: GrapesJS as the external visual builder

Status: Accepted
Date: 20 October 2026

## Decision

The visual builder is GrapesJS 0.23.8 (BSD-3-Clause), embedded in the Astro frontend at `/builder`. The builder is external to TYPO3: there is no builder interface inside the TYPO3 backend. TYPO3 is the content engine and is reached through the API only.

How the pieces fit:

- Component types and blocks are generated from the shared registry at runtime (`apps/astro-frontend/src/lib/grapesRegistry.mjs`). Every registry component becomes one GrapesJS component type and one block. Props become traits generated from the props schema: string to a text trait, boolean to a checkbox, enum to a select, number to a number trait, array and object to a JSON text trait.
- Builder component type is the TYPO3 core content element type (CType) and traits are its `tt_content` fields. Props are stored on canvas components as `data-prop-*` attributes plus `data-astro-component-id` and a stable `data-astro-element-id`, so the canvas serializes back to page JSON (elements array) losslessly for the core types.
- Canvas rendering is builder side rendering of the same props contract: the mapping module produces markup equivalent to the Astro renderers in `src/components`, with the frontend tokens and global CSS loaded into the canvas frame. The published site is still rendered by Astro from page JSON, never from builder HTML.
- Persistence goes through a custom GrapesJS storage manager type named `typo3-api` (`apps/astro-frontend/src/lib/typo3Storage.mjs`): load reads `GET /api/content/v1/pages/<slug>`, store serializes the canvas to page JSON and posts to `POST /api/builder/save`. Autosave is off; saving is explicit, with an unsaved indicator from the editor dirty count. The API base URL is one config constant (`TYPO3_API_BASE`, empty means same origin demo API) so the builder can point at a real TYPO3 host later without code changes.
- Element types come from `GET /api/v1/element-types` and are merged over the bundled registry (API wins). Creating a type in the builder posts to the same endpoint; the returned type is registered into GrapesJS live (component type plus block) without a reload. The CType rule is `astro_builder_` plus the type id with dots and dashes replaced by underscores. On the TYPO3 side the extension implements the same contract (`ElementTypeApiController`, `ElementTypeRegistryService`, table `tx_astrobuilder_element_type`, TCA override for `tt_content`); created types become real core elements, selectable in the backend after a cache flush because TCA is built at bootstrap.
- The Style Manager edits canvas presentation only. It is not part of the TYPO3 content contract; published styling comes from the design tokens and the Astro renderers.
- The AI panel stays a labelled mock. Applying a plan adds its elements to the canvas as GrapesJS components after the existing change plan validation.

## Alternatives considered

- VvvebJs (Apache-2.0). Its model is HTML first: pages are edited as HTML documents and sections are HTML blocks. Our contract is structured the other way round: a page is typed elements whose props map 1:1 to TYPO3 CTypes and `tt_content` fields, and the public HTML is a render of that structure. GrapesJS has a structured component and trait model that matches the CType mapping directly; VvvebJs would have forced an HTML parsing layer between the builder and the contract.
- Puck (MIT). A React component editor with a clean model, but it would add a React application inside the Astro frontend for one page, and its field model still needs the same trait and storage mapping work.
- Framely (MIT). A full Next.js SaaS application, not an embeddable editor library.
- Webstudio (AGPL-3.0). Copyleft licence is a poor fit for a product we may ship closed, and it is a full builder product rather than a library.
- Keep the hand written demo builder. It was a list of rows with a schema inspector, useful as a placeholder, but it is not a visual canvas and reimplementing drag and drop, devices, undo and selection properly is exactly what an editor library already does well.

## Consequences

- The builder bundle is large (GrapesJS is most of it, about 1.17 MB uncompressed JS for the builder route). Only the builder route pays this cost; public pages are unaffected.
- Complex props (arrays such as feature grid items) are edited as JSON text in traits. A per item sub editor is future work, not hidden.
- Demo mode stores element types and saved pages in local JSON files behind demo labelled endpoints. Production behaviour comes from the TYPO3 endpoints with the same shapes; the TYPO3 create endpoint additionally requires a token for the `element-types` scope.
- One contract difference to close later: the demo element types validator accepts a `richtext` field type, while the TYPO3 service currently lists `text` and `object` instead. The builder converts richtext fields to string props either way.
