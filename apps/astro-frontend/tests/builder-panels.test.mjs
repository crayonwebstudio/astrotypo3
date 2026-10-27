// Builder chrome tests: GrapesJS Panels config, block icons, commands.
//
// The builder page used to hand-roll its toolbar and side panels in
// plain HTML. It now uses GrapesJS's own Panels module (top bar with
// devices, basic actions and a views switcher), the standard manager
// containers, and icon tile blocks. These tests pin the pure parts of
// that chrome: the panels config shape from lib/builderPanels.mjs,
// an icon on every registry block from lib/grapesRegistry.mjs, and the
// command registrations that wire panel buttons to editor actions.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildPanelsConfig, registerBuilderCommands, PANEL_IDS, COMMAND_IDS, RIGHT_VIEWS } from '../src/lib/builderPanels.mjs';
import { buildGrapesBlocks } from '../src/lib/grapesRegistry.mjs';
import { iconForComponent, GENERIC_BLOCK_ICON } from '../src/lib/blockIcons.mjs';

const registry = JSON.parse(readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'));

function panelById(config, id) {
  return config.defaults.find((p) => p.id === id);
}
function allButtons(config) {
  return config.defaults.flatMap((p) => p.buttons || []);
}

test('panels config defines the official editor chrome panels', () => {
  const config = buildPanelsConfig();
  assert.ok(Array.isArray(config.defaults));
  assert.equal(panelById(config, PANEL_IDS.top).el, '.panel__top');
  assert.equal(panelById(config, PANEL_IDS.devices).el, '.panel__devices');
  assert.equal(panelById(config, PANEL_IDS.basicActions).el, '.panel__basic-actions');
  assert.equal(panelById(config, PANEL_IDS.switcher).el, '.panel__switcher');
});

test('device buttons use the builder device commands with one active', () => {
  const devices = panelById(buildPanelsConfig(), PANEL_IDS.devices);
  assert.deepEqual(devices.buttons.map((b) => b.id), ['device-desktop', 'device-tablet', 'device-mobile']);
  assert.deepEqual(
    devices.buttons.map((b) => b.command),
    [COMMAND_IDS.deviceDesktop, COMMAND_IDS.deviceTablet, COMMAND_IDS.deviceMobile],
  );
  assert.equal(devices.buttons.filter((b) => b.active).length, 1);
  for (const b of devices.buttons) {
    assert.ok(b.label.includes('<svg'), 'device button has an icon label: ' + b.id);
    assert.ok(b.attributes && b.attributes.title, 'device button has a tooltip: ' + b.id);
  }
});

test('basic actions mix core commands with our save, validate and publish commands', () => {
  const actions = panelById(buildPanelsConfig(), PANEL_IDS.basicActions);
  const byId = new Map(actions.buttons.map((b) => [b.id, b]));
  // Undo/Redo go through momentary wrapper commands (builder-undo /
  // builder-redo) that blur a focused trait input first and then run
  // the core commands; wiring them straight to core:undo/core:redo
  // left the toolbar click fighting the trait input's blur commit
  // in the browser reproduction.
  assert.equal(byId.get('undo').command, 'builder-undo');
  assert.equal(byId.get('redo').command, 'builder-redo');
  assert.equal(byId.get('visibility').command, 'sw-visibility');
  assert.equal(byId.get('preview').command, 'preview');
  assert.equal(byId.get('fullscreen').command, 'fullscreen');
  assert.equal(byId.get('export').command, 'export-template');
  assert.equal(byId.get('save-draft').command, COMMAND_IDS.save);
  assert.equal(byId.get('validate').command, COMMAND_IDS.validate);
  assert.equal(byId.get('publish').command, COMMAND_IDS.publish);
  for (const b of actions.buttons) {
    assert.ok(b.label.includes('<svg'), 'action button has an icon label: ' + b.id);
    assert.ok(b.attributes && b.attributes.title, 'action button has a tooltip: ' + b.id);
  }
});

test('panels defaults order is unchanged; product slot sits between devices and actions in the page', () => {
  // The GrapesJS panels config itself is unchanged (top, devices,
  // basic actions, switcher): the product controls are plain HTML in
  // a .panel__product slot inside the bar, not a GrapesJS panel, so
  // they do not appear in the config. The page CSS pins the full bar
  // reading order: devices, product, basic actions, switcher at the
  // right end (flex order + margin-left auto on the switcher mount).
  const config = buildPanelsConfig();
  assert.deepEqual(
    config.defaults.map((p) => p.id),
    [PANEL_IDS.top, PANEL_IDS.devices, PANEL_IDS.basicActions, PANEL_IDS.switcher],
  );
  const page = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
  const order = ['class="panel__top"', 'class="panel__devices"', 'class="panel__product"', 'class="panel__basic-actions"', 'class="panel__switcher"']
    .map((marker) => page.indexOf(marker));
  assert.ok(order.every((at) => at >= 0), 'all bar slots present in the page');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'bar slots in DOM order devices, product, actions, switcher');
});

