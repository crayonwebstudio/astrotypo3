import { listFixturePublished } from '../lib/content.mjs';
export const GET = async () => {
  const base = 'https://astrotypo3.woodwolfdigital.com';
  const pages = listFixturePublished();
  const urls = pages.map((p: any) => {
    const loc = p.slug === 'home' ? base + '/' : base + '/' + p.slug;
    return '<url><loc>' + loc + '</loc></url>';
  }).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>';
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
};
