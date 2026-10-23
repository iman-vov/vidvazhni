// Checks every optimized model (assets/models/<id>/<id>.glb, made by `npm run models`) against the
// game's budgets: it loads, rigged characters have the six game clips, textures fit, triangles fit
// the manifest budget, and weapons' attachTo bones exist in their owner's skeleton.

import { describe, expect, it } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODELS_DIR = 'assets/models';
const REQUIRED_CLIPS = ['idle', 'walk', 'run', 'attack', 'hit', 'death'];
const TEXTURE_MAX: Record<string, number> = { weapon: 512, prop: 512 };
const ASSET_BUDGET_BYTES = 60 * 1024 * 1024; // osnova.md «Робота без інтернету»: all assets except voice

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
const path = (id: string): string => join(MODELS_DIR, id, `${id}.glb`);

const docs = new Map<string, Promise<Document>>();
function read(id: string): Promise<Document> {
  let doc = docs.get(id);
  if (!doc) {
    doc = MeshoptDecoder.ready.then(() =>
      new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(path(id)),
    );
    docs.set(id, doc);
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
  it('all fit in the offline asset budget', () => {
    const total = ids.reduce((sum, id) => sum + statSync(path(id)).size, 0);
    expect(total).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
  });

  describe.each(ids.length ? ids : ['(none)'])('%s', (id) => {
    if (id === '(none)') {
      it.skip('no optimized models yet', () => {});
      return;
    }
    const entry = entries.get(id);

    it('is in the manifest', () => {
      expect(entry, `${id} missing from art/prompts/manifest.json`).toBeDefined();
    });

    it('loads, is meshopt-compressed and uses WebP textures', async () => {
      const doc = await read(id);
      const used = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
      expect(used).toContain('EXT_meshopt_compression');
      for (const texture of doc.getRoot().listTextures()) expect(texture.getMimeType()).toBe('image/webp');
    });

    it('has textures within the size limit', async () => {
      const limit = TEXTURE_MAX[entry?.kind ?? ''] ?? 1024;
      for (const texture of (await read(id)).getRoot().listTextures()) {
        const size = texture.getSize();
        expect(size, `${texture.getName()} has no readable size`).not.toBeNull();
        expect(Math.max(...size!), texture.getName()).toBeLessThanOrEqual(limit);
      }
    });

    it('is within its triangle budget', async () => {
      const max = entry?.triangleBudget?.max;
      if (!max) return;
      expect(triangles(await read(id))).toBeLessThanOrEqual(max);
    });

    it('has the game clip names if rigged', async () => {
      const root = (await read(id)).getRoot();
      if (!root.listSkins().length) return;
      const clips = root.listAnimations().map((a) => a.getName());
      for (const name of REQUIRED_CLIPS) expect(clips, `${id} clips`).toContain(name);
    });

    it("attaches to bones that exist in its owner's skeleton", async () => {
      const attach = entry?.attachTo;
      if (!attach || !ids.includes(attach.model)) return;
      const owner = await read(attach.model);
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
