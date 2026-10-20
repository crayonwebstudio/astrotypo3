import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildGrapesTypes, buildGrapesBlocks, traitsForComponent, traitForProp,
  propsToAttributes, attributesToProps, defaultsForProps, renderElementHtml,
} from '../src/lib/grapesRegistry.mjs';
import {
  ctypeFor, registryToElementTypes, createElementType, mergeElementTypes,
  elementTypeToRegistryComponent, ALLOWED_FIELD_TYPES,
} from '../src/lib/elementTypes.mjs';
import {
  TYPO3_API_BASE, typo3ApiUrl, pageToGrapesComponents, grapesComponentsToPage,
  elementToComponentData, createTypo3ApiClient, resolveApiBase,
  typo3HostFromContentApiUrl, builderSavePath,
} from '../src/lib/typo3Storage.mjs';

const registry = JSON.parse(readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'));
const home = JSON.parse(readFileSync(new URL('../src/data/sample-published.json', import.meta.url), 'utf8'));
const byId = (id) => registry.components.find((c) => c.id === id);

test('every registry component produces a GrapesJS type and a block', () => {
  const types = buildGrapesTypes(registry);
  const blocks = buildGrapesBlocks(registry);
  assert.equal(types.length, 15);
  assert.equal(blocks.length, 15);
  for (const def of registry.components) {
    const type = types.find((t) => t.id === def.id);
    assert.ok(type, 'type for ' + def.id);
    assert.equal(type.category, def.category);
    assert.equal(type.traits.length, Object.keys(def.props).length, 'trait count for ' + def.id);
    assert.equal(type.defaults.attributes['data-astro-component-id'], def.id);
    const block = blocks.find((b) => b.id === def.id);
    assert.ok(block, 'block for ' + def.id);
    assert.equal(block.content.type, def.id);
    assert.equal(block.content.attributes['data-astro-component-id'], def.id);
  }
});

test('traits are generated from the props schema with the right kinds', () => {
  const hero = traitsForComponent(byId('section.hero'));
  assert.equal(hero.find((t) => t.name === 'data-prop-heading').type, 'text');
  const heading = traitsForComponent(byId('content.heading'));
  assert.equal(heading.find((t) => t.name === 'data-prop-level').type, 'number');
  const imageText = traitsForComponent(byId('section.image-text'));
  const reversed = imageText.find((t) => t.name === 'data-prop-reversed');
  assert.equal(reversed.type, 'checkbox');
  assert.equal(reversed.valueTrue, 'true');
  assert.equal(reversed.valueFalse, 'false');
  const button = traitsForComponent(byId('content.button'));
  const variant = button.find((t) => t.name === 'data-prop-variant');
  assert.equal(variant.type, 'select');
  assert.deepEqual(variant.options.map((o) => o.value), ['primary', 'secondary', 'ghost']);
  const grid = traitsForComponent(byId('section.feature-grid'));
  assert.equal(grid.find((t) => t.name === 'data-prop-items').type, 'textarea');
  const rich = traitsForComponent(byId('content.rich-text'));
  assert.equal(rich.find((t) => t.name === 'data-prop-html').type, 'textarea');
  assert.equal(traitForProp('src', { type: 'string' }).type, 'text');
});

test('props survive the attribute round trip for core components', () => {
  for (const def of registry.components) {
    const props = { ...defaultsForProps(def) };
    if (def.id === 'section.image-text') props.reversed = true;
    if (def.id === 'content.heading') props.level = 4;
    const attrs = propsToAttributes(def, props, 'el-test');
    assert.equal(attrs['data-astro-element-id'], 'el-test');
    assert.deepEqual(attributesToProps(def, attrs), props, 'round trip for ' + def.id);
  }
});

test('canvas HTML mirrors the Astro renderers and escapes text props', () => {
  const hero = renderElementHtml(byId('section.hero'), { heading: 'Hi <script>x</script>', subheading: 'Sub', ctaLabel: 'Go', ctaHref: '/x' });
  assert.match(hero, /<section class="hero">/);
  assert.match(hero, /Hi &lt;script&gt;x&lt;\/script&gt;/);
  assert.match(hero, /btn btn-primary/);
  const faq = renderElementHtml(byId('section.faq'), { heading: 'FAQ', items: [{ question: 'Q?', answer: 'A.' }] });
  assert.match(faq, /<details/);
  assert.match(faq, /<summary[^>]*>Q\?<\/summary>/);
  const container = renderElementHtml(byId('layout.container'), { padding: 'lg' }, '<p>child</p>');
  assert.match(container, /padding: 2\.5rem 1\.25rem/);
  assert.match(container, /<p>child<\/p>/);
  const imageText = renderElementHtml(byId('section.image-text'), { heading: 'H', text: 'T', imageSrc: '/i.jpg', reversed: true });
  assert.match(imageText, /image-text reversed/);
});

test('element types: 15 core types with the CType mapping rule', () => {
  const types = registryToElementTypes(registry);
  assert.equal(types.length, 15);
  assert.equal(ctypeFor('section.hero'), 'astro_builder_section_hero');
  const hero = types.find((t) => t.id === 'section.hero');
  assert.equal(hero.ctype, 'astro_builder_section_hero');
  assert.equal(hero.source, 'core');
  assert.deepEqual(hero.fields.find((f) => f.name === 'heading'), { name: 'heading', type: 'string', required: true, default: 'Build better websites' });
  const button = types.find((t) => t.id === 'content.button');
  assert.deepEqual(button.fields.find((f) => f.name === 'variant').values, ['primary', 'secondary', 'ghost']);
});


const pricingPayload = {
  id: 'custom.pricing-table',
  label: 'Pricing Table',
  category: 'custom',
  fields: [
    { name: 'heading', type: 'string', required: true, default: 'Pricing' },
    { name: 'body', type: 'richtext' },
    { name: 'columns', type: 'number', default: 3 },
    { name: 'highlighted', type: 'boolean', default: false },
    { name: 'style', type: 'enum', values: ['simple', 'boxed'], default: 'simple' },
    { name: 'image', type: 'image' },
    { name: 'link', type: 'link' },
    { name: 'plans', type: 'array', default: [] },
  ],
};

test('element types: a valid custom type is created with ctype and defaults', () => {
  const result = createElementType(pricingPayload, registryToElementTypes(registry).map((t) => t.id));
  assert.equal(result.valid, true);
  assert.equal(result.type.ctype, 'astro_builder_custom_pricing_table');
  assert.equal(result.type.source, 'custom');
  assert.equal(result.type.fields.find((f) => f.name === 'columns').default, 3);
  assert.ok(ALLOWED_FIELD_TYPES.includes('richtext'));
});

test('element types: duplicates, bad ids and bad fields are rejected', () => {
  const existing = registryToElementTypes(registry).map((t) => t.id).concat(['custom.pricing-table']);
  assert.equal(createElementType(pricingPayload, existing).valid, false, 'duplicate rejected');
  assert.equal(createElementType({ ...pricingPayload, id: 'Bad ID' }, []).valid, false, 'bad id rejected');
  assert.equal(createElementType({ ...pricingPayload, id: 'custom.x', fields: [{ name: 'f', type: 'video' }] }, []).valid, false, 'bad field type rejected');
  assert.equal(createElementType({ ...pricingPayload, id: 'custom.x', fields: [{ name: 'f', type: 'enum' }] }, []).valid, false, 'enum without values rejected');
  assert.equal(createElementType({ ...pricingPayload, id: 'custom.x', label: '' }, []).valid, false, 'missing label rejected');
  assert.equal(createElementType({ ...pricingPayload, id: 'custom.x', fields: [] }, []).valid, false, 'no fields rejected');
});

test('element types: API type converts back to a registry component for GrapesJS', () => {
  const { type } = createElementType(pricingPayload, []);
  const def = elementTypeToRegistryComponent(type);
  assert.equal(def.id, 'custom.pricing-table');
  assert.equal(def.ctype, 'astro_builder_custom_pricing_table');
  assert.equal(def.props.body.type, 'string', 'richtext fields become string props');
  assert.equal(def.props.columns.type, 'number');
  assert.equal(def.props.style.type, 'enum');
  assert.deepEqual(def.props.style.values, ['simple', 'boxed']);
  const types = buildGrapesTypes({ components: [def] });
  assert.equal(types[0].traits.find((t) => t.name === 'data-prop-style').type, 'select');
  assert.match(renderElementHtml(def, { heading: 'Plans' }), /Pricing Table/);
});

test('mergeElementTypes lets API types win over same-id entries', () => {
  const core = registryToElementTypes(registry);
  const override = [{ ...core[0], label: 'Overridden' }];
  const merged = mergeElementTypes(core, override);
  assert.equal(merged.length, 15);
  assert.equal(merged.find((t) => t.id === core[0].id).label, 'Overridden');
});

test('storage round trip preserves the fixture page elements', () => {
  const components = pageToGrapesComponents(home, registry);
  assert.equal(components.length, home.elements.length);
  const back = grapesComponentsToPage(components, { id: home.id, slug: home.slug, title: home.title, locale: home.locale, seo: home.seo }, registry);
  const expected = home.elements.map((el) => {
    const def = byId(el.componentId);
    return { id: el.id, componentId: el.componentId, props: { ...defaultsForProps(def), ...el.props } };
  });
  assert.deepEqual(back.elements, expected);
  assert.equal(back.slug, 'home');
});

test('storage round trip preserves nested container children', () => {
  const page = {
    id: 'p1', slug: 'nested', title: 'Nested', locale: 'en', seo: {},
    elements: [
      { id: 'el-wrap', componentId: 'layout.container', props: { padding: 'sm', background: 'transparent', maxWidth: 'lg' }, children: [
        { id: 'el-h', componentId: 'content.heading', props: { text: 'Inside', level: 3, align: 'center' } },
        { id: 'el-b', componentId: 'content.button', props: { label: 'Go', href: '/go', variant: 'secondary' } },
      ] },
    ],
  };
  const components = pageToGrapesComponents(page, registry);
  assert.equal(components[0].components.length, 2);
  const back = grapesComponentsToPage(components, { id: 'p1', slug: 'nested', title: 'Nested' }, registry);
  assert.deepEqual(back.elements, page.elements);
  const unknown = elementToComponentData({ id: 'el-u', componentId: 'custom.unknown', props: { a: 1 } }, registry);
  const backUnknown = grapesComponentsToPage([unknown], { slug: 'x' }, registry);
  assert.deepEqual(backUnknown.elements[0].props, { a: 1 }, 'unknown types stay lossless via props JSON');
});

test('storage client targets the contract endpoints and the config base URL', () => {
  assert.equal(TYPO3_API_BASE, '');
  assert.equal(typo3ApiUrl('/api/v1/element-types', 'https://typo3.example/'), 'https://typo3.example/api/v1/element-types');
  assert.equal(typo3ApiUrl('/api/v1/element-types'), '/api/v1/element-types');
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/api/v1/element-types') && (!options || !options.method)) {
      return { ok: true, status: 200, json: async () => ({ types: [{ id: 'section.hero' }] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return (async () => {
    const api = createTypo3ApiClient({ base: 'https://typo3.example', fetchFn: fakeFetch });
    const types = await api.loadElementTypes();
    assert.deepEqual(types, [{ id: 'section.hero' }]);
    const missing = await api.loadPage('nope');
    assert.equal(missing, null, '404 page loads as null');
    assert.equal(calls[0][0], 'https://typo3.example/api/v1/element-types');
  })();
});

test('builder config resolution: injected config wins, then window override, then constant', () => {
  assert.equal(
    typo3HostFromContentApiUrl('https://typo3.woodwolfdigital.com/api/content/v1'),
    'https://typo3.woodwolfdigital.com',
    'content API URL is reduced to the TYPO3 host root',
  );
  assert.equal(typo3HostFromContentApiUrl('https://typo3.woodwolfdigital.com/api/content/v1/'), 'https://typo3.woodwolfdigital.com');
  assert.equal(typo3HostFromContentApiUrl('https://typo3.example'), 'https://typo3.example', 'host root passes through');
  assert.equal(typo3HostFromContentApiUrl(''), '');
  assert.equal(typo3HostFromContentApiUrl(undefined), '');
  assert.equal(
    resolveApiBase({ config: { apiBase: 'https://typo3.example/' }, override: 'https://other.example', fallback: 'https://third.example' }),
    'https://typo3.example',
    'injected builder config has priority and is slash trimmed',
  );
  assert.equal(
    resolveApiBase({ config: { apiBase: '' }, override: 'https://other.example/', fallback: 'https://third.example' }),
    'https://other.example',
    'manual override is next',
  );
  assert.equal(resolveApiBase({ config: undefined, override: undefined, fallback: '' }), '', 'empty fallback means demo mode');
  assert.equal(resolveApiBase({}), '', 'default constant is the demo API');
  assert.equal(builderSavePath(''), '/api/builder/save', 'demo save path unchanged');
  assert.equal(builderSavePath('https://typo3.example'), '/api/builder/v1/save', 'TYPO3 save path is versioned');
});

test('storage client sends the preview token header on TYPO3 writes only when a token is set', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push([url, options]);
    return { ok: true, status: 200, json: async () => ({ notice: 'saved', type: { id: 'custom.x' } }) };
  };
  let token = '';
  const api = createTypo3ApiClient({ base: 'https://typo3.example', fetchFn: fakeFetch, getToken: () => token });
  assert.equal(api.savePath, '/api/builder/v1/save');

  await api.storePage({ slug: 'home', elements: [] });
  assert.equal(calls[0][0], 'https://typo3.example/api/builder/v1/save');
  assert.equal(calls[0][1].headers['x-preview-token'], undefined, 'no token header before a token is entered');

  token = 'tok-abc';
  await api.storePage({ slug: 'home', elements: [] });
  assert.equal(calls[1][1].headers['x-preview-token'], 'tok-abc', 'save sends the token header');
  const created = await api.createElementType({ id: 'custom.x' });
  assert.equal(calls[2][0], 'https://typo3.example/api/v1/element-types');
  assert.equal(calls[2][1].headers['x-preview-token'], 'tok-abc', 'element type create sends the token header');
  assert.equal(created.id, 'custom.x');

  const demoCalls = [];
  const demo = createTypo3ApiClient({
    base: '',
    fetchFn: async (url, options) => { demoCalls.push([url, options]); return { ok: true, status: 200, json: async () => ({}) }; },
    getToken: () => 'tok-abc',
  });
  await demo.storePage({ slug: 'home', elements: [] });
  assert.equal(demoCalls[0][0], '/api/builder/save', 'demo base keeps the original save path');
});
