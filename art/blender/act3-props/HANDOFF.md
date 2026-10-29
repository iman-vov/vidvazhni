# Act III props v2 (high detail): hand-over

## State 2026-10-29 ~16:00 (props-hq-3, local_e9d7e22a)
- **bookshelf is done and committed**: 4364 tris (low tier 2594), 1024 col / metal-rough / normal baked from `bookshelf-hi` (73.8k tris). The maps are in `hq-tex/bookshelf_{col,mr,n}.png`, the GLB is in `assets/models/bookshelf/`, and the sheet is `docs/art/act3/props-hq.jpg` (Blender only so far).
- **Still owed for the bookshelf:** the in-game board shot (`dev/board.html?board=s18&quality=high`). With 46 node sims running, Chrome's renderer froze on every dev page, the plain model viewer included, so no board shot exists yet.
- **This session had no Blender MCP tools.** The lead session approved driving the live Blender through the addon socket on 9876. The helper `bl.py` sends `execute_code` / `get_viewport_screenshot` JSON, one step per call. It lived in the session scratchpad; recreate it as needed.
- **Pipeline:** the functions are in `hq_lib.py`; one call each:
  1. `step_*()` builds each part (lo plus hi);
  2. `join_parts(id, parts)` joins the parts and triangulates the lo;
  3. `prep_lo(lo)`;
  4. `shrink_hidden(lo, rule)` shrinks the bottoms and inner book faces in UV and repacks;
  5. mark lo edges over 40° sharp;
  6. `bake_start(lo, hi, id, 'col'|'mr'|'n')` runs as an INVOKE job: poll `bpy.app.is_job_running('OBJECT_BAKE')`, then call `bake_save(id, which)`;
  7. `final_mat(lo, id)`;
  8. export a GLB (`export_vertex_color='NONE'`, tangents) to `art/meshy-source/<id>/<id>.glb`, then run `npm run models <id>`.
- `_new_faces` takes a set again. A face count was wrong because BMesh reuses freed face slots, and that broke `book_piece`.
- Books are built one shelf per call (`step_books(0|1|2)`), and `step_top()` adds the dressing (books plus a glass globe on a brass stand).
- **Weak points to revisit** (seen on the sheet): the wood surfaces are a bit clean and smooth, with little visible wear or scratching; the glass globe is opaque (one material per prop).
- **Next, in order:** mirror, glass-cart, crystal-heart, loom, bell, glass-lantern, glass-workbench, then the rest.

## Brief (unchanged)
- Remodel the 17 Act III props in Blender, much more detailed and realistic. The bar is `docs/art/weapons/warden.jpg` and the Meshy figures.
- Each prop gets:
  - real construction: joinery, planks with gaps, nails and rivets, bands, trims;
  - a bevel on every hard edge;
  - wear: chips, dirt in crevices, scratches;
  - a proper material read: grain, aged bronze, glass with thickness, cloth threads.
- Textures:
  - baked colour with AO, 1024 max;
  - metal-rough where it matters;
  - a normal map baked from the high-poly version.
- Budget: 2–6k tris per prop (they are instanced, iPad).
- Current props and contact sheets: `docs/art/act3/props*.jpg`. Old scene: `act3-props.blend`, old helpers: `props_lib.py`.
- Order:
  1. bookshelf, then mirror, then glass-cart;
  2. after the bookshelf, make the contact sheet `docs/art/act3/props-hq.jpg` (Blender Solid plus the in-game board at high quality), critique it against the bar, and continue;
  3. crystal-heart, loom, bell, glass-lantern, glass-workbench;
  4. the rest: wind-up-key, blueprint, cocoon, lily-pad ×3, glass-crystals ×2, glass-panes.
- If images appear in `art/reference/props/<id>.png` (the user generates them from `art/prompts/props/act3-props.md`), use them for the props not yet done.
- Commit each prop separately, with tris and texture sizes in the message. Run tsc and the model/render tests. Don't push. Commit only your own files.
- Answer the user in Ukrainian.

## Hard Blender rules
- Blender MCP only.
- Solid `look` only, never Material or Rendered shading.
- Calls must be short: a few seconds each.
- **One call timed out and killed the connector:** building all ~36 books (lo + hi) in one `execute_blender_code`, while the machine was heavily loaded. Build big sets in chunks, for example one shelf of books per call (see "What's next").
- Run bakes through `bpy.app.timers`, or try `bpy.ops.object.bake('INVOKE_DEFAULT', ...)` under `context.temp_override(window=...)` so the bake runs as a background job. Check `bpy.app.is_job_running('OBJECT_BAKE')` in short calls.
- The CPU is an i5-1135G7 with no GPU, so Cycles runs on the CPU. Keep samples low (8–16).
- Health check without the MCP: raw TCP JSON `{"type":"get_scene_info","params":{}}` to 127.0.0.1:9876.
- `LOCK.txt` currently says "handover to props-hq-2". Take it, and set it to FREE at the end.

## State of `act3-props-hq.blend` — SAVE IT FIRST
The file on disk was saved **before** any modelling. Everything below exists only in Blender's memory. Run `bpy.ops.wm.save_mainfile()` first thing.

- **Collections:**
  - `hq` (visible) holds the new work;
  - the old collections (`props`, `sheet`, `marsh`, `sheet-marsh`, `dressing`, `sheet-dressing`) are hidden in the view layer and untouched.
