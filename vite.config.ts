import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/** Dev server only: dev/bench.html POSTs its results to /__bench, written to docs/tech/bench/;
 *  /__bench/shot?name=<name> takes a JPEG data URL (a canvas screenshot) into docs/art/perf/. */
function benchResults(): Plugin {
  return {
    name: 'bench-results',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (req.method !== 'POST' || !/\/__bench(\/shot)?$/.test(path)) return next();
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => {
          try {
            if (path.endsWith('/shot')) {
              const name = new URL(req.url!, 'http://x').searchParams.get('name') ?? '';
              if (!/^[a-z0-9-]+$/.test(name)) throw new Error('bad name');
              mkdirSync('docs/art/perf', { recursive: true });
              const file = `docs/art/perf/${name}.jpg`;
              writeFileSync(file, Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
              res.end(JSON.stringify({ file }));
              return;
            }
            const report = JSON.parse(body) as { device?: string; started?: string };
            const device = String(report.device ?? 'device').toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'device';
            const date = String(report.started ?? new Date().toISOString()).slice(0, 10);
            mkdirSync('docs/tech/bench', { recursive: true });
            let file = `docs/tech/bench/${date}-${device}.json`;
            for (let i = 2; existsSync(file); i++) file = `docs/tech/bench/${date}-${device}-${i}.json`;
            writeFileSync(file, JSON.stringify(report, null, 1) + '\n');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ file }));
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

// GitHub Pages serves the site from /<repo>/.
const base = process.env.BASE_PATH ?? '/vidvazhni/';

export default defineConfig({
  base,
  plugins: [
    benchResults(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Відважні',
        short_name: 'Відважні',
        description: 'Кооперативна тактична гра для родини',
        lang: 'uk',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#1d2433',
        theme_color: '#1d2433',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Models: only the low tier is precached, so the game always works offline after the first
        // visit. The medium/high tier is put into the runtime cache by prefetchModels()
        // (src/render/models.ts) and served from it here. Audio is never precached: each file is
        // fetched when first played (src/audio/engine.ts) and kept in the runtime cache.
        globPatterns: ['**/*.{js,css,html,svg,png,json,webp}', '**/*.low-*.glb'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/audio\/.+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'vidvazhni-audio', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /\.glb$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vidvazhni-models', // MODEL_CACHE in src/render/models.ts
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
