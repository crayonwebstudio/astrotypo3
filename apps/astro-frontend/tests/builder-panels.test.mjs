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
  assert.equal(byId.get('undo').command, 'core:undo');
  assert.equal(byId.get('redo').command, 'core:redo');
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

test('panels defaults are ordered devices, basic actions, switcher last', () => {
  // The top bar reads left to right: devices, basic actions, then the
  // views switcher at the right end (the page CSS pins the same order
  // with flex order and margin-left auto on the switcher mount point).
  const config = buildPanelsConfig();
  assert.deepEqual(
    config.defaults.map((p) => p.id),
    [PANEL_IDS.top, PANEL_IDS.devices, PANEL_IDS.basicActions, PANEL_IDS.switcher],
  );
});

test('builder page uses the slim bar with the token in a popover', () => {
  const page = readFileSync(new URL('../src/pages/builder.astro', import.meta.url), 'utf8');
  // Slim 52px product bar, token field moved into a toggle popover.
  assert.ok(page.includes('flex: 0 0 52px'), 'app strip is a fixed 52px bar');
  assert.ok(page.includes('id="btn-token"'), 'token toggle button exists');
  assert.ok(page.includes('id="token-popover"'), 'token popover exists');
  // The token input keeps its id and stays in the DOM (inside the
  // popover) so the API client can read it on every write.
  const popoverAt = page.indexOf('id="token-popover"');
  const tokenAt = page.indexOf('id="typo3-token"');
  assert.ok(tokenAt > popoverAt, 'token input lives inside the popover');
  // The long explanatory paragraphs are gone from the always-visible
  // layout (their content survives as the popover note).
  assert.ok(!page.includes('builder-note'), 'no always-visible builder note paragraph');
  assert.ok(!page.includes('app-strip__row'), 'no multi-row header strip');
  // Global (unscoped) trait overrides so JS-created trait DOM is
  // reached: full labels, full width fields.
  assert.ok(page.includes('<style is:global>'), 'global style block present');
  assert.ok(page.includes('.gjs-trt-trait .gjs-label'), 'trait label override present');
});

test('views switcher covers blocks, layers, styles and traits', () => {
  const switcher = panelById(buildPanelsConfig(), PANEL_IDS.switcher);
  assert.deepEqual(switcher.buttons.map((b) => b.id), ['show-blocks', 'show-layers', 'show-styles', 'show-traits']);
  assert.deepEqual(
    switcher.buttons.map((b) => b.command),
    [COMMAND_IDS.showBlocks, COMMAND_IDS.showLayers, COMMAND_IDS.showStyles, COMMAND_IDS.showTraits],
  );
  // Blocks (left column) and Traits (default right view) start active.
  assert.equal(switcher.buttons.find((b) => b.id === 'show-blocks').active, true);
  assert.equal(switcher.buttons.find((b) => b.id === 'show-traits').active, true);
  assert.deepEqual(Object.keys(RIGHT_VIEWS).sort(), ['layers', 'styles', 'traits']);
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
  assert.equal(switcher.buttons.find((b) => b.id === 'show-blocks').context, 'builder-left-view');
  for (const id of ['show-layers', 'show-styles', 'show-traits']) {
    assert.equal(switcher.buttons.find((b) => b.id === id).context, 'builder-right-view');
  }
});
