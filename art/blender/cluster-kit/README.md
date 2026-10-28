# Cluster kit

Set pieces of the obstacle clusters that no Meshy model covers, to replace the procedural `long-table` and `wagon` in `src/render/environment/pieces.ts` (the user's rule: every decorative mesh is modelled in Blender through the Blender MCP).

- `cluster_kit.py` — builds `long-table_1..4`, `chair_1..4`, `cart_1..4` (life size, long side along X, palette-key materials, flat low poly) on top of the scatter kit's helpers. Run through the Blender MCP:
  `exec(open(r'C:/Braves/art/blender/cluster-kit/cluster_kit.py').read()); r = build_all()`, check each piece with `look` close up and from the game camera (55° pitch), refine (chipped edges, uneven legs, worn planks), then `export(r)` → `art/meshy-source/cluster-kit/cluster-kit.glb`.
- Then `npm run models cluster-kit` (tiers into `assets/models/cluster-kit/`) and `node tools/model-bounds.mjs` (writes `cluster-kit#<node>` bounds used for the footprints).
- `wiring.patch` — the code side, ready: `git apply --3way art/blender/cluster-kit/wiring.patch`, then add `import MODEL_BOUNDS from './modelBounds.json';` to `obstacles.ts` and `loadClusterKit: () => loadLocationKit('cluster-kit', quality),` next to `loadKit` in `index.ts` `makeCluster`. It draws the kit nodes (4 variants, footprints per variant from the GLB bounds), uses chairs around the long table and the cart in the wagon/yard sets, and deletes the procedural `long-table` and `wagon` pieces. Apply it only once the GLB is in `assets/models/cluster-kit/`, or those pieces disappear.
- Check: `npx vitest run tests/render/obstacles.test.ts tests/render/footprint.test.ts`, screenshots of s1 (two long-table/barrel pairs) and s2 (hut yard with the cart).