test('builder page uses ONE top bar with the product controls inside it', () => {
  const page = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
  // The separate 52px product strip is gone: no app strip element, no
  // fixed 52px bar rule, no header strip.
  assert.ok(!page.includes('app-strip'), 'no separate product strip');
  assert.ok(!page.includes('flex: 0 0 52px'), 'no fixed 52px bar');
  assert.ok(!page.includes('<header'), 'no header strip element');
  // Every product control keeps its id and lives inside the product
  // slot, between the devices mount and the basic actions mount.
  const productAt = page.indexOf('class="panel__product"');
  const actionsAt = page.indexOf('class="panel__basic-actions"');
  for (const id of ['page-title', 'page-slug', 'btn-load', 'btn-local-draft', 'btn-reset', 'btn-token', 'token-popover', 'typo3-token', 'status', 'unsaved']) {
    const at = page.indexOf('id="' + id + '"');
    assert.ok(at > productAt && at < actionsAt, 'control inside the product slot: ' + id);
  }
  // The token input keeps its id and stays in the DOM (inside the
  // popover) so the API client can read it on every write.
  const popoverAt = page.indexOf('id="token-popover"');
  const tokenAt = page.indexOf('id="typo3-token"');
  assert.ok(tokenAt > popoverAt, 'token input lives inside the popover');
  // The long explanatory paragraphs are gone from the always-visible
  // layout (their content survives as the popover note).
  assert.ok(!page.includes('builder-note'), 'no always-visible builder note paragraph');
  // Global (unscoped) trait overrides so JS-created trait DOM is
  // reached: full labels, full width fields.
  assert.ok(page.includes('<style is:global>'), 'global style block present');
  assert.ok(page.includes('.gjs-trt-trait .gjs-label'), 'trait label override present');
});

test('builder page arrangement matches the demo: layers left, blocks right by default', () => {
  const page = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
  const leftAt = page.indexOf('id="panel-left"');
  const canvasAt = page.indexOf('id="gjs"');
  const rightAt = page.indexOf('class="panel__right"');
  // Layers mount lives in the left column, before the canvas.
  const layersAt = page.indexOf('id="layers"');
  assert.ok(layersAt > leftAt && layersAt < canvasAt, 'layers mount in the left column');
  // Blocks mount lives in the right column, inside the blocks view.
  const blocksViewAt = page.indexOf('id="view-blocks"');
  const blocksAt = page.indexOf('id="blocks"');
  assert.ok(blocksViewAt > rightAt && blocksAt > blocksViewAt, 'blocks mount inside the right blocks view');
  // Blocks is the default right view; Styles and Traits start hidden.
  assert.ok(page.includes('<div id="view-blocks" class="editor-view">'), 'blocks view visible by default');
  assert.ok(page.includes('<div id="view-styles" class="editor-view" hidden>'), 'styles view hidden by default');
  assert.ok(page.includes('<div id="view-traits" class="editor-view" hidden>'), 'traits view hidden by default');
  // The extra tools sit below Layers in the left column, after the
  // layers mount and before the canvas.
  for (const id of ['extra-net', 'extra-ai']) {
    const at = page.indexOf('id="' + id + '"');
    assert.ok(at > layersAt && at < canvasAt, 'extra tool below layers in the left column: ' + id);
  }
});

