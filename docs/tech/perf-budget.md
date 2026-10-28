# Board performance budget

What a frame of the board may cost per graphics quality, how to measure it, and where the cost went.
Measured at the default camera, 4 heroes, every room revealed (`dev/board.html?board=sN&quality=Q`).

## Budgets

Triangles and draw calls do not depend on the device, so they can be checked on any PC. Frame rate is
measured on the tablet.

| quality | triangles / frame | draw calls / frame | target |
|---|---|---|---|
| high | ≤ ~1.2M | ≤ ~200 | 30+ fps on iPad Air 13" (M2) |
| medium | ≤ ~1.0M | ≤ ~150 | as before: 55 fps on the M2 |
| low | < 300k | < 100 | weaker tablets and phones |

The numbers live in code as `PERF_BUDGET` (`src/render/perfStats.ts`). The bench table marks red what
goes over them.

## Tools

- **`dev/bench.html`**: open it once on the tablet. It goes through s0–s10 × low/medium/high, warms up
  each board (until the triangle count holds still) and then measures for 5 s with the board drawing
  every frame. It reports the average fps, p5 (the slowest 5 % of frames), calls, tris, canvas size and
  the breakdown below. At the end it shows a table and POSTs the JSON to the dev server, which writes
  `docs/tech/bench/<date>-<device>.json`. An unfinished run resumes after a reload. Options:
  `?boards=s1,s3&qualities=high&warm=3&secs=5&device=ipad-air-m2&auto=1`.
  Serve it to the LAN from a server with no HMR, so that edits elsewhere never reload the tablet
  mid-run, e.g. `npx vite --config <config with server.watch: null, hmr: false> --host --port 5180`.
- **`?perf=1`** on `dev/board.html`: the info line shows calls/tris by pass (shadow maps, scene,
  post) and by what is drawn (heroes, monsters, `env:<material>`, marsh, scatter, tiles…), with
  `(shadow)` for the shadow-map draws. `board.perf()` returns the same as JSON.
- **`devBoard.shot(name)`** in the console: waits until the scene has settled and saves the canvas
  as `docs/art/perf/<name>.jpg` through the dev server.

## Where the cost was (before, PC counts at 1366×1024)

The "high" picture cost about 2–2.5× "medium" for three reasons, none of them visible:

1. **GTAO drew the whole scene a second time** (a normal and depth pre-pass), so every mesh was
   drawn twice.
2. **That second render drew the sun's shadow map again.** three redraws `autoUpdate` shadow maps on
   every `renderer.render`, so the map (with every caster on the board) was drawn twice per frame.
3. **Big merged meshes were never culled.** The environment is merged per material, so the rocks
   around s7 were a single 252k-triangle mesh drawn in full in both passes, off screen or not. On
   s3 the marsh reeds (~410k triangles) were drawn into the sun's map as well.

On top of that, high rendered at devicePixelRatio 2 (≈5.6M pixels on the iPad 13"), with full-res
AO and its denoise.

## What changed (high keeps its look)

- **AO from the scene pass's depth** (`post.ts`): GTAO reads the depth that the scene pass already
  drew, rebuilds the normals from it and runs at half resolution. There is no second scene render
  and no second shadow-map draw.
- **The sun's map follows the view** (`fitSunToView` in `shadows.ts`): the shadow camera covers what
  the view shows plus the light-space column over it, so off-screen walls still throw their shadows
  into view. Its size moves in √2 steps (at most two) and its position in whole texels, so edges do
  not crawl while panning. The filter radius follows the texel size, so softness stays the same.
- **Swaying reed blades cast no sun shadow on high** (`SHADOW_TIERS.high.reeds`). Their stems still
  do. The blades' shadow read as noise and cost as much as all the reeds again.
- **Heavy merged materials are split into 8 m patches** (`PATCH`, `PATCH_MIN_TRIS` in
  `environment/index.ts`), so patches out of view and out of the sun's map are culled. Light
  materials stay one draw call.
- **DPR cap 1.5 on high** (`RENDERER_PRESETS.high.maxPixelRatio`).
- **Obstacles and dividers merged per room** (`mergeParts.ts`, `TileLayer.batchObstacles`). A
  piece was built one mesh per part, so a crate was 21 draw calls for 3 materials. Now each obstacle
  is first merged by material, then a room's obstacles and its dividers become one mesh per material.
  The batch is rebuilt only when something in the room changes (an obstacle added or broken, a model
  or the litter loaded in, shadow flags changed with the quality). The merged meshes keep their
  parts' shadow flags (`userData.keepShadow`). On s6 high: 534 → 377 calls before dividers.
- **Shader compiles were the s0/s9 cliffs.** Frames on the iPad took 2–5 s on s0 and s9 high, because
  kits and models that arrive late compile their shaders on first draw. On this PC a frame with +17
  programs took 17 s. The bench now warms up until neither the triangles nor the program count
  change for 3 s (`programs` and `compiled` are in `board.perf()`). The lamp redraw renders with
  one override material, so it no longer compiles a second variant of every shader for its own
  target.
- **Lamp shadow maps come from the static things only** (`redrawLamps` in `boardView.ts`): they are
  drawn in a render of their own with the figures hidden. `LAMP_LAYER` alone never kept the figures
  out, because three tests layers against the main camera in the shadow pass. So each lamp redraw
  (600 ms after a change) drew every figure 6× per lamp: a ~4.7M-triangle frame on s1, now ~1.8M. It
  also froze the figures' silhouettes in the kept maps.
- Already in place and checked: low uses the `.low` model tier (~50 % triangles), and there are no
  Морок wisps on low and fewer on medium (`QUALITY` in `environment/index.ts`).

Screenshots, before and after on high: `docs/art/perf/s1-high-*.jpg`, `s3-high-*.jpg`,
`s7-high-*.jpg`.

## Results

### Counts (device-independent): iPad before → PC now, 1366×892

| mission | quality | calls | tris |
|---|---|---|---|
| s0 | high | 337 → 192 | 1.11M → 0.56M |
| s1 | high | 659 → 383 | 1.49M → 0.75M |
| s2 | high | 1152 → 353 | 3.55M → 1.70M |
| s3 | high | 894 → 465 | 3.32M → 1.29M |
| s6 | high | 1509 → 369 | 1.48M → 0.84M |
| s6 | medium | 568 → 324 | 0.65M → 0.74M |
| s7 | high | 598 → 361 | 2.43M → 1.13M |
| s9 | high | 1351 → 287 | 3.40M → 0.67M |

s1, s3 and s7 were measured before the per-room merge; their calls are lower now. The iPad's before
numbers are in `docs/tech/bench/2026-10-25-ipad-air-m2.json`
(`node tools/bench-table.mjs <before> <after>` prints the table).

### iPad Air 13" (M2), fps

Filled in from `docs/tech/bench/` after the before and after runs.

## Still open

- **s2 high is ~1.7M triangles.** The forest flora alone is ~290k in the scene plus ~320k in the
  sun's map. It is the art density of the forest edge, so it stays until the iPad numbers say
  otherwise.
- **Calls on high are ~190–370** against ~200. Most of what remains are the figures: each monster
  is several skinned meshes, drawn again in the shadow map. Merging them would need atlased
  materials per figure.
