# Кріплення штольні · `mine-support`

**Тип:** пропс · **стильовий блок:** D · **черга:** №68 (Хвиля 6 — Акт II «Сиві гори») · **сценарії:** 6, 9

**Куди зберегти:** `art/concepts/mine-support/` — `sketch.png`, `front.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1. Правила проти «нейрослопу» — у [STYLE-LOCK.md](../ui/STYLE-LOCK.md).

**Референс:** прикріпи фото дерев'яного кріплення в старій шахті (дверний оклад: дві стійки й верхняк).

> Стоїть на гексі як перешкода: ширина ≈ 1 гекс, нічого не виступає назад. Поки моделі немає, на дошці стоїть процедурна заглушка `mine-support` (`src/render/environment/pieces.ts`); модель підхопиться сама через `propModels` локацій Акту II.

## 1. sketch → `sketch.png`

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game prop, for a 3D model concept. No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The prop: a mine tunnel timber support frame: two thick upright square wooden posts, slightly leaning inward, with a heavy square cross beam (cap) resting on top, two short diagonal wooden braces in the upper corners, two flat stones under the post feet, a few loose planks laid across the top of the cap.

Layout: seen straight from the front and slightly above, the frame facing the viewer like a doorway, whole frame visible, centered, frame height about 75% of the image height, generous empty space around it.

Detail budget: nothing smaller than 1/40 of the image width; big simple blocks, no surface texture lines.
```

## 2. front → `front.png`

В **тому самому чаті**, коли ескіз влаштовує.

```text
Now color THIS exact sketch. Keep every line, shape, proportion and the view unchanged.

Style: stylized fantasy game prop concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures. Big simple chunky shapes with a clear silhouette. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight.
Lighting: soft, even, flat light from the front-left; matte, no shine, no rim light, no cast shadow.
Palette (use only these): posts and braces #4A3220 with shade #2E1E14, cap beam #7A5434 with shade #4A3220, stones #5E5248 with shade #3A322C, outline #2B2A33.
Background: plain flat light grey #D9D9D9, no shadow, no floor, no text, no frame, no other objects.

NEGATIVE — do NOT use: glow, bloom, lens flare, god rays, volumetric light, sparkles, glints, specular highlights, glossy or plastic surfaces, 3D render look, HDR, sunset or golden-hour light, dramatic lighting, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, rust and grime texture everywhere, hyper-detailed texture, tiny repeated details, painterly brush noise, text, labels, watermarks, signatures, rock wall behind it, tunnel, rails, lantern, cobwebs, cracks, splinters, wood grain lines, nails.
```

## Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact mine support as clean game art: bigger simpler shapes, flat matte colors with one shade tone, half the details, no glow, plain light grey background, no shadow.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** предмет, видно повністю, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без підлоги й інших предметів.
- [ ] Нічого не світиться; кольори з палітри, одна тінь на колір.
- [ ] Великі прості форми, без дрібних деталей і текстури «скрізь».

## Meshy

- Image to 3D → модель **Meshy 7**, одне зображення front, без Multi-View.
- Ріг: без рігу.
- Трикутників: до 2 тис.; текстура до 1024 px. Висота в грі ≈ 1,45 гекса.
