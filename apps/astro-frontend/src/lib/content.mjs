// Content loading for the Astro app.
// If TYPO3_CONTENT_API_URL is set, pages are fetched from TYPO3 (published
// endpoint only for public routes). Otherwise bundled fixtures are used and
// that fallback is logged clearly. Drafts are never returned by public loaders.
import publishedHome from '../data/sample-published.json';
import publishedAbout from '../data/sample-about.json';
import draftHome from '../data/sample-draft.json';

const publishedBySlug = { home: publishedHome, '': publishedHome, about: publishedAbout };
const draftBySlug = { home: draftHome };

export function getFixturePublished(slug) {
  const key = slug === undefined || slug === null ? 'home' : String(slug);
  return publishedBySlug[key] || null;
}
export function getFixtureDraft(slug) {
  return draftBySlug[String(slug)] || null;
}
export function listFixturePublished() {
  return [publishedHome, publishedAbout].map((p) => ({ slug: p.slug, title: p.title }));
}

export async function getPublishedPage(slug) {
  const base = process.env.TYPO3_CONTENT_API_URL;
  if (base) {
    try {
      const res = await fetch(base.replace(/\/$/, '') + '/pages/' + encodeURIComponent(slug || 'home'));
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      console.warn('[content] TYPO3 API returned ' + res.status + ', falling back to fixtures');
    } catch (err) {
      console.warn('[content] TYPO3 API unreachable, falling back to fixtures: ' + String(err));
    }
  } else {
    console.info('[content] TYPO3_CONTENT_API_URL not set, using bundled fixtures');
  }
  return getFixturePublished(slug);
}

export async function getDraftPage(slug, token, verifyFn) {
  // Caller must verify the token first. This function refuses without a verifier pass.
  if (!verifyFn || verifyFn(token, slug) !== true) return null;
  const base = process.env.TYPO3_CONTENT_API_URL;
  if (base) {
    try {
      const res = await fetch(base.replace(/\/$/, '') + '/draft/' + encodeURIComponent(slug), { headers: { 'x-preview-token': token } });
      if (res.ok) return await res.json();
    } catch (err) { console.warn('[content] Draft fetch failed: ' + String(err)); }
  }
  return getFixtureDraft(slug);
}
