// Live trait editing tests: trait input applies while typing, the
// toolbar Undo button reverts, textarea traits are real textareas,
// JSON validation surfaces, and the saved-snapshot dirty rule.
//
// Background: GrapesJS 0.23.8 TraitView only commits on the DOM
// 'change' event (eventCapture = ['change']), so typing in a trait
// field changed nothing on the canvas until blur/Enter. lib/liveTraits
// applies on 'input' through the trait model path, and the later
// blur/change commit of the same value is a Backbone no-op.
// Harness limits: jsdom has no layout engine, so canvas geometry and
// real double-click selection are NOT covered here; what is covered
// is the trait model path, the DOM wiring, and the undo round trip
// against a real editor instance.

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const registry = JSON.parse(readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'));
const home = JSON.parse(readFileSync(new URL('../src/data/sample-published.json', import.meta.url), 'utf8'));

let grapesjs;
let registryLib;
let panelsLib;
let liveTraits;
let typo3Storage;
let historyLib;
let history;
let editor;
let dom;
// Shared command handlers, exactly as the builder page wires them:
// the commands are registered by a plugin during grapesjs.init, so
// the handlers object is mutated after init (closures read it at
// click time) to attach the history instance once it exists.
const panelHandlers = {};
const jsonErrors = [];
const jsonClears = [];
const inputRefreshes = [];

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

before(async () => {
  installDomGlobals();
  grapesjs = (await import('grapesjs')).default;
  registryLib = await import('../src/lib/grapesRegistry.mjs');
  panelsLib = await import('../src/lib/builderPanels.mjs');
  liveTraits = await import('../src/lib/liveTraits.mjs');
  typo3Storage = await import('../src/lib/typo3Storage.mjs');
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
  // Snapshot history, wired exactly as the builder page wires it:
  // restore re-selects by element id (loadProjectData rebuilds the
  // component instances, so the old selection object is gone and
  // the trait panel must re-render for the restored component),
  // buttons and keymaps route here, never to core:undo/core:redo.
  history = historyLib.createHistory(editor, {
    onRestore: (elementId) => {
      if (!elementId) return;
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
      if (walk(top)) { try { editor.select(found); } catch {} }
    },
  });
  history.attach();
  panelHandlers.onUndo = () => history.undo();
  panelHandlers.onRedo = () => history.redo();
  historyLib.installHistoryKeymaps(editor, history);
  liveTraits.registerTextareaTraitType(editor);
  for (const id of ['section.hero', 'content.heading', 'section.feature-grid']) {
    registerComponentType(registry.components.find((c) => c.id === id));
  }
  liveTraits.wireLiveTraits(editor, document.getElementById('traits-box'), {
    getDef: (cid) => registry.components.find((c) => c.id === cid),
    onJsonError: (prop, message) => { jsonErrors.push({ prop, message }); },
    onJsonClear: (prop) => { jsonClears.push(prop); },
    onSessionStart: () => history.beginTraitSession(),
    onSessionCommit: () => history.commitTraitSession(),
    // Exactly as the builder page wires it: live input refreshes the
    // dirty compare, and trait-field shortcuts route to history
    // (GrapesJS keymaps never fire from inside a text input).
    onLiveInput: () => { inputRefreshes.push(1); },
    onUndoKey: () => history.undo(),
    onRedoKey: () => history.redo(),
  });
});

after(() => { if (editor) editor.destroy(); });

function selectFirstOfType(type, attributes) {
  // Give the component a stable element id, exactly as the builder
  // page's component:add handler does for dropped blocks; without
  // one, serialization invents a random id per call and no
  // snapshot comparison could ever match.
  const withId = { ...attributes, 'data-astro-element-id': 'el-test-stable-1' };
  editor.setComponents([{ type, attributes: withId }]);
  const comp = editor.getWrapper().components().at(0);
  editor.select(comp);
  // Fresh history baseline for the test, exactly as the builder
  // page's applyPage does on every page load: the loaded canvas is
  // entry 0, so Undo at baseline can never wipe the page.
  history.reset();
  return comp;
}

// After a history restore, loadProjectData rebuilds the component
// instances, so a component object captured before the restore is
// stale: its attributes still show the pre-restore values. Tests
// must re-query by element id after any Undo/Redo.
function componentByElementId(elementId) {
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

function traitInputFor(propAttr) {
  const traits = document.getElementById('traits-box').querySelectorAll('input, textarea, select');
  for (const el of traits) {
    const trait = liveTraits.findTraitForInput(editor, el);
    if (trait && trait.getName() === propAttr) return el;
  }
  return null;
}

test('typing in a trait field applies live: attribute and canvas update on input', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Before' }));
  const input = traitInputFor('data-prop-heading');
  assert.ok(input, 'heading trait input exists in the traits panel');
  input.value = 'Typed live';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Typed live');
  // jsdom never renders component views (frame rendering needs the
  // timers that freeze after init), so the canvas half is asserted
  // the honest way here: the editor serialization carries the new
  // value, and the leaf render function turns the new attributes
  // into the new heading. The view re-render on attribute change is
  // the pre-existing GrapesJS path (ComponentView change ->
  // model.updated -> view.render in the page's type registration)
  // and stays a browser re-test item.
  assert.match(editor.getHtml(), /data-prop-heading="Typed live"/);
  assert.match(
    registryLib.renderElementHtml(heroDef, registryLib.attributesToProps(heroDef, comp.getAttributes()), ''),
    /Typed live/,
  );
});

test('blur/change commit after a live apply is idempotent (no double apply)', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Start' }));
  const input = traitInputFor('data-prop-heading');
  input.value = 'Live then blur';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Live then blur');
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Live then blur');
  assert.match(editor.getHtml(), /data-prop-heading="Live then blur"/);
});

