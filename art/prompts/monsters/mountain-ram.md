# Круторіг · `mountain-ram`

**Тип:** монстр · **стильовий блок:** B · **черга:** №64 (Хвиля 6 — Акт II «Сиві гори») · **сценарії:** 7, 8

**Куди зберегти:** `art/concepts/mountain-ram/` — `sketch.png`, `front.png`, `side.png`, `back.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1. Правила проти «нейрослопу» — у [STYLE-LOCK.md](../ui/STYLE-LOCK.md).

**Референс:** прикріпи до першого запиту прийнятий `art/concepts/grey-wolf/front.png` (той самий блок B, та сама гра) і, якщо є, фото справжнього гірського барана (снігового чи архара) збоку. Справжня картинка тримає стиль краще за слова.

## 1. sketch → `sketch.png`

Спершу лише форма, без кольору.

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game creature, for a 3D model concept. No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The creature: a stocky grey mountain ram, a stubborn grumpy herd animal under a misty enchantment. Big simple chunky shapes like a tabletop miniature: a barrel body, short thick legs, a heavy head held low, two huge horns that curl once around the ears in a simple thick spiral, a thick shaggy fleece drawn as 6 to 8 big rounded clumps, a short stub tail.

Layout: the ram stands on all four legs in a neutral standing pose, three-quarter front view facing left, whole body visible, centered, filling about 70% of the image height, generous empty space around it. Horns read clearly against the background and do not touch the image edge.

Detail budget: nothing smaller than 1/40 of the image width. No individual hair strands, no fur texture lines, no rings on the horns, no hooves split into parts, no harness, no bells, no rope.
```

## 2. front → `front.png`

В **тому самому чаті**, коли ескіз влаштовує.

```text
Now color THIS exact sketch. Keep every line, shape, proportion and the pose unchanged.

Style: stylized fantasy game creature concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight.
Lighting: soft, even, flat light from the front-left; matte, no shine, no rim light, no cast shadow.
Palette (use only these): fleece #C9C4BA with shade #9A958C, snow clumps in the fleece #EEF0F2, horns #8C7A5E with shade #6A5B45, face and legs #6F6A63, hooves #3E3A36, misty eyes #B9B3C4 (flat pale grey-violet, NOT glowing), fog wisps in the wool #B9B3C4 at 60% opacity as 3 to 4 simple flat curls, outline #2B2A33.
Background: plain flat light grey #D9D9D9, no floor, no shadow, no text, no frame, no other objects.
The face is grumpy and stubborn, a little funny, never scary: no teeth, no red eyes, no blood, no scars.

NEGATIVE — do NOT use: glowing eyes, glow, bloom, lens flare, god rays, sparkles, magical particles, glints, specular highlights, glossy or plastic surfaces, 3D render look, HDR, dramatic lighting, sunset or golden-hour light, snowfall, mountains or sky in the background, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, hyper-detailed fur strands, tiny repeated details, painterly brush noise, text, labels, watermarks, signatures.
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

Відповідай у тому самому чаті одним рядком:

```text
Too detailed and glossy, looks AI-generated. Redo THIS exact ram as clean game art: bigger simpler fleece clumps, flat matte colors with one shade tone, no glow in the eyes, no fur strands, plain light grey background, no shadow.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **одна** істота, видно цілу, роги не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без тексту й рамки, без гір і снігопаду.
- [ ] Очі бляклі сіро-фіолетові, **не світяться**; морда сердито-смішна, не страшна.
- [ ] Шерсть — великі прості пасма, без тонких волосків; роги — один товстий завиток.
- [ ] Бік і спина — **той самий** дизайн, кольори й поза, що на фронті.

## Модель (пізніше, не зараз)

Чотириногий, за рецептом пацюка й вовка: ріг і анімації idle, walk, attack, hit, death. Трикутників 5–10 тис., текстура до 1024 px.
