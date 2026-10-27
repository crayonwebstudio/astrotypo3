// Live trait editing for the GrapesJS builder.
//
// Why this module exists: GrapesJS 0.23.8 TraitView only commits on the
// DOM 'change' event (TraitView.prototype.eventCapture = ['change'] in
// node_modules/grapesjs/dist/grapes.mjs), so typing in a trait field
// changed nothing on the canvas until the field lost focus or Enter
// was pressed. A user typing without pressing Enter reasonably
// concluded editing did not work. This module applies trait input
// live, on the 'input' event, through the trait model path
// (Trait.setValue -> setTargetValue -> component.addAttributes), so
// the canvas re-renders while typing.
//
// Undo mechanism, updated again (27 Oct 2026, second change the
// same day): the session-commit entry described below used to be
// the builder's undo, recorded on GrapesJS's stock UndoManager. That
// stock stack is abandoned (see lib/history.mjs for the full
// reasons: Redo not restoring, drag-add not undoing, one Undo
// wiping the canvas through a load group). The commit below still
// does the silent restore plus one full apply, because that keeps
// the __p marker handling correct, but the builder's undo entry is
// now a snapshot pushed through the onSessionStart/onSessionCommit
// hooks into lib/history.mjs, and the stock entry the full apply
// records is inert (no button, keymap, or command path reaches
// core:undo/core:redo any more). Everything else in this header
// about partial live applies, capture-phase commit ordering, and
// the grouping guard still describes the live-typing path
// accurately; the grouping guard now guards only an inert entry.
//
// Undo mechanism, and why the previous design was replaced
// (27 Oct 2026): live applies used to be FULL applies, one undo entry
// per keystroke, and a commit step collapsed the session's entries by
// slicing the stack tail (entries since session start) and replacing
// them with one entry built by silent restore plus full apply. That
// collapse is unsound whenever a session starts while the undo
// pointer sits mid-stack (after undos): Backbone.Undo's addToStack
// pops the redo tail when the session's first keystroke lands, so
// the session's entries do NOT start at the recorded stack length.
// The tail slice then misses the first keystroke entry, leaving it
// below the collapsed entry as a leftover whose undo is invisible
// (its before value already equals the current value), and further
// undos walk into older entries, eventually undoing the
// component-add entry, which removes the component from the canvas
// AND unregisters it from the UndoManager, after which every later
// edit to it records no undo entry at all. Both failure modes were
// reproduced in a jsdom harness against the real editor (see the
// tests): a mid-stack session leaves a leftover entry, and once the
// pointer reaches -1, typing records zero entries while the value
// still changes. The browser matrix (a no-op Undo after Redo, then a
// second edit session that could not be undone at all) is exactly
// what this mechanism produces.
//
// The replacement makes one undo entry per session BY CONSTRUCTION,
// with no tail slicing and no pointer arithmetic:
//   * Typing applies with { partial: true } (avoidStore). GrapesJS
//     skips the undo stack for partial applies (UndoManager change
//     handler skips on opts.partial/avoidStore) and skips the dirty
//     counter (EditorModel.handleUpdates returns early on partial),
//     so keystrokes record NOTHING and cannot corrupt the stack.
//     The canvas still re-renders live, because the change event
//     itself still fires; only the undo recording and the dirty
//     count are skipped. One honest consequence: the dirty indicator
//     now moves at commit, not per keystroke.
//   * Commit (change event, or deselect backstop) does silent restore
//     to the pre-session value plus one full apply of the final
//     value, exactly as the old collapse did for its replacement
//     entry, but with no entries to remove: Backbone sets
//     _previousAttributes at the start of every top-level set,
//     silent or not, so the full apply's undo entry records the
//     pre-edit state. The session needs only { comp, attrName,
//     preValue }; it never reads the stack, so mid-stack pointers,
//     redo tails, and leftover entries cannot occur. A new edit
//     after undos pops the redo tail through Backbone.Undo's own
//     addToStack, which is the standard, correct behaviour.
//   * Commit runs on the change event's CAPTURE phase (a capture
//     listener on the traits panel), before GrapesJS's own
//     TraitView change handler (a bubble listener on the trait row).
//     Ordering matters because partial applies leave the component
//     attribute __p at null (setTargetValue sets __p null for
//     avoidStore applies, undefined otherwise), and TraitView's
//     commit path would flip __p back to undefined, recording an
//     invisible __p-only undo entry above the session entry.
//     Capturing first means the commit's full apply (direct
//     addAttributes, bypassing setTargetValue, so __p is untouched)
//     lands before TraitView's handler runs, and that handler then
//     finds the trait value already equal to the input and becomes
//     a no-op. No phantom entry.
//   * The commit entry gets a unique group index (a string no
//     numeric callstack index can equal), so GrapesJS's default
//     magic grouping (UndoManagerModule undo/redo pass all=true)
//     touches exactly that one entry even if another session
//     committed in the same callstack (deselect backstop). Magic
//     grouping stays ON for everything else, so drag-add and other
//     multi-entry operations still undo sensibly in one click.
//   * Toolbar Undo still blurs first (builder-undo) so a focused
//     field commits through the capture handler before the undo
//     runs; toolbar Redo still does not blur. Keyboard Ctrl+Z /
//     Ctrl+Shift+Z are rerouted by lib/history.mjs
//     (installHistoryKeymaps removes the stock keymaps and binds
//     the same keys to the snapshot history); GrapesJS binds redo
//     to Ctrl+Shift+Z only, there is no Ctrl+Y binding, and none
//     is invented.
//   * Enter in a single-line text trait input (INPUT, never
//     TEXTAREA or SELECT) blurs the field, which fires change in a
//     browser and therefore commits, matching the commit-on-Enter
//     users expect.
//
// Canvas text is NOT directly editable in this slice, by design:
// leaf component views render static innerHTML from props, so there
// is no editable text node to double-click into. Double-clicking a
// text-bearing block instead jumps to the Traits view and focuses
// that component's primary text trait (see PRIMARY_TEXT_TRAIT).
// Traits are the editing surface; the builder UI note says so.

