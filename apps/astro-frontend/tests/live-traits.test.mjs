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
let editor;
let dom;
const jsonErrors = [];
const jsonClears = [];

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

  editor = grapesjs.init({
    container: '#gjs',
    fromElement: false,
    noticeOnUnload: false,
    storageManager: false,
    blockManager: { appendTo: '#blocks' },
    layerManager: { appendTo: '#layers' },
    traitManager: { appendTo: '#traits-box' },
    panels: panelsLib.buildPanelsConfig(),
    plugins: [(ed) => { panelsLib.registerBuilderCommands(ed, {}); }],
  });
  liveTraits.registerTextareaTraitType(editor);
  for (const id of ['section.hero', 'content.heading', 'section.feature-grid']) {
    registerComponentType(registry.components.find((c) => c.id === id));
  }
  liveTraits.wireLiveTraits(editor, document.getElementById('traits-box'), {
    getDef: (cid) => registry.components.find((c) => c.id === cid),
    onJsonError: (prop, message) => { jsonErrors.push({ prop, message }); },
    onJsonClear: (prop) => { jsonClears.push(prop); },
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
  return comp;
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
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original');
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Edited');
});

test('trait edit session records exactly one undo entry: one Undo click reverts the whole typed edit', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  const um = editor.UndoManager;
  const beforeLength = um.getStack().length;
  let cur = input.value;
  for (const ch of ' TEST') {
    cur += ch;
    input.value = cur;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST');
  // Live applies are partial and record nothing: typing alone must
  // not grow the stack (this is the mechanism that replaces the old
  // tail-slice collapse, which broke for mid-stack sessions).
  assert.equal(um.getStack().length, beforeLength, 'partial live applies record no undo entries');
  assert.equal(um.getStack().pointer, beforeLength - 1, 'pointer unmoved by typing');
  // Commit (blur/Enter in a real browser): exactly one entry for
  // the whole session, recorded by the commit's full apply.
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(um.getStack().length, beforeLength + 1, 'session commits to exactly one undo entry');
  const basicActions = document.querySelector('.panel__basic-actions');
  const buttons = [...basicActions.querySelectorAll('.gjs-pn-btn')];
  const undoEl = buttons.find((b) => b.getAttribute('title') === 'Undo');
  const redoEl = buttons.find((b) => b.getAttribute('title') === 'Redo');
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'one Undo click reverts the whole session');
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST', 'one Redo click restores the whole session');
});

test('redo survives repeated use: commit entry is its own undo group, undo never removes the component', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  // Show the Traits view first, exactly as the page does before
  // focusing: a hidden input cannot take focus, in jsdom or in a
  // browser, so focus/blur sequencing below would be fiction without
  // this step (the earlier tests never focused the input at all).
  editor.Panels.getButton('panel-switcher', 'show-traits').set('active', true);
  const input = traitInputFor('data-prop-heading');
  assert.ok(input, 'heading trait input exists');
  const um = editor.UndoManager;
  const stack = um.getStack();
  const beforeLength = stack.length;
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
  // would fire it), committing and collapsing the session, then the
  // button takes focus and the click runs.
  input.blur();
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(stack.length, beforeLength + 1, 'session commits to one undo entry');
  const collapsed = stack.at(beforeLength);
  assert.equal(collapsed.get('type'), 'change', 'commit entry is the session change');
  assert.equal(collapsed.get('object'), comp, 'commit entry belongs to the edited component');
  const otherIndices = new Set();
  stack.forEach((entry, i) => { if (i !== beforeLength) otherIndices.add(entry.get('magicFusionIndex')); });
  assert.ok(!otherIndices.has(collapsed.get('magicFusionIndex')), 'collapsed entry has a group index no other entry shares');
  const basicActions = document.querySelector('.panel__basic-actions');
  const buttons = [...basicActions.querySelectorAll('.gjs-pn-btn')];
  const undoEl = buttons.find((b) => b.getAttribute('title') === 'Undo');
  const redoEl = buttons.find((b) => b.getAttribute('title') === 'Redo');
  assert.ok(undoEl && redoEl, 'undo and redo buttons found by title, not by position');
  const wrapperContains = () => {
    let found = false;
    editor.getWrapper().components().forEach((c) => { if (c === comp) found = true; });
    return found;
  };
  // First Undo: whole session reverts, the component stays in the
  // canvas (a shared group index previously let magic Undo drag in
  // the older component-add entry, removing the component and
  // moving the pointer to -1), and redo stays available.
  undoEl.focus();
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'one Undo click reverts the whole session');
  assert.ok(wrapperContains(), 'undo leaves the component in the canvas');
  assert.equal(stack.pointer, beforeLength - 1, 'pointer sits on the entry before the collapsed entry, not -1');
  assert.ok(um.hasRedo(), 'redo available after undo');
  // First Redo: whole session restores, including the trait input.
  redoEl.focus();
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST', 'one Redo click restores the whole session');
  assert.equal(input.value, 'Original TEST', 'trait input resyncs on redo');
  assert.equal(stack.pointer, beforeLength, 'pointer back on the collapsed entry after redo');
  // Second cycle: the redo stack survives repeated use.
  undoEl.focus();
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'second Undo reverts again');
  assert.ok(wrapperContains(), 'second undo still leaves the component in the canvas');
  redoEl.focus();
  redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST', 'second Redo restores again');
});

