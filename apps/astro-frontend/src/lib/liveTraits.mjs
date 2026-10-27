// Live trait editing for the GrapesJS builder.
//
// Why this module exists: GrapesJS 0.23.8 TraitView only commits on the
// DOM 'change' event (TraitView.prototype.eventCapture = ['change'] in
// node_modules/grapesjs/dist/grapes.mjs), so typing in a trait field
// changed nothing on the canvas and nothing in the dirty indicator
// until the field lost focus or Enter was pressed. A user typing
// without pressing Enter reasonably concluded editing did not work.
// This module applies trait input live, on the 'input' event, through
// the exact same code path as the blur/Enter commit
// (Trait.setValue -> setTargetValue -> component.addAttributes), so
// the canvas re-renders and the dirty counter moves while typing, and
// the later blur/change commit is a no-op (same value, Backbone set
// skips unchanged attributes), never a double apply.
//
// Undo granularity, stated plainly: live applies are full
// (non-partial) applies, because GrapesJS skips both the dirty counter
// and the undo stack for partial/avoidStore applies
// (EditorModel.handleUpdates returns early on opt.partial, and the
// UndoManager change handler skips on opts.partial). Per keystroke,
// that would make each keystroke its own undo step, which is why a
// browser user typing " TEST" and clicking Undo three times saw the
// edit still standing: in a real browser each keystroke lands in its
// own task, so Backbone.Undo's magic grouping (same callstack) does
// not group them, and one Undo click reverts one keystroke. So a
// trait edit session (first input until commit on change/blur or
// deselect) is collapsed into exactly one undo entry on commit: the
// per-keystroke entries are removed from the stack tail and one
// entry is added by silently restoring the pre-edit value and then
// applying the final value as a full apply (Backbone sets
// _previousAttributes at the start of every top-level set, silent or
// not, so the full apply's undo entry records the pre-edit state).
// One toolbar Undo click therefore reverts the whole field edit, and
// one Redo restores it, matching the old blur-commit behaviour while
// keeping live canvas feedback. Collapse only happens when the
// session's entries are a clean tail of the stack (pointer at the
// end, every entry a change on this component); otherwise the entries
// are left exactly as GrapesJS recorded them.
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
 * component change (targetUpdated) and the later blur/change commit
 * of the same value is a Backbone no-op.
 */
export function applyTraitInput(editor, inputEl) {
  const trait = findTraitForInput(editor, inputEl);
  if (!trait) return false;
  const value = traitInputValue(trait, inputEl);
  if (value === undefined) return false;
  try { trait.setValue(value); } catch { return false; }
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
 * Second, edit sessions collapse to one undo entry on commit (see
 * the module header). 'change' commits the session for that input
 * and re-validates JSON props; deselect commits any open sessions.
 */
export function wireLiveTraits(editor, traitsBox, options = {}) {
  if (!editor || !traitsBox) return () => {};
  const { getDef, onJsonError, onJsonClear } = options;
  // Open edit sessions, keyed by input element: { comp, attrName,
  // preValue, startLength }. preValue is the attribute value before
  // the session's first live apply.
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
    const stack = undoStack();
    const session = {
      comp,
      attrName,
      preValue: ((comp.getAttributes && comp.getAttributes()) || {})[attrName],
      startLength: stack ? stack.length : 0,
    };
    sessions.set(inputEl, session);
    return session;
  }

  // Collapse one session to a single undo entry. No-op unless the
  // session's entries are a clean tail of the stack (pointer at the
  // end, every entry since session start a change on this
  // component). A round trip (final value equals pre-edit value)
  // removes the entries and adds nothing.
  function commitSession(inputEl) {
    const session = sessions.get(inputEl);
    if (!session) return;
    sessions.delete(inputEl);
    const stack = undoStack();
    if (!stack || !Array.isArray(stack.models)) return;
    const tail = stack.models.slice(session.startLength);
    const pointerAtEnd = typeof stack.pointer !== 'number' || stack.pointer === stack.length - 1;
    let tailClean = true;
    for (const entry of tail) {
      try {
        if (!(entry.get('type') === 'change' && entry.get('object') === session.comp)) { tailClean = false; break; }
      } catch { tailClean = false; break; }
    }
    if (!pointerAtEnd || !tailClean) return;
    for (let i = tail.length - 1; i >= 0; i--) {
      try { stack.remove(tail[i]); } catch { /* keep going */ }
    }
    try { stack.pointer = session.startLength - 1; } catch { /* pointer stays */ }
    let finalValue;
    try { finalValue = ((session.comp.getAttributes && session.comp.getAttributes()) || {})[session.attrName]; } catch { return; }
    if (finalValue !== session.preValue) {
      // Silent restore first: no change event, no undo entry, no
      // canvas re-render, but Backbone records the restored state
      // as _previousAttributes. The full apply that follows then
      // records exactly one undo entry whose before is pre-edit.
      try { session.comp.addAttributes({ [session.attrName]: session.preValue }, { silent: true }); } catch { return; }
      try { session.comp.addAttributes({ [session.attrName]: finalValue }); } catch { /* attribute stays restored */ }
    }
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
    applyTraitInput(editor, target);
  };
  const onChange = (event) => {
    const target = event.target;
    if (!target || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    commitSession(target);
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
  traitsBox.addEventListener('change', onChange);
  return () => {
    traitsBox.removeEventListener('input', onInput);
    traitsBox.removeEventListener('change', onChange);
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
