// Element types: the two-way mapping between builder component types and
// TYPO3 core content elements (CType records in tt_content).
//
//   builder component type id  ==  registry component id, e.g. "section.hero"
//   TYPO3 CType                ==  "astro_builder_" + id with dots and dashes
//                                  replaced by underscores, e.g.
//                                  "astro_builder_section_hero"
//
// The 15 registry components are the core element types (source: "core").
// New types created through POST /api/v1/element-types are source: "custom"
// and, in production, are registered by the TYPO3 extension
// (ElementTypeRegistry) as real CTypes backed by the
// tx_astrobuilder_element_type table. This module is pure logic: the Astro
// API route, the builder page and the tests all use it.

export const ALLOWED_FIELD_TYPES = ['string', 'text', 'richtext', 'number', 'boolean', 'enum', 'image', 'link', 'array'];

// Field types are the API vocabulary. Registry props use a slightly
// different vocabulary (string for everything text-like), so map both ways.
const FIELD_TO_PROP_TYPE = { string: 'string', text: 'string', richtext: 'string', image: 'string', link: 'string', number: 'number', boolean: 'boolean', enum: 'enum', array: 'array' };
const PROP_TO_FIELD_TYPE = { string: 'string', number: 'number', boolean: 'boolean', enum: 'enum', array: 'array', object: 'array' };

export const ELEMENT_TYPE_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
export const FIELD_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
export const CATEGORY_PATTERN = /^[a-z][a-z0-9-]*$/;

export function ctypeFor(componentId) {
  return 'astro_builder_' + String(componentId).replace(/[.-]/g, '_');
}

export function fieldTypeToPropType(fieldType) {
  return FIELD_TO_PROP_TYPE[fieldType] || 'string';
}

function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

/** Map the shared component registry to core element types. */
export function registryToElementTypes(registry) {
  return (registry.components || []).map((c) => ({
    id: c.id,
    ctype: ctypeFor(c.id),
    label: c.label,
    category: c.category || 'content',
    description: c.description || '',
    fields: Object.entries(c.props || {}).map(([name, spec]) => {
      const field = {
        name,
        type: PROP_TO_FIELD_TYPE[spec.type] || 'string',
        required: Boolean(spec.required),
        default: spec.default !== undefined ? clone(spec.default) : null,
      };
      if (spec.type === 'enum' && Array.isArray(spec.values)) field.values = [...spec.values];
      return field;
    }),
    source: 'core',
  }));
}

/** Normalize one raw field definition, or return null when unusable. */
export function normalizeField(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const type = typeof raw.type === 'string' ? raw.type : '';
  if (!FIELD_NAME_PATTERN.test(name) || !ALLOWED_FIELD_TYPES.includes(type)) return null;
  const field = { name, type, required: Boolean(raw.required), default: raw.default !== undefined ? clone(raw.default) :
 (type === 'array' ? [] : type === 'boolean' ? false : '') };
  if (type === 'enum') field.values = Array.isArray(raw.values) ? raw.values.map((v) => String(v)) : [];
  return field;
}

/**
 * Validate a create element type payload. existingIds is a list of ids that
 * are already taken (core plus previously created custom types).
 * Returns { valid, errors } with field level messages.
 */
export function validateElementTypeInput(input, existingIds = []) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['body: must be an object'] };
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!id) errors.push('id: required');
  else if (!ELEMENT_TYPE_ID_PATTERN.test(id)) errors.push('id: must be a dotted lowercase id like "custom.pricing-table"');
  else if (existingIds.includes(id)) errors.push('id: an element type with this id already exists');
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label) errors.push('label: required');
  else if (label.length > 120) errors.push('label: must be 120 characters or fewer');
  const category = input.category === undefined || input.category === '' ? 'custom' : String(input.category).trim();
  if (!CATEGORY_PATTERN.test(category)) errors.push('category: must be lowercase letters, digits and dashes');
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    errors.push('fields: a non-empty array of fields is required');
  } else {
    if (input.fields.length > 20) errors.push('fields: at most 20 fields are allowed');
    const seen = new Set();
    input.fields.forEach((raw, i) => {
      const path = 'fields[' + i + ']';
      if (!raw || typeof raw !== 'object') { errors.push(path + ': must be an object'); return; }
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!FIELD_NAME_PATTERN.test(name)) errors.push(path + '.name: must start with a lowercase letter and contain only letters and digits');
      else if (seen.has(name)) errors.push(path + '.name: duplicate field name ' + name);
      else seen.add(name);
      if (!ALLOWED_FIELD_TYPES.includes(raw.type)) errors.push(path + '.type: must be one of ' + ALLOWED_FIELD_TYPES.join(', '));
      if (raw.type === 'enum' && (!Array.isArray(raw.values) || raw.values.length === 0 || raw.values.some((v) => typeof v !== 'string' || v === ''))) {
        errors.push(path + '.values: enum fields need a non-empty values array of strings');
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

/** Validate and build the stored element type record. */
export function createElementType(input, existingIds = []) {
  const check = validateElementTypeInput(input, existingIds);
  if (!check.valid) return { valid: false, errors: check.errors, type: null };
  const type = {
    id: input.id.trim(),
    ctype: ctypeFor(input.id.trim()),
    label: input.label.trim(),
    category: input.category === undefined || input.category === '' ? 'custom' : String(input.category).trim(),
    description: typeof input.description === 'string' ? input.description : '',
    fields: input.fields.map((f) => normalizeField(f)).filter(Boolean),
    source: 'custom',
  };
  return { valid: true, errors: [], type };
}

/** Merge type lists by id. Later lists win (API types over bundled core). */
export function mergeElementTypes(...lists) {
  const byId = new Map();
  for (const list of lists) for (const t of list || []) if (t && t.id) byId.set(t.id, t);
  return [...byId.values()];
}

/**
 * Convert an element type (core or custom) back into a registry shaped
 * component definition, so the builder, validator and AI layer can treat
 * API-created types exactly like the 15 core components.
 */
export function elementTypeToRegistryComponent(type) {
  const props = {};
  for (const field of type.fields || []) {
    const spec = { type: fieldTypeToPropType(field.type) };
    if (field.required) spec.required = true;
    if (field.default !== undefined && field.default !== null) spec.default = clone(field.default);
    else if (field.type === 'array') spec.default = [];
    if (field.type === 'enum' && Array.isArray(field.values)) spec.values = [...field.values];
    props[field.name] = spec;
  }
  return {
    id: type.id,
    version: '1.0.0',
    category: type.category || 'custom',
    label: type.label,
    description: type.description || 'Element type registered through the element types API. Maps to TYPO3 CType ' + (type.ctype || ctypeFor(type.id)) + '.',
    props,
    ctype: type.ctype || ctypeFor(type.id),
    source: type.source || 'custom',
  };
}
