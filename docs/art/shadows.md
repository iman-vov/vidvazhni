# Shadows on the board (2026-10-25)

Code: `src/render/shadows.ts` (tiers, caster rules, sun fit), `src/render/shadowBake.ts` (low-tier bake),
wiring in `src/render/boardView.ts`. Screenshots in `docs/art/shadows/` (1024×768, `?board=sN&quality=…`).

## What each level does

| Level | Shadows | Who casts |
|---|---|---|
| high | sun shadow map 2048², PCF with a soft radius of 3 texels, the orthographic camera fitted tightly to the board and its walls; bias follows the texel size | every opaque lit mesh taller than 1.2 cm: walls, dividers, obstacle clusters, props, figures, litter planks |
| medium | sun shadow map 1024², radius 1.5 | only big things: taller than 30 cm, or wider than 45 cm and taller than 10 cm (figures, walls, barrels, furniture) |
| low | no shadow maps. Once per build, room reveal or prop load, the static casters are drawn into a top-down texture over the board: squashed along the sun onto the floor for their shadows, and straight down, darker near the floor, for contact occlusion. The texture is blurred and multiplied over the floor by one decal. Figures keep their blob. | all static casters |

Decisions:
- **The sun now comes from the far left**, direction (0.7, −1, 0.5). It used to stand behind the camera, so every shadow fell behind its object and could not be seen.
- **The sun is the key light.** In the locations the sun gave about 10 % of the floor's light; sky, image light and lamps gave the rest, so a shadow was 90 % as bright as the lit floor. Now the sun is ×4 and the sky and image light are ×0.55. Overall brightness stays about the same, and a shadow keeps roughly 2/3 of the light.
- **Nothing whose top is at or below the floor casts.** The hex plates under the floor had put the whole floor in their own shadow.
- **Small instanced scatter (pebbles, leaves, straw) casts nothing.** At 1–2 texels its shadow would be invisible, and it would cost a full extra pass. GTAO and the blob already ground it. Planks and sticks from the obstacle litter do cast on high.
- **Lamp shadows exist but are off** (`SHADOW_TIERS.high.lamps = 0`). One lantern's cube map cost 6–70 ms even when limited to the 60k triangles nearest to it (A/B below).
- **The bake runs at most once per 250 ms**, and only when the casters changed (a key built from the caster set and positions). Async loads had kept postponing a debounced bake forever.

## Frame time (Iris Xe laptop, headless Chrome, 1024×768, ms per frame)

A/B in the same page, with shadows switched on and then off (median of 5×20 frames). Other sessions were busy on the same machine, so ±2 ms is noise.

| | s1 | s2 | s6 | s8 |
|---|---|---|---|---|
| low: baked decal on / off | 10.8 / 11.0 | 11.2 / 15.1 | 14.9 / 14.4 | 14.2 / 14.2 |
| medium: sun on / off | 12.7 / 9.3 | 38.1 / 30.6 | 29.2 / 23.1 | 22.1 / 24.3 |
| high: sun on / off | 40.4 / 35.2 | 95.4 / 76.0 | 50.4 / 44.4 | 61.9 / 50.4 |
| high: + one lamp (now off) | 60.0 | 163.9 | 89.5 | 77.6 |

- **low:** the bake costs nothing measurable per frame. The bake itself is a few ms, done once.
- **high:** the sun shadow costs 5–19 ms. s2's forest edge is the most expensive.

Whole-frame numbers before this work (HEAD 5366044, same method): low s1 13.2, s2 9.0, s6 11.8; high s1 57.1, s2 67.7, s6 58.3. The scenes have grown since then (thicket, floors, rocks), so whole-frame before/after does not isolate the shadows. The A/B table above does.

## Look

- `s1-low.jpg` / `s1-high.jpg` / `s1-medium.jpg`: shadows of the wall, the divider (right of it) and the barrels fall to the lower right.
- `s1-zooms.jpg`: top row is low, bottom row is high. It shows the barrel pile, the leaning crate, broken boards and a figure.
- `s2-*`, `s6-*`: forest palisade and trees, and the mine. These were taken before the latest floor and rock commits, with the same shadow code.

Low reads as baked-in: soft, dark and grounded, with an occlusion rim at the foot of the walls. High is softer and lighter, because the lamps and GTAO still fill in.

## Left / follow-ups

- High shadows could be stronger in the torch-lit indoor maps (s1, s6), where the lamps dominate. The next step would be per-location key/fill values in the environment JSON instead of the global ×4 / ×0.55.
- s8 at high, and all levels after the latest floor and rock commits, were not re-shot. Another session's mid-edit of `thicket.ts` kept breaking the page. Repeated GPU-heavy headless runs also coincided with two PC freezes, so the screenshot runs were kept short.
- `tests/render/scatter.test.ts` fails on the leaf-pile kit model (0.0037 > 0.003). That is the scatter kit session's file, not this change.
