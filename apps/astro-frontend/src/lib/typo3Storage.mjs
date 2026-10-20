// TYPO3 API storage adapter for the GrapesJS builder.
//
// The builder never talks to TYPO3 internals. It reads and writes the
// versioned content contract through HTTP endpoints:
//
//   GET  {base}/api/content/v1/pages/<slug>   published page JSON (load)
//   POST {base}/api/builder/save              validated draft page JSON
//   GET  {base}/api/v1/element-types          element types (CType mapping)
//   POST {base}/api/v1/element-types          create an element type
//
// TYPO3_API_BASE is the single configuration point. Empty string means
// same origin, which is the Astro demo API in this app. Point it at a real
// TYPO3 host (for example "https://typo3.example") and the same builder code
// works against the TYPO3 extension endpoints, no other changes needed. The
// builder page injects window.__ASTRO_BUILDER_CONFIG__ (rendered server
// side from the TYPO3_CONTENT_API_URL environment variable); a manual
// window.__ASTRO_TYPO3_API_BASE override still works as a fallback.
//
// Endpoint shape differs between the two backends for saves only:
//   demo API:  POST {base}/api/builder/save
//   TYPO3 API: POST {base}/api/builder/v1/save  (preview token required)
// Loads and element types use identical paths on both. Writes against the
// TYPO3 API send the editor supplied token as the "x-preview-token" header,
// the header the extension PreviewAuthMiddleware and controllers check.

import { propsToAttributes, attributesToProps } from './grapesRegistry.mjs';

export const TYPO3_API_BASE = '';

function stripTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/$/, '') : '';
}

/**
 * Derive the TYPO3 host base from a TYPO3_CONTENT_API_URL value. That env
 * var points at the content API ("https://host/api/content/v1"); the
 * builder needs the host root because it also calls /api/v1/element-types
 * and /api/builder/v1/save. A value that is already a host root is returned
 * unchanged.
 */
export function typo3HostFromContentApiUrl(url) {
  const trimmed = stripTrailingSlash(url);
  if (!trimmed) return '';
  const suffix = '/api/content/v1';
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
}

/**
 * Resolve the effective API base from the possible configuration sources,
 * in priority order: the injected builder config, the manual window
 * override, then the module constant. Pure and exported for tests.
 */
export function resolveApiBase({ config, override, fallback } = {}) {
  if (config && typeof config.apiBase === 'string' && config.apiBase) return stripTrailingSlash(config.apiBase);
  if (typeof override === 'string' && override) return stripTrailingSlash(override);
  return stripTrailingSlash(typeof fallback === 'string' ? fallback : TYPO3_API_BASE);
}

export function getTypo3ApiBase() {
  if (typeof window !== 'undefined') {
    return resolveApiBase({ config: window.__ASTRO_BUILDER_CONFIG__, override: window.__ASTRO_TYPO3_API_BASE });
  }
  return TYPO3_API_BASE;
}

/**
 * Save endpoint path for a given base. A non-empty base targets a real
 * TYPO3 host, whose builder save endpoint is versioned; the same-origin
 * demo API keeps its original path.
 */
export function builderSavePath(base) {
  return base ? '/api/builder/v1/save' : '/api/builder/save';
}

export function typo3ApiUrl(path, base = '') {
  return (base || '').replace(/\/$/, '') + path;
}

export const DRAFT_LOCALSTORAGE_KEY = 'astrotypo3-builder-draft';

function registryMap(registry) {
  return new Map(((registry && registry.components) || []).map((c) => [c.id, c]));
}

function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

/** One page element to GrapesJS component data (plain object shape). */
export function elementToComponentData(element, registry) {
  const map = registryMap(registry);
  const def = map.get(element.componentId);
  let attributes;
  if (def) {
    attributes = propsToAttributes(def, element.props || {}, element.id);
  } else {
    // Unknown component (no registry entry): keep the full props payload in
    // one JSON attribute so serialization stays lossless even without a def.
    attributes = {
      'data-astro-component-id': element.componentId,
      'data-astro-element-id': element.id,
      'data-astro-props-json': JSON.stringify(element.props || {}),
    };
  }
  const data = { type: element.componentId, attributes };
  if (Array.isArray(element.children) && element.children.length) {
    data.components = element.children.map((child) => elementToComponentData(child, registry));
  }
  return data;
}