import { PROP_ATTRIBUTE_PREFIX } from './grapesRegistry.mjs';
import { normalizeComponentData } from './typo3Storage.mjs';

/** Component id -> primary text prop edited on canvas double-click. */
export const PRIMARY_TEXT_TRAIT = {
  'content.heading': 'text',
  'section.hero': 'heading',
  'content.rich-text': 'html',
  'content.button': 'label',
  'section.cta': 'heading',
  'section.feature-grid': 'heading',
  'section.faq': 'heading',
  'section.testimonials': 'heading',
  'section.image-text': 'heading',
  'navigation.header': 'brand',
  'navigation.footer': 'text',
  // layout.container, layout.columns, content.divider: no text trait.
};

export function attrNameForProp(propName) {
  return PROP_ATTRIBUTE_PREFIX + propName;
}

/** Value a trait input element currently holds, in trait value terms. */
export function traitInputValue(trait, inputEl) {
  if (!trait || !inputEl) return undefined;
  if (trait.getType && trait.getType() === 'checkbox') return !!inputEl.checked;
  return inputEl.value;
}

/**
 * Find the trait model that owns an input element inside the traits
 * panel. Primary path: the trait view keeps its input element
 * (model.view is set by the TraitView constructor, and getInputElem
 * returns the rendered input). Fallback: the trait row root carries
 * class "gjs-trait__wrp-<id>", matched against trait ids and names.
 */
