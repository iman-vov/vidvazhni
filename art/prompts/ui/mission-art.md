# Ілюстрації місій для сюжетного інтро (ChatGPT)

Навіщо: перед місією гра показує розмову пані Марти й героїв (`src/app/screens/storyScene.ts`, `missionArt`). Діалог лишається внизу, а за ним на весь екран стоїть **ілюстрація місії**. Поки картинки немає, гра показує розмитий шматок карти кампанії довкола позначки місії.

Куди класти результат:
- оригінал `art/ui-mockups/story/missions/<scenarioId>.png` (наприклад `s3.png`), 1920×1080;
- у гру: `public/story/<scenarioId>.webp`, 1920×1080, якість ≈ 82 (той самий кадр, лише стиснутий). Гра бере файл саме за цим ім'ям, і більше нічого підключати не треба;
- `art/ui-mockups/story/missions/manifest.json`, див. блок «Маніфест» нижче.

Тексти сцен узято з `data/story/uk.json`, другий акт з `docs/design/act2.md`. Правила проти «нейрослопу» з [STYLE-LOCK.md](STYLE-LOCK.md).

## Як просити

1. **Референси обов'язкові.** До кожного запиту прикріпи `art/ui-mockups/camp/assets/background.png` (це наш мальований стиль A: теплий пергамент і дерево) і портрети героїв, які є в кадрі, з `art/ui-mockups/camp/assets/heroes/` (`warden.png`, `wind-archer.png`, `herbalist.png`, `rogue.png`, `elementalist.png`, `tinker.png`). Для Марти — `art/ui-mockups/camp/assets/marta.png`. Обличчя й одяг не вигадувати, лише з цих картинок.
2. **Два проходи.** Крок 1: чорно-білий ескіз (рядок «Sketch» місії + `Black-and-white clean ink line sketch only, no color, no shading, no hatching. Landscape 16:9.`). Коли композиція влаштовує, крок 2 у тому самому чаті: `Now color THIS exact sketch. Keep every line, shape and position unchanged.` + STYLE + NEGATIVE + COMPOSITION RULES + рядок «Palette accents» місії.
3. **Одна місія на запит.** Спільні блоки вставляй повністю щоразу: скорочений запит повертає генератор до глянцю й заходу сонця.
4. **Якщо результат поплив**, встав цей рядок:
   `Too glossy, glowing and detailed, looks AI-generated. Redo as the attached camp background: flat warm matte light, one cel-shade tone per color, bigger simpler shapes, half the details, no glow, no sparkles, calm dark lower third, no text.`
5. Якщо герої вийшли не схожі: `The heroes must match the attached portraits exactly: same faces, hair, clothes and colors. Keep them small, mid-ground, seen from behind or in three-quarter view.`

### Блок STYLE (вставляти завжди)

```
Style: hand-painted 2D STORYBOOK scene for a family fantasy co-op board game, matching the attached camp background exactly: warm parchment-and-wood world, soft painted shapes, the same brush finish and the same scale of characters. Big simple chunky shapes with clear silhouettes; clean dark-brown outline (#3A2A20) of even weight on characters and key objects only; every color has its base tone plus exactly ONE darker cel-shade tone, no airbrush gradients.
Detail budget: nothing smaller than 1/60 of the image width. Trees are 3–5 big rounded blobs, stones are big simple shapes, planks are wide boards (at most 8 visible per wall), no texture noise. At least 35% of the picture is calm flat areas of one color.
Lighting: flat, even, matte, cool-neutral daylight or a plain warm interior light from the top-left. One soft shadow side. Light sources (lanterns, fires, braziers) are drawn as simple flat shapes with a flat lighter color around them, NOT glowing.
Canvas: 1920×1080, landscape 16:9, a full-bleed painting with no frame and no border.
Base palette (use mostly these): outline #3A2A20, parchment #E9DFC6, warm wood #9C6B3F, dark wood #5E3F27, stone #9A968C, moss green #7E9A55, forest #4F6B3C, water #6F8FA0, earth #B98A55, roof red #A9503A, mist lilac #B9B3C4, shadow navy #2C3A55, accent gold #D8A93A (sparingly).
```

### Блок NEGATIVE (вставляти завжди)

```
Do NOT use: glow, bloom, lens flare, god rays, light beams, volumetric light, sparkles, magic particles, fireflies, glowing eyes, glowing runes, glowing windows, neon, sunset or golden-hour sky, dramatic sky, backlight, rim light, vignette, clouds or fog framing the edges, smoke frame, torn or burnt paper edges, frame, border, gloss, plastic look, 3D render look, HDR, teal-and-orange grading, oversaturated colors, depth-of-field blur, hyper-detailed texture everywhere, tiny repeated details, scattered coins, sparkle highlights, specular highlights, blood, gore, scary faces, close-up faces, text, letters, numbers, signs with writing, labels, UI, watermark, signature.
```

### Блок COMPOSITION RULES (вставляти завжди)

