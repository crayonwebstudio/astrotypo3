import { writeFile, mkdir } from 'node:fs/promises';
import registry from '../../../data/registry.json';
import { validatePage } from '../../../lib/validate.mjs';
// Demo save endpoint. Validates the page, keeps it in memory and tries to
// persist to a local JSON file. Production editing belongs in TYPO3 with
// real authentication and permissions. This endpoint is labelled demo mode.
const memoryStore = new Map<string, any>();
export const POST = async ({ request }: any) => {
  let body: any = {};
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: { code: 'invalid_json', message: 'Request body must be JSON.' } }), { status: 400, headers: { 'content-type': 'application/json' } }); }
  if (body.demoEdit) {
    return new Response(JSON.stringify({ status: 'demo-edit-received', demoMode: true, notice: 'Demo mode: edit message validated at the bridge and received. It is not persisted as published content.', message: body.demoEdit }), { headers: { 'content-type': 'application/json' } });
  }
  const page = body.page;
  if (!page) return new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'page is required.' } }), { status: 422, headers: { 'content-type': 'application/json' } });
  const check = validatePage(page, registry as any);
  if (!check.valid) return new Response(JSON.stringify({ error: { code: 'validation_failed', message: 'The page did not validate.', details: check.errors } }), { status: 422, headers: { 'content-type': 'application/json' } });
  const draft = { ...page, status: 'draft' };
  memoryStore.set(draft.slug, draft);
  let fileSaved = false;
  try {
    await mkdir(process.cwd() + '/data', { recursive: true });
    await writeFile(process.cwd() + '/data/saved-pages.json', JSON.stringify(Object.fromEntries(memoryStore), null, 2));
    fileSaved = true;
  } catch { fileSaved = false; }
  return new Response(JSON.stringify({ status: 'saved', demoMode: true, fileSaved, notice: 'Demo mode: saved as a draft in the demo store only. In production this save goes to TYPO3 with editor authentication.', page: draft }), { headers: { 'content-type': 'application/json' } });
};
export const GET = async ({ url }: any) => {
  const slug = url.searchParams.get('slug') ?? 'home';
  const page = memoryStore.get(slug);
  if (!page) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'No demo draft saved for this slug.' } }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify(page), { headers: { 'content-type': 'application/json' } });
};
