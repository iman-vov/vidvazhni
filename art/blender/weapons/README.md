# Weapons made in Blender

## warden-sword (v2, 2026-10-28)
Modelled from scratch through the Blender MCP, step by step with `look` checks. No Meshy and no third-party assets, so there is no licence to record.

- **Blade:** 78 cm arming sword. The fuller ends in a rounded tip at about 60% of the length. Width tapers from 8.6 to 6.3 cm and thickness (distal taper) from 15 to 3 mm. Ogive point. A secondary edge bevel runs along both edges; sharp edges come from smooth-by-angle.
- **Guard:** curved quillons bent toward the blade, octagonal section, knobbed ends. Diamond écusson with a faceted blue cabochon on both faces.
- **Grip:** the wrap is a helix-aligned tube with three rows per turn (groove, overlap, strap) and sharp groove edges. Gold ferrules sit at both ends.
- **Pommel:** wheel pommel with a rim, a recess and a raised boss, plus a peen block at the end.
- **Budget:** 2472 tris (high and medium), 1236 tris (low, from `npm run models warden-sword`).

### Files
- `warden-sword.blend`: object `warden-sword`, one material `warden-sword`. The bake materials `steel`, `gold`, `leather` and `gem` are kept with a fake user so the texture can be re-baked.
- `warden-sword_col.src.png` (1024): raw EMIT bake in Cycles. It combines AO cavity, inside-AO edge highlights, noise wear and vertex-colour masks from the `paint` attribute: R marks the blade edge bevel, G the fuller.
- `warden-sword_col.png`: the source bake with the blade strips (u < 0.18) lifted ×1.18 + 6.
- `warden-sword_mr.src.png` (512): raw metal-rough bake (G roughness, B metallic).
- `warden-sword_mr.png`: the same with metallic remapped (steel 0.75 → 0.35, gold 0.8 → 0.55), so the sword is not near-black next to the armour.

### Export
glTF/GLB, selection only, +Y up, `export_vertex_color='NONE'`. Without that, three.js multiplies the texture by the `paint` masks and the sword turns black. Backface culling is on. Output goes to `art/meshy-source/warden-sword/warden-sword.glb`, then run `npm run models warden-sword`.

Tip: long bakes go through `bpy.app.timers` with a marker file. A single MCP call longer than the timeout leaves the MCP server dead until it is restarted.
