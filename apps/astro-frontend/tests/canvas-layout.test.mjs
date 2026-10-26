// Regression tests: canvas surround, canvas centering mechanism, and
// Layers auto-expand, against the REAL GrapesJS 0.23.8 CSS.
//
// Why these tests exist: the demo-layout rebuild (single top bar,
// Layers left, Blocks right) was structurally correct, but the live
// page still diverged from the official free core demo
// (grapesjs.com/demo.html) in three browser-observed ways:
//   1. Dark surround: the canvas area showed dark grey editor chrome
//      around the white page instead of the demo's light grey.
//   2. Page not centred: the white page sat against the left panel
//      with a dark gutter only on its right.
//   3. Layers collapsed: the tree showed only "Body - 8" until a
//      component was selected.
//
// Root causes, measured in jsdom with the real CSS (see the probe
// notes in the page's global style block):
//   1. Inside #gjs, the editor div carries the dark theme colour and
//      the canvas element on top of it carries
//      .gjs-cv-canvas-bg { background-color: rgba(0,0,0,.15) }, so
//      the translucent layer over the dark editor reads as dark grey
//      and the light grey on #gjs itself never shows.
//   2. The canvas element sizes itself from theme variables meant for
//      the DEFAULT layout, where the left panel lives inside the
//      editor: .gjs-cv-canvas { width: calc(100% - var(--gjs-left-width)) }
//      with --gjs-left-width: 15% from :root. Our panels are mounted
//      outside the editor (appendTo), so the canvas area was only 85%
//      of the #gjs column and the remaining 15% on the right showed
//      the dark editor colour. Zeroing both variables makes the canvas
//      area the full column; centering then follows from the theme
//      itself (.gjs-frame-wrapper is absolute with left 0, right 0 and
//      margin auto), so Desktop fills the area and Tablet/Mobile
//      frames centre themselves.
//   3. Every component's layer 'open' attribute is unset by default.
//      The fix (lib/layerExpand.mjs) walks the tree with the
//      documented LayerManager API (setOpen / getComponents) and opens
//      every layer that has children.
//
// jsdom has no layout engine, so pixel geometry (centring in px)
// cannot be asserted here; what is asserted is the cascade and model
// state that determines the geometry in a real browser, exactly like
// tests/panel-layout.test.mjs. One jsdom quirk to know: after
// grapesjs.init, Node timers stop firing until editor.destroy()
// (the live editor loop starves them in jsdom only, not in a real
// browser), so every test below is synchronous and the editor is
// destroyed in after(). The layer root is set by LayerManager on the
// editor 'load' event, which never fires synchronously in jsdom, so
// the test triggers 'load' itself, which is the exact call
// LayerManager makes on load (setRoot + append the view).

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const pageSource = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
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
let layerExpand;
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
  for (const k of ['HTMLElement', 'Element', 'Node', 'CustomEvent', 'Event', 'DOMParser', 'XMLSerializer', 'MutationObserver', 'HTMLIFrameElement']) globalThis[k] = dom.window[k];
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
  layerExpand = await import('../src/lib/layerExpand.mjs');

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
  });
  // Replicate the editor 'load' event, which LayerManager uses to set
  // its root and append its view; it never fires synchronously here.
  editor.trigger('load');
  editor.setComponents(`<header><h1>Site</h1></header><section><h2>Hero</h2><div><p>Nested</p></div></section><footer>Foot</footer>`);
});

after(() => {
  if (editor) editor.destroy();
});

const cs = (el) => dom.window.getComputedStyle(el);

test('canvas surround is the demo light grey, not the dark theme colour', () => {
  const doc = dom.window.document;
  const canvas = doc.querySelector('#gjs .gjs-cv-canvas');
  assert.ok(canvas, 'canvas element rendered');
  // Theme rule .gjs-cv-canvas-bg paints rgba(0,0,0,.15) over the dark
  // #444 editor; the page global override must win with #e6e6e6.
  assert.equal(cs(canvas).backgroundColor, 'rgb(230, 230, 230)', 'canvas background is #e6e6e6');
  const editorEl = doc.querySelector('#gjs .gjs-editor');
  assert.equal(cs(editorEl).backgroundColor, 'rgb(230, 230, 230)', 'editor behind the canvas is #e6e6e6 too, so no dark shows through');
});