test('round 3 page fixes: global panel position reset, token anchor, short status', () => {
  const page = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
  const globalStart = page.indexOf('<style is:global>');
  const globalBlock = page.slice(globalStart, page.indexOf('</style>', globalStart));
  // The panel bar ordering rules must live in the GLOBAL block and
  // must reset the GrapesJS theme's absolute positioning, otherwise
  // flex order never applies (see tests/panel-layout.test.mjs).
  assert.ok(globalBlock.includes('.panel__top'), 'global block carries the panel bar rules');
  assert.ok(globalBlock.includes('position: static'), 'global block resets panel positioning to static');
  assert.ok(globalBlock.includes('margin-left: auto'), 'switcher pushed to the right end in global CSS');
  // The scoped block must NOT carry the panel bar rules any more, so
  // there is one source of truth for them.
  const scopedBlock = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
  assert.ok(!scopedBlock.includes('.panel__switcher'), 'panel bar rules not duplicated in the scoped block');
  // Token popover anchored to its button via a positioned wrapper,
  // right edge aligned to the wrapper (button), not the strip.
  assert.ok(page.includes('class="token-anchor"'), 'token anchor wrapper exists');
  assert.ok(page.indexOf('id="btn-token"') > page.indexOf('class="token-anchor"'), 'token button inside the anchor wrapper');
  assert.ok(!page.includes('right: 0.6rem'), 'popover no longer anchored to the strip edge');
  // Ready status text is short (the long form survives as the title
  // detail), so the slim bar does not ellipsis it mid-URL.
  assert.ok(page.includes("'Builder ready. Storage: live TYPO3.'"), 'short live ready status');
  assert.ok(page.includes("'Builder ready. Storage: demo API.'"), 'short demo ready status');
});

test('views switcher covers blocks, layers, styles and traits', () => {
  const switcher = panelById(buildPanelsConfig(), PANEL_IDS.switcher);
  assert.deepEqual(switcher.buttons.map((b) => b.id), ['show-blocks', 'show-layers', 'show-styles', 'show-traits']);
  assert.deepEqual(
    switcher.buttons.map((b) => b.command),
    [COMMAND_IDS.showBlocks, COMMAND_IDS.showLayers, COMMAND_IDS.showStyles, COMMAND_IDS.showTraits],
  );
  // Demo arrangement: Layers (left column) and Blocks (default right
  // view) start active. Styles and Traits start inactive; the old
  // arrangement had Traits as the default right view instead.
  assert.equal(switcher.buttons.find((b) => b.id === 'show-blocks').active, true);
  assert.equal(switcher.buttons.find((b) => b.id === 'show-layers').active, true);
  assert.equal(switcher.buttons.find((b) => b.id === 'show-styles').active, undefined);
  assert.equal(switcher.buttons.find((b) => b.id === 'show-traits').active, undefined);
  assert.deepEqual(Object.keys(RIGHT_VIEWS).sort(), ['blocks', 'styles', 'traits']);
});

test('every registry component block carries an SVG icon as its media', () => {
  const blocks = buildGrapesBlocks(registry);
  assert.equal(blocks.length, 15);
  for (const block of blocks) {
    assert.equal(typeof block.media, 'string', 'media for ' + block.id);
    assert.ok(block.media.includes('<svg'), 'media is an inline SVG for ' + block.id);
    assert.equal(block.media, iconForComponent(block.id));
  }
  // Known components have dedicated icons, unknown ids get the generic one.
  assert.notEqual(iconForComponent('section.hero'), GENERIC_BLOCK_ICON);
  assert.equal(iconForComponent('custom.unknown-thing'), GENERIC_BLOCK_ICON);
});

test('registerBuilderCommands wires devices and page actions on a fake editor', () => {
  const added = new Map();
  const calls = [];
  const fakeEditor = {
    Commands: { add: (id, cmd) => added.set(id, cmd) },
    Panels: { getPanel: () => null, getButton: () => null },
    setDevice: (name) => calls.push(['setDevice', name]),
  };
  const handlers = {
    onSave: () => calls.push(['save']),
    onValidate: () => calls.push(['validate']),
    onPublish: () => calls.push(['publish']),
  };
  registerBuilderCommands(fakeEditor, handlers);

  for (const id of Object.values(COMMAND_IDS)) {
    assert.ok(added.has(id), 'command registered: ' + id);
  }
  added.get(COMMAND_IDS.deviceTablet).run(fakeEditor);
  added.get(COMMAND_IDS.deviceMobile).run(fakeEditor);
  added.get(COMMAND_IDS.save).run(fakeEditor);
  added.get(COMMAND_IDS.validate).run(fakeEditor);
  added.get(COMMAND_IDS.publish).run(fakeEditor);
  assert.deepEqual(calls, [
    ['setDevice', 'Tablet'],
    ['setDevice', 'Mobile'],
    ['save'],
    ['validate'],
    ['publish'],
  ]);
});

