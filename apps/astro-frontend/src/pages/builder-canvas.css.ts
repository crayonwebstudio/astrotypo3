// Dedicated stylesheet for the GrapesJS builder canvas, served at the
// stable unhashed path /builder-canvas.css.
//
// GrapesJS canvas.styles takes stylesheet URLs, not CSS text, so the
// builder points its canvas at this URL. The content is composed from
// the same src/styles/tokens.css and src/styles/global.css sources the
// public site uses (see src/lib/canvasCss.mjs), so canvas components
// render with the real design tokens and component rules.
import tokensCss from '../styles/tokens.css?raw';
import globalCss from '../styles/global.css?raw';
import { composeCanvasCss } from '../lib/canvasCss.mjs';

const body = composeCanvasCss(tokensCss, globalCss);

export const GET = async () => {
  return new Response(body, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
