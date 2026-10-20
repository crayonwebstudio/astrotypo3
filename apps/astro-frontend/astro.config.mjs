import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// SSR with the Node adapter: one deployment serves public pages, token gated
// preview, API routes and the builder demo. See docs/adr/0003.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: '0.0.0.0', port: 4321 },
});