test('toggle commands define stop, momentary actions do not', () => {
  // GrapesJS treats a command without a stop method as momentary: its
  // panel button does not stay active. Devices and views must stay
  // active (they are state toggles driven by run/stop), while Save,
  // Validate and Publish are one-shot actions.
  const added = new Map();
  const fakeEditor = {
    Commands: { add: (id, cmd) => added.set(id, cmd) },
    Panels: { getPanel: () => null, getButton: () => null },
    setDevice: () => {},
  };
  registerBuilderCommands(fakeEditor, {});
  for (const id of [
    COMMAND_IDS.deviceDesktop, COMMAND_IDS.deviceTablet, COMMAND_IDS.deviceMobile,
    COMMAND_IDS.showBlocks, COMMAND_IDS.showLayers, COMMAND_IDS.showStyles, COMMAND_IDS.showTraits,
  ]) {
    assert.equal(typeof added.get(id).stop, 'function', 'toggle command has stop: ' + id);
  }
  for (const id of [COMMAND_IDS.save, COMMAND_IDS.validate, COMMAND_IDS.publish]) {
    assert.equal(added.get(id).stop, undefined, 'momentary action has no stop: ' + id);
  }
  // Device and view groups share a context each, so the Panels
  // machinery keeps exactly one button active per group.
  const config = buildPanelsConfig();
  const devices = config.defaults.find((p) => p.id === PANEL_IDS.devices);
  assert.ok(devices.buttons.every((b) => b.context === 'builder-device'));
  const switcher = config.defaults.find((p) => p.id === PANEL_IDS.switcher);
  // Demo arrangement: the left column toggle is Layers, the right
  // column toggles are Blocks, Styles and Traits (the old arrangement
  // had Blocks on the left and Layers on the right).
  assert.equal(switcher.buttons.find((b) => b.id === 'show-layers').context, 'builder-left-view');
  for (const id of ['show-blocks', 'show-styles', 'show-traits']) {
    assert.equal(switcher.buttons.find((b) => b.id === id).context, 'builder-right-view');
  }
});

test('view toggle commands show and hide their own view (run/stop contract)', () => {
  // The page relies on this contract: a view command's run shows its
  // view, its stop hides it again, and the Panels machinery calls stop
  // on the previously active button when a sibling in the same context
  // group is activated. Exercised against a real DOM so a regression
  // in the selector wiring (left panel vs right views) is caught.
  const dom = new JSDOM(`<!doctype html><body>
    <aside id="panel-left"></aside>
    <div id="view-blocks"></div>
    <div id="view-styles" hidden></div>
    <div id="view-traits" hidden></div>
  </body>`);
  const prevDocument = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const added = new Map();
    const fakeEditor = { Commands: { add: (id, cmd) => added.set(id, cmd) }, setDevice: () => {} };
    registerBuilderCommands(fakeEditor, {});
    const view = (id) => dom.window.document.querySelector(id);
    // Right views: run shows, stop hides.
    added.get(COMMAND_IDS.showStyles).run();
    assert.equal(view('#view-styles').hidden, false, 'styles shown by run');
    added.get(COMMAND_IDS.showStyles).stop();
    assert.equal(view('#view-styles').hidden, true, 'styles hidden by stop');
    // Switching right views: activating Styles stops Blocks.
    added.get(COMMAND_IDS.showBlocks).run();
    assert.equal(view('#view-blocks').hidden, false, 'blocks shown by run');
    added.get(COMMAND_IDS.showBlocks).stop();
    assert.equal(view('#view-blocks').hidden, true, 'blocks hidden by stop');
    // Left column: Layers toggles the whole left panel.
    added.get(COMMAND_IDS.showLayers).stop();
    assert.equal(view('#panel-left').hidden, true, 'left panel hidden by layers stop');
    added.get(COMMAND_IDS.showLayers).run();
    assert.equal(view('#panel-left').hidden, false, 'left panel shown by layers run');
  } finally {
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
  }
});
