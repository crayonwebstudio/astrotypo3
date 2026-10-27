// GrapesJS Panels configuration and builder commands.
//
// The builder page uses GrapesJS's own editor chrome, mirroring the
// official free core webpage-preset demo layout (grapesjs.com/demo.html):
// ONE top panel bar rendered by the Panels module into .panel__top.
// The bar reads left to right: devices, then the product controls
// (plain HTML in a .panel__product slot inside the bar, not a GrapesJS
// panel), then basic actions, then the views switcher at the right
// end. The left column holds Layers (plus the extra tools below it);
// the right column holds Blocks by default, with Style Manager and
// Traits as switchable right views. The page's global CSS turns the
// bar into that flex row (flex order + margin-left auto on the
// switcher). Load bearing detail, diagnosed in round 3: the GrapesJS
// theme styles every panel .gjs-pn-panel as position absolute, which
// takes the mounts out of flow and defeats flex ordering entirely
// (the mounts stack and paint in DOM order, switcher on top, and the
// bar overlays the content below). The page's global CSS therefore
// also resets the mounts to position static; without that reset the
// order rules below are decoration. Nothing here is a hand-rolled
// shell: panels, buttons, active states and tooltips all come from
// editor.Panels and editor.Commands. Only the product controls are
// plain HTML, because they are our TYPO3 page controls, not editor
// commands.
//
// Command ids: device and view switching plus our own actions
// (Save draft, Validate, Publish) are registered by
// registerBuilderCommands below. Visibility, preview, fullscreen, code
// export and undo/redo use GrapesJS core commands ('sw-visibility',
// 'preview', 'fullscreen', 'export-template', 'core:undo', 'core:redo'),
// verified against the installed grapesjs 0.23.8 command registry.
//
// Active state follows the GrapesJS button idiom, which is load bearing:
// ButtonView flips a button's active flag on click and reacts to the
// change: activating a button deactivates the other buttons in its
// context group (their stop methods run) and runs its command, and a
// command WITHOUT a stop method is treated as momentary (the button's
// active flag is cleared again right after the run). So the toggle
// commands below (devices, views) all define run AND stop, share a
// context per group, and never touch button state themselves, while
// momentary actions (Save, Validate, Publish, undo, redo) define run
// only. Setting a button's active flag from command code would re-enter
// this machinery and undo itself; do not do it.
//
// buildPanelsConfig is pure data so tests can assert the shape without
// a DOM or an editor instance.

function svgIcon(inner, size = 18) {
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">' + inner + '</svg>';
}

