// Regression test: "Unsaved changes" shown immediately on builder load.
//
// Root cause (verified in the installed grapesjs 0.23.8 source,
// node_modules/grapesjs/dist/grapes.mjs): EditorModel.handleUpdates
// debounces every change into a setTimeout(..., 0) that executes
// changesCount = current + 1, while editor.clearDirtyCount() resets the
// counter synchronously. The builder used to call clearDirtyCount() in
// the same microtask chain right after editor.setComponents(...), so
// the load's own pending increment fired one macrotask later, set the
// counter to 1, and the next 'update' event showed "Unsaved changes"
// before any edit. Selection does not dirty the editor in 0.23.8
// (selection never calls changesUp), it only kept revealing the
// already-positive counter.
//
// Why a fake editor: under jsdom the real editor's event loop starves
// once components render (timers and intervals stop firing after
// setComponents, observed while developing this fix), so the browser's
// event order cannot be reproduced with the real package in this
// harness. The fake below mirrors the verified dist semantics exactly
// (debounced setTimeout increment, synchronous clear), and the tracker
// in src/lib/dirtyTracking.mjs is exercised against it. The live
// behaviour was verified in a real browser before and after the fix.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDirtyTracker } from '../src/lib/dirtyTracking.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Faithful miniature of the GrapesJS 0.23.8 change counter:
// handleUpdates clears any pending timer and schedules a new
// setTimeout(0) that increments the counter when it fires;
// clearDirtyCount resets synchronously.
function createFakeGrapesEditor() {
  let count = 0;
  let timer = null;
  return {
    simulateChange() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { count += 1; }, 0);
    },
    getDirtyCount: () => count,
    clearDirtyCount: () => { count = 0; },
  };
}

function createTracker(editor) {
  const seen = [];
  const tracker = createDirtyTracker(editor, (count) => seen.push(count), {
    tickMs: 2,
    stableReads: 2,
    maxTicks: 100,
  });
  return { tracker, seen, last: () => seen[seen.length - 1] };
}

test('mechanism: a synchronous clear after a change is overwritten by the debounced increment', async () => {
  const editor = createFakeGrapesEditor();
  editor.simulateChange(); // what setComponents does during a page load
  editor.clearDirtyCount(); // the old markClean(): synchronous reset
  assert.equal(editor.getDirtyCount(), 0, 'counter is 0 in the same tick');
  await sleep(20);
  assert.equal(editor.getDirtyCount(), 1, 'the pending debounced increment lands afterwards and re-dirties the editor');
});

test('gate: refresh reports clean while initializing, even when the counter is positive', async () => {
  const editor = createFakeGrapesEditor();
  const { tracker, last } = createTracker(editor);
  editor.simulateChange();
  await sleep(20);
  assert.equal(editor.getDirtyCount(), 1, 'load produced a positive counter');
  tracker.refresh(); // an editor 'update' event during init
  assert.equal(last(), 0, 'label stays clean while initializing');
  assert.equal(tracker.isInitializing(), true);
});

test('finishInitialization waits out the pending increment and ends truly clean', async () => {
  const editor = createFakeGrapesEditor();
  const { tracker, last } = createTracker(editor);
  // Burst of load-time changes, then finishInitialization immediately,
  // while the last debounced increment is still pending.
  editor.simulateChange();
  editor.simulateChange();
  editor.simulateChange();
  await tracker.finishInitialization();
  assert.equal(editor.getDirtyCount(), 0, 'counter reset after settling');
  assert.equal(last(), 0, 'label clean at end of init');
  assert.equal(tracker.isInitializing(), false, 'gate opened');
  await sleep(30);
  assert.equal(editor.getDirtyCount(), 0, 'no late increment re-dirties the editor after init');
});

test('real edits after initialization still mark the page dirty', async () => {
  const editor = createFakeGrapesEditor();
  const { tracker, last } = createTracker(editor);
  editor.simulateChange();
  await tracker.finishInitialization();
  editor.simulateChange(); // a real user edit
  await sleep(20); // debounced increment lands
  tracker.refresh(); // the editor 'update' event
  assert.equal(last(), 1, 'label reports the dirty count after a real edit');
});

test('settleAndMarkClean after a load waits out its pending increment', async () => {
  const editor = createFakeGrapesEditor();
  const { tracker, last } = createTracker(editor);
  await tracker.finishInitialization();
  editor.simulateChange(); // Load page button: setComponents for the new page
  await tracker.settleAndMarkClean();
  assert.equal(editor.getDirtyCount(), 0, 'counter reset once the load settled');
  assert.equal(last(), 0, 'label clean after loading a page');
  await sleep(30);
  assert.equal(editor.getDirtyCount(), 0, 'no late increment after the settled load');
});

test('markClean resets immediately when no change is in flight', async () => {
  const editor = createFakeGrapesEditor();
  const { tracker, last } = createTracker(editor);
  await tracker.finishInitialization();
  editor.simulateChange();
  await sleep(20);
  assert.equal(editor.getDirtyCount(), 1);
  tracker.markClean();
  assert.equal(editor.getDirtyCount(), 0);
  assert.equal(last(), 0);
});
