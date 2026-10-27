import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!doctype html><html><body>
  <div id="gjs"></div><div id="blocks"></div><div id="layers"></div>
  <div class="panel__top"><div class="panel__devices"></div><div class="panel__basic-actions"></div><div class="panel__switcher"></div></div>
  <div id="view-blocks"></div><div id="view-styles" hidden><div id="styles-box"></div></div>
  <div id="view-traits" hidden><div id="traits-box"></div></div>
</body></html>`, { url: 'http://localhost/builder', pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node; globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event; globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const grapesjs = (await import('grapesjs')).default;
const registryLib = await import('./src/lib/grapesRegistry.mjs');
const panelsLib = await import('./src/lib/builderPanels.mjs');
const liveTraits = await import('./src/lib/liveTraits.mjs');
const registry = JSON.parse(readFileSync('./src/data/registry.json', 'utf8'));
const editor = grapesjs.init({ container: '#gjs', fromElement: false, noticeOnUnload: false, storageManager: false,
  blockManager: { appendTo: '#blocks' }, layerManager: { appendTo: '#layers' }, traitManager: { appendTo: '#traits-box' },
  panels: panelsLib.buildPanelsConfig(), plugins: [(ed) => { panelsLib.registerBuilderCommands(ed, {}); }] });
liveTraits.registerTextareaTraitType(editor);
const heroDef = registry.components.find((c) => c.id === 'section.hero');
const typeDesc = registryLib.buildGrapesTypes({ components: [heroDef] })[0];
editor.DomComponents.addType('section.hero', { model: { defaults: { tagName: 'section', traits: typeDesc.traits, attributes: typeDesc.defaults.attributes } },
  view: { render() { this.renderAttributes(); this.el.innerHTML = registryLib.renderElementHtml(heroDef, registryLib.attributesToProps(heroDef, this.model.get('attributes') || {}), ''); return this; } } });
liveTraits.wireLiveTraits(editor, document.getElementById('traits-box'), { getDef: (cid) => registry.components.find((c) => c.id === cid) });
editor.setComponents([{ type: 'section.hero', attributes: { ...registryLib.propsToAttributes(heroDef, { heading: 'Before' }), 'data-astro-element-id': 'el-1' } }]);
const comp = editor.getWrapper().components().at(0);
editor.select(comp);
const input = [...document.getElementById('traits-box').querySelectorAll('input, textarea, select')].find((el) => { const t = liveTraits.findTraitForInput(editor, el); return t && t.getName() === 'data-prop-heading'; });
const um = editor.UndoManager;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('stack after load:', um.getStack().length);
input.focus();
let cur = input.value;
for (const ch of ' TEST') {
  await sleep(5); // separate macrotask per keystroke, like a real browser
  cur += ch; input.value = cur;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
console.log('after typing attr:', JSON.stringify(comp.getAttributes()['data-prop-heading']), 'stack:', um.getStack().length);
input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); input.blur();
const undoEl = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')].find((b) => b.getAttribute('title') === 'Undo');
const redoEl = [...document.querySelector('.panel__basic-actions').querySelectorAll('.gjs-pn-btn')].find((b) => b.getAttribute('title') === 'Redo');
for (let i = 1; i <= 3; i++) {
  undoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  console.log('after undo', i, 'attr:', JSON.stringify(comp.getAttributes()['data-prop-heading']), 'input:', JSON.stringify(input.value));
}
redoEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
console.log('after 1 redo attr:', JSON.stringify(comp.getAttributes()['data-prop-heading']), 'input:', JSON.stringify(input.value));
editor.destroy();
