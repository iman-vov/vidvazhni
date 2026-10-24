# Нічний метелик · `night-moth`

**Тип:** монстр · **стильовий блок:** C · **черга:** №65 (Хвиля 6 — Акт II «Сиві гори») · **сценарії:** 6, 9, 10 (і призов Молотобія)

**Куди зберегти:** `art/concepts/night-moth/` — `sketch.png`, `front.png`, `side.png`, `back.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1. Правила проти «нейрослопу» — у [STYLE-LOCK.md](../ui/STYLE-LOCK.md).

**Референс:** прикріпи прийнятий `art/concepts/shadow-wraith/front.png` (той самий блок C, теж слуга Тінерука) і фото справжнього пухнастого нічного метелика (шовкопряд, совка) згори. Метелик — більше милий, ніж страшний.

## 1. sketch → `sketch.png`

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game creature, for a 3D model concept. No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The creature: a large fluffy night moth the size of a cat, more cute than scary. Big simple chunky shapes like a tabletop miniature: a round fuzzy body made of 3 soft segments, a round head with two big round eyes, two short feathery antennae drawn as simple leaf shapes, four broad rounded wings spread wide and flat, each wing with ONE simple round eye-spot. Six tiny legs tucked under the body, barely visible.

Layout: hovering in a neutral resting pose, wings fully spread and symmetric, seen from the front and slightly above (three-quarter top view), whole creature visible, centered, wingspan about 75% of the image width, generous empty space around it.

Detail budget: nothing smaller than 1/40 of the image width. No vein patterns on the wings, no scales, no fur strands, no dust trails, no particles.
```

## 2. front → `front.png`

В **тому самому чаті**, коли ескіз влаштовує.

```text
Now color THIS exact sketch. Keep every line, shape, proportion and the pose unchanged.

Style: stylized fantasy game creature concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures, soft velvet feel shown only by flat color. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight.
Lighting: soft, even, flat light from the front-left; matte, no shine, no rim light, no cast shadow.
Palette (use only these): wings and body #2F2A3A with shade #1F1B28, fuzzy collar #4A4258, eye-spots on the wings #7A5FA0 (flat violet, NOT glowing), eyes #D9D4E6 with a flat dark pupil #2B2A33, antennae #5A5068, outline #2B2A33.
Background: plain flat light grey #D9D9D9, no shadow, no text, no frame, no other objects.
The face is round and sleepy-cute, like a plush toy: no fangs, no mandibles, no red eyes.

NEGATIVE — do NOT use: glowing eyes, glowing eye-spots, glow, bloom, lens flare, god rays, sparkles, magical dust, glowing particles, fireflies, light trails, glints, specular highlights, iridescence, glossy or plastic surfaces, 3D render look, HDR, dramatic or moonlit lighting, night sky, stars, moon, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, wing vein patterns, hyper-detailed fur, tiny repeated details, painterly brush noise, text, labels, watermarks, signatures.
```

## 3. side → `side.png`

```text
Show exactly the same creature with identical design, colors, proportions and pose, seen from the left side. Same flat background, same flat lighting, no shadow.
```

## 4. back → `back.png`

```text
Show exactly the same creature with identical design, colors, proportions and pose, seen from behind. Same flat background, same flat lighting, no shadow.
```

## Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact moth as clean game art: bigger simpler wing shapes, flat matte dark violet, eye-spots flat and not glowing, no particles or dust, plain light grey background, no shadow.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** метелик, крила цілі, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без зірок, місяця й пилу.
- [ ] Плями на крилах і очі **не світяться**; мордочка мила, без щелеп.
- [ ] Форма проста й цілісна: крила — 4 великі пласкі площини, без тонких відокремлених шматків (анімує код).
- [ ] Бік і спина — **той самий** дизайн, кольори й поза.

## Модель (пізніше, не зараз)

Без рігу: змахи крил і гойдання робить код (крила — окремі площини, щоб їх можна було повертати). Трикутників 3–6 тис., текстура до 1024 px.
