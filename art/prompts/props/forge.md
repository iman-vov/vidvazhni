# Горн · `forge`

**Тип:** пропс · **стильовий блок:** D · **черга:** №71 (Хвиля 6 — Акт II «Сиві гори») · **сценарії:** 10

**Куди зберегти:** `art/concepts/forge/` — `sketch.png`, `front.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1. Правила проти «нейрослопу» — у [STYLE-LOCK.md](../ui/STYLE-LOCK.md).

**Референс:** прикріпи фото старого ковальського горна з цегли з витяжкою, і прийнятий `art/concepts/brazier/front.png`.

> Сценарний об'єкт (6 hp): жар і вогонь додає код — у моделі вугілля пласке, темно-помаранчеве. Поки моделі немає, на дошці стоїть процедурна заглушка `forge` (`src/render/environment/pieces.ts`); модель підхопиться сама через `propModels` локацій Акту II.

## 1. sketch → `sketch.png`

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game prop, for a 3D model concept. No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The prop: an old blacksmith forge: a waist-high block hearth of big dark bricks, a shallow coal bed on top, above it a wide four-sided stone hood narrowing into a short square chimney, a simple iron bar frame in front of the hood, a small wooden-and-leather bellows on the right side.

Layout: seen from the front-left and slightly above (three-quarter view), whole forge visible, centered, forge height about 80% of the image height, generous empty space around it.

Detail budget: nothing smaller than 1/40 of the image width; big simple blocks, no surface texture lines.
```

## 2. front → `front.png`

В **тому самому чаті**, коли ескіз влаштовує.

```text
Now color THIS exact sketch. Keep every line, shape, proportion and the view unchanged.

Style: stylized fantasy game prop concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures. Big simple chunky shapes with a clear silhouette. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight.
Lighting: soft, even, flat light from the front-left; matte, no shine, no rim light, no cast shadow.
Palette (use only these): bricks and hood #3E3430 with shade #2A2420, brick seams #6A5A50, iron #3C3C42 with shade #24242A, coals #2A2420 with a few flat orange coals #C8642A (flat paint, NOT glowing), bellows wood #6A4A30, leather #5A3A2A, outline #2B2A33.
Background: plain flat light grey #D9D9D9, no shadow, no floor, no text, no frame, no other objects.

NEGATIVE — do NOT use: glow, bloom, lens flare, god rays, volumetric light, sparkles, glints, specular highlights, glossy or plastic surfaces, 3D render look, HDR, sunset or golden-hour light, dramatic lighting, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, rust and grime texture everywhere, hyper-detailed texture, tiny repeated details, painterly brush noise, text, labels, watermarks, signatures, fire, flames, glow, glowing coals, smoke, sparks, light spill, tools hanging everywhere, horseshoes, anvil, background wall, floor.
```

## Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact forge as clean game art: bigger simpler shapes, flat matte colors with one shade tone, half the details, no glow, plain light grey background, no shadow.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** предмет, видно повністю, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без підлоги й інших предметів.
- [ ] Нічого не світиться; кольори з палітри, одна тінь на колір.
- [ ] Великі прості форми, без дрібних деталей і текстури «скрізь».

## Meshy

- Image to 3D → модель **Meshy 7**, одне зображення front, без Multi-View.
- Ріг: без рігу.
- Трикутників: до 5 тис.; текстура до 1024 px. Висота в грі ≈ 1,9 гекса.
