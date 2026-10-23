// Renders every data/scenarios/*.json to docs/screenshots/maps/<id>.png with the editor's own SVG
// renderer (tools/map-editor/render.ts), loaded through Vite so the TypeScript runs as-is.
// Usage: node tools/map-editor/snapshot.mjs [s2 s3 …]
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { createServer } from 'vite';

const only = process.argv.slice(2);
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { renderSvg } = await server.ssrLoadModule('/tools/map-editor/render.ts');
  const names = JSON.parse(readFileSync('data/i18n/uk.json', 'utf8'));
  mkdirSync('docs/screenshots/maps', { recursive: true });
  for (const file of readdirSync('data/scenarios').filter((f) => f.endsWith('.json')).sort()) {
    const s = JSON.parse(readFileSync(`data/scenarios/${file}`, 'utf8'));
    if (only.length && !only.includes(s.id)) continue;
    const { svg } = renderSvg(s, { size: 34, heroes: 'all', legend: true, names });
    const out = `docs/screenshots/maps/${s.id}.png`;
    await sharp(Buffer.from(svg)).png().toFile(out);
    console.log(out);
  }
} finally {
  await server.close();
}
