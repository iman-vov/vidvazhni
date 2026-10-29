# Act III props v2 (high detail): hand-over

## State 2026-10-29 ~18:30 (props-hq-3, local_e9d7e22a)
- **Done and committed (v2, 1024 col / metal-rough / normal baked from `<id>-hi`):**

  | prop | lo tris | low tier | commit |
  |---|---|---|---|
  | bookshelf | 4364 | 2594 | 7dd11fc |
  | mirror | 4228 | 2114 | f5ec9cd |
  | glass-cart | 5352 | 2708 | 6d0e6ef |
  | crystal-heart | 2246 | 1206 | 0117bb7 |
  | wind-up-key | 4508 | 3368 | 1786638 |
  | blueprint | 1756 | 1278 | 786b6bb |

  - One script per prop: `bookshelf_hq.py`, `mirror_hq.py`, `glasscart_hq.py`, `crystalheart_hq.py`, `windupkey_hq.py`, `blueprint_hq.py`.
  - The v1 objects are renamed `<id>-v1` in the blend.
- **Sheet `docs/art/act3/props-hq.jpg`:** the top row is in-game (s18 bookshelves, s16 mirrors), then one Blender row per prop.
- **In-game shots: headless Chrome works when the window does not.**
  - With the screen off or locked, the interactive Chrome tab froze and Blender's viewport did not redraw.
  - Command: `chrome.exe --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --user-data-dir=<one scratch dir> --window-size=1280,800 --virtual-time-budget=40000 --screenshot=out.png "http://localhost:5342/vidvazhni/dev/board.html?board=s16&quality=high"`. Note the `/vidvazhni/` base.
  - Larger windows crash the renderer.
  - `models.html` stays blank headless.
- **Viewport shots: Blender's offscreen viewport was stale/empty while the window did not redraw.** Looks are a Workbench render from a camera instead (`look()` in the scratchpad `view.py`: Solid/Texture, 512, about 0.5 s).
- **glass-cart has a second, clear material** `glass-cart-glass` (BLEND, no textures) on the pane faces.
  - Its UV islands are shrunk to 3%, and the hi pane faces are deleted before the bake.
  - The loader instances each primitive with its own cloned material, so it reaches the board.
  - **Not yet seen in the game:** the cart's room in s16 was off the headless frame.
  - The cart now runs along X (wheels toward the camera); v1 ran along Y.
- **Pipeline changes in `hq_lib.py`:**
  - Wood wear: edge chips (paler raw wood, rougher, dented), dark hand-worn patches, a per-piece tone (`Kit(tone=True)`, its own random stream).
  - `join_parts` marks edges over 50° sharp on lo and hi. Without it, unbevelled flat faces on smooth-shaded hi baked big normal gradients.
  - `shrink_hidden`'s rule may return its own factor.
  - Crystal faces get `use_smooth=False` on lo and hi for a faceted look (done in the join timer, see crystalheart in the transcript).
- **Weak points:**
  - The bookshelf was baked before the wood wear and the sharp-edge fix. A rebake of its col/n would improve it.
  - The rope on the cart is 6-sided on lo.
  - The heart pedestal's chips are subtle from the front.
- **Next:** loom, bell, glass-lantern, glass-workbench, then the rest (cocoon, lily pads, glass-crystals ×2, glass-panes).

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
