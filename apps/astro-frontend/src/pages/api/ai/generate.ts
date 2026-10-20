import registry from '../../../data/registry.json';
import { generateMockPlan } from '../../../lib/mockAi.mjs';
import { checkRateLimit } from '../../../lib/rateLimit.mjs';
export const POST = async ({ request }: any) => {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  const limit = checkRateLimit('ai-generate:' + ip, 20);
  if (!limit.allowed) return new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'AI demo rate limit reached. Try again shortly.' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  let body: any = {};
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: { code: 'invalid_json', message: 'Request body must be JSON.' } }), { status: 400, headers: { 'content-type': 'application/json' } }); }
  if (!body.prompt || typeof body.prompt !== 'string') return new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'prompt is required.' } }), { status: 422, headers: { 'content-type': 'application/json' } });
  const result = generateMockPlan(body.prompt, registry as any);
  if (!result.validation.valid) return new Response(JSON.stringify({ provider: 'mock', mock: true, error: { code: 'invalid_plan', message: 'Mock plan failed validation.', details: result.validation.errors } }), { status: 422, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};
