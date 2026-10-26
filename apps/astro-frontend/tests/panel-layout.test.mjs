// Regression test: top panel bar layout against the REAL GrapesJS CSS.
//
// Why this test exists: rounds 1 and 2 set the panel bar order with
// config defaults order and with flex order + margin-left auto in the
// page CSS, and the live bar still rendered switcher first, actions
// next, devices buried, plus the first Blocks category title ("layout")
// was hidden under the bar. The config and DOM were always correct;
// the broken mechanism was CSS: the GrapesJS theme styles every panel
// as .gjs-pn-panel { position: absolute; display: inline-block;
// z-index: 3 }, and PanelView adds that class to all four mount points
// (.panel__top itself and the three sub-panel mounts). Out of flow,
// the mounts stacked at one static position painting in DOM order
// (switcher last, on top), flex order never applied, the bar's height
// collapsed, and the floating bar overlaid the first ~41px of the
// editor area, covering the layout category title.
//
// This test inits the real grapesjs 0.23.8 in jsdom with the page's
// own stylesheet blocks (extracted from builder.astro) layered over
// the real grapes.min.css, exactly like the served page, and asserts
// COMPUTED styles, not config: the mounts must compute to position
// static inside a flex .panel__top with the pinned order, and the
// first block category title must be rendered visible and open.
// jsdom has no layout engine, so geometry (overlap, heights in px)
// cannot be asserted here; what is asserted is the cascade outcome
// that determines the geometry in a real browser.

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const pageSource = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
const registry = JSON.parse(readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'));
const grapesCss = readFileSync(new URL('../node_modules/grapesjs/dist/css/grapes.min.css', import.meta.url), 'utf8');

function styleBlock(source, openTag) {
  const start = source.indexOf(openTag);
  assert.ok(start >= 0, 'style block present: ' + openTag);
  const end = source.indexOf('</style>', start);
  return source.slice(start + openTag.length, end);
}
const scopedCss = styleBlock(pageSource, '<style>');
const globalCss = styleBlock(pageSource, '<style is:global>');

let grapesjs;
let panelsLib;
let registryLib;
let editor;
let dom;

function installDom() {
  dom = new JSDOM(`<!doctype html><html><head></head><body>
  <div class="builder-shell">
    <div class="editor-area">
      <div class="panel__top">
        <div class="panel__devices"></div>
        <div class="panel__product"></div>
        <div class="panel__basic-actions"></div>
        <div class="panel__switcher"></div>
      </div>
      <div class="editor-main">
        <aside id="panel-left" class="panel__left"><div id="layers"></div></aside>
        <main id="gjs"></main>
        <aside class="panel__right">
          <div id="view-blocks" class="editor-view"><div id="blocks"></div></div>
          <div id="view-styles" class="editor-view" hidden><div id="styles-box"></div></div>
          <div id="view-traits" class="editor-view" hidden><div id="selected-info"></div><div id="traits-box"></div></div>
        </aside>
      </div>
    </div>
  </div>
  </body></html>`, { url: 'http://localhost/builder', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try { globalThis.localStorage = dom.window.localStorage; } catch { /* jsdom getter quirks */ }
  for (const k of ['HTMLElement', 'Element', 'Node', 'CustomEvent', 'Event']) globalThis[k] = dom.window[k];
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  const RO = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.ResizeObserver = RO;
  dom.window.ResizeObserver = RO;
  const mm = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  globalThis.matchMedia = mm;
  dom.window.matchMedia = mm;
  // Same layering as the served page: GrapesJS stylesheet first, then
  // the page's own blocks.
  for (const css of [grapesCss, scopedCss, globalCss]) {
    const st = dom.window.document.createElement('style');
    st.textContent = css;
    dom.window.document.head.appendChild(st);
  }
}

before(async () => {
  installDom();
  grapesjs = (await import('grapesjs')).default;
  panelsLib = await import('../src/lib/builderPanels.mjs');
  registryLib = await import('../src/lib/grapesRegistry.mjs');

  editor = grapesjs.init({
    container: '#gjs',
    fromElement: false,
    noticeOnUnload: false,
    storageManager: false,
    deviceManager: {
      devices: [
        { name: 'Desktop', width: '' },
        { name: 'Tablet', width: '768px', widthMedia: '992px' },
        { name: 'Mobile', width: '390px', widthMedia: '575px' },
      ],
    },
    blockManager: { appendTo: '#blocks' },
    layerManager: { appendTo: '#layers' },
    traitManager: { appendTo: '#traits-box' },
    styleManager: { appendTo: '#styles-box' },
    panels: panelsLib.buildPanelsConfig(),
    plugins: [(ed) => { panelsLib.registerBuilderCommands(ed, {}); }],
  });

  for (const def of registry.components) {
    const typeDesc = registryLib.buildGrapesTypes({ components: [def] })[0];
    if (!editor.DomComponents.getType(def.id)) {
      editor.DomComponents.addType(def.id, { model: { defaults: { traits: typeDesc.traits, attributes: typeDesc.defaults.attributes, droppable: false } } });
    }
    const block = registryLib.buildGrapesBlocks({ components: [def] })[0];
    if (!editor.BlockManager.get(block.id)) {
      editor.BlockManager.add(block.id, { label: block.label, category: block.category, title: block.title, media: block.media, content: block.content });
    }
  }
});

after(() => {
  if (editor) editor.destroy();
});

const cs = (el) => dom.window.getComputedStyle(el);

test('panel mounts render in DOM order devices, product, basic actions, switcher', () => {
  const top = dom.window.document.querySelector('.panel__top');
  assert.deepEqual(
    [...top.children].map((c) => [...c.classList].find((cl) => cl.startsWith('panel__'))),
    ['panel__devices', 'panel__product', 'panel__basic-actions', 'panel__switcher'],
  );
  const titles = [...top.querySelectorAll('.gjs-pn-btn')].map((b) => b.getAttribute('title'));
  assert.deepEqual(titles.slice(0, 3), ['Desktop', 'Tablet', 'Mobile'], 'device group at the extreme left');
  assert.deepEqual(titles.slice(-4), ['Blocks panel', 'Layers', 'Style manager', 'Traits (element fields)'], 'switcher cluster at the right end');
});

test('panel mounts compute to position static inside a flex bar (the round 3 fix)', () => {
  const doc = dom.window.document;
  const top = doc.querySelector('.panel__top');
  // The GrapesJS theme rule .gjs-pn-panel sets position absolute on
  // every mount (measured pre-fix: all four computed to absolute).
  // The page global CSS must win and put them back into flow.
  assert.equal(cs(top).display, 'flex');
  assert.equal(cs(top).position, 'static', '.panel__top itself is a gjs-pn-panel and must not float');
  const expected = [
    ['.panel__devices', '1', false],
    ['.panel__product', '2', false],
    ['.panel__basic-actions', '3', false],
    ['.panel__switcher', '4', true],
  ];
  for (const [sel, order, autoLeft] of expected) {
    const el = doc.querySelector(sel);
    assert.equal(cs(el).position, 'static', sel + ' back in flow');
    assert.equal(cs(el).display, 'flex', sel + ' is a flex row');
    assert.equal(cs(el).order, order, sel + ' flex order');
    // jsdom serializes a zero margin as '0', a real browser as '0px'.
    if (autoLeft) assert.equal(cs(el).marginLeft, 'auto', sel + ' pushed right by margin-left auto');
    else assert.ok(['0', '0px'].includes(cs(el).marginLeft), sel + ' has no left margin, got ' + cs(el).marginLeft);
  }
});

test('first block category header (layout) is rendered visible and open', () => {
  const doc = dom.window.document;
  const cats = [...doc.querySelectorAll('#blocks .gjs-block-category')];
  assert.deepEqual(cats.map((c) => c.querySelector('.gjs-title').textContent.trim()), ['layout', 'content', 'section', 'navigation']);
  const first = cats[0];
  const title = first.querySelector('.gjs-title');
  assert.equal(cs(title).display, 'block', 'layout title not display:none');
  assert.equal(cs(title).visibility, 'visible', 'layout title visible');
  assert.ok(first.classList.contains('gjs-open'), 'layout category starts open');
  const blocksC = first.querySelector('.gjs-blocks-c');
  assert.notEqual(cs(blocksC).display, 'none', 'layout blocks container shown');
  assert.equal(blocksC.children.length, 2, 'layout category holds Container and Columns');
});
