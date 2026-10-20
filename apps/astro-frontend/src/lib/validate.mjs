// Shared validator, plain ESM, no dependencies.
// Used by the Astro app, the API endpoints and the test suite.
// The TYPO3 PHP ValidationService mirrors this logic.

export const ALLOWED_OPS = [
  "create_page","update_page_metadata","add_element","update_element_props",
  "move_element","duplicate_element","remove_element","apply_section_template",
  "apply_page_template","suggest_seo","generate_image_request"
];
// Operations that are never allowed through an AI change plan.
export const FORBIDDEN_OPS = ["publish_page","delete_page","change_permissions","execute_code","run_sql"];

function typeOk(value, type) {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "enum") return typeof value === "string";
  return true;
}

export function getComponent(registry, id) {
  return (registry.components || []).find((c) => c.id === id) || null;
}

export function validateElement(element, registry, path = "element") {
  const errors = [];
  if (!element || typeof element !== "object") return [`${path}: must be an object`];
  if (!element.id || typeof element.id !== "string") errors.push(`${path}: id is required`);
  const def = getComponent(registry, element.componentId);
  if (!def) { errors.push(`${path}: unknown componentId ${String(element.componentId)}`); return errors; }
  const props = element.props || {};
  for (const [key, spec] of Object.entries(def.props || {})) {
    const val = props[key];
    if (val === undefined) {
      if (spec.required) errors.push(`${path}.props.${key}: required prop missing`);
      continue;
    }
    if (spec.type === "enum") {
      if (!spec.values || !spec.values.includes(val)) errors.push(`${path}.props.${key}: must be one of ${(spec.values||[]).join(", ")}`);
      continue;
    }
    if (!typeOk(val, spec.type)) errors.push(`${path}.props.${key}: expected ${spec.type}`);
  }
  for (const key of Object.keys(props)) {
    if (!(key in (def.props || {}))) errors.push(`${path}.props.${key}: unknown prop for ${def.id}`);
  }
  if (element.children !== undefined) {
    if (!Array.isArray(element.children)) errors.push(`${path}.children: must be an array`);
    else {
      const allowed = def.childrenAllowed || [];
      element.children.forEach((child, i) => {
        if (allowed.length && child && !allowed.includes(child.componentId)) {
          errors.push(`${path}.children[${i}]: ${child.componentId} is not allowed inside ${def.id}`);
        }
        errors.push(...validateElement(child, registry, `${path}.children[${i}]`));
      });
    }
  }
  return errors;
}

export function validatePage(page, registry) {
  const errors = [];
  if (!page || typeof page !== "object") return { valid: false, errors: ["page: must be an object"] };
  for (const f of ["id","slug","title","status"]) if (!page[f]) errors.push(`page.${f}: required`);
  if (page.status && !["published","draft"].includes(page.status)) errors.push("page.status: must be published or draft");
  if (!Array.isArray(page.elements)) errors.push("page.elements: must be an array");
  else page.elements.forEach((el, i) => errors.push(...validateElement(el, registry, `elements[${i}]`)));
  return { valid: errors.length === 0, errors };
}

export function validateTemplateSet(templates, registry) {
  const errors = [];
  const checkElements = (elements, path) => (elements||[]).forEach((el,i)=> errors.push(...validateElement(el, registry, `${path}[${i}]`)));
  (templates.elementPresets||[]).forEach((t,i)=> { if(!t.id||!t.element) errors.push(`elementPresets[${i}]: id and element required`); else checkElements([t.element], `elementPresets[${i}].element`); });
  (templates.sectionTemplates||[]).forEach((t,i)=> checkElements(t.elements, `sectionTemplates[${i}].elements`));
  (templates.pageTemplates||[]).forEach((t,i)=> checkElements(t.elements, `pageTemplates[${i}].elements`));
  const pageIds = new Set((templates.pageTemplates||[]).map((t)=>t.id));
  (templates.siteTemplates||[]).forEach((t,i)=> (t.pages||[]).forEach((pid)=> { if(!pageIds.has(pid)) errors.push(`siteTemplates[${i}]: unknown page template ${pid}`); }));
  return { valid: errors.length === 0, errors };
}

export function validateChangePlan(plan, registry, options = {}) {
  const errors = [];
  if (!plan || !Array.isArray(plan.operations)) return { valid: false, errors: ["plan.operations: must be an array"] };
  plan.operations.forEach((op, i) => {
    const path = `operations[${i}]`;
    if (!op || !op.type) { errors.push(`${path}: type is required`); return; }
    if (FORBIDDEN_OPS.includes(op.type)) { errors.push(`${path}: operation ${op.type} is forbidden in AI change plans`); return; }
    if (!ALLOWED_OPS.includes(op.type)) { errors.push(`${path}: operation ${op.type} is not allowlisted`); return; }
    if ((op.type === "remove_element") && options.allowDestructive !== true) errors.push(`${path}: remove_element requires explicit destructive approval`);
    if (op.type === "add_element" && op.element) errors.push(...validateElement(op.element, registry, `${path}.element`));
    if (op.type === "update_element_props") {
      if (!op.elementId) errors.push(`${path}: elementId is required`);
      if (op.componentId && op.props) {
        const fake = { id: op.elementId, componentId: op.componentId, props: op.props };
        // Only type-check supplied props, required checks do not apply to partial updates.
        const def = getComponent(registry, op.componentId);
        if (!def) errors.push(`${path}: unknown componentId ${op.componentId}`);
        else for (const [k,v] of Object.entries(op.props)) { const spec=(def.props||{})[k]; if(!spec) errors.push(`${path}.props.${k}: unknown prop`); else if(spec.type==="enum" && !(spec.values||[]).includes(v)) errors.push(`${path}.props.${k}: invalid enum value`); else if(spec.type!=="enum" && !typeOk(v, spec.type)) errors.push(`${path}.props.${k}: expected ${spec.type}`); }
      }
    }
  });
  return { valid: errors.length === 0, errors };
}

export function applyDefaults(element, registry) {
  const def = getComponent(registry, element.componentId);
  if (!def) return element;
  const props = { ...(element.props || {}) };
  for (const [k, spec] of Object.entries(def.props || {})) if (props[k] === undefined && spec.default !== undefined) props[k] = spec.default;
  return { ...element, props };
}
