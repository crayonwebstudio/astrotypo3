# Components and Templates

## Registry

`packages/shared-contract/registry.json` is the single source of truth. It defines 15 components: layout.container, layout.columns, content.heading, content.rich-text, content.image, content.button, content.divider, section.hero, section.feature-grid, section.image-text, section.testimonials, section.faq, section.cta, navigation.header and navigation.footer.

Each definition has: id, version, category, label, description, a props schema with types, defaults and required flags, optional `childrenAllowed`, accessibility notes and AI guidance.

A contract test asserts that every registry ID has a matching Astro renderer file in `apps/astro-frontend/src/components/`. Adding a component means: add the registry entry, add the renderer, add builder support automatically (the inspector is generated from the props schema), and add a test fixture if it has new prop types.

## Templates

`packages/shared-contract/templates.json` has four levels:

1. Element presets: 4 configured elements.
2. Section templates: 4 reusable sections.
3. Page templates: home, about, services, contact, landing.
4. Site template: agency starter with design tokens and the four main pages.

Applying a template in the demo offers create or append behaviour in the builder and never silently overwrites: the templates page asks the builder to load a template into a new draft or append its elements, and the existing draft stays in localStorage until the editor saves over it explicitly.

## Authoring a new component

1. Add the definition to `registry.json` with a props schema and defaults.
2. Create `src/components/<id>.astro` in the Astro app that renders semantic, accessible markup from props.
3. Run `npm test`. The registry and renderer sync test will fail until the renderer exists.
4. Mirror any new validation need in the PHP `ValidationService`.
