# Молотобій · `hammerfist`

**Тип:** бос · **стильовий блок:** A · **черга:** №66 (Хвиля 6 — Акт II «Сиві гори») · **сценарії:** 10

**Куди зберегти:** `art/concepts/hammerfist/` — `sketch.png`, `front.png`, `side.png`, `back.png`, `portrait.png`.

> Молот замість правої кисті — це частина моделі, як жорно в Мірошника. Ліва кисть порожня й відкрита. Тому з блоку A прибрано «empty open hands».

Окремий чат у ChatGPT для цієї моделі. Формат 1:1. Правила проти «нейрослопу» — у [STYLE-LOCK.md](../ui/STYLE-LOCK.md).

**Референс:** прикріпи прийнятий `art/concepts/bog-miller/front.png` (інший бос, той самий блок A, той самий масштаб «великий, але добрий»). Можна додати фото старого кам'яного ковальського горна.

## 1. sketch → `sketch.png`

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game character, for a 3D model concept. No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The character: Hammerfist, an old blacksmith giant made of grey stone and copper, enchanted and sleepy, not evil. Painted tabletop-miniature proportions: a huge barrel chest, short thick legs, a small head about one sixth of body height, very large forearms. Instead of the right hand he has a big blacksmith hammer head of grey stone bound with two copper bands, fused to the wrist. The left hand is a large open stone hand. In the middle of the chest there is a round forge opening with a simple grate of 3 bars. A thick leather blacksmith apron hangs from the chest to the knees. A short square stone beard. 4 to 5 simple moth shapes sit on the shoulders and the apron, each drawn as a small closed triangle.

Layout: full body, centered, front view, standing in a relaxed A-pose with arms angled down about 45 degrees away from the body, legs slightly apart, the hammer arm hanging down beside the leg. The figure fills about 80% of the image height, generous empty space around it.

Detail budget: nothing smaller than 1/40 of the image width. Stone is 8 to 12 big flat facets, not rubble; no cracks pattern, no runes, no rivets, no chains, no tools on a belt.
```

## 2. front → `front.png`

В **тому самому чаті**, коли ескіз влаштовує.

```text
Now color THIS exact sketch. Keep every line, shape, proportion and the A-pose unchanged.

Style: stylized fantasy game character concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight.
Lighting: soft, even, flat light from the front-left; matte, no shine, no rim light, no cast shadow.
Palette (use only these): stone body #8E8A82 with shade #6B675F, copper bands and copper patches #B8733E with shade #8A5530, hammer head #7C7870, leather apron #6B4A32 with shade #4E3524, beard #A39E94, the forge opening inside #C8642E as ONE flat orange color with a flat darker #8A3E1E shade (NOT glowing, no light cast on the body), eyes #B9B3C4 flat pale grey-violet (misty, sleepy), moths #2F2A3A, outline #2B2A33.
Background: plain flat light grey #D9D9D9, no floor, no shadow, no text, no frame, no other objects.
The face is tired and confused like someone woken at night, a little sad, never angry: no teeth, no fangs, no red eyes, no fire breath.

NEGATIVE — do NOT use: glowing forge light, glowing eyes, embers, sparks, flying particles, smoke plumes, fire on the body, glow, bloom, lens flare, god rays, volumetric light, heat haze, glints, specular highlights, metallic shine, glossy or plastic surfaces, 3D render look, HDR, dramatic lighting, sunset or golden-hour light, forge or cave in the background, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, cracks and rubble everywhere, runes, hyper-detailed texture, tiny repeated details, painterly brush noise, text, labels, watermarks, signatures.
```

## 3. side → `side.png`

```text
Show exactly the same character with identical design, colors, proportions and A-pose, seen from the left side. Same flat background, same flat lighting, no shadow.
```

## 4. back → `back.png`

```text
Show exactly the same character with identical design, colors, proportions and A-pose, seen from behind. Same flat background, same flat lighting, no shadow.
```

## 5. portrait → `portrait.png`

Там само, після бокового й заднього вигляду. Для іконки в інтерфейсі й мовця в історії; у модель не йде.

```text
Portrait bust of exactly the same character, same flat matte style and colors, facing slightly to the side, sleepy confused expression, plain flat light grey background, no glow, square 1:1, for a game UI icon.
```

## Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact giant as clean game art: bigger simpler stone facets, flat matte colors with one shade tone, the chest forge one flat orange with no light, no sparks or embers, plain light grey background, no shadow.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** персонаж, ціла фігура, A-поза; молот — продовження правої руки, ліва кисть відкрита.
- [ ] Горно в грудях — пласка помаранчева пляма, **нічого не світиться**, немає іскор і диму.
- [ ] Обличчя сонне й розгублене, не зле.
- [ ] Рівний світло-сірий фон, **без тіні**, без кузні на тлі.
- [ ] Бік, спина й портрет — **той самий** дизайн і кольори.

## Модель (пізніше, не зараз)

Гуманоїд до 25 тис. трикутників: idle, walk, attack, hit, death і rage для другої фази. Метелики на плечах — частина меша; призвані метелики — окремі моделі `night-moth`.