test('canvas sizing variables are zeroed so the canvas area is the full column', () => {
  const gjs = dom.window.document.querySelector('#gjs');
  // Theme default --gjs-left-width is 15% (default-layout left panel
  // inside the editor); our panels live outside, so it must be 0.
  assert.equal(cs(gjs).getPropertyValue('--gjs-left-width').trim(), '0', 'left width variable zeroed');
  assert.equal(cs(gjs).getPropertyValue('--gjs-canvas-top').trim(), '0', 'canvas top variable zeroed');
});

test('frame centering mechanism: theme wrapper is margin auto, device widths are explicit except Desktop', () => {
  // Theme rule, not ours: the frame wrapper centres itself when it is
  // narrower than the frames area (Tablet/Mobile); Desktop (width '')
  // fills the area instead.
  assert.match(grapesCss, /\.gjs-frame-wrapper\{[^}]*left:0;right:0;margin:auto/, 'theme frame wrapper is left 0, right 0, margin auto');
  editor.Devices.select('Tablet');
  assert.equal(editor.Devices.getSelected().get('width'), '768px', 'Tablet frame width');
  editor.Devices.select('Mobile');
  assert.equal(editor.Devices.getSelected().get('width'), '390px', 'Mobile frame width');
  editor.Devices.select('Desktop');
  assert.equal(editor.Devices.getSelected().get('width'), '', 'Desktop frame fills the canvas area');
});

test('layers tree loads collapsed by default (the reported bug)', () => {
  const layers = editor.Layers;
  const root = layers.getRoot();
  assert.ok(root, 'layer root set after load');
  const parents = [];
  const walk = (cmp) => {
    const kids = layers.getComponents(cmp);
    if (kids.length) { parents.push(cmp); kids.forEach(walk); }
  };
  walk(root);
  assert.ok(parents.length >= 3, 'tree has parents to expand, got ' + parents.length);
  for (const p of parents) assert.equal(p.get('open'), undefined, 'parent starts collapsed: ' + (p.get('name') || p.get('type')));
});

test('expandLayers opens every parent layer, leaves stay untouched', () => {
  const layers = editor.Layers;
  assert.equal(layerExpand.expandLayers(editor), true, 'expand succeeds once the root is set');
  const check = (cmp) => {
    const kids = layers.getComponents(cmp);
    if (kids.length) {
      assert.equal(layers.isOpen(cmp), true, 'parent open: ' + (cmp.get('name') || cmp.get('type')));
      kids.forEach(check);
    } else {
      assert.equal(cmp.get('open'), undefined, 'leaf not forced open: ' + (cmp.get('name') || cmp.get('type')));
    }
  };
  check(layers.getRoot());
  // DOM: the open parents carry the 'open' class and their children
  // containers show (theme: .gjs-layer.open>.gjs-layer-children
  // displays block, collapsed parents hide theirs).
  const doc = dom.window.document;
  const openItems = [...doc.querySelectorAll('#layers .gjs-layer.open')];
  assert.ok(openItems.length >= 3, 'open layer items in DOM, got ' + openItems.length);
  const body = doc.querySelector('#layers .gjs-layer');
  assert.ok(body.classList.contains('open'), 'Body item is open');
  const bodyChildren = body.querySelector(':scope > .gjs-layer-children');
  assert.ok(bodyChildren, 'Body has a children container');
  assert.equal(cs(bodyChildren).display, 'block', 'Body children shown');
});

test('expandLayers is a safe no-op before the layer root is set', () => {
  assert.equal(layerExpand.expandLayers(null), false, 'null editor');
  assert.equal(layerExpand.expandLayers({ Layers: { getRoot: () => undefined } }), false, 'root not set yet');
});
