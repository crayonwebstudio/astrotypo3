// Deterministic SEO and accessibility checks.
// These are rule based findings, not AI claims and not a compliance guarantee.
export function auditPage(page) {
  const findings = [];
  const push = (level, code, message, elementId) => findings.push({ level, code, message, elementId: elementId || null, source: 'deterministic' });
  if (!page) return [{ level: 'error', code: 'no-page', message: 'No page to audit.', elementId: null, source: 'deterministic' }];
  if (!page.seo || !page.seo.title) push('error', 'seo-title-missing', 'SEO title is missing.');
  if (page.seo && page.seo.title && page.seo.title.length > 60) push('warning', 'seo-title-long', 'SEO title is longer than 60 characters.');
  if (!page.seo || !page.seo.description) push('warning', 'seo-description-missing', 'Meta description is missing.');
  let h1Count = 0;
  const walk = (elements) => {
    for (const el of elements || []) {
      if (el.componentId === 'section.hero') h1Count += 1;
      if (el.componentId === 'content.heading' && Number(el.props && el.props.level) === 1) h1Count += 1;
      if (el.componentId === 'content.heading' && !String((el.props && el.props.text) || '').trim()) push('error', 'heading-empty', 'Heading text is empty.', el.id);
      if ((el.componentId === 'content.image' || el.componentId === 'section.image-text') && el.props && el.props.alt === undefined && el.props.imageAlt === undefined) push('error', 'image-alt-missing', 'Image has no alt property.', el.id);
      if ((el.componentId === 'content.image') && el.props && el.props.alt === '') push('warning', 'image-alt-empty', 'Image alt is empty. Confirm the image is decorative.', el.id);
      if (el.componentId === 'section.image-text' && el.props && !el.props.imageAlt) push('error', 'image-alt-missing', 'Image and text section image needs alt text.', el.id);
      if (el.componentId === 'content.button' && el.props && !el.props.href) push('error', 'button-href-missing', 'Button has no destination.', el.id);
      if (el.children) walk(el.children);
    }
  };
  walk(page.elements);
  if (h1Count === 0) push('error', 'h1-missing', 'Page has no h1 (hero or level 1 heading).');
  if (h1Count > 1) push('warning', 'h1-multiple', 'Page has more than one h1.');
  return findings;
}
