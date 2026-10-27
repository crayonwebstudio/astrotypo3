// Deterministic snapshot history for the builder (27 Oct 2026).
//
// Why this module exists, and why GrapesJS's stock UndoManager is no
// longer the builder's undo: four rounds of patching Backbone.Undo
// magic grouping, collapse entries, and blur ordering each fixed one
// sequence and broke another. Browser-verified failures of the stock
// stack: trait-edit Undo works but Redo after Undo does not restore,
// drag-add Undo does not remove the dragged block, and one Undo
// after a failed Redo wiped the entire canvas (Layers collapsed to
// only the Body wrapper). The wipe has a clear mechanism: the stock
// UndoManager records the page-load component adds on the same stack,
// and a magic Undo can consume that whole load group at once. Stop
// patching it. History is now a list of full editor snapshots plus
// an index, managed by the builder.
//
// Snapshot format: editor.getProjectData(), deep-cloned. Verified
// against the installed GrapesJS 0.23.8 (see tests/history.test.mjs):
// getProjectData returns { dataSources, assets, styles, pages, symbols }
// with the canvas nested as pages[0].frames[0].component, and a
// getProjectData/loadProjectData round trip preserves every contract
// attribute (data-astro-component-id, all data-prop-* attributes,
// data-astro-element-id including temp el-... ids of newly added
// blocks), nested children, component types, and styles (the styles
// array is keyed by internal component id selectors and GrapesJS
// re-keys them to the new component ids on load). Save mapping reads
// only the data-astro-* attributes, so internal ids changing across
// a restore cannot disturb it. No page-serialization fallback was
// needed: project data is lossless for the contract.
//
// Push rules (pushCurrent is idempotent: a snapshot equal to the
// entry at the current index is never appended, so async stragglers
// from a restore or a load can never duplicate an entry):
//   * reset(): baseline only, entries = [current], index = 0. Called
//     on every page load (initial, Load page, local draft, Reset,
//     template apply), so Undo at baseline is a safe no-op and can
//     NEVER wipe the loaded page: there is no load group on the
//     stack at all, because the load IS the baseline entry.
//   * Generic edits (add, remove, move, style edits): pushed from
//     editor events, always coalesced onto one microtask. A drag
//     move is a remove plus an insert in the component collection,
//     so pushing synchronously on component:add/remove would split
//     one move into two entries (Undo once would restore the
//     "removed" intermediate state, not the pre-move state). One
//     scheduled microtask push per tick captures only the settled
//     state, so an add, a remove, and a move each cost exactly one
//     entry. Microtasks run even where timers do not (e.g. jsdom),
//     so this works in tests as well as in a browser. The editor
//     'update' event (debounced change notification, covering
//     StyleManager edits) schedules the same push. While a trait
//     session is open, generic pushes are suppressed: trait
//     sessions push explicitly at commit instead.
//   * Trait sessions: beginTraitSession() (called at the first input
//     of a session) ensures the pre-edit state is present (a no-op
//     push when the last entry already equals it, which is the
//     normal case); commitTraitSession() (called at commit:
//     change/blur/deselect) pushes the post-edit state. One Undo
//     therefore reverts one whole field edit, one Redo restores it.
//     Live trait typing stays preview-only and partial (no entry
//     per keystroke), exactly as before; only the history mechanism
//     changed.
//   * A new edit after Undo truncates the redo tail (standard
//     behaviour): entries past the index are dropped before append.
//   * Entries are capped at MAX_ENTRIES (100); the oldest entry is
//     dropped and the index shifted, so a long session cannot grow
//     the snapshot list without bound.
//
// Undo/Redo: index moves by exactly one, the snapshot at the new
// index is restored with loadProjectData under a restoring guard
// (no push during a restore), then options.onRestore(selectedId)
// runs: the builder re-selects the previously selected component by
// its data-astro-element-id when it still exists, re-expands Layers,
// and refreshes the dirty indicator from the serialization-vs-saved
// snapshot compare. Undo at index 0 and Redo at the last entry do
// nothing at all (return false, no canvas touch, no blank canvas,
// ever). Undo/Redo never touch the stock UndoManager: the toolbar
// buttons and the keyboard shortcuts (see installHistoryKeymaps)
// route here, and core:undo/core:redo are never invoked by the
// builder. The stock manager itself is left running but
// disconnected: its module is load-bearing for component tracking
// registration (Component.__postAdd calls um.add without optional
// chaining), so disabling it risks breaking component registration;
// nothing in the builder reaches it any more.
//
// What history does NOT cover: page metadata (Title/Slug inputs
// change pageMeta, not canvas project data), element-type creation
// (registry, not canvas), the token popover, and the AI panel's
// unapplied plan preview. AI-applied elements ARE covered, because
// applying a plan appends canvas components, which pushes normally.

export const MAX_HISTORY_ENTRIES = 100;

/** Stable JSON stringify: object keys sorted recursively, array order kept. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Create a snapshot history bound to one GrapesJS editor.
 * options: { onRestore(elementId) } called after every restore with
 * the data-astro-element-id that was selected before the restore
 * (or null when nothing was selected). maxEntries caps the list.
 */
