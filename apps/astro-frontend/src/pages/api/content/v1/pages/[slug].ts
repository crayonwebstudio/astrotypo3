import { getFixturePublished } from '../../../../../lib/content.mjs';
export const GET = async ({ params }: any) => {
  const slug = params.slug === 'home' || !params.slug ? 'home' : params.slug;
  const page: any = getFixturePublished(slug);
  if (!page || page.status !== 'published') {
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Published page not found.' } }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify(page), { headers: { 'content-type': 'application/json' } });
};
