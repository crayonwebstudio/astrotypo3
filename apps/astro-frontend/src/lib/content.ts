// TypeScript surface for content loading. Implementation is in content.mjs
// so Node tests and the server share one module.
export interface SeoMeta { title?: string; description?: string; canonical?: string }
export interface PageData { id: string; slug: string; title: string; status: 'published' | 'draft'; seo?: SeoMeta; elements: unknown[] }
