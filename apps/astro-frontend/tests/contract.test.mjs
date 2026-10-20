import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePage, validateChangePlan, validateTemplateSet } from '../src/lib/validate.mjs';
import { createPreviewToken, verifyPreviewToken, isDemoPreviewAllowed } from '../src/lib/previewToken.mjs';
import { auditPage } from '../src/lib/audit.mjs';
import { generateMockPlan } from '../src/lib/mockAi.mjs';
import { validateEditorMessage } from '../src/lib/editBridge.mjs';
import { sanitizeHtml } from '../src/lib/sanitize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, '..');
const sharedRoot = path.join(appRoot, '..', '..', 'packages', 'shared-contract');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const registry = readJson(path.join(sharedRoot, 'registry.json'));
const templates = readJson(path.join(sharedRoot, 'templates.json'));
const published = readJson(path.join(sharedRoot, 'fixtures', 'sample-published.json'));
const draft = readJson(path.join(sharedRoot, 'fixtures', 'sample-draft.json'));

test('validator accepts valid published and draft fixtures', () => {
  assert.equal(validatePage(published, registry).valid, true, JSON.stringify(validatePage(published, registry).errors));
  assert.equal(validatePage(draft, registry).valid, true, JSON.stringify(validatePage(draft, registry).errors));
});

test('validator rejects invalid props', () => {
  const bad = JSON.parse(JSON.stringify(published));
  bad.elements = [{ id: 'x1', componentId: 'content.heading', props: { text: 'Hi', level: 'two', align: 'middle', bogus: 1 } }];
  const result = validatePage(bad, registry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('level')));
  assert.ok(result.errors.some((e) => e.includes('align')));
  assert.ok(result.errors.some((e) => e.includes('bogus')));
  const missing = { id: 'p', slug: 'x', title: 'X', status: 'published', elements: [{ id: 'x2', componentId: 'content.heading', props: {} }] };
  assert.equal(validatePage(missing, registry).valid, false);
  const unknown = { id: 'p', slug: 'x', title: 'X', status: 'published', elements: [{ id: 'x3', componentId: 'nope.nope', props: {} }] };
  assert.equal(validatePage(unknown, registry).valid, false);
});

test('change plan validator rejects non allowlisted and forbidden operations', () => {
  assert.equal(validateChangePlan({ operations: [{ type: 'publish_page' }] }, registry).valid, false);
  assert.equal(validateChangePlan({ operations: [{ type: 'delete_everything' }] }, registry).valid, false);
  assert.equal(validateChangePlan({ operations: [{ type: 'execute_code', code: 'x' }] }, registry).valid, false);
  assert.equal(validateChangePlan({ operations: [{ type: 'remove_element', elementId: 'a' }] }, registry).valid, false);
  assert.equal(validateChangePlan({ operations: [{ type: 'remove_element', elementId: 'a' }] }, registry, { allowDestructive: true }).valid, true);
  assert.equal(validateChangePlan({ operations: [{ type: 'add_element', element: { id: 'e1', componentId: 'section.cta', props: { heading: 'Go' } } }] }, registry).valid, true);
});

test('registry and renderer sync: every registry id has a renderer file', () => {
  assert.equal(registry.components.length, 15);
  for (const c of registry.components) {
    const file = path.join(appRoot, 'src', 'components', c.id + '.astro');
    assert.ok(existsSync(file), 'Missing renderer for ' + c.id);
  }
});

test('template validation passes for the full template library', () => {
  const result = validateTemplateSet(templates, registry);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(templates.elementPresets.length >= 4);
  assert.ok(templates.sectionTemplates.length >= 4);
  assert.deepEqual(templates.pageTemplates.map((t) => t.slug).sort(), ['about', 'contact', 'home', 'landing', 'services']);
  assert.equal(templates.siteTemplates.length, 1);
});

test('preview token logic: create, verify, expiry, tamper', () => {
  const now = 1700000000;
  const token = createPreviewToken('home', 'test-secret', 900, now);
  assert.equal(verifyPreviewToken(token, 'home', 'test-secret', now + 10), true);
  assert.equal(verifyPreviewToken(token, 'about', 'test-secret', now + 10), false);
  assert.equal(verifyPreviewToken(token, 'home', 'wrong-secret', now + 10), false);
  assert.equal(verifyPreviewToken(token, 'home', 'test-secret', now + 10000), false);
  assert.equal(verifyPreviewToken(token + 'x', 'home', 'test-secret', now + 10), false);
  assert.equal(isDemoPreviewAllowed('demo', false), true);
  assert.equal(isDemoPreviewAllowed('demo', true), false);
});

test('audit flags broken page and passes fixture home', () => {
  const broken = { id: 'p', slug: 'x', title: 'X', status: 'published', seo: {}, elements: [{ id: 'i1', componentId: 'content.image', props: { src: '/x.jpg', alt: '' } }] };
  const codes = auditPage(broken).map((f) => f.code);
  assert.ok(codes.includes('h1-missing'));
  assert.ok(codes.includes('seo-title-missing'));
  const homeCodes = auditPage(published).map((f) => f.code);
  assert.ok(!homeCodes.includes('h1-missing'), JSON.stringify(homeCodes));
});

test('mock AI produces a validated, labelled plan', () => {
  const result = generateMockPlan('add an faq section please', registry);
  assert.equal(result.mock, true);
  assert.equal(result.provider, 'mock');
  assert.equal(result.validation.valid, true, JSON.stringify(result.validation.errors));
});

test('edit bridge validates origin, type and schema', () => {
  assert.equal(validateEditorMessage({ type: 'astro-builder:select', elementId: 'e1' }, 'https://a.example', 'https://a.example').valid, true);
  assert.equal(validateEditorMessage({ type: 'astro-builder:select', elementId: 'e1' }, 'https://evil.example', 'https://a.example').valid, false);
  assert.equal(validateEditorMessage({ type: 'unknown', elementId: 'e1' }, 'https://a.example', 'https://a.example').valid, false);
  assert.equal(validateEditorMessage({ type: 'astro-builder:update-text', elementId: 'e1', text: 42 }, 'https://a.example', 'https://a.example').valid, false);
});

test('sanitizer strips scripts and unsafe tags', () => {
  const out = sanitizeHtml('<p>Hi</p><script>alert(1)</script><div>bye</div>');
  assert.ok(!out.includes('script'));
  assert.ok(out.includes('<p>Hi</p>'));
});