/** Page JSON to the GrapesJS component data list for the canvas. */
export function pageToGrapesComponents(page, registry) {
  return ((page && page.elements) || []).map((el) => elementToComponentData(el, registry));
}

/**
 * Normalize component data coming either from pageToGrapesComponents or from
 * a live GrapesJS component (duck typed: getAttributes/components/getId) or
 * from GrapesJS project JSON (plain {type, attributes, components}).
 */
export function normalizeComponentData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let attributes = {};
  let children = [];
  let type = raw.type || '';
  if (typeof raw.getAttributes === 'function') {
    attributes = raw.getAttributes() || {};
    const comps = typeof raw.components === 'function' ? raw.components() : [];
    children = (typeof comps.map === 'function' ? comps.map((c) => c) : [...comps]).map(normalizeComponentData).filter(Boolean);
    type = attributes['data-astro-component-id'] || type;
  } else {
    attributes = raw.attributes || {};
    children = (raw.components || []).map(normalizeComponentData).filter(Boolean);
    type = attributes['data-astro-component-id'] || type;
  }
  if (!type) return null;
  return { type, attributes, components: children };
}

/** GrapesJS component data list back to page elements (inverse mapping). */
export function grapesComponentsToElements(componentDataList, registry) {
  const map = registryMap(registry);
  const toElement = (data) => {
    const normalized = normalizeComponentData(data);
    if (!normalized) return null;
    const componentId = normalized.attributes['data-astro-component-id'] || normalized.type;
    const def = map.get(componentId);
    let props;
    if (def) props = attributesToProps(def, normalized.attributes);
    else if (normalized.attributes['data-astro-props-json']) {
      try { props = JSON.parse(normalized.attributes['data-astro-props-json']); } catch { props = {}; }
    } else props = {};
    const element = {
      id: normalized.attributes['data-astro-element-id'] || ('el-' + componentId.replace(/[^a-z0-9]+/gi, '-') + '-' + Math.random().toString(36).slice(2, 8)),
      componentId,
      props,
    };
    if (normalized.components.length) element.children = normalized.components.map(toElement).filter(Boolean);
    return element;
  };
  return (componentDataList || []).map(toElement).filter(Boolean);
}

/** GrapesJS component data list plus page meta back to a full page JSON. */
export function grapesComponentsToPage(componentDataList, meta = {}, registry) {
  return {
    id: meta.id || 'page-builder',
    slug: meta.slug || 'home',
    title: meta.title || 'Untitled page',
    status: 'draft',
    locale: meta.locale || 'en',
    seo: clone(meta.seo || {}),
    elements: grapesComponentsToElements(componentDataList, registry),
  };
}


/**
 * HTTP client for the TYPO3 content contract. fetchFn and base are
 * injectable for tests and for pointing the builder at a real TYPO3 host.
 * When base is omitted it resolves from the runtime builder config
 * (window.__ASTRO_BUILDER_CONFIG__ / window.__ASTRO_TYPO3_API_BASE).
 * getToken, when provided, is called before every write and its return
 * value is sent as the "x-preview-token" header the TYPO3 extension checks;
 * the token lives only in the editor's memory, never in storage.
 */
