import registry from '../../../data/registry.json';
import { editMockPlan, proposeComponentSchema } from '../../../lib/mockAi.mjs';
import { validateChangePlan } from '../../../lib/validate.mjs';
import { checkRateLimit } from '../../../lib/rateLimit.mjs';
export const POST = async ({ request }: any) => {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  const limit = checkRateLimit('ai-edit:' + ip, 20);
  if (!limit.allowed) return new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'AI demo rate limit reached.' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  let body: any = {};
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: { code: 'invalid_json', message: 'Request body must be JSON.' } }), { status: 400, headers: { 'content-type': 'application/json' } }); }
  if (body.mode === 'propose-component') {
    return new Response(JSON.stringify(proposeComponentSchema(body.prompt ?? '')), { headers: { 'content-type': 'application/json' } });
  }
  if (!body.instruction || typeof body.instruction !== 'string') return new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'instruction is required.' } }), { status: 422, headers: { 'content-type': 'application/json' } });
  const result = editMockPlan(body.instruction, body.element ?? null);
  const check = validateChangePlan(result.plan, registry as any);
  return new Response(JSON.stringify({ ...result, validation: check }), { headers: { 'content-type': 'application/json' } });
};