test('toolbar Undo button reverts a trait change, Redo restores it', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  input.value = 'Edited';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Edited');
  // Commit before Undo: in a browser the Undo button's mousedown
  // blurs the input and the blur fires change, which commits the
  // session; jsdom fires no change on blur, so it is dispatched
  // explicitly, exactly as the browser would fire it. Without the
  // commit there is no session entry to undo (live applies are
  // partial and record nothing).
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const basicActions = document.querySelector('.panel__basic-actions');
  const buttons = [...basicActions.querySelectorAll('.gjs-pn-btn')];
  const undoEl = buttons.find((b) => b.getAttribute('title') === 'Undo');
  const redoEl = buttons.find((b) => b.getAttribute('title') === 'Redo');
  assert.ok(undoEl && redoEl, 'undo and redo buttons rendered');
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  // Re-query: the restore rebuilds the component instances, so the
  // pre-restore `comp` object still shows the old values.
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Original');
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Edited');
});

test('trait edit session records exactly one history entry: one Undo click reverts the whole typed edit', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  const beforeLength = history.length;
  let cur = input.value;
  for (const ch of ' TEST') {
    cur += ch;
    input.value = cur;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST');
  // Live applies are partial and record nothing: typing alone must
  // not grow the history (the session is open, so generic pushes
  // are suppressed and only the commit pushes).
  assert.equal(history.length, beforeLength, 'partial live applies record no history entries');
  assert.equal(history.canRedo(), false, 'no redo tail while typing');
  // Commit (blur/Enter in a real browser): exactly one entry for
  // the whole session, pushed by the session commit hook.
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(history.length, beforeLength + 1, 'session commits to exactly one history entry');
  const basicActions = document.querySelector('.panel__basic-actions');
  const buttons = [...basicActions.querySelectorAll('.gjs-pn-btn')];
  const undoEl = buttons.find((b) => b.getAttribute('title') === 'Undo');
  const redoEl = buttons.find((b) => b.getAttribute('title') === 'Redo');
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  // Re-query: the restore rebuilds the component instances, so the
  // pre-restore `comp` object still shows the old values.
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Original', 'one Undo click reverts the whole session');
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Original TEST', 'one Redo click restores the whole session');
});