export function findTraitForInput(editor, inputEl) {
  if (!editor || !inputEl) return null;
  let selected = null;
  try { selected = editor.getSelected(); } catch { selected = null; }
  if (!selected) return null;
  let traits = [];
  try { traits = selected.getTraits() || []; } catch { traits = []; }
  for (const trait of traits) {
    try {
      const viewInput = trait.view && trait.view.getInputElem ? trait.view.getInputElem() : null;
      if (viewInput && viewInput === inputEl) return trait;
    } catch { /* try the class fallback below */ }
  }
  let el = inputEl;
  while (el && el !== inputEl.ownerDocument) {
    const cls = typeof el.className === 'string' ? el.className : '';
    const m = cls.match(/(?:^|\s)gjs-trait__wrp-([^\s]+)/);
    if (m) {
      const id = m[1];
      const found = traits.find((t) => {
        try { return (t.getId && t.getId() === id) || (t.getName && t.getName() === id); } catch { return false; }
      });
      if (found) return found;
      return null;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Apply one trait input's current value to the selected component,
 * live. Returns true when a trait was found and applied. Uses the
 * trait model path (setValue), so the trait model resyncs from the
 * component change (targetUpdated). With options.partial, the apply
 * goes through as a partial (avoidStore) apply: GrapesJS records no
 * undo entry for it and does not move the dirty counter, while the
 * canvas still re-renders live. That is the live-typing path; the
 * commit step later records exactly one full entry for the session.
 * Without partial, the apply is a full apply and records normally
 * (kept for callers that need a recorded apply).
 */
export function applyTraitInput(editor, inputEl, options = {}) {
  const trait = findTraitForInput(editor, inputEl);
  if (!trait) return false;
  const value = traitInputValue(trait, inputEl);
  if (value === undefined) return false;
  try { trait.setValue(value, options.partial ? { partial: true } : {}); } catch { return false; }
  return true;
}

/**
 * Register a real multi-line textarea trait type. GrapesJS 0.23.8
 * ships trait views only for text, number, select and checkbox; a
 * trait declared with type 'textarea' falls back to the base TraitView,
 * whose getInputEl builds "<input type=textarea>", which browsers
 * render as a single-line text input. That is why the Items (JSON)
 * trait showed as one line. This type renders a genuine <textarea>
 * (rows 6, CSS min-height in the builder page) and otherwise behaves
 * exactly like the base view: onChange reads el.value, onValueChange
 * fromTarget writes el.value.
 */
export function registerTextareaTraitType(editor) {
  if (!editor || !editor.TraitManager || typeof editor.TraitManager.addType !== 'function') return false;
  editor.TraitManager.addType('textarea', {
    createInput({ trait }) {
      const ta = document.createElement('textarea');
      ta.rows = 6;
      try {
        const v = trait.getValue();
        ta.value = v === undefined || v === null ? '' : String(v);
      } catch { ta.value = ''; }
      return ta;
    },
  });
  return true;
}

/**
 * Wire live trait application onto a traits panel element.
 * options: { getDef(componentId) -> registry def or undefined,
 *   onJsonError(propName, message), onJsonClear(propName) }.
 * 'input' applies live, with two guards. First, for array/object
 * props the raw text is validated as JSON BEFORE applying: invalid
 * JSON is never applied, so attributesToProps can never silently
 * fall back to [] and wipe the rendered items live (the previous
 * behaviour: every keystroke applied, invalid text parsed to [] on
 * render, all cards vanished before any commit or save validation
 * could run). An invalid value reports through onJsonError at once
 * and marks the input (aria-invalid, red border, message as title);
 * a valid value applies and clears the mark through onJsonClear.
 * Second, edit sessions record exactly one undo entry on commit
 * (see the module header): 'input' applies are partial and record
 * nothing, and 'change' (capture phase) commits the session for
 * that input and re-validates JSON props; deselect commits any
 * open sessions.
 */
// Monotonic counter for collapsed-entry group indices. A string
// prefix guarantees no collision with Backbone.Undo's numeric
// per-callstack indices (see the module header).
let collapseCounter = 0;

export function wireLiveTraits(editor, traitsBox, options = {}) {
  if (!editor || !traitsBox) return () => {};
  const { getDef, onJsonError, onJsonClear, onSessionStart, onSessionCommit } = options;
  // Open edit sessions, keyed by input element: { comp, attrName,
  // preValue }. preValue is the attribute value before the session's
  // first live apply. Deliberately NO stack bookkeeping: live applies
  // are partial and record nothing, so there is no tail to slice and
  // no pointer to track (see the module header).
  const sessions = new Map();

  function undoStack() {
    try { return editor.UndoManager ? editor.UndoManager.getStack() : null; } catch { return null; }
  }

  // Array/object prop info for an input element, or null when the
  // input is not such a prop (or the def is unknown).
  function jsonPropForInput(inputEl) {
    if (!getDef) return null;
    let selected = null;
    try { selected = editor.getSelected(); } catch { selected = null; }
    if (!selected) return null;
    const attrs = (selected.getAttributes && selected.getAttributes()) || {};
    const componentId = attrs['data-astro-component-id'] || (selected.get && selected.get('type')) || '';
    const def = getDef(componentId);
    if (!def) return null;
    const trait = findTraitForInput(editor, inputEl);
    if (!trait) return null;
    const attrName = trait.getName ? trait.getName() : '';
    if (!attrName.startsWith(PROP_ATTRIBUTE_PREFIX)) return null;
    const propName = attrName.slice(PROP_ATTRIBUTE_PREFIX.length);
    const spec = (def.props || {})[propName];
    if (!spec || (spec.type !== 'array' && spec.type !== 'object')) return null;
    return { propName, attrName, spec };
  }

  function setJsonErrorVisual(inputEl, message) {
    try {
      inputEl.setAttribute('aria-invalid', 'true');
      inputEl.title = message;
      inputEl.style.borderColor = '#e5484d';
    } catch { /* input gone */ }
  }
  function clearJsonErrorVisual(inputEl) {
    try {
      inputEl.removeAttribute('aria-invalid');
      inputEl.title = '';
      inputEl.style.borderColor = '';
    } catch { /* input gone */ }
  }

  function startSession(inputEl) {
    if (sessions.has(inputEl)) return sessions.get(inputEl);
    const trait = findTraitForInput(editor, inputEl);
    if (!trait) return null;
    let comp = null;
    try { comp = editor.getSelected(); } catch { comp = null; }
    if (!comp) return null;
    const attrName = trait.getName ? trait.getName() : '';
    if (!attrName) return null;
    const session = {
      comp,
      attrName,
      preValue: ((comp.getAttributes && comp.getAttributes()) || {})[attrName],
    };
    sessions.set(inputEl, session);
    // Snapshot history hook (lib/history.mjs): the session's
    // pre-edit state is ensured present now; the generic push path
    // is suppressed while the session is open, so keystrokes can
    // never become entries. The commit hook below pushes exactly
    // one entry for the whole session.
    try { if (onSessionStart) onSessionStart(); } catch { /* history hook is best effort */ }
    return session;
  }

  // Commit one session to exactly one undo entry. Live applies were
  // partial and recorded nothing, so there is no tail to clean up:
  // silent restore to the pre-session value, then one full apply of
  // the final value. Backbone records the restored state as
  // _previousAttributes at the start of every top-level set, silent
  // or not, so the full apply's undo entry records the pre-edit
  // state as its before. A round trip (final value equals pre-edit
  // value) touches nothing and adds no entry. This never reads the
  // stack position, so it is correct whatever the pointer state is
  // (mid-stack after undos, redo tail present, or otherwise); a
  // mid-stack full apply pops the redo tail through Backbone.Undo's
  // own addToStack, which is the standard behaviour for any new
  // edit. The apply bypasses the trait model path on purpose
  // (direct addAttributes, not setTargetValue), so the __p marker
  // partial applies left behind is untouched and no second entry
  // can appear (see the module header).
  function commitSession(inputEl) {
    const session = sessions.get(inputEl);
    if (!session) return;
    sessions.delete(inputEl);
    // The session closes on EVERY exit path, including the no-change
    // round trip below: if the history hook were skipped there, the
    // history would keep suppressing generic pushes forever.
    const closeSession = () => { try { if (onSessionCommit) onSessionCommit(); } catch { /* history hook is best effort */ } };
    let finalValue;
    try { finalValue = ((session.comp.getAttributes && session.comp.getAttributes()) || {})[session.attrName]; } catch { closeSession(); return; }
    if (finalValue === session.preValue) { closeSession(); return; }
    try { session.comp.addAttributes({ [session.attrName]: session.preValue }, { silent: true }); } catch { closeSession(); return; }
    try { session.comp.addAttributes({ [session.attrName]: finalValue }); } catch { /* attribute stays restored */ }
    closeSession();
    // Grouping guard (see the module header): the full apply's
    // entry is the new stack tail; give it a unique group index
    // so magic Undo/Redo touch exactly this entry and move the
    // pointer by exactly one. Guarded to the tail entry being
    // this session's change; if anything else is on top, leave
    // the stack exactly as GrapesJS recorded it.
    try {
      const stack = undoStack();
      if (stack && Array.isArray(stack.models)) {
        const tailEntry = stack.at(stack.length - 1);
        if (tailEntry && tailEntry.get('type') === 'change' && tailEntry.get('object') === session.comp) {
          tailEntry.set('magicFusionIndex', 'astro-collapse-' + (++collapseCounter), { silent: true });
        }
      }
    } catch { /* grouping guard is best effort; the entry itself stands */ }
  }
  function commitAllSessions() {
    for (const inputEl of [...sessions.keys()]) commitSession(inputEl);
  }

  const onInput = (event) => {
    const target = event.target;
    if (!target || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const json = jsonPropForInput(target);
    if (json) {
      try {
        JSON.parse(target.value);
        clearJsonErrorVisual(target);
        if (onJsonClear) onJsonClear(json.propName);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        setJsonErrorVisual(target, 'Invalid JSON: ' + message);
        if (onJsonError) onJsonError(json.propName, message);
        return;
      }
    }
    startSession(target);
    // Partial apply: canvas re-renders live, no undo entry, no
    // dirty count (see the module header). The commit step records
    // the session as exactly one entry.
    applyTraitInput(editor, target, { partial: true });
  };
  // Commit on the change event's CAPTURE phase, before GrapesJS's
  // own TraitView change handler (a bubble listener on the trait
  // row) runs. Capture ordering is load bearing: partial applies
  // left __p at null, and TraitView's commit path would flip it back
  // to undefined and record an invisible __p-only entry. Committing
  // first makes TraitView's handler find the trait value already
  // equal to the input, so it becomes a no-op (see module header).
  const onChangeCommit = (event) => {
    const target = event.target;
    if (!target || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    commitSession(target);
  };
  // Enter in a single-line text trait input commits by blurring
  // the field; in a browser the blur fires change (value changed
  // since focus), which runs the capture commit above. TEXTAREA
  // traits (JSON props) keep Enter for newlines, and SELECT traits
  // keep Enter for opening the dropdown, so neither blurs here;
  // SELECT commits on its change event anyway.
  const onKeydown = (event) => {
    const target = event.target;
    if (!target || event.key !== 'Enter') return;
    if (target.tagName !== 'INPUT') return;
    try { target.blur(); } catch { /* field gone */ }
  };
  const onChange = (event) => {
    const target = event.target;
    if (!target || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (!getDef) return;
    let selected = null;
    try { selected = editor.getSelected(); } catch { selected = null; }
    if (!selected) return;
    const attrs = (selected.getAttributes && selected.getAttributes()) || {};
    const componentId = attrs['data-astro-component-id'] || (selected.get && selected.get('type')) || '';
    const def = getDef(componentId);
    if (!def) return;
    const trait = findTraitForInput(editor, target);
    if (!trait) return;
    const attrName = trait.getName ? trait.getName() : '';
    if (!attrName.startsWith(PROP_ATTRIBUTE_PREFIX)) return;
    const propName = attrName.slice(PROP_ATTRIBUTE_PREFIX.length);
    const spec = (def.props || {})[propName];
    if (!spec || (spec.type !== 'array' && spec.type !== 'object')) return;
    const raw = target.value;
    try {
      JSON.parse(raw);
      clearJsonErrorVisual(target);
      if (onJsonClear) onJsonClear(propName);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      setJsonErrorVisual(target, 'Invalid JSON: ' + message);
      if (onJsonError) onJsonError(propName, message);
    }
  };
  // A selection change ends any open edit session (the click that
  // selects another component blurs the old input first, so its
  // change commit normally runs before this; this is the backstop
  // for sessions whose input is detached without a change event).
  const onDeselected = () => { commitAllSessions(); };
  try { if (editor.on) editor.on('component:deselected', onDeselected); } catch { /* no event bus */ }
  traitsBox.addEventListener('input', onInput);
  traitsBox.addEventListener('change', onChangeCommit, true);
  traitsBox.addEventListener('change', onChange);
  traitsBox.addEventListener('keydown', onKeydown);
  return () => {
    traitsBox.removeEventListener('input', onInput);
    traitsBox.removeEventListener('change', onChangeCommit, true);
    traitsBox.removeEventListener('change', onChange);
    traitsBox.removeEventListener('keydown', onKeydown);
    try { if (editor.off) editor.off('component:deselected', onDeselected); } catch { /* already gone */ }
  };
}

/**
 * Scan live or plain component data for array/object props whose raw
 * attribute is not valid JSON. attributesToProps silently converts
 * such values to [] or {} on serialize, so without this check a save
 * would quietly empty the field. Returns [{ elementId, componentId,
 * prop, raw }]. registryMap: Map of component id -> registry def.
 */
export function findInvalidJsonProps(componentDataList, registryMap) {
  const bad = [];
  const walk = (data) => {
    const normalized = normalizeComponentData(data);
    if (!normalized) return;
    const componentId = normalized.attributes['data-astro-component-id'] || normalized.type;
    const def = registryMap ? registryMap.get(componentId) : undefined;
    if (def) {
      for (const [name, spec] of Object.entries(def.props || {})) {
        if (spec.type !== 'array' && spec.type !== 'object') continue;
        const raw = normalized.attributes[attrNameForProp(name)];
        if (typeof raw !== 'string') continue;
        try { JSON.parse(raw); } catch { bad.push({ elementId: normalized.attributes['data-astro-element-id'] || '', componentId, prop: name, raw }); }
      }
    }
    for (const child of normalized.components || []) walk(child);
  };
  for (const data of componentDataList || []) walk(data);
  return bad;
}

/** Canonical JSON: object keys sorted recursively, array order kept. */
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

/**
 * Focus a component's primary text trait input in the traits panel.
 * Returns true when an input was focused. The caller switches the
 * right panel to the Traits view first; this only focuses.
 */
export function focusPrimaryTextTrait(editor, component) {
  if (!editor || !component) return false;
  const attrs = (component.getAttributes && component.getAttributes()) || {};
  const componentId = attrs['data-astro-component-id'] || (component.get && component.get('type')) || '';
  const prop = PRIMARY_TEXT_TRAIT[componentId];
  if (!prop) return false;
  let traits = [];
  try { traits = component.getTraits() || []; } catch { traits = []; }
  const trait = traits.find((t) => {
    try { return t.getName() === attrNameForProp(prop); } catch { return false; }
  });
  if (!trait) return false;
  let input = null;
  try { input = trait.view && trait.view.getInputElem ? trait.view.getInputElem() : null; } catch { input = null; }
  if (!input || typeof input.focus !== 'function') return false;
  input.focus();
  return true;
}
