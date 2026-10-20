// Simple in-memory rate limiter for demo endpoints.
// Production TYPO3 deployments should use a shared store and real quotas.
const buckets = new Map();
export function checkRateLimit(key, limit = 20, windowMs = 60000, now = Date.now()) {
  const entry = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count += 1;
  buckets.set(key, entry);
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}