test('redo survives repeated use: snapshot history, undo never removes the component', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  // Show the Traits view first, exactly as the page does before
  // focusing: a hidden input cannot take focus, in jsdom or in a
  // browser, so focus/blur sequencing below would be fiction without
  // this step (the earlier tests never focused the input at all).
  editor.Panels.getButton('panel-switcher', 'show-traits').set('active', true);
  const input = traitInputFor('data-prop-heading');
  assert.ok(input, 'heading trait input exists');
  const beforeLength = history.length;
  input.focus();
  assert.equal(document.activeElement, input, 'trait input takes focus once its view is shown');
  let cur = input.value;
  for (const ch of ' TEST') {
    cur += ch;
    input.value = cur;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST');
  // Browser mousedown on the Undo button: the focused input blurs
  // (a real browser fires change on blur after a value change; jsdom
  // does not, so the change is dispatched explicitly, as the browser
  // would fire it), committing the session, then the button takes
  // focus and the click runs.
  input.blur();
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(history.length, beforeLength + 1, 'session commits to one history entry');
  const basicActions = document.querySelector('.panel__basic-actions');
  const buttons = [...basicActions.querySelectorAll('.gjs-pn-btn')];
  const undoEl = buttons.find((b) => b.getAttribute('title') === 'Undo');
  const redoEl = buttons.find((b) => b.getAttribute('title') === 'Redo');
  assert.ok(undoEl && redoEl, 'undo and redo buttons found by title, not by position');
  const wrapperContainsId = () => {
    let found = false;
    editor.getWrapper().components().forEach((c) => {
      if ((c.getAttributes() || {})['data-astro-element-id'] === 'el-test-stable-1') found = true;
    });
    return found;
  };
  // First Undo: whole session reverts, the component stays in the
  // canvas (the stock stack's shared group index previously let a
  // magic Undo drag in the older component-add entry, removing the
  // component and moving the pointer to -1; snapshots have no
  // groups, so that failure mode cannot occur), and redo stays
  // available.
  undoEl.focus();
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(wrapperContainsId(), true, 'undo leaves the component in the canvas');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'one Undo click reverts the whole session');
  assert.ok(history.canRedo(), 'redo available after undo');
  // First Redo: whole session restores. The restore rebuilds the
  // component instances, so the trait input is re-queried: the old
  // input element belongs to the discarded instance.
  redoEl.focus();
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(wrapperContainsId(), 'redo restores the component');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original TEST', 'trait input resyncs on redo');
  assert.equal(history.canUndo(), true, 'undo available again after redo');
  // Second cycle: the redo tail survives repeated use.
  undoEl.focus();
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(wrapperContainsId(), 'second undo still leaves the component in the canvas');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'second Undo reverts again');
  redoEl.focus();
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(wrapperContainsId(), 'second redo still restores the component');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original TEST', 'second Redo restores again');
});

