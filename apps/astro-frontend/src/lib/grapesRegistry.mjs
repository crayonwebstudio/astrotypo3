// GrapesJS mapping for the shared component registry.
//
// The builder is GrapesJS (BSD-3-Clause, see docs/adr/0005). This module is
// the pure, testable half of the integration: it turns registry component
// definitions into GrapesJS component type descriptors (traits generated
// from the props schema) and blocks, converts props to and from HTML
// attributes, and renders canvas HTML equivalent to the Astro renderers in
// src/components. The browser-only half (editor.DomComponents.addType with
// model and view behaviour) lives in src/pages/builder.astro and consumes
// these descriptors.
//
// Props live on the canvas as attributes so GrapesJS traits (which edit
// attributes by default) are the property editor:
//   data-astro-component-id   the registry component id (== builder type)
//   data-astro-element-id     the stable page element id
//   data-prop-<name>          one attribute per prop, stringified:
//                             string/enum as-is, number as decimal text,
//                             boolean as "true"/"false", array/object as JSON.

import { iconForComponent } from './blockIcons.mjs';

export const PROP_ATTRIBUTE_PREFIX = 'data-prop-';

export function propAttributeName(propName) {
  return PROP_ATTRIBUTE_PREFIX + propName;
}

function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Default props for a registry component definition. */
export function defaultsForProps(def) {
  const props = {};
  for (const [name, spec] of Object.entries((def && def.props) || {})) {
    if (spec.default !== undefined) props[name] = clone(spec.default);
  }
  return props;
}

/** One GrapesJS trait descriptor for one prop schema entry. */
export function traitForProp(name, spec) {
  const trait = { name: propAttributeName(name), label: name + (spec.required ? ' *' : '') };
  switch (spec.type) {
    case 'boolean':
      return { ...trait, type: 'checkbox', valueTrue: 'true', valueFalse: 'false' };
    case 'enum':
      return { ...trait, type: 'select', options: (spec.values || []).map((v) => ({ id: v, value: v, name: v })) };
    case 'number':
      return { ...trait, type: 'number' };
    case 'array':
    case 'object':
      // Complex props are edited as JSON text. Documented in the builder UI
      // and in docs/adr/0005: there is no per-item sub-editor in this slice.
      return { ...trait, type: 'textarea', label: trait.label + ' (JSON)' };
    case 'text':
    case 'richtext':
      return { ...trait, type: 'textarea' };
    default:
      // string, image, link and anything new: single line text. The rich
      // text body prop is named "html" in the registry, give it a textarea.
      return { ...trait, type: name === 'html' ? 'textarea' : 'text' };
  }
}

export function traitsForComponent(def) {
  return Object.entries((def && def.props) || {}).map(([name, spec]) => traitForProp(name, spec));
}

function stringifyProp(spec, value) {
  if (value === undefined || value === null) return undefined;
  if (spec.type === 'boolean') return value ? 'true' : 'false';
  if (spec.type === 'array' || spec.type === 'object') return JSON.stringify(value);
  return String(value);
}

function parseProp(spec, raw) {
  if (raw === undefined) return undefined;
  if (spec.type === 'boolean') return raw === 'true' || raw === true;
  if (spec.type === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : spec.default; }
  if (spec.type === 'array' || spec.type === 'object') {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return spec.type === 'array' ? [] : {}; }
  }
  return String(raw);
}

/** Props object to GrapesJS component attributes (including identity). */
export function propsToAttributes(def, props = {}, elementId = '') {
  const attributes = { 'data-astro-component-id': def.id };
  if (elementId) attributes['data-astro-element-id'] = elementId;
  const withDefaults = { ...defaultsForProps(def), ...props };
  for (const [name, spec] of Object.entries(def.props || {})) {
    const s = stringifyProp(spec, withDefaults[name]);
    if (s !== undefined) attributes[propAttributeName(name)] = s;
  }
  return attributes;
}

