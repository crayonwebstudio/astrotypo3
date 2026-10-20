// Regression test: GrapesJS editor startup with the TYPO3 API storage.
//
// Why this test exists: the live builder failed to start with
// "Storage.addType is not a function". The builder registered its custom
// storage with editor.Storage.addType(...), but in grapesjs 0.23.8 the
// StorageManager (node_modules/grapesjs/dist/index.d.ts, class
// StorageManager) registers custom storages with .add(type, storage) and
// has no addType method (addType exists on DomComponents, TraitManager,
// AssetManager and StyleManager instead). The pure-logic tests never init
// a real editor, so they could not catch an editor API mismatch. This
// test inits the real grapesjs package in jsdom, runs the exact same
// registerGrapesStorage() code path as src/pages/builder.astro, and
// exercises a full store() round trip against a mocked fetch.
//
// Harness limits: jsdom has no layout engine, so canvas rendering, drag
// and drop and visual behaviour are NOT covered here. What is covered is
// the part that broke: editor construction, module registration against
// the real 0.23.8 APIs, block registration, and the storage round trip.

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const registry = JSON.parse(readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'));
const home = JSON.parse(readFileSync(new URL('../src/data/sample-published.json', import.meta.url), 'utf8'));

let grapesjs;
let storageLib;
let registryLib;
let editor;
let fetchCalls;
let storageState;

function installDomGlobals() {
  const dom = new JSDOM('<!doctype html><html><body><div id="gjs"></div><div id="blocks"></div></body></html>', {
    url: 'http://localhost/builder',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try { globalThis.localStorage = dom.window.localStorage; } catch { /* jsdom getter quirks */ }
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  const ResizeObserverStub = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.ResizeObserver = ResizeObserverStub;
  dom.window.ResizeObserver = ResizeObserverStub;
  const matchMediaStub = (query) => ({
    matches: false, media: query,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  });
  globalThis.matchMedia = matchMediaStub;
  dom.window.matchMedia = matchMediaStub;
  return dom;
}

before(async () => {
  installDomGlobals();
  grapesjs = (await import('grapesjs')).default;
  storageLib = await import('../src/lib/typo3Storage.mjs');
  registryLib = await import('../src/lib/grapesRegistry.mjs');

  fetchCalls = [];
  const client = storageLib.createTypo3ApiClient({
    base: '',
    fetchFn: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ saved: true }) };
    },
  });

  storageState = {
    page: null,
    meta: { id: home.id, slug: home.slug, title: home.title, locale: home.locale || 'en', seo: home.seo || {} },
    registry,
    getComponents: () => {
      const list = [];
      if (editor) editor.getWrapper().components().forEach((c) => list.push(c));
      return list;
    },
  };

  // Same init shape as builder.astro initEditor(): same storageManager
  // config and the storage registration as a plugin, using the shared
  // registerGrapesStorage function the page itself calls.
  editor = grapesjs.init({
    container: '#gjs',
    fromElement: false,
    noticeOnUnload: false,
    storageManager: { type: storageLib.GRAPES_STORAGE_TYPE_ID, autosave: false, autoload: false, stepsBeforeSave: 1 },
    blockManager: { appendTo: '#blocks' },
    panels: { defaults: [] },
    plugins: [(ed) => { storageLib.registerGrapesStorage(ed, storageState, client); }],
  });

  // Same block registration path as builder.astro registerComponentType:
  // descriptors from buildGrapesBlocks, added one by one to BlockManager.
  for (const def of registry.components) {
    const block = registryLib.buildGrapesBlocks({ components: [def] })[0];
    if (!editor.BlockManager.get(block.id)) {
      editor.BlockManager.add(block.id, { label: block.label, category: block.category, title: block.title, content: block.content });
    }
  }
});

after(() => {
  if (editor) editor.destroy();
});

test('editor inits without throwing and the typo3-api storage type is registered', () => {
  assert.ok(editor, 'editor instance created');
  const storage = editor.StorageManager.get(storageLib.GRAPES_STORAGE_TYPE_ID);
  assert.ok(storage, 'custom storage registered with StorageManager.get()');
  assert.equal(typeof storage.load, 'function');
  assert.equal(typeof storage.store, 'function');
  assert.equal(editor.StorageManager.getCurrent(), storageLib.GRAPES_STORAGE_TYPE_ID);
  // The broken call from the incident must stay absent on this API surface.
  assert.equal(typeof editor.Storage.addType, 'undefined', 'grapesjs 0.23.8 StorageManager has no addType');
  assert.equal(typeof editor.Storage.add, 'function', 'grapesjs 0.23.8 StorageManager.add exists');
});

test('all 15 registry blocks are present in the BlockManager', () => {
  const blocks = editor.BlockManager.getAll();
  assert.equal(blocks.length, 15);
  for (const def of registry.components) {
    assert.ok(editor.BlockManager.get(def.id), 'block present: ' + def.id);
  }
});

test('editor.store() serializes to the page JSON shape and POSTs to the builder save path', async () => {
  editor.setComponents(storageLib.pageToGrapesComponents(home, registry));
  storageState.page = home;
  fetchCalls.length = 0;

  await editor.store();

  assert.equal(fetchCalls.length, 1, 'exactly one fetch for the store');
  const { url, options } = fetchCalls[0];
  assert.equal(url, '/api/builder/save', 'demo mode save endpoint path');
  assert.equal(options.method, 'POST');
  const payload = JSON.parse(options.body);
  assert.ok(payload.page, 'body carries a page object');
  assert.equal(payload.page.slug, home.slug);
  assert.equal(payload.page.title, home.title);
  assert.equal(payload.page.status, 'draft');
  assert.equal(payload.page.elements.length, home.elements.length, 'all page elements serialized');
  assert.deepEqual(
    payload.page.elements.map((el) => el.componentId),
    home.elements.map((el) => el.componentId),
    'component ids round trip in order',
  );
});

test('storage load() converts the held page into GrapesJS components', async () => {
  const storage = editor.StorageManager.get(storageLib.GRAPES_STORAGE_TYPE_ID);
  storageState.page = home;
  const data = await storage.load();
  assert.ok(Array.isArray(data.components));
  assert.equal(data.components.length, home.elements.length);
  assert.equal(data.components[0].type, home.elements[0].componentId);
});
