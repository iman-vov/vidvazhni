// Checks every optimized model (made by `npm run models`) in all three tiers against the game's
// budgets: each tier loads, rigged characters have the six game clips, textures fit the tier,
// triangles fit the manifest budget, the tiers share clips and bones, and weapons' attachTo bones
// exist in their owner's skeleton.

import { describe, expect, it } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODELS_DIR = 'assets/models';
const REQUIRED_CLIPS = ['idle', 'walk', 'run', 'attack', 'hit', 'death'];
// osnova.md «Робота без інтернету»: all assets except voice ≤ 60 MB. The low tier is the first
// download (precached), and medium is the default tier on tablets, so both must fit.
const ASSET_BUDGET_BYTES = 60 * 1024 * 1024;

const TIERS = [
  { name: 'low', suffix: '.low', textureMax: { weapon: 256, prop: 256, default: 512 }, budgeted: true },
  { name: 'medium', suffix: '', textureMax: { weapon: 512, prop: 512, default: 1024 }, budgeted: true },
  { name: 'high', suffix: '.hq', textureMax: { default: 4096 }, budgeted: false },
] as const;
type Tier = (typeof TIERS)[number];

interface ManifestEntry {
  id: string;
  kind: string;
  rig?: string;
  triangleBudget?: { min: number | null; max: number | null } | null;
  attachTo?: { model: string; hand: string; bones: string[] } | null;
}
const manifest = JSON.parse(readFileSync('art/prompts/manifest.json', 'utf8')) as { models: ManifestEntry[] };
const entries = new Map(manifest.models.map((m) => [m.id, m]));

// Only the pipeline's outputs; interim files such as <id>-1k.glb are not game assets.
const ids = existsSync(MODELS_DIR)
  ? readdirSync(MODELS_DIR).filter((id) => existsSync(join(MODELS_DIR, id, `${id}.glb`)))
  : [];
const path = (id: string, tier: Tier): string => join(MODELS_DIR, id, `${id}${tier.suffix}.glb`);
const medium = TIERS[1];

const docs = new Map<string, Promise<Document>>();
function read(id: string, tier: Tier): Promise<Document> {
  const key = path(id, tier);
  let doc = docs.get(key);
  if (!doc) {
    doc = MeshoptDecoder.ready.then(() =>
      new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(key),
    );
    docs.set(key, doc);
  }
  return doc;
}

function triangles(doc: Document): number {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      total += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    }
  }
  return total;
}

describe('optimized models', () => {
  for (const tier of TIERS.filter((t) => t.budgeted)) {
    it(`${tier.name} tier fits in the offline asset budget`, () => {
      const total = ids.reduce((sum, id) => sum + statSync(path(id, tier)).size, 0);
      expect(total).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
    });
  }

  describe.each(ids.length ? ids : ['(none)'])('%s', (id) => {
    if (id === '(none)') {
      it.skip('no optimized models yet', () => {});
      return;
    }
    const entry = entries.get(id);

    it('is in the manifest', () => {
      expect(entry, `${id} missing from art/prompts/manifest.json`).toBeDefined();
    });

    it('has all three tiers', () => {
      for (const tier of TIERS) expect(existsSync(path(id, tier)), path(id, tier)).toBe(true);
    });

    describe.each(TIERS)('$name tier', (tier) => {
      it('loads, is meshopt-compressed and uses WebP textures', async () => {
        const doc = await read(id, tier);
        const used = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
        expect(used).toContain('EXT_meshopt_compression');
        for (const texture of doc.getRoot().listTextures()) expect(texture.getMimeType()).toBe('image/webp');
      });

      it('has textures within the tier limit', async () => {
        const limits: Record<string, number> = tier.textureMax;
        const limit = limits[entry?.kind ?? ''] ?? tier.textureMax.default;
        for (const texture of (await read(id, tier)).getRoot().listTextures()) {
          const size = texture.getSize();
          expect(size, `${texture.getName()} has no readable size`).not.toBeNull();
          expect(Math.max(...size!), texture.getName()).toBeLessThanOrEqual(limit);
        }
      });

      it('is within its triangle budget', async () => {
        const max = entry?.triangleBudget?.max;
        if (!max) return;
        expect(triangles(await read(id, tier))).toBeLessThanOrEqual(max);
      });

      it('has the game clip names if rigged', async () => {
        const root = (await read(id, tier)).getRoot();
        if (!root.listSkins().length) return;
        const clips = root.listAnimations().map((a) => a.getName());
        for (const name of REQUIRED_CLIPS) expect(clips, `${id} clips`).toContain(name);
      });

      it('shares clip and node names with the medium tier', async () => {
        if (tier === medium) return;
        const names = (doc: Document) => ({
          clips: doc.getRoot().listAnimations().map((a) => a.getName()).sort(),
          nodes: doc.getRoot().listNodes().map((n) => n.getName()).sort(),
        });
        expect(names(await read(id, tier))).toEqual(names(await read(id, medium)));
      });
    });

    it('has fewer triangles in the low tier than in medium', async () => {
      expect(triangles(await read(id, TIERS[0]))).toBeLessThan(triangles(await read(id, medium)));
    });

    it("attaches to bones that exist in its owner's skeleton", async () => {
      const attach = entry?.attachTo;
      if (!attach || !ids.includes(attach.model)) return;
      const owner = await read(attach.model, medium);
      const names = new Set(owner.getRoot().listNodes().map((n) => n.getName()));
      for (const bone of attach.bones) expect(names, `${attach.model} bones`).toContain(bone);
    });
  });
});

describe('manifest attachTo bones', () => {
  it('use the Mixamo names Meshy exports', () => {
    for (const m of manifest.models) {
      for (const bone of m.attachTo?.bones ?? []) expect(bone, m.id).toMatch(/^mixamorig:(Left|Right)Hand$/);
    }
  });
});
