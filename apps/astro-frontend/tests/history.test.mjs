// Snapshot history tests (lib/history.mjs): push/undo/redo/truncate
// semantics, baseline and end no-ops, trait sessions, drag-add,
// move coalescing, style edits, keymap rerouting, and the project
// data round trip the snapshots rely on.
//
// Harness limits, stated plainly: jsdom has no layout engine and
// its timers freeze after GrapesJS init, so canvas geometry and the
// debounced editor 'update' event are NOT covered here. What is
// covered is the snapshot/restore level against a real editor
// instance: project data fidelity, entry accounting, and restore
// behaviour. The browser re-test covers the visual matrix (trait
// Undo/Redo cycles, drag-add Undo/Redo, Undo at baseline never
// blanking the canvas, Redo at end as a no-op).

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const registry = JSON.parse(readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'));

let grapesjs;
let registryLib;
let panelsLib;
let historyLib;
let history;
let editor;
let dom;
const panelHandlers = {};
const tick = () => new Promise((resolve) => queueMicrotask(resolve));

function installDomGlobals() {
  dom = new JSDOM(`<!doctype html><html><body>
    <div id="gjs"></div><div id="blocks"></div><div id="layers"></div>
    <div class="panel__top"><div class="panel__devices"></div><div class="panel__basic-actions"></div><div class="panel__switcher"></div></div>
    <div id="view-blocks"><div id="blocks2"></div></div>
    <div id="view-styles" hidden><div id="styles-box"></div></div>
    <div id="view-traits" hidden><div id="traits-box"></div></div>
  </body></html>`, { url: 'http://localhost/builder', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}

function registerComponentType(def) {
  const typeDesc = registryLib.buildGrapesTypes({ components: [def] })[0];
  editor.DomComponents.addType(def.id, {
    model: {
      defaults: { tagName: 'div', traits: typeDesc.traits, attributes: typeDesc.defaults.attributes },
      updated(property) {
        if (property !== 'attributes') return;
        if (this.view) { try { this.view.render(); } catch {} }
      },
    },
    view: {
      render() {
        this.renderAttributes();
        const attrs = this.model.get('attributes') || {};
        this.el.innerHTML = registryLib.renderElementHtml(def, registryLib.attributesToProps(def, attrs), '');
        return this;
      },
    },
  });
}

function findByElementId(elementId) {
  let found = null;
  const walk = (list) => {
    for (const comp of list) {
      const attrs = (comp.getAttributes && comp.getAttributes()) || {};
      if (attrs['data-astro-element-id'] === elementId) { found = comp; return true; }
      const kids = [];
      try { comp.components().forEach((k) => kids.push(k)); } catch {}
      if (kids.length && walk(kids)) return true;
    }
    return false;
  };
  const top = [];
  editor.getWrapper().components().forEach((c) => top.push(c));
  walk(top);
  return found;
}

function topComponents() {
  const list = [];
  editor.getWrapper().components().forEach((c) => list.push(c));
  return list;
}

function setCanvas(components) {
  editor.setComponents(components);
  history.reset();
}

before(async () => {
  installDomGlobals();
  grapesjs = (await import('grapesjs')).default;
  registryLib = await import('../src/lib/grapesRegistry.mjs');
  panelsLib = await import('../src/lib/builderPanels.mjs');
  historyLib = await import('../src/lib/history.mjs');

  editor = grapesjs.init({
    container: '#gjs',
    fromElement: false,
    noticeOnUnload: false,
    storageManager: false,
    blockManager: { appendTo: '#blocks' },
    layerManager: { appendTo: '#layers' },
    traitManager: { appendTo: '#traits-box' },
    panels: panelsLib.buildPanelsConfig(),
    plugins: [(ed) => { panelsLib.registerBuilderCommands(ed, panelHandlers); }],
  });
  history = historyLib.createHistory(editor, {
    onRestore: (elementId) => {
      if (!elementId) return;
      const found = findByElementId(elementId);
      if (found) { try { editor.select(found); } catch {} }
    },
  });
  history.attach();
  panelHandlers.onUndo = () => history.undo();
  panelHandlers.onRedo = () => history.redo();
  historyLib.installHistoryKeymaps(editor, history);
  for (const id of ['section.hero', 'content.heading', 'layout.container']) {
    registerComponentType(registry.components.find((c) => c.id === id));
  }
});

after(() => { if (editor) editor.destroy(); });

function heroAttrs(heading) {
  const def = registry.components.find((c) => c.id === 'section.hero');
  return registryLib.propsToAttributes(def, { heading });
}

test('project data round trip preserves contract attributes, children, styles, and temp element ids', () => {
  const headDef = registry.components.find((c) => c.id === 'content.heading');
  editor.setComponents([
    { type: 'section.hero', attributes: { ...heroAttrs('Hello'), 'data-astro-element-id': 'el-section-hero-1001' } },
    { type: 'layout.container', attributes: { 'data-astro-component-id': 'layout.container', 'data-astro-element-id': 'el-layout-container-1002' }, components: [
      { type: 'content.heading', attributes: { ...registryLib.propsToAttributes(headDef, { text: 'Inner' }), 'data-astro-element-id': 'el-content-heading-1003' } },
    ] },
  ]);
  const hero = topComponents()[0];
  hero.setStyle({ color: 'rgb(1, 2, 3)' });
  const snap = JSON.parse(JSON.stringify(editor.getProjectData()));
  // Mutate, then restore through the snapshot path itself.
  hero.addAttributes({ 'data-prop-heading': 'MUTATED' });
  editor.getWrapper().append({ type: 'content.heading', attributes: { ...registryLib.propsToAttributes(headDef, { text: 'Extra' }), 'data-astro-element-id': 'el-temp-9999' } });
  assert.equal(topComponents().length, 3);
  editor.loadProjectData(JSON.parse(JSON.stringify(snap)));
  assert.equal(topComponents().length, 2, 'restore removes the temp block');
  const restored = findByElementId('el-section-hero-1001');
  assert.ok(restored, 'temp element id survives the round trip');
  const attrs = restored.getAttributes();
  assert.equal(attrs['data-prop-heading'], 'Hello', 'prop attribute survives');
  assert.equal(attrs['data-astro-component-id'], 'section.hero', 'component id survives');
  assert.equal(restored.getStyle().color, 'rgb(1, 2, 3)', 'style survives (re-keyed to the new component id)');
  const child = findByElementId('el-content-heading-1003');
  assert.ok(child, 'nested child survives with its element id');
  assert.equal(child.get('type'), 'content.heading', 'child type survives');
  assert.equal(child.getAttributes()['data-prop-text'], 'Inner', 'child prop survives');
});

test('push/undo/redo/truncate semantics', () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  assert.equal(history.length, 1);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  const hero = () => findByElementId('el-test-stable-1');
  hero().addAttributes({ 'data-prop-heading': 'Edited' });
  assert.equal(history.pushCurrent(), true, 'changed state pushes');
  assert.equal(history.length, 2);
  assert.equal(history.undo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Original', 'undo reverts');
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), true);
  assert.equal(history.redo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Edited', 'redo restores');
  assert.equal(history.undo(), true);
  hero().addAttributes({ 'data-prop-heading': 'Second' });
  assert.equal(history.pushCurrent(), true, 'new edit after undo pushes');
  assert.equal(history.length, 2, 'redo tail truncated by the new edit');
  assert.equal(history.canRedo(), false, 'no redo after truncation');
  assert.equal(history.undo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Original');
});

test('Undo at baseline is a no-op and never blanks the page', () => {
  setCanvas([
    { type: 'section.hero', attributes: { ...heroAttrs('Kept'), 'data-astro-element-id': 'el-test-stable-1' } },
    { type: 'content.heading', attributes: { ...registryLib.propsToAttributes(registry.components.find((c) => c.id === 'content.heading'), { text: 'Also kept' }), 'data-astro-element-id': 'el-test-stable-2' } },
  ]);
  assert.equal(topComponents().length, 2);
  assert.equal(history.undo(), false, 'undo at baseline returns false');
  assert.equal(history.undo(), false, 'repeated undo at baseline still false');
  assert.equal(topComponents().length, 2, 'canvas never blanked by baseline undo');
  assert.ok(findByElementId('el-test-stable-1'), 'first component survives');
  assert.ok(findByElementId('el-test-stable-2'), 'second component survives');
});

test('Redo at the end is a no-op', () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const hero = () => findByElementId('el-test-stable-1');
  hero().addAttributes({ 'data-prop-heading': 'Edited' });
  history.pushCurrent();
  assert.equal(history.redo(), false, 'redo at the end returns false');
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Edited', 'redo at end changes nothing');
  assert.equal(history.undo(), true);
  assert.equal(history.redo(), true);
  assert.equal(history.redo(), false, 'redo at the new end still false');
});

test('trait session hooks give exactly one entry per session', () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const hero = () => findByElementId('el-test-stable-1');
  const before = history.length;
  history.beginTraitSession();
  hero().addAttributes({ 'data-prop-heading': 'Typed 1' });
  hero().addAttributes({ 'data-prop-heading': 'Typed 2' });
  hero().addAttributes({ 'data-prop-heading': 'Typed 3' });
  history.commitTraitSession();
  assert.equal(history.length, before + 1, 'one entry for the whole session');
  assert.equal(history.undo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Original', 'undo reverts the whole session');
  assert.equal(history.redo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Typed 3', 'redo restores the whole session');
  // No-change session: begin and commit with nothing changed.
  history.beginTraitSession();
  history.commitTraitSession();
  assert.equal(history.length, before + 1, 'no-change session pushes nothing');
});

test('drag-add undoes and redoes in one click each', async () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Kept'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const countHeroes = () => topComponents().filter((c) => c.get('type') === 'section.hero').length;
  const click = (title) => {
    const btn = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')]
      .find((b) => b.getAttribute('title') === title);
    btn.focus();
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  assert.equal(countHeroes(), 1);
  editor.getWrapper().append({ type: 'section.hero', attributes: { ...heroAttrs('Dragged'), 'data-astro-element-id': 'el-drag-test-1' } });
  await tick();
  assert.equal(countHeroes(), 2, 'drag-add appends a second hero');
  assert.equal(history.length, 2, 'drag-add is one entry');
  click('Undo');
  assert.equal(countHeroes(), 1, 'one Undo click removes the dragged component');
  assert.ok(findByElementId('el-test-stable-1'), 'the original hero remains');
  click('Redo');
  assert.equal(countHeroes(), 2, 'one Redo click restores the dragged component');
  assert.ok(findByElementId('el-drag-test-1'), 'the dragged component keeps its temp element id on redo');
});

test('a move (remove plus insert) costs exactly one entry', async () => {
  const headDef = registry.components.find((c) => c.id === 'content.heading');
  setCanvas([
    { type: 'section.hero', attributes: { ...heroAttrs('First'), 'data-astro-element-id': 'el-test-stable-1' } },
    { type: 'content.heading', attributes: { ...registryLib.propsToAttributes(headDef, { text: 'Second' }), 'data-astro-element-id': 'el-test-stable-2' } },
  ]);
  const order = () => topComponents().map((c) => (c.getAttributes() || {})['data-astro-element-id']);
  assert.deepEqual(order(), ['el-test-stable-1', 'el-test-stable-2']);
  // Sorter move: remove plus insert in the same tick.
  const second = findByElementId('el-test-stable-2');
  topComponents(); // settle
  editor.getWrapper().components().remove(second);
  editor.getWrapper().components().add(second, { at: 0 });
  await tick();
  assert.deepEqual(order(), ['el-test-stable-2', 'el-test-stable-1'], 'move reordered');
  assert.equal(history.length, 2, 'the move is one entry, not a remove entry plus an add entry');
  assert.equal(history.undo(), true);
  assert.deepEqual(order(), ['el-test-stable-1', 'el-test-stable-2'], 'one Undo reverts the whole move');
  assert.equal(history.redo(), true);
  assert.deepEqual(order(), ['el-test-stable-2', 'el-test-stable-1'], 'one Redo restores the move');
});

test('style edit undoes and redoes', () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const hero = () => findByElementId('el-test-stable-1');
  hero().setStyle({ color: 'rgb(9, 9, 9)' });
  history.pushCurrent();
  assert.equal(history.undo(), true);
  assert.ok(!hero().getStyle().color, 'undo removes the style edit');
  assert.equal(history.redo(), true);
  assert.equal(hero().getStyle().color, 'rgb(9, 9, 9)', 'redo restores the style edit');
});

test('repeated Undo/Redo cycles are stable', () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const hero = () => findByElementId('el-test-stable-1');
  hero().addAttributes({ 'data-prop-heading': 'Edited' });
  history.pushCurrent();
  for (let i = 0; i < 5; i++) {
    assert.equal(history.undo(), true, 'cycle ' + i + ' undo');
    assert.equal(hero().getAttributes()['data-prop-heading'], 'Original', 'cycle ' + i + ' reverted');
    assert.equal(history.redo(), true, 'cycle ' + i + ' redo');
    assert.equal(hero().getAttributes()['data-prop-heading'], 'Edited', 'cycle ' + i + ' restored');
  }
  assert.equal(history.length, 2, 'cycles do not grow the history');
});

test('restore re-selects by element id, and undoing an add leaves no stale selection', async () => {
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const hero = () => findByElementId('el-test-stable-1');
  editor.select(hero());
  hero().addAttributes({ 'data-prop-heading': 'Edited' });
  history.pushCurrent();
  assert.equal(history.undo(), true);
  const selected = editor.getSelected();
  assert.ok(selected, 'something is selected after restore');
  assert.equal((selected.getAttributes() || {})['data-astro-element-id'], 'el-test-stable-1', 'restore re-selected the edited component');
  // Undoing an add: the selected added component is genuinely gone.
  editor.getWrapper().append({ type: 'section.hero', attributes: { ...heroAttrs('Added'), 'data-astro-element-id': 'el-added-1' } });
  const added = findByElementId('el-added-1');
  editor.select(added);
  await tick();
  assert.equal(history.undo(), true);
  assert.equal(findByElementId('el-added-1'), null, 'the added component is gone after undo');
});

test('history caps at maxEntries, dropping the oldest', () => {
  const small = historyLib.createHistory(editor, { maxEntries: 3 });
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('v0'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  // setCanvas resets the shared history; reset the capped one too.
  small.reset();
  const hero = () => findByElementId('el-test-stable-1');
  for (const v of ['v1', 'v2', 'v3', 'v4']) {
    hero().addAttributes({ 'data-prop-heading': v });
    small.pushCurrent();
  }
  assert.equal(small.length, 3, 'capped at 3 entries');
  assert.equal(small.undo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'v3');
  assert.equal(small.undo(), true);
  assert.equal(hero().getAttributes()['data-prop-heading'], 'v2');
  assert.equal(small.canUndo(), false, 'oldest states dropped, undo stops at the cap floor');
});

test('keymaps rerouted: stock undo/redo keymaps gone, builder keymaps invoke history, no Ctrl+Y invented', () => {
  const all = editor.Keymaps.getAll();
  assert.equal(all['core:undo'], undefined, 'stock undo keymap removed');
  assert.equal(all['core:redo'], undefined, 'stock redo keymap removed');
  const undoKey = editor.Keymaps.get('builder-undo-key');
  const redoKey = editor.Keymaps.get('builder-redo-key');
  assert.ok(undoKey, 'builder undo keymap present');
  assert.ok(redoKey, 'builder redo keymap present');
  assert.equal(undoKey.keys, '⌘+z, ctrl+z', 'undo keeps the stock keys');
  assert.equal(redoKey.keys, '⌘+shift+z, ctrl+shift+z', 'redo keeps the stock keys');
  assert.ok(!Object.values(all).some((k) => (k.keys || '').includes('ctrl+y')), 'no Ctrl+Y binding exists');
  setCanvas([{ type: 'section.hero', attributes: { ...heroAttrs('Original'), 'data-astro-element-id': 'el-test-stable-1' } }]);
  const hero = () => findByElementId('el-test-stable-1');
  hero().addAttributes({ 'data-prop-heading': 'Edited' });
  history.pushCurrent();
  assert.equal(typeof undoKey.handler, 'function', 'undo keymap handler is callable');
  undoKey.handler();
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Original', 'undo keymap handler reverts through history');
  assert.equal(typeof redoKey.handler, 'function', 'redo keymap handler is callable');
  redoKey.handler();
  assert.equal(hero().getAttributes()['data-prop-heading'], 'Edited', 'redo keymap handler restores through history');
});