- **Bake materials:** `bk-wood`, `bk-leather`, `bk-paper`, `bk-iron`, `bk-brass`, `bk-glass`, `bk-cloth`, `bk-stone`, `bk-crystal` and `bk-rope`, all with a fake user.
- **Bookshelf objects** (game mesh at x=0; the `-hi` copies were moved to x=1.2 for side-by-side looks, so **move every `-hi` back to x=0 before baking**):

| Part | Objects | Contents | Tris lo / hi | Status |
|---|---|---|---|---|
| carcass | `bs-carcass` / `bs-carcass-hi` | two-plank sides with a 3 mm gap and an arched foot, plinth with an arch, deck, 2 shelves with front lips, ceiling board, 5 back boards with gaps, overhanging top board | 940 / 4012 | looked at, OK |
| trim | `bs-trim` / `bs-trim-hi` | cornice (fillet, bead, cove) mitred round the front, shelf pegs, iron L-brackets on the lower corners, corner straps on the top board, nail heads | 920 / 3080 | looked at, OK |
| books | `bs-books` / `bs-books-hi` | rows on 3 shelves: standing books, leaning books, a horizontal stack of 3 | ? | created in the call that timed out; **never looked at** |

  Book details:
  - lo: box, page block recessed on top, chamfered spine;
  - hi: rounded spine, raised bands, gilt strips (brass material), some title labels.

## Code (on disk, not committed yet; commit with the bookshelf)
- **`hq_lib.py`** (exec at the top of every call):
  - Kit:
    - `Kit.add(build, mat, colour, gax)` runs `build(bm, hi)` twice, once into the lo bmesh and once into the hi one;
    - faces get `material_index` (the `MATS` order), the face colour attribute `base` (linear) and the int `gax` (wood grain axis 0/1/2 = x/y/z);
    - `build` may return `[(faces, mat, colour)]` to give sub-parts another material;
    - `Kit.finish(name)` makes `<name>` and `<name>-hi`.
  - Shapes:
    - `box`, `prism` (extruded 2D outline), `sweep` (profile along a polyline with mitres), `lathe`, `cyl`, `dome` (nail or rivet heads), `sphere`;
    - lo gets 1-segment chamfers and hi gets 3-segment rounded bevels, through `bevel_piece`.
  - `bake_mat(kind)`: procedural Cycles bake material in Object space, so the hi mesh needs no UVs. It has three outputs, and `set_bake_output(which)` picks which one feeds the material output:
    - `EM_COL` (colour): base × grain/noise pattern × hue drift, AO cavity darkening plus dirt, edge wear from a Bevel-node vs. normal edge mask, brass patina in recesses, iron rust in crevices, ground dirt on the lowest 14 cm;
    - `EM_MR` (metal-rough): G roughness, B metallic;
    - `BSDF_N` (normal): Diffuse with a Bump from the pattern.
  - `prep_lo(ob)`: weighted normals modifier, smart UV project and pack.
  - Untested last edit: `_new_faces(bm, before)` now takes a face count, and every `before = set(bm.faces)` became `before = len(bm.faces)`, for speed. If the pieces come out wrong, revert to sets.
- **`bookshelf_hq.py`:** `step_carcass()`, `step_trim()`, `step_books()`, plus `book_piece` and `row`.

## What's next for the bookshelf
1. Save. `look` at `bs-books`. If it needs a rebuild, split `step_books` into one call per shelf: separate objects `bs-books-0/1/2`, each with its own Kit and seed.
2. Add the top dressing: a stack of 2 books and a glass sphere on a turned brass stand (`lathe` + `sphere`). Optional: chips on the hi edges.
3. Join the lo parts into `bookshelf` and the hi parts into `bookshelf-hi`, both at the origin. Triangulate the lo with the ngon method `EAR_CLIP` or `BEAUTY` (the plinth arch is a concave ngon).
4. Run `prep_lo(bookshelf)` and apply the WeightedNormal modifier. Check tris: aim for about 4–6k.
5. Bake 1024 colour (EMIT), then metal-rough (EMIT with `EM_MR`), then normal (`BSDF_N`, tangent space). Settings: selected-to-active hi → lo, cage extrusion about 0.006, max ray distance about 0.012, margin 8, low samples. Write the images to `art/blender/act3-props/hq-tex/` (`TEX`) as `bookshelf_col.png`, `bookshelf_mr.png` and `bookshelf_n.png`.
6. Final material `bookshelf` on the lo: a Principled BSDF with the colour image, the MR image through Separate Color (G → Roughness, B → Metallic) and the normal map.
7. Export a GLB: selection only, Y up, apply modifiers, `export_vertex_color='NONE'` (otherwise three.js darkens it), tangents on. Write it to `art/meshy-source/bookshelf/bookshelf.glb`, then run `npm run models bookshelf`.
8. In `art/prompts/manifest.json`, change the bookshelf entry:
   - `triangleBudget.max` from 1500 to about 6000;
   - `blendFile` to `act3-props-hq.blend`.
9. Check the low tier is lighter than medium (models.test). Run tsc, `tests/models` and `tests/render/props.test.ts`.
10. Make the contact sheet `docs/art/act3/props-hq.jpg` (Blender Solid with `color_type` TEXTURE, plus the in-game board at high quality), critique it against warden.jpg, then commit the bookshelf.

Then do mirror and glass-cart the same way, and the rest in the order above.