test('mid-stack session commits to exactly one entry with no leftover (the old collapse bug)', () => {
  // The old tail-slice collapse broke here: a session starting
  // while the pointer sat mid-stack (after an Undo) left its first
  // keystroke entry below the collapsed entry, because
  // Backbone.Undo pops the redo tail when that keystroke lands.
  // That leftover undid invisibly and corrupted later sessions.
  // With partial live applies there is no tail to slice, so a
  // mid-stack session must produce exactly one entry and nothing
  // else, whatever the pointer state is.
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  const um = editor.UndoManager;
  const stack = um.getStack();
  const baseLength = stack.length;
  const click = (title) => {
    const btn = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')]
      .find((b) => b.getAttribute('title') === title);
    btn.focus();
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const typeAndCommit = (text) => {
    input.focus();
    let cur = input.value;
    for (const ch of text) {
      cur += ch;
      input.value = cur;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    input.blur();
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };
  typeAndCommit(' ONE');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original ONE');
  assert.equal(stack.length, baseLength + 1, 'session 1 commits to one entry');
  click('Undo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'undo reverts session 1');
  assert.equal(stack.pointer, baseLength - 1, 'pointer mid-stack after undo');
  typeAndCommit(' TWO');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TWO');
  assert.equal(stack.length, baseLength + 1, 'mid-stack session commits to one entry, no leftover');
  const entries = [];
  stack.forEach((entry) => { entries.push(entry); });
  const sessionEntries = entries.filter((e) => e.get('type') === 'change' && e.get('object') === comp);
  assert.equal(sessionEntries.length, 1, 'exactly one change entry for this component on the stack');
  assert.equal(sessionEntries[0].get('after').attributes['data-prop-heading'], 'Original TWO');
  click('Undo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'one Undo click reverts the mid-stack session fully');
});

test('full Undo/Redo cycle then a second edit session undoes in one click (Test B analogue)', () => {
  // Browser matrix, second half: after edit, Undo, Redo, Undo, a
  // second typed edit could not be undone at all. Under the new
  // mechanism each session is one entry by construction, so the
  // second session must undo in exactly one click, with no
  // leftover entries from either session on the stack.
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  const um = editor.UndoManager;
  const stack = um.getStack();
  const baseLength = stack.length;
  const click = (title) => {
    const btn = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')]
      .find((b) => b.getAttribute('title') === title);
    btn.focus();
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const typeAndCommit = (text) => {
    input.focus();
    let cur = input.value;
    for (const ch of text) {
      cur += ch;
      input.value = cur;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    input.blur();
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  };
  typeAndCommit(' TEST');
  assert.equal(stack.length, baseLength + 1, 'session 1 is one entry');
  click('Undo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'undo reverts session 1');
  click('Redo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST', 'redo restores session 1');
  click('Undo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'post-redo Undo reverts in exactly one click, no phantom entry');
  typeAndCommit(' TEST2');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST2');
  assert.equal(stack.length, baseLength + 1, 'session 2 replaces session 1, no leftover entries');
  click('Undo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original', 'second session undoes in one click');
  click('Redo');
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original TEST2', 'redo restores the second session');
});

test('drag-add still undoes sensibly with magic grouping kept', () => {
  // Magic grouping stays ON for non-trait operations (only trait
  // session entries carry a unique index), so a drag-add must
  // still be undoable. jsdom cannot model magic grouping itself:
  // Node timers freeze after GrapesJS init, so Backbone.Undo's
  // deferred magic-index reset never runs and every entry in the
  // process shares index 0, which would make one magic Undo remove
  // every entry on the stack. That is a harness artifact, not
  // product behaviour, so this test pins the single-entry path
  // (undo(false)/redo(false)): the append's entry undoes and
  // redoes exactly, and the browser re-test covers magic grouping
  // for drag-add (one click reverting the whole drag).
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const first = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Kept' }));
  const countHeroes = () => {
    let n = 0;
    editor.getWrapper().components().forEach((c) => { if (c.get('type') === 'section.hero') n += 1; });
    return n;
  };
  assert.equal(countHeroes(), 1);
  editor.getWrapper().append({ type: 'section.hero', attributes: { ...registryLib.propsToAttributes(heroDef, { heading: 'Dragged' }), 'data-astro-element-id': 'el-drag-test-1' } });
  assert.equal(countHeroes(), 2, 'drag-add appends a second hero');
  editor.UndoManager.undo(false);
  assert.equal(countHeroes(), 1, 'undo removes the dragged component');
  assert.ok(editor.getWrapper().components().at(0) === first, 'the original hero remains');
  editor.UndoManager.redo(false);
  assert.equal(countHeroes(), 2, 'redo restores the dragged component');
});

test('Enter in a single-line trait input blurs it; Enter in a textarea does not', () => {
  const heroDef = registry.components.find((c) => c.id === 'section.hero');
  const comp = selectFirstOfType('section.hero', registryLib.propsToAttributes(heroDef, { heading: 'Original' }));
  const input = traitInputFor('data-prop-heading');
  editor.Panels.getButton('panel-switcher', 'show-traits').set('active', true);
  const um = editor.UndoManager;
  const beforeLength = um.getStack().length;
  input.focus();
  assert.equal(document.activeElement, input, 'input focused before Enter');
  let cur = input.value;
  for (const ch of ' ENTER') {
    cur += ch;
    input.value = cur;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal(comp.getAttributes()['data-prop-heading'], 'Original ENTER');
  assert.equal(um.getStack().length, beforeLength, 'typing alone records nothing');
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.notEqual(document.activeElement, input, 'Enter blurs a single-line input');
  // jsdom fires no change on blur, so the browser's blur-change is
  // dispatched explicitly; it must commit the session to one entry.
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(um.getStack().length, beforeLength + 1, 'Enter-committed session is one entry');
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
