# Visual audit of s0–s10 (2026-10-25)

How: `dev/board.html?board=<id>&quality=high` with every room revealed, 1024×768, a whole-map view
(the camera's «Уся мапа» button) grabbed straight from the WebGL canvas by a headless Chrome script
(the board view is on `window.board` in the dev page for this). Screenshots are in
[docs/art/audit/](audit/) as `<id>.jpg` (before), `<id>-after*.jpg` (after the fixes below). JPG
instead of PNG to keep the repo small. One check on `medium` was planned and not done (see «Left»).

Ratings: **ok** / **weak** / **bad**. Columns: 1 walls dressed, 2 floor relief and variety,
3 props fit and cluster, 4 style consistency, 5 animation, 6 lighting.

| | 1 Walls | 2 Floor | 3 Props | 4 Style | 5 Animation | 6 Light |
|---|---|---|---|---|---|---|
| s0 tutorial | **bad → ok**: had no location at all (generic stone room, bare walls); now the cellar kit, torches, shelves | **weak**: flagstone grid reads as tiles | **bad → ok**: lone barrels → cellar sets | **ok** | **ok**: torches flicker, wisps | **bad → ok**: no lights → 5 point lights |
| s1 cellar | **ok**: kit walls, torches, racks, cobwebs | **weak**: regular flagstone grid, «bathroom tiles» | **ok**: racks, kegs, sacks in clusters | **ok** | **weak**: only flames and wisps; nothing small moves | **ok** |
| s2 thorn path | **weak**: thicket edge is a row of identical blob bushes (beads) | **weak**: one even orange litter carpet | **weak**: ring had no sets → now fern/rock/stump clumps | **weak**: low-poly cone/sphere trees vs painted Meshy props | **ok**: leaves, fireflies, sway | **ok**: dusk |
| s3 flooded mill | **ok**: timber fence with lanterns, reeds | **ok**: mud, water, lilies, puddles | **ok** (+ shore and sack sets) | **weak**: blob trees outside | **ok**: water, wheel, fireflies | **ok** |
| s4 watchtower | **ok**: kit walls, slits, ivy, torches | **weak**: worn-stone grid reads as tiles | **weak → ok**: lone barrels and crates along the front wall → sets with candles, shelves | **ok** | **weak**: flames only | **ok** (cold) |
| s5 gloom heart | **ok**: rock, crystals | **weak**: one rock texture, all purple | **weak → ok**: scattered singles → stalagmite/crystal/mushroom clumps, lit braziers, cult candles | **ok** | **weak → ok**: no particles → purple motes | **weak**: monotone purple, no warm accent (braziers added) |
| s6 mine tunnel | **bad**: the mine edge reads as a low wooden fence, not a rock tunnel | **weak**: dark, flat | **weak**: mine-cart, mine-support, ore-pile, mine-lantern are procedural stand-ins | **bad**: night-moth has no model (box tokens) | **ok**: dust, lamp flicker | **bad → weak**: too dark on a tablet; light raised |
| s7 mountain pass | **ok**: snow-capped stone | **weak**: flat grey cobble, snow decals as dots | **weak**: campfire, pennant-pole procedural | **weak**: mountain-ram and the shepherd have no models | **ok**: blowing snow | **weak**: flat grey, little contrast |
| s8 Copperdale | **ok**: palisade, lit windows, torches | **weak**: bright flat cobble with polka-dot stains | **weak → ok**: lone barrels and crates in the ring → tavern corner, keg racks | **weak**: campfire, mine-cart, ore-pile procedural; far houses read as boxes | **ok**: snow | **ok** |
| s9 dark depths | **weak**: again the wooden mine fence | **ok**: rock, still water pool | **ok**: stalagmites, crystals, mushrooms | **weak**: mine-cart/support procedural | **ok**: dust, water | **weak**: very dark; light raised |
| s10 old forge | **ok**: stone, candles | **bad**: bright flagstone grid, the most tile-like floor | **weak**: forge, anvil, chain-hoist, dark-lantern procedural boxes | **bad**: Hammerfist has no model | **ok**: sparks, forge glow | **ok**: red haze |

Interior walls: s1, s4, s5, s9 straight; s2, s6, s8 partitions are low wooden fences (being reworked
by the straight-walls session, not touched here).

## Top 10 fixes by visual impact

| # | Fix | Where | Size | Status |
|---|---|---|---|---|
| 1 | Floors on `flagstones` / `worn-stone` / `cobblestone` read as a tile grid (s0, s1, s4, s8, s10): irregular slab sizes, offset rows, per-slab tint and height, broken grout, worn edges | renderer/code (surfaces.ts, relief.ts) | medium | open |
| 2 | Act II figures without models: night-moth, mountain-ram, Hammerfist, shepherd → box tokens | art (Meshy, meshy-act2 session) | large | open |
| 3 | Act II props without models: mine-cart, mine-support, ore-pile, mine-lantern, campfire, pennant-pole, forge, anvil, dark-lantern, chain-hoist | art | large | open |
| 4 | Small-things layer: pebbles, tufts, flowers, mushrooms, twigs, leaves, straw, shards, bones, candle stubs, ore, coal, scraps, snow, reeds — clumped, off hex middles, per quality | renderer/code (`scatter.ts`) | medium | **done** |
| 5 | Mine edge (s6, s9) is a low fence: needs rock walls with timber frames and lamps | renderer/code (plan.ts `mine` style) | medium | open |
| 6 | Lone props → clusters: sets for watchtower, thorn-path, flooded-mill, gloom-heart; Copperdale ring without single barrels/crates | data/dressing | small | **done** |
| 7 | s0 had no location: now the cellar (kit walls, torches, lights, sets) | data/dressing | small | **done** |
| 8 | Forest edge (s2) and outdoor trees (s2, s3): bead-like blob bushes and cone trees; use the env-thorn-path kit thickets/trees or painted models | art + data | large | open |
| 9 | Too dark / too flat light: s6, s9 raised hemi and lamp light; s5 warm braziers + purple motes; s7 still flat grey (needs a warmer sun and darker rock tint) | data/dressing | small | s5, s6, s9 **done**; s7 open |
| 10 | Things that should move and do not: lever and chest lids (single-mesh GLBs), banners only sway on cloth pieces, no fireflies/motes table entries for Act II and the cellar | renderer/code (life.ts) + Blender split | small/medium | open |

Also seen: Copperdale `house-far` silhouettes look like boxes (data: swap for trees or remove, small).

## What changed in this pass

- `data/environments/cellar.json`: also plays s0.
- `data/environments/{watchtower,thorn-path,flooded-mill,gloom-heart,copperdale}.json`: dressing sets;
  watchtower/gloom-heart/copperdale get candles (candles-stone), shelves, tavern tables, keg racks
  from existing models; gloom-heart gets lit braziers and a purple dust `weather`.
- `data/environments/{mine-tunnel,dark-depths}.json`: more hemisphere and lamp light.
- `src/render/environment/scatter.ts` (new) + hook in `index.ts` (`buildScatter`, `busyHexes`):
  ~200–400 tiny instanced things per map on high, 65 % medium, 30 % low; tufts and reeds sway;
  candle stubs flicker with the lights. Test: `tests/render/scatter.test.ts`.
- `src/render/boardDev.ts`: `?board=s0` loads the tutorial map; `window.board` for screenshot scripts.

## Left

- The `medium` check and «after» shots of s2 overview, s7–s10 were not taken (dev server restarts).
- The small things are subtle from the default camera; if the user wants them louder, raise `SIZE`
  or `perHex` in `scatter.ts`.
- Fixes 1, 2, 3, 5, 8, 10 and s7 lighting.
- `tests/render/obstacles.test.ts` (obstacle-clusters session, uncommitted) fails on s2
  (18 < 20 items); not caused by this pass (obstacles.ts reads no dressing data).
