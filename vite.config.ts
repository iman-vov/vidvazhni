import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/.
const base = process.env.BASE_PATH ?? '/vidvazhni/';

export default defineConfig({
  base,
  plugins: [
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
        // (src/render/models.ts) and served from it here.
        globPatterns: ['**/*.{js,css,html,svg,png,json,webp,ogg,mp3}', '**/*.low-*.glb'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        runtimeCaching: [
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
