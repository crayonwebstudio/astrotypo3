// Composition of the stylesheet used inside the GrapesJS canvas iframe.
//
// Single source of truth: the canvas CSS is built from the exact same
// source files the public site uses, src/styles/tokens.css and
// src/styles/global.css. Those files are imported with ?raw by the Astro
// endpoint src/pages/builder-canvas.css.ts and passed in here as strings,
// so this module stays a pure, testable function.
//
// Why a served URL at all: GrapesJS canvas.styles entries are stylesheet
// URLs that become <link> tags in the canvas iframe head (see
// CanvasConfig.styles in grapesjs 0.23.8). Passing CSS text there is a
// bug, the browser tries to fetch the CSS text as a URL and the canvas
// renders with default browser styles only.

/**
 * Compose the canvas stylesheet from the design tokens CSS and the
 * global frontend CSS.
 *
 * global.css starts with `@import './tokens.css';`, which cannot be
 * resolved once the files are inlined into a single served stylesheet,
 * so the import line is stripped and the tokens are prepended instead.
 * The token custom properties must come first: global.css rules and the
 * canvas component markup both reference var(--...) tokens.
 */
export function composeCanvasCss(tokensCss, globalCss) {
  const tokens = String(tokensCss || '').trim();
  const global = String(globalCss || '').replace(/@import[^;]+;\s*/, '').trim();
  return tokens + '\n\n' + global + '\n';
}

/** Path of the served canvas stylesheet (stable, unhashed). */
export const CANVAS_CSS_PATH = '/builder-canvas.css';
