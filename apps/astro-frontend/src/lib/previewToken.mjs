import { createHmac, timingSafeEqual } from 'node:crypto';

function b64url(input) { return Buffer.from(input).toString('base64url'); }
function sign(payload, secret) { return createHmac('sha256', secret).update(payload).digest('base64url'); }

export function createPreviewToken(slug, secret, ttlSeconds = 900, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = slug + '|' + String(nowSeconds + ttlSeconds);
  return b64url(payload) + '.' + sign(payload, secret);
}

export function verifyPreviewToken(token, slug, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || !secret) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  let payload;
  try { payload = Buffer.from(parts[0], 'base64url').toString('utf8'); } catch { return false; }
  const [tokenSlug, expires] = payload.split('|');
  if (tokenSlug !== slug) return false;
  if (!expires || Number(expires) < nowSeconds) return false;
  const expected = sign(payload, secret);
  const a = Buffer.from(expected); const b = Buffer.from(parts[1]);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Demo shortcut: only when no secret is configured. Production must set a secret.
export function isDemoPreviewAllowed(token, secretConfigured) {
  return !secretConfigured && token === 'demo';
}