test('mid-stack session commits to exactly one entry and truncates the redo tail', () => {
  // The old tail-slice collapse broke here: a session starting
  // while the pointer sat mid-stack (after an Undo) left its first
  // keystroke entry below the collapsed entry, because
  // Backbone.Undo pops the redo tail when that keystroke lands.
  // With snapshots there is no tail to slice: a mid-stack session
  // must produce exactly one entry, truncating the redo tail, and
  // one Undo must revert it fully.
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  const baseLength = history.length;
  const click = (title) => {
    const btn = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')]
      .find((b) => b.getAttribute('title') === title);
    btn.focus();
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const typeAndCommit = (text) => {
    const field = traitInputFor('data-prop-heading');
    field.focus();
    let cur = field.value;
    for (const ch of text) {
      cur += ch;
      field.value = cur;
      field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    field.blur();
    field.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };
  typeAndCommit(' ONE');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original ONE');
  assert.equal(history.length, baseLength + 1, 'session 1 commits to one entry');
  click('Undo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'undo reverts session 1');
  assert.equal(history.canRedo(), true, 'redo available mid-stack after undo');
  typeAndCommit(' TWO');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original TWO');
  assert.equal(history.length, baseLength + 1, 'mid-stack session commits to one entry, redo tail truncated');
  assert.equal(history.canRedo(), false, 'no redo tail after the new session');
  click('Undo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'one Undo click reverts the mid-stack session fully');
});

test('full Undo/Redo cycle then a second edit session undoes in one click (Test B analogue)', () => {
  // Browser matrix, second half: after edit, Undo, Redo, Undo, a
  // second typed edit could not be undone at all. Under snapshots
  // each session is one entry by construction, so the second
  // session must undo in exactly one click, with no leftover
  // entries from either session in the history.
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const baseLength = history.length;
  const click = (title) => {
    const btn = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')]
      .find((b) => b.getAttribute('title') === title);
    btn.focus();
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const typeAndCommit = (text) => {
    const field = traitInputFor('data-prop-heading');
    field.focus();
    let cur = field.value;
    for (const ch of text) {
      cur += ch;
      field.value = cur;
      field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    field.blur();
    field.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };
  typeAndCommit(' TEST');
  assert.equal(history.length, baseLength + 1, 'session 1 is one entry');
  click('Undo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'undo reverts session 1');
  click('Redo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original TEST', 'redo restores session 1');
  click('Undo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'post-redo Undo reverts in exactly one click, no phantom entry');
  typeAndCommit(' TEST2');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original TEST2');
  assert.equal(history.length, baseLength + 1, 'session 2 replaces session 1, no leftover entries');
  click('Undo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original', 'second session undoes in one click');
  click('Redo');
  assert.equal(traitInputFor('data-prop-heading').value, 'Original TEST2', 'redo restores the second session');
});

test('drag-add undoes and redoes in one click each with snapshot history', async () => {
  // Previously this pinned the stock stack's single-entry path
  // (undo(false)/redo(false)) because jsdom timers freeze and
  // Backbone.Undo's deferred magic-index reset never runs there.
  // Snapshots have no magic grouping at all: the append schedules
  // one coalesced microtask push (see lib/history.mjs), so one Undo
  // click removes the dragged block and one Redo click restores it,
  // in jsdom exactly as in a browser. The tick await lets the
  // coalesced push land before asserting on the history length.
  const tick = () => new Promise((resolve) => queueMicrotask(resolve));
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Kept' }));
  const countHeroes = () => {
    let n = 0;
    editor.getWrapper().components().forEach((c) => { if (c.get('type') === 'section.hero') n += 1; });
    return n;
  };
  const click = (title) => {
    const btn = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')]
      .find((b) => b.getAttribute('title') === title);
    btn.focus();
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  assert.equal(countHeroes(), 1);
  assert.equal(history.length, 1, 'baseline is the only entry before the drag-add');
  editor.getWrapper().append({ type: 'section.hero', attributes: { ...registryLib.propsToAttributes(heroDef, { heading: 'Dragged' }), 'data-astro-element-id': 'el-drag-test-1' } });
  assert.equal(countHeroes(), 2, 'drag-add appends a second hero');
  await tick();
  assert.equal(history.length, 2, 'drag-add pushes exactly one entry');
  click('Undo');
  assert.equal(countHeroes(), 1, 'one Undo click removes the dragged component');
  assert.equal(history.canUndo(), false, 'Undo at baseline after removing the drag-add');
  click('Redo');
  assert.equal(countHeroes(), 2, 'one Redo click restores the dragged component');
});

test('Enter in a single-line trait input blurs it; Enter in a textarea does not', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  editor.Panels.getButton('panel-switcher', 'show-traits').set('active', true);
  const beforeLength = history.length;
  input.focus();
  assert.equal(document.activeElement, input, 'input focused before Enter');
  let cur = input.value;
  for (const ch of ' ENTER') {
    cur += ch;
    input.value = cur;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original ENTER');
  assert.equal(history.length, beforeLength, 'typing alone records nothing');
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.notEqual(document.activeElement, input, 'Enter blurs a single-line input');
  // jsdom fires no change on blur, so the browser's blur-change is
  // dispatched explicitly; it must commit the session to one entry.
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(history.length, beforeLength + 1, 'Enter-committed session is one entry');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original ENTER');

  const gridDef = registry.components.find((c) => c.id === 'section.feature-grid');
  selectFirstOfType('section.feature-grid', registryLib.propsToAttributes(gridDef, { heading: 'Grid', items: [] }));
  const textarea = traitInputFor('data-prop-items');
  assert.ok(textarea && textarea.tagName === 'TEXTAREA', 'items trait is a textarea');
  textarea.focus();
  assert.equal(document.activeElement, textarea, 'textarea focused before Enter');
  textarea.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(document.activeElement, textarea, 'Enter never blurs a textarea');
});

test('invalid JSON typed live never applies: items stay, error reported, valid JSON applies and clears', () => {
  const gridDef = registry.components.find((c) => c.id === 'section.feature-grid');
  const twoItems = [{ title: 'One', text: 'First' }, { title: 'Two', text: 'Second' }];
  const comp = selectFirstOfType('section.feature-grid', registryLib.propsToAttributes(gridDef, { heading: 'Grid', items: twoItems }));
  const input = traitInputFor('data-prop-items');
  assert.ok(input, 'items trait input exists');
  assert.equal(input.tagName, 'TEXTAREA');
  jsonErrors.length = 0;
  jsonClears.length = 0;
  const validTwo = JSON.stringify(twoItems);
  input.value = validTwo;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-items'], validTwo);
  assert.equal(registryLib.attributesToProps(gridDef, comp.getAttributes()).items.length, 2);
  // Append an invalid fragment, as the browser report did: the
  // attribute must keep the last valid JSON and the cards must stay.
  input.value = validTwo + ' NOTJSON{';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-items'], validTwo, 'invalid JSON never touches the attribute');
  assert.equal(registryLib.attributesToProps(gridDef, comp.getAttributes()).items.length, 2, 'rendered items unchanged');
  assert.match(
    registryLib.renderElementHtml(gridDef, registryLib.attributesToProps(gridDef, comp.getAttributes()), ''),
    /One/,
  );
  assert.ok(jsonErrors.some((e) => e.prop === 'items'), 'invalid JSON reported through onJsonError');
  assert.equal(input.getAttribute('aria-invalid'), 'true', 'field marked invalid');
  // Fixing the text to valid JSON applies and clears the error.
  const threeItems = [...twoItems, { title: 'Three', text: 'Third' }];
  input.value = JSON.stringify(threeItems);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(registryLib.attributesToProps(gridDef, comp.getAttributes()).items.length, 3);
  assert.ok(jsonClears.includes('items'), 'valid JSON clears through onJsonClear');
  assert.equal(input.getAttribute('aria-invalid'), null, 'field mark cleared');
});

test('Items (JSON) trait renders as a real multi-line textarea', () => {
  const gridDef = registry.components.find((c) => c.id === 'section.feature-grid');
  selectFirstOfType('section.feature-grid', registryLib.propsToAttributes(gridDef, { heading: 'Grid', items: [] }));
  const input = traitInputFor('data-prop-items');
  assert.ok(input, 'items trait input exists');
  assert.equal(input.tagName, 'TEXTAREA');
  assert.equal(input.rows, 6);
});

test('findInvalidJsonProps flags bad JSON and passes good JSON', () => {
  const gridDef = registry.components.find((c) => c.id === 'section.feature-grid');
  const map = new Map(registry.components.map((c) => [c.id, c]));
  const bad = liveTraits.findInvalidJsonProps(
    [{ type: 'section.feature-grid', attributes: registryLib.propsToAttributes(gridDef, { heading: 'G' }) }],
    map,
  );
  assert.equal(bad.length, 0, 'default items JSON is valid');
  const comp = selectFirstOfType('section.feature-grid', registryLib.propsToAttributes(gridDef, { heading: 'G', items: [] }));
  comp.addAttributes({ 'data-prop-items': '[{"title": broken' });
  const flagged = liveTraits.findInvalidJsonProps([comp], map);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].prop, 'items');
  comp.addAttributes({ 'data-prop-items': '[{"title":"One","text":"T"}]' });
  assert.equal(liveTraits.findInvalidJsonProps([comp], map).length, 0);
});

test('canonicalStringify ignores object key order but not array order', () => {
  assert.equal(
    liveTraits.canonicalStringify({ b: 1, a: { d: 4, c: 3 } }),
    liveTraits.canonicalStringify({ a: { c: 3, d: 4 }, b: 1 }),
  );
  assert.notEqual(
    liveTraits.canonicalStringify({ items: [1, 2] }),
    liveTraits.canonicalStringify({ items: [2, 1] }),
  );
});

test('snapshot rule: restoring the original trait value serializes identically', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const meta = { id: home.id, slug: home.slug, title: home.title, locale: 'en', seo: {} };
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Saved' }));
  const list = () => { const out = []; editor.getWrapper().components().forEach((c) => out.push(c)); return out; };
  const snapshot = liveTraits.canonicalStringify(typo3Storage.grapesComponentsToPage(list(), meta, registry));
  comp.addAttributes({ 'data-prop-heading': 'Changed' });
  assert.notEqual(liveTraits.canonicalStringify(typo3Storage.grapesComponentsToPage(list(), meta, registry)), snapshot);
  comp.addAttributes({ 'data-prop-heading': 'Saved' });
  assert.equal(liveTraits.canonicalStringify(typo3Storage.grapesComponentsToPage(list(), meta, registry)), snapshot);
});

test('primary text trait table covers the text-bearing components', () => {
  assert.equal(liveTraits.PRIMARY_TEXT_TRAIT['section.hero'], 'heading');
  assert.equal(liveTraits.PRIMARY_TEXT_TRAIT['content.heading'], 'text');
  assert.equal(liveTraits.PRIMARY_TEXT_TRAIT['content.rich-text'], 'html');
  assert.equal(liveTraits.PRIMARY_TEXT_TRAIT['navigation.footer'], 'text');
  assert.equal(liveTraits.PRIMARY_TEXT_TRAIT['layout.container'], undefined);
  assert.equal(liveTraits.PRIMARY_TEXT_TRAIT['content.divider'], undefined);
});

test('focusPrimaryTextTrait focuses the hero heading input', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Focus me' }));
  // The traits view starts hidden in this harness (as in the page);
  // focus only lands once the view is shown, which is exactly the
  // order the canvas double-click handler uses (switch, then focus).
  editor.Panels.getButton('panel-switcher', 'show-traits').set('active', true);
  assert.equal(liveTraits.focusPrimaryTextTrait(editor, comp), true);
  const input = traitInputFor('data-prop-heading');
  assert.equal(document.activeElement, input);
});

test('activating the Traits switcher button shows the traits view', () => {
  const btn = editor.Panels.getButton('panel-switcher', 'show-traits');
  assert.ok(btn, 'traits switcher button exists');
  btn.set('active', true);
  assert.equal(document.getElementById('view-traits').hidden, false);
  assert.equal(document.getElementById('view-blocks').hidden, true);
});

test('focused-field Ctrl+Z routes to history undo (not native input undo); Ctrl+Shift+Z routes to redo', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  let input = traitInputFor('data-prop-heading');
  assert.ok(input, 'heading trait input exists');
  input.value = 'Edited';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(history.position, 1, 'commit pushed exactly one entry');
  // Focus the field again and press Ctrl+Z ON THE INPUT. GrapesJS
  // keymaps never fire from inside a text input (keymaster skips
  // INPUT targets), so without the trait keydown routing this would
  // do nothing to history and the browser's native input undo would
  // take over, reverting the field text with no history or dirty
  // bookkeeping at all. The routing must prevent the native default
  // and move history instead.
  input.focus();
  const undoKey = new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(undoKey);
  assert.equal(undoKey.defaultPrevented, true, 'native input undo is prevented');
  assert.equal(history.position, 0, 'history moved back one entry');
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Original', 'canvas reverted through history');
  // Redo the same way, from inside the freshly rendered trait input.
  input = traitInputFor('data-prop-heading');
  input.focus();
  const redoKey = new dom.window.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(redoKey);
  assert.equal(redoKey.defaultPrevented, true, 'native input redo is prevented');
  assert.equal(history.position, 1, 'history moved forward one entry');
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Edited', 'canvas restored through history');
});

test('focused-field Ctrl+Z commits an open session first, so the whole field edit is undone', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  input.focus();
  input.value = 'Typed but uncommitted';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(history.position, 0, 'live typing alone pushes nothing (partial applies)');
  const undoKey = new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(undoKey);
  assert.equal(history.position, 0, 'commit-then-undo lands back on the baseline entry');
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Original', 'the whole uncommitted edit is undone, not a previous entry');
});

test('live input refreshes the dirty compare: undo to saved reads clean, redo reads dirty, two-edit undo-once reads dirty', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const meta = { id: 'page-builder', slug: 'home', title: 'Home' };
  const snap = () => {
    const list = [];
    editor.getWrapper().components().forEach((c) => list.push(c));
    return liveTraits.canonicalStringify(typo3Storage.grapesComponentsToPage(list, meta, registry));
  };
  const saved = snap();
  const inputRefreshesBefore = inputRefreshes.length;
  const input = traitInputFor('data-prop-heading');
  input.value = 'Edited';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(inputRefreshes.length > inputRefreshesBefore, 'live input fires the dirty-refresh hook');
  assert.notEqual(snap(), saved, 'typed edit reads dirty against the saved snapshot');
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.ok(history.undo(), 'undo runs');
  assert.equal(snap(), saved, 'undo to the saved state reads clean');
  assert.ok(history.redo(), 'redo runs');
  assert.notEqual(snap(), saved, 'redo to the edited state reads dirty again');
  // Two edits, undo once: the intermediate state is still edited.
  const input2 = traitInputFor('data-prop-heading');
  input2.value = 'Second edit';
  input2.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.ok(history.undo(), 'undo of the second edit runs');
  assert.notEqual(snap(), saved, 'undo-once after two edits still reads dirty (intermediate edited state)');
  assert.equal(componentByElementId('el-test-stable-1').getAttributes()['data-prop-heading'], 'Edited', 'intermediate state is the first edit, not the original');
});