export function createHistory(editor, options = {}) {
  const onRestore = typeof options.onRestore === 'function' ? options.onRestore : null;
  const maxEntries = options.maxEntries ?? MAX_HISTORY_ENTRIES;
  let entries = [];
  let index = -1;
  let restoring = false;
  let traitSessionOpen = false;
  let updateScheduled = false;

  function snapshot() {
    try { return clone(editor.getProjectData()); } catch { return null; }
  }

  function selectedElementId() {
    try {
      const selected = editor.getSelected ? editor.getSelected() : null;
      if (!selected || !selected.getAttributes) return null;
      return (selected.getAttributes() || {})['data-astro-element-id'] || null;
    } catch { return null; }
  }

  function pushCurrent() {
    if (restoring) return false;
    const snap = snapshot();
    if (snap === null) return false;
    if (index >= 0 && stableStringify(snap) === stableStringify(entries[index])) return false;
    entries = entries.slice(0, index + 1);
    entries.push(snap);
    index = entries.length - 1;
    while (entries.length > maxEntries) {
      entries.shift();
      index -= 1;
    }
    return true;
  }

  function restoreAt(targetIndex) {
    if (targetIndex < 0 || targetIndex >= entries.length) return false;
    const elementId = selectedElementId();
    restoring = true;
    try {
      editor.loadProjectData(clone(entries[targetIndex]));
      index = targetIndex;
    } catch {
      return false;
    } finally {
      restoring = false;
    }
    if (onRestore) {
      try { onRestore(elementId); } catch { /* restore already landed */ }
    }
    return true;
  }

  // One coalesced push per tick, shared by every event source (see
  // the header: a move is remove plus insert, and must cost one
  // entry, not two). The restoring and trait-session guards are
  // evaluated when the microtask runs, not when the event fires,
  // so a restore's own structure events can never push.
  function schedulePush() {
    if (updateScheduled) return;
    updateScheduled = true;
    queueMicrotask(() => {
      updateScheduled = false;
      if (!restoring && !traitSessionOpen) pushCurrent();
    });
  }

  const listeners = [
    ['component:add', schedulePush],
    ['component:remove', schedulePush],
    ['component:dragend', schedulePush],
    ['update', schedulePush],
  ];

  return {
    /** Baseline only: the current canvas becomes entry 0. */
    reset() {
      const snap = snapshot();
      entries = snap === null ? [] : [snap];
      index = entries.length - 1;
      traitSessionOpen = false;
      return index === 0;
    },

    /** Append the current canvas state, unless it equals the current entry. */
    pushCurrent,

    /** Trait session start: suppress generic pushes, ensure pre-state present. */
    beginTraitSession() {
      traitSessionOpen = true;
      pushCurrent();
    },

    /** Trait session commit: one entry for the whole field edit. */
    commitTraitSession() {
      traitSessionOpen = false;
      pushCurrent();
    },

    undo() {
      if (index <= 0) return false;
      return restoreAt(index - 1);
    },

    redo() {
      if (index < 0 || index >= entries.length - 1) return false;
      return restoreAt(index + 1);
    },

    canUndo: () => index > 0,
    canRedo: () => index >= 0 && index < entries.length - 1,
    get length() { return entries.length; },
    get position() { return index; },
    isRestoring: () => restoring,
    isTraitSessionOpen: () => traitSessionOpen,

    attach() {
      for (const [event, handler] of listeners) {
        try { editor.on(event, handler); } catch { /* event bus gone */ }
      }
    },

    detach() {
      for (const [event, handler] of listeners) {
        try { editor.off(event, handler); } catch { /* already gone */ }
      }
    },
  };
}

/**
 * Reroute the editor keyboard shortcuts from the stock UndoManager to
 * a builder history. GrapesJS 0.23.8 default keymaps (keymaps config):
 *   'core:undo': keys '⌘+z, ctrl+z', handler 'core:undo'
 *   'core:redo': keys '⌘+shift+z, ctrl+shift+z', handler 'core:redo'
 * There is no Ctrl+Y binding in GrapesJS, and none is invented here.
 * The stock keymaps are removed (Keymaps.remove) and replaced with
 * builder keymaps on the same keys whose handlers call history. The
 * stock commands are never invoked by these shortcuts afterwards.
 * Keymaps do not fire while focus sits in a text input (keymaster
 * skips form fields), which matches the old behaviour: while typing
 * in a trait field, the toolbar buttons are the undo path.
 */
export function installHistoryKeymaps(editor, history) {
  if (!editor || !editor.Keymaps || !history) return false;
  try { editor.Keymaps.remove('core:undo'); } catch { /* not registered */ }
  try { editor.Keymaps.remove('core:redo'); } catch { /* not registered */ }
  editor.Keymaps.add('builder-undo-key', '⌘+z, ctrl+z', () => { history.undo(); }, { prevent: true });
  editor.Keymaps.add('builder-redo-key', '⌘+shift+z, ctrl+shift+z', () => { history.redo(); }, { prevent: true });
  return true;
}