```
Composition rules for a game cut-scene background:
- The LOWER THIRD (bottom 360 px) is calm and darker: plain floor, water, grass or shadow in one or two flat dark tones (#2C3A55 / #3A2A20 range), no figures, no key objects, no high contrast there. A dialogue box will cover it.
- The key location and the key object of the mission sit in the UPPER-MIDDLE band (between 15% and 60% of the height), readable at a glance.
- Characters, if any, are small to medium (at most 30% of the image height), in the mid-ground, standing on the line at about 62% of the height, seen from behind or in three-quarter view. Nobody looks at the viewer.
- Leave the top-right corner (about 300×120 px) simple and quiet: a «Skip» button sits there.
- No text of any kind anywhere in the picture.
```

### Блок «Маніфест» (додавати до кроку 2)

```
Also give me manifest.json next to the image:
{ "file": "<scenarioId>.png", "size": [1920, 1080], "use": "story intro background, full screen behind the dialogue", "safeArea": { "dialogBand": [0, 720, 1920, 1080], "skipButton": [1620, 0, 1920, 120] } }
```

## Промпти місій

Кожна місія: рядок **Sketch** (для кроку 1 і як опис сцени в кроці 2) і рядок **Palette accents** (додати до кроку 2). Хто з героїв у кадрі: беремо стартовий загін або тих, хто є на референсі; якщо генератор плутається з шістьма героями, лиши двох-трьох зі спини.

### `s0` — Навчання: двір «Ситого Гусака»

```
Sketch: the back yard of a cosy village inn «The Fat Goose», morning. Upper-middle: the timber-framed inn wall with a wide kitchen door; Marta (as in marta.png) leans out of the doorway pointing towards a low wooden cellar hatch on the left. On the right a woodpile, two barrels and a well. In the mid-ground the Warden (as in warden.png) stands with shield raised, seen in three-quarter view from behind. Three small fat rats peek out of the open cellar hatch — cute, not scary. Lower third: plain packed-earth yard in shadow.
Palette accents: inn plaster #EFE6D2, timber #5E3F27, hatch #9C6B3F, rats #8A7A6A.
```

### `s1` — Підвал «Ситого Гусака»

```
Sketch: the inn's wine cellar at night, seen from the bottom of a wooden staircase. Upper-middle: a low vaulted stone cellar with rows of big kvass barrels (do not show any broken barrel), shelves with jars; in the far corner a messy little hoard of spoons, buttons and a frying pan stacked on a crate. Two small mischievous goblin-like thieves peek from behind the barrels. Upper left: the staircase going up to a warm open door where Marta's silhouette holds a lantern. Mid-ground: two or three heroes (as in the attached portraits) just stepping down, seen from behind. Lower third: dark flat stone floor.
Palette accents: barrels #8A5A32, cellar stone #7C746A, lantern light area flat #E7C27A (no glow), shadows #2C3A55.
```

### `s2` — Тернова стежка

```
Sketch: a narrow path through a thorn forest at dusk-free grey daylight. Upper-middle: the path winds between big rounded bramble bushes towards a small forester's hut far away on the right, with a pale flat lilac light spot near the hut (the lantern shard light), drawn as a flat shape, not glowing. Low flat mist bands lie along the ground like a creeping cat. Between the bushes three pairs of simple yellow eyes (flat yellow dots, no glow). Mid-ground: the party of heroes walking along the path, seen from behind. Lower third: dark thorny undergrowth in one flat dark green.
Palette accents: brambles #4F6B3C, thorns #3A2A20, mist #B9B3C4 flat bands, eyes #E2C04A flat, hut roof #A9503A.
```

### `s3` — Затоплений млин

```
Sketch: an old watermill standing knee-deep in floodwater. Upper-middle: the mill building with a big wooden water wheel on the left (simple spokes, 8 paddles), a sluice gate with a large lever on a stone weir to the right. Two bandits with clubs guard a muddy yard on a raised strip of land. From a dark mill window a big, wet, bulky silhouette is just visible (the Bog-Miller), only a shape with two plain eyes, not scary. Mid-ground: heroes wading in from the left on a plank causeway, seen in three-quarter view from behind. Lower third: flat dark floodwater with a few simple wave lines.
Palette accents: water #5E7E8E, mud #7A5A3A, mill wood #8A5A32, reeds #7E9A55, weir stone #9A968C.
```

### `s4` — Стара сторожова вежа

```
Sketch: a ruined stone watchtower on a lone hill above a mountain pass. Upper-middle: the tall round tower with a broken top; on its top tier a cold flat violet light shape in two windows (flat color, NOT glowing); a locked iron-bound door at the top tier reached by an outer stair. At the tower base two stone guardian statues with simple runes carved on their chests (runes as plain carved lines, no glow). Two hooded cultists in purple robes walk on the outer stair, one has a big key on his belt. Mid-ground: the heroes climbing the hill path, seen from behind. Lower third: dark flat hillside grass.
Palette accents: tower stone #8E8A80, cultist robes #5B3F72, cold window light #9A86C2 flat, grass #6E8A4A, sky plain #C9CFD3.
```