/** GrapesJS component attributes back to a props object. */
export function attributesToProps(def, attributes = {}) {
  const props = {};
  for (const [name, spec] of Object.entries((def && def.props) || {})) {
    const raw = attributes[propAttributeName(name)];
    if (raw === undefined) {
      if (spec.default !== undefined) props[name] = clone(spec.default);
      continue;
    }
    props[name] = parseProp(spec, raw);
  }
  return props;
}


// ---------------------------------------------------------------------------
// Canvas rendering. These builders produce markup equivalent to the Astro
// renderers in src/components/<id>.astro for the same props, so what the
// editor sees on the canvas follows the same contract as the public site.
// Text props are escaped. The rich text "html" prop is inserted as-is,
// mirroring the Astro renderer (which sanitizes server side before output).
// ---------------------------------------------------------------------------

function linkList(links) {
  return '<ul>' + (links || []).map((l) => '<li><a href="' + esc(l.href || '/') + '">' + esc(l.label || '') + '</a></li>').join('') + '</ul>';
}

export function renderElementHtml(def, props = {}, childrenHtml = '') {
  const p = { ...defaultsForProps(def || {}), ...props };
  switch (def && def.id) {
    case 'layout.container': {
      const pad = p.padding === 'lg' ? '2.5rem' : p.padding === 'sm' ? '0.75rem' : '1.25rem';
      return '<div class="container-wrap" style="max-width: var(--container); margin: 0 auto; padding: ' + pad + ' 1.25rem;' + (p.background && p.background !== 'transparent' ? ' background: ' + esc(p.background) + ';' : '') + '">' + childrenHtml + '</div>';
    }
    case 'layout.columns':
      return '<div style="display:grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">' + childrenHtml + '</div>';
    case 'content.heading': {
      const level = Math.min(6, Math.max(1, Number(p.level ?? 2) || 2));
      return '<h' + level + ' style="text-align: ' + esc(p.align || 'left') + '">' + esc(p.text || '') + '</h' + level + '>';
    }
    case 'content.rich-text':
      return '<div style="text-align: ' + esc(p.align || 'left') + '">' + (p.html || '') + '</div>';
    case 'content.image':
      return '<figure><img src="' + esc(p.src || '') + '" alt="' + esc(p.alt || '') + '" width="' + esc(p.width ?? 1200) + '" height="' + esc(p.height ?? 800) + '" loading="lazy" />' + (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '') + '</figure>';
    case 'content.button':
      return '<p><a class="btn btn-' + esc(p.variant || 'primary') + '" href="' + esc(p.href || '/') + '">' + esc(p.label || 'Learn more') + '</a></p>';
    case 'content.divider':
      return '<hr aria-hidden="true" style="border: none; border-top: 2px solid var(--color-border); margin: 2rem 0;" />';
    case 'section.hero':
      return '<section class="hero"><div class="container"><h1>' + esc(p.heading || '') + '</h1>' +
        (p.subheading ? '<p style="font-size: 1.2rem; max-width: 42rem;">' + esc(p.subheading) + '</p>' : '') +
        (p.ctaLabel ? '<p><a class="btn btn-primary" href="' + esc(p.ctaHref || '/') + '">' + esc(p.ctaLabel) + '</a></p>' : '') +
        (p.imageSrc ? '<img src="' + esc(p.imageSrc) + '" alt="' + esc(p.imageAlt || '') + '" loading="lazy" />' : '') +
        '</div></section>';
    case 'section.feature-grid':
      return '<section style="padding: var(--space-lg) 0;"><div class="container">' +
        (p.heading ? '<h2>' + esc(p.heading) + '</h2>' : '') +
        '<ul class="grid" style="list-style:none; padding:0;">' +
        (p.items || []).map((item) => '<li class="card"><h3>' + esc(item.title || '') + '</h3><p>' + esc(item.text || '') + '</p></li>').join('') +
        '</ul></div></section>';
    case 'section.image-text':
      return '<section style="padding: var(--space-lg) 0;"><div class="container"><div class="image-text' + (p.reversed ? ' reversed' : '') + '">' +
        '<figure><img src="' + esc(p.imageSrc || '') + '" alt="' + esc(p.imageAlt || '') + '" loading="lazy" /></figure>' +
        '<div><h2>' + esc(p.heading || '') + '</h2><p>' + esc(p.text || '') + '</p></div>' +
        '</div></div></section>';
    case 'section.testimonials':
      return '<section style="padding: var(--space-lg) 0;"><div class="container">' +
        (p.heading ? '<h2>' + esc(p.heading) + '</h2>' : '') +
        '<div class="grid">' +
        (p.items || []).map((item) => '<blockquote class="card"><p>' + esc(item.quote || '') + '</p><footer><cite>' + esc(item.name || '') + '</cite>' + (item.role ? '<span> (' + esc(item.role) + ')</span>' : '') + '</footer></blockquote>').join('') +
        '</div></div></section>';
    case 'section.faq':
      return '<section style="padding: var(--space-lg) 0;"><div class="container">' +
        (p.heading ? '<h2>' + esc(p.heading) + '</h2>' : '') +
        (p.items || []).map((item) => '<details class="card" style="margin-bottom: 0.75rem;"><summary style="font-weight:700; cursor:pointer;">' + esc(item.question || '') + '</summary><p>' + esc(item.answer || '') + '</p></details>').join('') +
        '</div></section>';
    case 'section.cta':
      return '<section style="padding: var(--space-lg) 0;"><div class="container card" style="text-align:center;"><h2>' + esc(p.heading || '') + '</h2>' +
        (p.text ? '<p>' + esc(p.text) + '</p>' : '') +
        (p.ctaLabel ? '<p><a class="btn btn-primary" href="' + esc(p.ctaHref || '/') + '">' + esc(p.ctaLabel) + '</a></p>' : '') +
        '</div></section>';
    case 'navigation.header':
      return '<header class="site-header"><div class="container"><a class="brand" href="/">' + esc(p.brand || 'AstroTYPO3') + '</a><nav aria-label="Main">' + linkList(p.links) + '</nav></div></header>';
    case 'navigation.footer':
      return '<footer class="site-footer"><div class="container"><p>' + esc(p.text || '') + '</p><nav aria-label="Footer">' + linkList(p.links) + '</nav></div></footer>';
    default: {
      // Generic canvas render for API-created element types that have no
      // dedicated Astro renderer yet: label plus a readable prop summary.
      const rows = Object.entries(def && def.props || {}).map(([name]) => {
        const v = p[name];
        const text = v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        return '<p style="margin: 0.25rem 0;"><strong>' + esc(name) + ':</strong> ' + esc(text) + '</p>';
      }).join('');
      return '<div class="card"><h3>' + esc((def && def.label) || (def && def.id) || 'Element') + '</h3>' + rows + childrenHtml + '</div>';
    }
  }
}

// ---------------------------------------------------------------------------
// GrapesJS descriptors. Plain data: builder.astro turns each type descriptor
// into a DomComponents.addType call (adding model/view behaviour) and each
// block descriptor into a BlockManager.add call.
// ---------------------------------------------------------------------------

export function buildGrapesTypes(registry) {
  return (registry.components || []).map((def) => ({
    id: def.id,
    label: def.label,
    category: def.category || 'content',
    ctype: def.ctype || null,
    traits: traitsForComponent(def),
    propSpecs: def.props || {},
    childrenAllowed: def.childrenAllowed ? [...def.childrenAllowed] : null,
    defaults: { attributes: propsToAttributes(def, {}) },
  }));
}

export function buildGrapesBlocks(registry) {
  return (registry.components || []).map((def) => ({
    id: def.id,
    label: def.label,
    category: def.category || 'content',
    title: def.description || def.label,
    // Icon tile thumbnail for the Blocks view (see lib/blockIcons.mjs).
    media: iconForComponent(def.id),
    content: { type: def.id, attributes: propsToAttributes(def, {}) },
  }));
}
