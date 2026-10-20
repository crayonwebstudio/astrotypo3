import { getFixtureDraft } from '../../../../../lib/content.mjs';
import { verifyPreviewToken, isDemoPreviewAllowed } from '../../../../../lib/previewToken.mjs';
export const GET = async ({ params, request }: any) => {
  const slug = params.slug ?? 'home';
  const token = request.headers.get('x-preview-token') ?? '';
  const secret = process.env.TYPO3_PREVIEW_SECRET ?? '';
  const valid = secret ? verifyPreviewToken(token, slug, secret) : isDemoPreviewAllowed(token, false);
  if (!valid) {
    return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'A valid preview token is required for draft content.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const page: any = getFixtureDraft(slug);
  if (!page) {
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Draft page not found.' } }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify(page), { headers: { 'content-type': 'application/json' } });
};