const ICONS = {
  desktop: svgIcon('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9.5 20h5"/><path d="M12 16.5V20"/>'),
  tablet: svgIcon('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M10.5 17.5h3"/>'),
  mobile: svgIcon('<rect x="7.5" y="2.5" width="9" height="19" rx="2"/><path d="M10.5 18h3"/>'),
  undo: svgIcon('<path d="M8.5 6 5 9.5 8.5 13"/><path d="M5 9.5h9a5 5 0 0 1 0 10h-3.5"/>'),
  redo: svgIcon('<path d="m15.5 6 3.5 3.5L15.5 13"/><path d="M19 9.5h-9a5 5 0 0 0 0 10h3.5"/>'),
  borders: svgIcon('<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3.5 3"/><rect x="8.5" y="8.5" width="7" height="7" rx="0.5"/>'),
  preview: svgIcon('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  fullscreen: svgIcon('<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>'),
  code: svgIcon('<path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/>'),
  save: svgIcon('<path d="M5 3.5h11L20.5 8v12a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M8 3.5v5h7.5v-5"/><rect x="8" y="13.5" width="8" height="7"/>'),
  validate: svgIcon('<circle cx="11" cy="11" r="6.5"/><path d="m8.2 11.2 2 2 3.6-4"/><path d="m16 16 4.5 4.5"/>'),
  publish: svgIcon('<path d="M12 15.5v-11"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M4.5 20h15"/>'),
  blocks: svgIcon('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  layers: svgIcon('<path d="m12 3.5 9.5 5L12 13.5 2.5 8.5z"/><path d="m4.8 13.2 7.2 3.8 7.2-3.8"/><path d="m4.8 17 7.2 3.8L19.2 17"/>'),
  styles: svgIcon('<path d="M5 20.5a2.25 2.25 0 0 0 2.25-2.25c0-1.6-2.25-2.1-2.25-3.75V6.6L15.4 3.4a2.12 2.12 0 0 1 2.7 2.7L14.9 16.5H8.5c-1.65 0-2.15 2.25-3.75 2.25z" transform="translate(1.5 0) scale(0.92)"/>'),
  traits: svgIcon('<path d="M5 7h9"/><path d="M18 7h1"/><circle cx="16" cy="7" r="2"/><path d="M5 12h3"/><path d="M12 12h7"/><circle cx="10" cy="12" r="2"/><path d="M5 17h11"/><path d="M20 17h-1"/><circle cx="18" cy="17" r="2"/>'),
};

export const PANEL_IDS = {
  top: 'panel-top',
  devices: 'panel-devices',
  basicActions: 'basic-actions',
  switcher: 'panel-switcher',
};

export const COMMAND_IDS = {
  deviceDesktop: 'builder-device-desktop',
  deviceTablet: 'builder-device-tablet',
  deviceMobile: 'builder-device-mobile',
  showBlocks: 'builder-show-blocks',
  showLayers: 'builder-show-layers',
  showStyles: 'builder-show-styles',
  showTraits: 'builder-show-traits',
  save: 'builder-save-draft',
  validate: 'builder-validate',
  publish: 'builder-publish',
  undo: 'builder-undo',
  redo: 'builder-redo',
};

/** Panels config object for grapesjs.init ({ panels: buildPanelsConfig() }). */
export function buildPanelsConfig() {
  return {
    defaults: [
      { id: PANEL_IDS.top, el: '.panel__top' },
      {
        id: PANEL_IDS.devices,
        el: '.panel__devices',
        buttons: [
          { id: 'device-desktop', label: ICONS.desktop, command: COMMAND_IDS.deviceDesktop, context: 'builder-device', active: true, togglable: false, attributes: { title: 'Desktop' } },
          { id: 'device-tablet', label: ICONS.tablet, command: COMMAND_IDS.deviceTablet, context: 'builder-device', togglable: false, attributes: { title: 'Tablet' } },
          { id: 'device-mobile', label: ICONS.mobile, command: COMMAND_IDS.deviceMobile, context: 'builder-device', togglable: false, attributes: { title: 'Mobile' } },
        ],
      },
      {
        id: PANEL_IDS.basicActions,
        el: '.panel__basic-actions',
        buttons: [
          { id: 'undo', label: ICONS.undo, command: COMMAND_IDS.undo, attributes: { title: 'Undo' } },
          { id: 'redo', label: ICONS.redo, command: COMMAND_IDS.redo, attributes: { title: 'Redo' } },
          { id: 'visibility', label: ICONS.borders, command: 'sw-visibility', active: true, attributes: { title: 'View components (outlines)' } },
          { id: 'preview', label: ICONS.preview, command: 'preview', attributes: { title: 'Preview' } },
          { id: 'fullscreen', label: ICONS.fullscreen, command: 'fullscreen', attributes: { title: 'Fullscreen' } },
          { id: 'export', label: ICONS.code, command: 'export-template', attributes: { title: 'View code (HTML export)' } },
          { id: 'save-draft', label: ICONS.save, command: COMMAND_IDS.save, attributes: { title: 'Save draft' } },
          { id: 'validate', label: ICONS.validate, command: COMMAND_IDS.validate, attributes: { title: 'Validate page' } },
          { id: 'publish', label: ICONS.publish, command: COMMAND_IDS.publish, attributes: { title: 'Publish' } },
        ],
      },
      {
        id: PANEL_IDS.switcher,
        el: '.panel__switcher',
        resizable: false,
        buttons: [
          { id: 'show-blocks', label: ICONS.blocks, command: COMMAND_IDS.showBlocks, context: 'builder-right-view', active: true, attributes: { title: 'Blocks panel' } },
          { id: 'show-layers', label: ICONS.layers, command: COMMAND_IDS.showLayers, context: 'builder-left-view', active: true, attributes: { title: 'Layers' } },
          { id: 'show-styles', label: ICONS.styles, command: COMMAND_IDS.showStyles, context: 'builder-right-view', attributes: { title: 'Style manager' } },
          { id: 'show-traits', label: ICONS.traits, command: COMMAND_IDS.showTraits, context: 'builder-right-view', attributes: { title: 'Traits (element fields)' } },
        ],
      },
    ],
  };
}

// Right column views, keyed by the switcher button that opens them.
// Blocks is the default right view; Layers lives in the left column
// and is toggled independently, so hiding it never disturbs the right
// side view that is open.
export const RIGHT_VIEWS = {
  blocks: '#view-blocks',
  styles: '#view-styles',
  traits: '#view-traits',
};
export const LEFT_PANEL_SELECTOR = '#panel-left';

function queryEl(selector) {
  return typeof document !== 'undefined' ? document.querySelector(selector) : null;
}

function setViewVisible(selector, visible) {
  const el = queryEl(selector);
  if (el) el.hidden = !visible;
}

/**
 * Register the builder commands referenced by buildPanelsConfig.
 * handlers: { onSave, onValidate, onPublish } page level actions.
 *
 * Toggle commands (devices, views) define run and stop and leave all
 * button state to the Panels machinery (see the header comment): run
 * applies the state, stop reverts it when the button is deactivated,
 * either by clicking it again or by a sibling in its context group
 * being activated. Momentary actions define run only.
 */
export function registerBuilderCommands(editor, handlers = {}) {
  const device = (name) => ({
    run(ed) { ed.setDevice(name); },
    // Deactivating a device button (a sibling took over) must not
    // change the device itself; the new button's run already did.
    stop() {},
  });
  editor.Commands.add(COMMAND_IDS.deviceDesktop, device('Desktop'));
  editor.Commands.add(COMMAND_IDS.deviceTablet, device('Tablet'));
  editor.Commands.add(COMMAND_IDS.deviceMobile, device('Mobile'));

  editor.Commands.add(COMMAND_IDS.showLayers, {
    run() { setViewVisible(LEFT_PANEL_SELECTOR, true); },
    stop() { setViewVisible(LEFT_PANEL_SELECTOR, false); },
  });
  const rightView = (selector) => ({
    run() { setViewVisible(selector, true); },
    stop() { setViewVisible(selector, false); },
  });
  editor.Commands.add(COMMAND_IDS.showBlocks, rightView(RIGHT_VIEWS.blocks));
  editor.Commands.add(COMMAND_IDS.showStyles, rightView(RIGHT_VIEWS.styles));
  editor.Commands.add(COMMAND_IDS.showTraits, rightView(RIGHT_VIEWS.traits));

  editor.Commands.add(COMMAND_IDS.save, { run() { if (handlers.onSave) handlers.onSave(); } });
  editor.Commands.add(COMMAND_IDS.validate, { run() { if (handlers.onValidate) handlers.onValidate(); } });
  editor.Commands.add(COMMAND_IDS.publish, { run() { if (handlers.onPublish) handlers.onPublish(); } });

  // Undo as a momentary custom command wrapping the core command,
  // instead of wiring the button straight to 'core:undo'. The
  // browser reproduction behind this: after a trait edit, the
  // toolbar Undo click produced no visible change while keyboard
  // Ctrl+Z after clicking the canvas did undo. The button path itself
  // reproduces fine in jsdom (see tests/live-traits.test.mjs), so the
  // browser difference is focus: a click on the toolbar first blurs a
  // focused trait input, and a pending (pre-live-traits) edit commits
  // on that blur in the same interaction as the undo. Blurring first
  // makes the order explicit (commit, then undo) instead of leaving
  // it to mousedown/click ordering, and with live traits the blur is
  // a no-op because every keystroke is already applied. Run only, so
  // the button stays momentary like Save/Validate/Publish.
  //
  // Redo deliberately does NOT blur first (27 Oct 2026). A blur
  // before redo can only hurt: if the focused trait input holds a
  // value that differs from the component attribute (a stale resync,
  // or invalid JSON text that live validation refused to apply), the
  // blur's change commit applies that value as a NEW undo entry, and
  // Backbone.Undo discards the whole redo tail (entries after the
  // pointer) when a new entry is added, so the entry Redo was about
  // to restore is gone before core:redo runs. Redo has no
  // commit-then-redo ordering need: live applies are already applied
  // on every keystroke, and an open edit session already puts the
  // pointer at the stack end, where redo is a no-op either way.
  // So Redo runs core:redo directly, and a focused input keeps its
  // value untouched by the click.
  const blurTraitInput = () => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    const traitsBox = document.getElementById('traits-box');
    if (active && traitsBox && traitsBox.contains(active)) active.blur();
  };
  editor.Commands.add(COMMAND_IDS.undo, { run(ed) { blurTraitInput(); ed.runCommand('core:undo'); } });
  editor.Commands.add(COMMAND_IDS.redo, { run(ed) { ed.runCommand('core:redo'); } });
  return editor;
}