### `s5` — Серце Мороку

```
Sketch: a huge cave hall under the Grey Mountains, entered through a broken door of black glass. Upper-middle: a wide dark cavern; along the walls a row of cold, unlit iron braziers (5 of them), one at the front already lit with a small flat orange flame shape. At the far end, on a rock step, the Shadowhand: a thin hooded sorcerer in dark robes holding a caged ball of stolen light (flat pale-yellow shape, not glowing), black moths sit on the rocks around him as simple dark shapes. Mid-ground: the whole party standing together at the doorway, seen from behind, the Warden in front. Lower third: flat dark cave floor.
Palette accents: cave rock #4A4652, black glass #2A2830 with one flat lighter facet #6A6874, flame #D8893A flat, stolen light #EAD9A0 flat, moths #2B2A33.
```

### `s6` — Гуркіт у штольні

```
Sketch: inside an old mine gallery. Upper-middle: a long timber-propped tunnel going into the distance; mine-cart rails along the floor; at the far end the wooden frame of a mine lift with a rope and a hanging platform (the escape goal). Cracks run across the ceiling and a few small rocks fall in the middle distance (simple shapes, no dust clouds). On the right a mine cart stuck on the rails with a small worried gremlin (Flip) sitting inside. Mid-ground: heroes hurrying along the rails, seen from behind. Lower third: dark flat tunnel floor with the rails fading out.
Palette accents: timber props #7A5232, mine rock #6E6458, rails #4A4A50, cracks #2B2A33, gremlin #8FA36A.
```

### `s7` — Вітряний перевал

```
Sketch: a high narrow mountain pass in strong wind, plain grey-blue daylight. Upper-middle: a narrow ledge path along a cliff, leading to the wooden gate of an old border outpost on the right with a lookout platform where a crossbowman holds a horn. A big shaggy mountain ram stands on a rock above the path. Wind drawn as 4–5 simple curved lines, snow streaks as a few flat strokes, flags on the outpost flapping. Mid-ground: an old shepherd with a crook and a bundle walking in the middle of the heroes, everyone seen in three-quarter view from behind. Lower third: the dark flat rock face and abyss in one flat shadow tone.
Palette accents: cliff #8C8A86, snow #E8ECEE, sky plain #B8C6CF, outpost wood #6E4A2E, ram wool #D9D0BE, shepherd cloak #7A6A4A.
```

### `s8` — Полонені Мідної Долини

```
Sketch: a small snowy mining village at night under a plain dark-blue sky with no stars. Upper-middle: a village square with a crackling bonfire in the middle (flat orange flame shapes, no glow, no sparks), three wooden cages with captured miners in them standing around the square, storage barns behind, a bell on a post on the left with a crossbowman by it, the miners' office (a small house with a lamp in the window drawn as a flat yellow square) on the right. Two or three purple-hooded cultists patrol. Mid-ground: heroes sneaking in from the left behind a snowdrift, seen from behind. Lower third: dark flat snow in shadow.
Palette accents: snow #DDE3E8, snow shadow #8E9BB0, night sky #2C3A55, cages wood #6E4A2E, fire #D8893A flat, cultists #5B3F72.
```

### `s9` — Темні глибини

```
Sketch: deep, dark lower mine tunnels. Upper-middle: a tunnel opening into a cavern; far away, a huge stone gate of the old forge with a round seal carved into it (plain carved shapes). Along the way a few unlit braziers. Most of the picture is in flat dark tones; the only light is the miner's lamp carried by one hero in the mid-ground, drawn as a flat lighter circle of color around the lamp (radius about 1/8 of the width), NOT glowing, no rays. At the edge of that light, a few night moths as simple pale shapes drawn to the lamp. Other heroes stay close inside the lit circle, seen from behind. Lower third: almost black flat floor.
Palette accents: darkness #1E2230, tunnel rock #3E3A44, lamp light circle flat #C9A86A, lamp #D8A93A, moths #CFC6B0, seal stone #6E6A72.
```

### `s10` — Стара кузня

```
Sketch: the Hall of the Forge deep under the mountains. Upper-middle: a huge stone hall with two big forges on the left and right, their fire drawn as flat orange shapes; in the centre on a massive anvil stands the Dark Lantern, a dark iron lantern with a flat purple-black core (not glowing). Behind the anvil the Hammerfist: an old, huge, kindly blacksmith giant with a beard and a big hammer, eyes half-closed as if bewitched, not scary. A few black moths circle the forges as simple shapes. Mid-ground: the heroes facing the giant, seen from behind. Lower third: dark flat stone floor with a few simple floor cracks.
Palette accents: forge stone #6A5E54, forge fire #D8893A flat, iron #4A4A50, lantern core #3B2A4A, giant skin #C9A07A, giant beard #8A8A8A, leather apron #6E4A2E.
```

## Що далі

Коли файл готовий: перевести в `public/story/<scenarioId>.webp` (1920×1080) і запустити сценарій — інтро візьме картинку сама. Перевір, що нижня третина темна й рівна, бо там діалог.
