// Dirty-state tracking for the GrapesJS builder toolbar.
//
// Why this module exists: GrapesJS 0.23.8 counts changes asynchronously.
// EditorModel.handleUpdates (node_modules/grapesjs/dist/grapes.mjs)
// debounces every change into a setTimeout(..., 0) that executes
// changesCount = current + 1, while editor.clearDirtyCount() resets the
// counter synchronously and immediately. The builder loads a page with
// editor.setComponents(...) and used to call clearDirtyCount() right
// afterwards, in the same microtask chain as the load. The debounced
// increment scheduled by setComponents then fired one macrotask later,
// set the counter to 1, and change:changesCount triggered the editor
// 'update' event, so the toolbar showed "Unsaved changes" before the
// user had edited anything (and merely selecting a component kept
// showing it, because the count was already positive; selection itself
// never calls changesUp in 0.23.8 and does not dirty the editor).
//
// The tracker fixes this in two parts:
//   1. Gating: while the builder is initializing, refresh() reports a
//      clean state no matter how the counter moves, because that
//      movement is the load itself, not a user edit.
//   2. Settling: the clean state is only established once the counter
//      has stopped moving across consecutive macrotask reads, which
//      guarantees every debounced increment scheduled during the load
//      has already landed. Only then is the counter cleared for real
//      and the gate opened.
//
// Real edits after initialization still count: they go through the same
// debounced increment and refresh() then reports the live counter.

const waitTick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create a dirty tracker bound to one GrapesJS editor.
 * onChange(count) is called whenever the displayed state should update;
 * count 0 means clean. Options exist for tests: tickMs (settle polling
 * interval), stableReads (consecutive equal reads that count as
 * settled), maxTicks (settle loop cap).
 */
export function createDirtyTracker(editor, onChange, options = {}) {
  const tickMs = options.tickMs ?? 10;
  const stableReadsNeeded = options.stableReads ?? 3;
  const maxTicks = options.maxTicks ?? 200;
  let initializing = true;

  const readCount = () => {
    try { return editor.getDirtyCount() || 0; } catch { return 0; }
  };
  const clearCount = () => { try { editor.clearDirtyCount(); } catch { /* editor gone */ } };

  // Wait until the GrapesJS change counter stops moving, i.e. every
  // debounced increment scheduled so far has fired. Resolves with the
  // last observed count.
  async function waitForCounterToSettle() {
    let last = -1;
    let stable = 0;
    for (let i = 0; i < maxTicks; i++) {
      await waitTick(tickMs);
      const count = readCount();
      if (count === last) {
        stable += 1;
        if (stable >= stableReadsNeeded) return count;
      } else {
        stable = 0;
        last = count;
      }
    }
    return last;
  }

  return {
    isInitializing: () => initializing,

    // Wire to editor.on('update'). While initializing, the counter
    // movement belongs to the load, so the label stays clean.
    refresh() {
      onChange(initializing ? 0 : readCount());
    },

    // Call once, after ALL async initialization steps have completed
    // (element types fetched and registered, page loaded, final
    // setComponents done). Establishes the true clean state and opens
    // the gate so later edits mark the page dirty.
    async finishInitialization() {
      await waitForCounterToSettle();
      clearCount();
      initializing = false;
      onChange(0);
    },

    // For loads and saves after initialization (Load page button, Save
    // draft): those operations also schedule debounced increments (the
    // load's setComponents, the last edit before a save), so wait them
    // out before resetting, exactly like finishInitialization but with
    // the gate already open.
    async settleAndMarkClean() {
      await waitForCounterToSettle();
      clearCount();
      onChange(0);
    },

    // Immediate reset, for callers that know no change is in flight.
    markClean() {
      clearCount();
      onChange(0);
    },
  };
}
