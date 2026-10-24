# Вогнище · `campfire`

**Тип:** пропс · **стильовий блок:** D · **черга:** №69 (Хвиля 6 — Акт II «Сиві гори») · **сценарії:** 7, 8

**Куди зберегти:** `art/concepts/campfire/` — `sketch.png`, `front.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1. Правила проти «нейрослопу» — у [STYLE-LOCK.md](../ui/STYLE-LOCK.md).

**Референс:** прикріпи фото табірного вогнища в кільці каміння (без полум'я або з маленьким).

> Полум'я, іскри й світло додає код: модель — лише каміння, дрова й вугілля. Поки моделі немає, на дошці стоїть процедурна заглушка `campfire` (`src/render/environment/pieces.ts`); модель підхопиться сама через `propModels` локацій Акту II.

## 1. sketch → `sketch.png`

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game prop, for a 3D model concept. No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The prop: an UNLIT campfire: a ring of 8 rounded stones, inside it three thick logs leaning together like a low tent, a flat bed of chunky coals and ash between them. No flames, no smoke.

Layout: seen from the front and above at about 45 degrees, whole ring visible, centered, ring width about 70% of the image width, generous empty space around it.

Detail budget: nothing smaller than 1/40 of the image width; big simple blocks, no surface texture lines.
```

## 2. front → `front.png`

В **тому самому чаті**, коли ескіз влаштовує.

```text
Now color THIS exact sketch. Keep every line, shape, proportion and the view unchanged.

Style: stylized fantasy game prop concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures. Big simple chunky shapes with a clear silhouette. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight.
Lighting: soft, even, flat light from the front-left; matte, no shine, no rim light, no cast shadow.
Palette (use only these): stones #6E6A66 with shade #4A4642, logs #4A3220 with shade #2E1E14, cut log ends #9A7652, coals #2A2420 with a few flat orange coals #C8642A (flat paint, NOT glowing), ash #8A8478, outline #2B2A33.
Background: plain flat light grey #D9D9D9, no shadow, no floor, no text, no frame, no other objects.

NEGATIVE — do NOT use: glow, bloom, lens flare, god rays, volumetric light, sparkles, glints, specular highlights, glossy or plastic surfaces, 3D render look, HDR, sunset or golden-hour light, dramatic lighting, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, rust and grime texture everywhere, hyper-detailed texture, tiny repeated details, painterly brush noise, text, labels, watermarks, signatures, flames, fire, smoke, embers, sparks, glow, light on the stones, ground, grass, snow, cooking pot, tiny twigs.
```

## Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact campfire as clean game art: bigger simpler shapes, flat matte colors with one shade tone, half the details, no glow, plain light grey background, no shadow.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** предмет, видно повністю, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без підлоги й інших предметів.
- [ ] Нічого не світиться; кольори з палітри, одна тінь на колір.
- [ ] Великі прості форми, без дрібних деталей і текстури «скрізь».

## Meshy

- Image to 3D → модель **Meshy 7**, одне зображення front, без Multi-View.
- Ріг: без рігу.
- Трикутників: до 2 тис.; текстура до 1024 px. Висота в грі ≈ 0,5 гекса.
