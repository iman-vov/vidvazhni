# Концепти середовища для ChatGPT

Мета: поле бою не має висіти в порожнечі. Кожна локація має свій світ навколо гексів: стіни, краї, рослинність, світло, туман Мороку. Концепти потрібні для того, щоб потім зібрати в Blender (через MCP) набір деталей середовища й підібрати освітлення в three.js.

## Порядок

Після макета головного меню. Одна локація — один чат. Спершу `cellar` (сценарій 1), бо його граємо зараз.

Файли: `art/environment/<id>/overview.png` (загальний вигляд), далі `kit.png` (аркуш деталей) і, за потреби, `v2.png`. Після кожної локації — рядок у `art/environment/REPORT.md`.

## Стильовий блок (англійською)

```
Environment concept art for a cozy fantasy tactical board game, painted tabletop-diorama look, warm hand-painted textures, soft even lighting, view from above at a 50-degree angle like a game camera. A playable area of stone or ground tiles in the centre (simple flat walkable floor, no clutter on it), surrounded by rich scenery that frames it: walls, edges, plants and props that make it feel like a real place, not a floating board. Soft grey magical fog creeping in from the edges. No characters, no text, no UI. Landscape 16:9.
```

Для аркуша деталей (`kit.png`) у тому самому чаті:
```
Now show the separate building pieces of this same environment laid out on a plain light grey background, each piece on its own with space around it, same style and colours: wall segments, a corner, a doorway with a door, floor edge pieces, and 6 to 8 props typical for this place. Orthographic three-quarter view, no shadows, no text.
```

## Локації

| № | id | Сценарій | Опис для промпту (додати до стильового блоку) |
|---|---|---|---|
| 1 | `cellar` | 1. Підвал «Ситого Гусака» | `A tavern cellar: old wooden floor planks and stone walls with arches, oak barrels and crates along the walls, hanging onions and sausages, a wine rack, a few candles and a lantern giving warm light, cobwebs in the corners, a wooden staircase going up to the tavern.` |
| 2 | `thorn-path` | 2. Тернова стежка | `A forest path through thorny bushes: mossy forest floor, roots, fallen leaves, dense thorn thickets with autumn leaves at the edges, tall dark trees framing the scene, a shallow ravine on one side, a forester's hut with a glowing window at the far end.` |
| 3 | `flooded-mill` | 3. Затоплений млин | `A flooded watermill: a muddy courtyard, a stone sluice with a rusty lever, shallow water with reeds and lily pads, a big mossy mill wheel, the mill hall with wooden beams and flour sacks, grey swamp fog.` |
| 4 | `watchtower` | 4. Стара сторожова вежа | `An old stone watchtower inside: grey stone walls, a gate room, a barracks with bunks, a spiral staircase to an upper floor, glowing violet rune stones on the floor, banners in black and violet, torches.` |
| 5 | `gloom-heart` | 5. Серце Мороку | `A cave under the mountains: rough dark rock with faint violet crystals, three cold stone braziers, a stolen warm golden light trapped in a glass orb at the centre, thick grey fog, stalactites framing the view.` |
