export const GET = async () => {
  const body = 'User-agent: *\nAllow: /\nDisallow: /preview/\nDisallow: /builder\nSitemap: https://astrotypo3.woodwolfdigital.com/sitemap.xml\n';
  return new Response(body, { headers: { 'content-type': 'text/plain' } });
};
