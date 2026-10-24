# Як не дати ChatGPT скотитися в «нейрослоп»

У кожного генератора є стиль за замовчуванням: золотий захід сонця, усе світиться, хмари по краях, кожен сантиметр перевантажений деталями, глянець, фіолетовий «злий» замок. Щоб він не сповзав туди, у кожен запит:

1. **Назви техніку, а не «красиво».** Пиши, чим це намальовано: туш і перо, пласка акварель, скан паперу.
2. **Обмеж палітру** списком HEX.
3. **Дай довгий список «НЕ»**: блок `NEGATIVE`, який нижче.
4. **Малюй у два проходи.** Спершу чорно-білий ескіз тушшю: композиція без кольору. Коли композиція влаштовує, проси розфарбувати **саме цей ескіз**, не змінюючи ліній.
5. **Додай референс**, якщо можеш: скан справжньої старої мапи з дитячої книжки чи фото настільної гри. Одна справжня картинка-приклад дає більше, ніж десять речень.
6. Якщо результат усе одно глянцевий, відповідай коротко: `Too glossy and glowing. Redo flatter: no light effects, flat washes, visible ink lines, more empty paper.`

## Спільні блоки (вставляти в кожен запит)

**STYLE**
```
Medium: traditional hand-drawn pen-and-ink linework with flat, transparent watercolor washes on warm off-white paper, as if scanned from a printed children's adventure book (1970s–1990s). Visible, slightly uneven ink lines of consistent weight. Colors are flat washes with paper texture showing through; at most a light single-tone shading on one side. Even, flat daylight. Calm, readable, restrained.
Palette (use only these): ink #2B2A33, paper #F3EAD7, forest green #6E8B4E, water blue #6F9FB8, earth ochre #C99A55, rooftop red #B5533C, stone grey #9A968C, accent gold #D8A93A (sparingly).
```

**NEGATIVE**
```
Do NOT use: glowing lights, bloom, lens flare, god rays, volumetric light, sparkles, magical glow, glowing windows, neon, sunset or golden-hour sky, dramatic sky, clouds or fog framing the edges, vignette, burnt or torn paper edges, 3D render look, glossy or plastic surfaces, airbrush gradients, hyper-detailed texture everywhere, HDR, teal-and-orange grading, high saturation, purple evil castle cliché, depth-of-field blur, text, labels, watermarks, signatures. Leave generous empty paper space; not every area needs detail.
```

## Карта кампанії: готовий промпт

Крок 1, ескіз:
```
Black-and-white pen-and-ink SKETCH of a fantasy region map for a family board-game campaign. Top-down view with a slight oblique tilt for landmarks only (landmarks drawn as small icon-like vignettes, roughly 1/15 of the map width each). Landscape 4:3. No color yet, no shading except simple hatching, no text.

Layout (left = west):
- West-centre: the small walled town of ALBA on the shore of a round lake, a tall lantern tower on its town hall, a windmill outside the walls, a small harbour pier.
- North-west, just outside Alba: THORNWOOD, a dense forest drawn as clusters of small tree symbols, with a forester's hut.
- On the river north of Thornwood: a watermill half sunk in floodwater (the Flooded Mill).
- On a lone hill between Thornwood and the mountains: an old stone watchtower.
- North and north-east: the GREY MOUNTAINS as a row of drawn peaks; in a valley among them COPPERDALE, a mining village with mine entrances, a mountain pass road and an old forge built into a cliff.
- South: the SLEEPY MARSHES, reeds, small ponds and a plank causeway, a tiny island with a heron-shaped hut.
- South-east: the GLASS CITY, a small cluster of crystal spires on a plain, a straight crystal road leading to it.
- Far east, separated by a band of hatched mist: a dark cave mouth in a rock (the Heart of Gloom) and further a thin lone tower (the Shadow Tower).
- Roads as dashed ink lines connecting all places, branching where routes split (mountains: tunnel vs. pass; middle of the map: marshes vs. glass city), all routes return to Alba.
- About 40% of the map is empty paper or simple meadow texture. No mission markers or icons: the game draws them on top.
```

Крок 2, колір (у тому самому чаті, коли ескіз влаштовує):
```
Now color THIS exact sketch. Keep every line, shape and position unchanged.
[STYLE block]
[NEGATIVE block]
The mist band in the east is a flat pale grey-violet wash (#B9B3C4), not glowing. Water is a flat blue wash with a few ink ripple lines. Same flat daylight everywhere.
```

## Інші завдання з NEXT.md: що додати до кожного запиту

Кожен запит = опис екрана з README + блоки **STYLE** і **NEGATIVE** + ці уточнення:

- **Інтерфейс** (табір, кінець сценарію, пауза, налаштування, плашки цілей). У STYLE для панелей заміни «paper» на `flat slate-blue panels #2C3A55 with a thin solid gold line #D8A93A, no bevel, no glow, no gradient`. Ілюстрація-тло — пласка акварель за тими самими правилами, і займає вона не більше чверті екрана. Текст великий і рівний, без ефектів.
- **Кубик ініціативи.** `A simple solid ivory d12 with dark ink numbers, drawn flat like a board-game icon, one soft shadow under it. No glow, no motion blur, no sparkles.` Анімацію покажи 3 кадрами поруч, а не «ефектом».
- **Кінець сценарію.** Здобич подай простими предметами на пергаменті, як на картці настільної гри, без купи золота, що сяє.
- **Плашки цілей.** Іконка з нашого аркуша v5 (опиши: `flat navy silhouette with one accent color`) плюс короткий текст. Плашка пласка, однакова для всіх типів.
