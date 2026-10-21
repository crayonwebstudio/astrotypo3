// Inline SVG icons for builder blocks.
//
// GrapesJS renders a block's `media` string as the tile thumbnail above
// the block label (the icon tiles in the official editor's Blocks view).
// Every registry component gets a simple line icon here so the Blocks
// panel reads as icon tiles grouped by category, not a plain text list.
// Icons are 24x24 stroke drawings in currentColor, so they inherit the
// GrapesJS dark theme font color. API-created element types have no
// dedicated icon and fall back to GENERIC_BLOCK_ICON.

function svg(inner) {
  return '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}

export const BLOCK_ICONS = {
  'layout.container': svg('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="7.5" y="9" width="9" height="6" rx="1" stroke-dasharray="2.5 2"/>'),
  'layout.columns': svg('<rect x="3" y="4" width="4.5" height="16" rx="1"/><rect x="9.75" y="4" width="4.5" height="16" rx="1"/><rect x="16.5" y="4" width="4.5" height="16" rx="1"/>'),
  'content.heading': svg('<path d="M6 5v14"/><path d="M6 12h5"/><path d="M11 5v14"/><path d="M15 19h6"/>'),
  'content.rich-text': svg('<path d="M5 6h14"/><path d="M5 10.5h14"/><path d="M5 15h9"/><path d="M5 19.5h12"/>'),
  'content.image': svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3.5 17.5 8.5 13l3.5 3 4-3.5 4.5 4"/>'),
  'content.button': svg('<rect x="3" y="8" width="18" height="8.5" rx="4.25"/><path d="M8.5 12.25h7"/>'),
  'content.divider': svg('<path d="M3 12h6.5"/><path d="M14.5 12H21"/><circle cx="12" cy="12" r="1.3"/>'),
  'section.hero': svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9.5h10"/><path d="M7 13h6"/><rect x="7" y="15.8" width="4.5" height="2.4" rx="1.2"/>'),
  'section.feature-grid': svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  'section.image-text': svg('<rect x="3" y="6" width="8" height="12" rx="1"/><circle cx="6" cy="10" r="1.1"/><path d="M3.8 16.5 6.5 14l2 1.8 1.7-1.5"/><path d="M14.5 9h6.5"/><path d="M14.5 12.5h6.5"/><path d="M14.5 16h4.5"/>'),
  'section.testimonials': svg('<path d="M4 4.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/><path d="M7.5 9.25c0 2 .8 3 2 3.75"/><path d="M13 9.25c0 2 .8 3 2 3.75"/>'),
  'section.faq': svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4A2.6 2.6 0 1 1 12 12.35c-.75.18-1 .75-1 1.65"/><circle cx="11.9" cy="16.9" r="0.4" fill="currentColor"/>'),
  'section.cta': svg('<path d="M7.5 4.5 19 11l-4.8 1.3L12.4 18z"/><path d="M12.4 18 10 21"/>'),
  'navigation.header': svg('<rect x="3" y="4" width="18" height="5.5" rx="1"/><circle cx="6.2" cy="6.75" r="1" fill="currentColor" stroke="none"/><path d="M13 6.75h5"/><path d="M5 14h14"/><path d="M5 18h9"/>'),
  'navigation.footer': svg('<path d="M5 6h14"/><path d="M5 10h9"/><rect x="3" y="14.5" width="18" height="5.5" rx="1"/><circle cx="6.2" cy="17.25" r="1" fill="currentColor" stroke="none"/><path d="M13 17.25h5"/>'),
};

export const GENERIC_BLOCK_ICON = svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8.5v7"/><path d="M8.5 12h7"/>');

/** Icon SVG string for a registry component id (generic for unknown ids). */
export function iconForComponent(componentId) {
  return BLOCK_ICONS[componentId] || GENERIC_BLOCK_ICON;
}