export function createTypo3ApiClient({ base, fetchFn, getToken, savePath } = {}) {
  const doFetch = fetchFn || ((...args) => fetch(...args));
  const apiBase = typeof base === 'string' ? stripTrailingSlash(base) : getTypo3ApiBase();
  const effectiveSavePath = typeof savePath === 'string' && savePath ? savePath : builderSavePath(apiBase);
  function tokenHeaders() {
    if (typeof getToken !== 'function') return {};
    let token = '';
    try { token = getToken() || ''; } catch { token = ''; }
    return token ? { 'x-preview-token': token } : {};
  }
  async function request(path, options = {}) {
    const res = await doFetch(typo3ApiUrl(path, apiBase), options);
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { ok: res.ok, status: res.status, body };
  }
  return {
    base: apiBase,
    savePath: effectiveSavePath,
    /** Published page JSON, or null when the API has no such page. */
    async loadPage(slug) {
      const { ok, status, body } = await request('/api/content/v1/pages/' + encodeURIComponent(slug || 'home'));
      if (status === 404) return null;
      if (!ok) throw new Error('Content API load failed with HTTP ' + status + (body && body.error ? ': ' + body.error.message : ''));
      return body;
    },
    /** POST a validated draft page to the builder save endpoint. */
    async storePage(page) {
      const { ok, status, body } = await request(effectiveSavePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...tokenHeaders() },
        body: JSON.stringify({ page }),
      });
      if (!ok) {
        const err = new Error('Save failed with HTTP ' + status + (body && body.error ? ': ' + body.error.message : ''));
        err.status = status;
        err.body = body;
        throw err;
      }
      return body;
    },
    /** Element types from the API: core types plus API-created types. */
    async loadElementTypes() {
      const { ok, status, body } = await request('/api/v1/element-types');
      if (!ok) throw new Error('Element types load failed with HTTP ' + status);
      return (body && body.types) || [];
    },
    /** Create an element type. Resolves with the created type (HTTP 201). */
    async createElementType(payload) {
      const { ok, status, body } = await request('/api/v1/element-types', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...tokenHeaders() },
        body: JSON.stringify(payload),
      });
      if (!ok) {
        const err = new Error('Create element type failed with HTTP ' + status + (body && body.error ? ': ' + body.error.message : ''));
        err.status = status;
        err.body = body;
        throw err;
      }
      return body.type;
    },
  };
}

/** Id of the GrapesJS custom storage type backed by the TYPO3 API. */
export const GRAPES_STORAGE_TYPE_ID = 'typo3-api';

/**
 * GrapesJS custom storage type ("typo3-api") backed by the contract client.
 * state is a live object: { page, meta, registry } that the builder page
 * keeps current. load() converts the held page into canvas components;
 * store() serializes the project data GrapesJS hands over back to page JSON
 * and POSTs it. Autosave stays off: the builder calls editor.store() only
 * from the explicit Save button.
 *
 * The returned object matches the IStorage interface of grapesjs 0.23.8
 * (node_modules/grapesjs/dist/index.d.ts): load(options) and
 * store(data, options), both async.
 */
export function createGrapesStorageType(state, client) {
  return {
    async load() {
      if (!state.page) return {};
      return { components: pageToGrapesComponents(state.page, state.registry) };
    },
    async store(data) {
      let components = (data && data.components) || [];
      // GrapesJS project data should carry our identity attributes, but if
      // its shape ever loses them, fall back to the live component list the
      // builder page provides through state.getComponents.
      if (!grapesComponentsToElements(components, state.registry).length && typeof state.getComponents === 'function') {
        components = state.getComponents();
      }
      const page = grapesComponentsToPage(components, state.meta || {}, state.registry);
      state.page = page;
      return client.storePage(page);
    },
  };
}

/**
 * Register the "typo3-api" storage type on a GrapesJS editor.
 *
 * GrapesJS 0.23.8 registers custom storages with StorageManager.add(type,
 * storage), see the StorageManager class in
 * node_modules/grapesjs/dist/index.d.ts. There is NO addType method on the
 * storage manager (addType exists on DomComponents, TraitManager,
 * AssetManager and StyleManager, which is how the wrong call slipped in).
 * Calling editor.Storage.addType() throws "Storage.addType is not a
 * function" during editor init and the whole builder fails to start.
 * Keep this registration in one exported function so the builder page and
 * the regression test run the exact same code path.
 */
export function registerGrapesStorage(editor, state, client) {
  const storage = createGrapesStorageType(state, client);
  editor.Storage.add(GRAPES_STORAGE_TYPE_ID, storage);
  return storage;
}
