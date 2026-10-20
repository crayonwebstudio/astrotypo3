import { createHmac, randomUUID } from 'node:crypto';
// Demo publishing adapter. When no webhook is configured it fails honestly.
// It never reports a false success.
export const POST = async ({ request }: any) => {
  let body: any = {};
  try { body = await request.json(); } catch { body = {}; }
  const jobId = 'publish-' + randomUUID();
  const url = process.env.PUBLISH_WEBHOOK_URL ?? '';
  const secret = process.env.PUBLISH_WEBHOOK_SECRET ?? '';
  if (!url) {
    return new Response(JSON.stringify({ status: 'error', jobId, message: 'No publish webhook configured. Set PUBLISH_WEBHOOK_URL to enable publishing. Nothing was published.', demoMode: true }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
  const payload = JSON.stringify({ event: 'page.published', slug: body.slug ?? 'home', idempotencyKey: jobId });
  const signature = secret ? createHmac('sha256', secret).update(payload).digest('hex') : '';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': jobId, 'x-signature': signature }, body: payload });
    if (!res.ok) return new Response(JSON.stringify({ status: 'error', jobId, message: 'Publish webhook returned HTTP ' + res.status + '.' }), { status: 502, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ status: 'accepted', jobId, message: 'Publish webhook accepted the job. Confirm final build status with the receiver.' }), { status: 202, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ status: 'error', jobId, message: 'Publish webhook request failed: ' + String(err) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
};
