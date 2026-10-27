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
// Undo granularity trade-off, stated plainly: live applies are full
// (non-partial) applies, because GrapesJS skips both the dirty counter
// and the undo stack for partial/avoidStore applies
// (EditorModel.handleUpdates returns early on opt.partial, and the
// UndoManager change handler skips on opts.partial). So each keystroke
// is its own undo step, where the old blur-commit behaviour was one
// step per field edit. Live feedback was judged worth that trade; the
// toolbar Undo button still reverts, one step at a time.
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
 * 'input' applies live. 'change' additionally validates JSON props
 * (array/object specs): typing JSON is noisy mid-keystroke, so the
 * error surfaces on commit (blur/Enter), not while typing.
 */
export function wireLiveTraits(editor, traitsBox, options = {}) {
  if (!editor || !traitsBox) return () => {};
  const { getDef, onJsonError, onJsonClear } = options;
  const onInput = (event) => {
    const target = event.target;
    if (!target || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    applyTraitInput(editor, target);
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
      if (onJsonClear) onJsonClear(propName);
    } catch (err) {
      if (onJsonError) onJsonError(propName, err && err.message ? err.message : String(err));
    }
  };
  traitsBox.addEventListener('input', onInput);
  traitsBox.addEventListener('change', onChange);
  return () => {
    traitsBox.removeEventListener('input', onInput);
    traitsBox.removeEventListener('change', onChange);
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
