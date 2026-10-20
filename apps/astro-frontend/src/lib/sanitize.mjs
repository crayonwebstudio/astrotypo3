// Minimal rich text sanitizer mirroring the PHP Sanitizer allowlist.
// The renderer only outputs sanitized HTML.
const ALLOWED = new Set(['p','strong','em','a','ul','ol','li','br','h3','h4','blockquote']);
export function sanitizeHtml(html) {
  let out = String(html || '');
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<\/?([a-z0-9-]+)(\s[^>]*)?>/gi, (match, tag, attrs) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED.has(name)) return '';
    if (name === 'a') {
      const hrefMatch = /href="([^"]*)"/i.exec(attrs || '');
      const href = hrefMatch ? hrefMatch[1] : '#';
      const safe = /^(https?:|mailto:|\/|#)/i.test(href) && !/^javascript:/i.test(href) ? href : '#';
      return match.startsWith('</') ? '</a>' : '<a href="' + safe + '">';
    }
    return match.startsWith('</') ? '</' + name + '>' : '<' + name + '>';
  });
  out = out.replace(/\son\w+="[^"]*"/gi, '');
  return out;
}
