# Монстри Акту II: концепти для ChatGPT

Концептів ще немає для трьох істот Акту II: **Круторіг** (`mountain-ram`), **Нічний метелик** (`night-moth`) і бос **Молотобій** (`hammerfist`). Дані лежать у `data/monsters/` і `data/bosses/`, опис — у [docs/design/act2.md](../../docs/design/act2.md).

**Що робити:**
1. Для кожної істоти відкрий **окремий новий чат** у ChatGPT, формат картинки квадрат 1:1.
2. Прикріпи до першого повідомлення концепт з Акту I, який вказано в розділі (референс стилю).
3. Встав **крок 1** (чорно-білий ескіз). Перегенеровуй, доки форма й поза не влаштують.
4. У **тому самому чаті** встав **крок 2** (колір саме цього ескізу).
5. Якщо картинка поїхала в глянець чи сяйво, відповідай рядком «Якщо поїхало».
6. Збережи результат як `art/concepts/<monster-id>/v1.png`, тобто `art/concepts/mountain-ram/v1.png`, `art/concepts/night-moth/v1.png`, `art/concepts/hammerfist/v1.png`. Ескіз можна зберегти поруч як `sketch.png`.

Картинка потім піде в Meshy (image-to-3D), тому на ній **одна** істота, ціла, у пів-оберта спереду, на рівному світло-сірому фоні, без сцени, без тіні, нічого не торкається країв. Коли `v1.png` прийнято, бік і спину для Multi-View доробляй у тому самому чаті блоками `side` і `back` з файлу моделі: [mountain-ram](monsters/mountain-ram.md), [night-moth](monsters/night-moth.md), [hammerfist](bosses/hammerfist.md). Прийнятий фронт збережи також як `front.png`, бо пайплайн Meshy шукає саме його. Правила проти «нейрослопу» описано в [ui/STYLE-LOCK.md](ui/STYLE-LOCK.md).

---

## 1. Круторіг · `mountain-ram`

Упертий сірий гірський баран під туманними чарами. Атакує розгоном і бодається лобом. Сценарії 7, 8.

**Референс:** прикріпи `art/concepts/grey-wolf/front.png` (чотириногий, той самий стиль) і, якщо маєш, фото справжнього архара чи снігового барана збоку.

### Крок 1 · ескіз

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game creature, for a 3D model concept (it will be converted to a 3D model from this single image). No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The creature: a stocky grey mountain ram, a stubborn grumpy herd animal under a misty enchantment. Painted tabletop-miniature proportions, chunky and slightly cute: a barrel-shaped body about 1.6 times as long as it is tall, short thick legs about one third of the total height, a heavy head held a little low, two huge horns that curl ONCE around the ears in a simple thick spiral (each horn about as wide as the head), a thick fleece drawn as 6 to 8 big rounded clumps, a short stub tail.

Pose and view: standing calmly on all four legs, all four hooves on the same ground line, legs apart and not overlapping much, head straight, mouth closed. Three-quarter FRONT view, the body turned about 30 degrees to the viewer's left, so both horns, the face and the front legs are clearly visible. Full body visible, centered, the creature fills about 70% of the image height, at least 12% empty margin on every side. Nothing touches or crosses the image edges. One single clear silhouette, no scene, no ground drawing, no props.

Detail budget: nothing smaller than 1/40 of the image width. No individual hair strands, no fur texture lines, no growth rings on the horns, no split hooves, no harness, no bells, no rope.
```

### Крок 2 · колір

```text
Now color THIS exact sketch. Keep every line, shape, proportion, the pose and the view unchanged.

Style: stylized fantasy game creature concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures, like a premium board-game miniature painted by hand. Big simple chunky shapes, clear silhouette, readable as a small thumbnail. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight (about 2 px at 1000 px width).
Detail budget: nothing smaller than 1/40 of the image width; large calm areas of one flat color.
Lighting: flat, even, matte light from the front-left. No shine, no rim light, no cast shadow, no contact shadow.
Palette (use only these): fleece #C9C4BA with shade #9A958C, snow clumps in the fleece #EEF0F2, horns #8C7A5E with shade #6A5B45, face and legs #6F6A63, hooves #3E3A36, misty eyes #B9B3C4 (flat pale grey-violet, NOT glowing), fog wisps in the wool #B9B3C4 as 3 to 4 simple flat curls, outline #2B2A33.
Background: plain flat light grey #D9D9D9 filling the whole image. No floor, no shadow, no text, no frame, no other objects.
The face is grumpy and stubborn, a little funny, never scary: no teeth, no red eyes, no blood, no scars.

NEGATIVE — do NOT use: glowing eyes, glow, bloom, lens flare, god rays, volumetric light, sparkles, magical particles, glints, specular highlights, glossy or plastic surfaces, 3D render look, HDR, teal-and-orange grading, dramatic lighting, sunset or golden-hour light, snowfall, mountains, rocks or sky in the background, ground, grass, cast shadow, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, hyper-detailed fur strands, tiny repeated details, painterly brush noise, cropped horns or hooves, a second animal, text, labels, watermarks, signatures.
```

### Якщо поїхало

```text
Too detailed and glossy, looks AI-generated. Redo THIS exact ram as clean game art: bigger simpler fleece clumps, flat matte colors with one shade tone, no glow in the eyes, no fur strands, whole body with empty margin on all sides, plain light grey background, no shadow.
```

---

## 2. Нічний метелик · `night-moth`

Пухнастий метелик завбільшки з кота, слуга Тінерука. Літає, а його пилкова хмара наводить Сум'яття. Він радше милий, ніж страшний. Сценарії 6, 9, 10, а ще його призиває Молотобій.

**Референс:** прикріпи `art/concepts/shadow-wraith/front.png` (теж слуга Тінерука, той самий стиль) і фото справжнього пухнастого нічного метелика (шовкопряд, совка).

### Крок 1 · ескіз

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game creature, for a 3D model concept (it will be converted to a 3D model from this single image). No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The creature: a large fluffy night moth the size of a cat, more cute than scary, like a plush toy. Painted tabletop-miniature proportions: a round fuzzy body made of 3 soft segments, a round head about one third of the body length with two big round eyes, a fuzzy collar between head and body, two short feathery antennae drawn as simple leaf shapes, four broad rounded wings (front pair larger, back pair smaller), each wing with ONE simple round eye-spot. Six short legs tucked under the body, barely visible.

Pose and view: hovering in a calm resting pose, wings spread wide, symmetric and held flat, body level. Three-quarter FRONT view from slightly above: the body turned about 30 degrees to the viewer's left and the camera about 20 degrees above, so the face, both antennae and the top of all four wings are clearly visible. Full creature visible, centered, wingspan about 70% of the image width, at least 12% empty margin on every side. Nothing touches or crosses the image edges. One single clear silhouette, no scene, no props, no flowers or lamps.

Detail budget: nothing smaller than 1/40 of the image width. No vein patterns on the wings, no scales, no fur strands, no dust trails, no particles. Wings are 4 big simple flat shapes, no thin separate pieces.
```

### Крок 2 · колір

```text
Now color THIS exact sketch. Keep every line, shape, proportion, the pose and the view unchanged.

Style: stylized fantasy game creature concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures, a soft velvet feel shown only by flat color. Big simple chunky shapes, clear silhouette, readable as a small thumbnail. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight (about 2 px at 1000 px width).
Detail budget: nothing smaller than 1/40 of the image width; large calm areas of one flat color.
Lighting: flat, even, matte light from the front-left. No shine, no rim light, no cast shadow.
Palette (use only these): wings and body #2F2A3A with shade #1F1B28, fuzzy collar #4A4258, eye-spots on the wings #7A5FA0 (flat violet, NOT glowing), eyes #D9D4E6 with a flat dark pupil #2B2A33, antennae #5A5068, outline #2B2A33.
Background: plain flat light grey #D9D9D9 filling the whole image. No shadow, no text, no frame, no other objects.
The face is round and sleepy-cute: no fangs, no mandibles, no red eyes.

NEGATIVE — do NOT use: glowing eyes, glowing eye-spots, glow, bloom, lens flare, god rays, volumetric light, sparkles, magical dust, pollen clouds, glowing particles, fireflies, light trails, glints, specular highlights, iridescence, glossy or plastic surfaces, 3D render look, HDR, teal-and-orange grading, dramatic or moonlit lighting, night sky, stars, moon, lamps or candles, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, wing vein patterns, hyper-detailed fur, tiny repeated details, painterly brush noise, cropped wing tips, a second moth, text, labels, watermarks, signatures.
```

### Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact moth as clean game art: bigger simpler wing shapes, flat matte dark violet, eye-spots flat and not glowing, no particles or dust, whole moth with empty margin on all sides, plain light grey background, no shadow.
```

---

## 3. Бос Молотобій · `hammerfist`

Старий велетень-коваль з каменю й міді, зачарований і сонний, а не злий. Замість правої кисті в нього молот, у грудях горно. Сценарій 10.

> Молот на місці правої кисті входить у саму модель, як жорно в Мірошника. Ліва кисть порожня й відкрита. Поза — A-поза (для рігу гуманоїда), лише трохи повернута в пів-оберта.

**Референс:** прикріпи `art/concepts/bog-miller/front.png` (інший бос, той самий стиль, той самий масштаб «великий, але добрий»).

### Крок 1 · ескіз

```text
Black-and-white clean ink line SKETCH of ONE stylized fantasy game character, for a 3D model concept (it will be converted to a 3D model from this single image). No color, no shading, no hatching texture, no text. Square 1:1, plain white background.

The character: Hammerfist, an old blacksmith giant made of grey stone and copper, enchanted and sleepy, not evil. Painted tabletop-miniature proportions: a huge barrel chest, short thick legs about one third of the height, a small head about one sixth of the body height, very large forearms. Instead of the right hand he has a big blacksmith hammer head of grey stone bound with two copper bands, fused to the wrist. The left hand is a large open empty stone hand. In the middle of the chest there is a round forge opening with a simple grate of 3 bars. A thick leather blacksmith apron hangs from the chest to the knees. A short square stone beard. 4 to 5 simple moth shapes sit on the shoulders and the apron, each drawn as a small closed triangle.

Pose and view: relaxed A-pose, arms angled down about 45 degrees away from the body, hands not touching the body, legs slightly apart, both feet flat on the same ground line, the hammer arm hanging down beside the leg. Three-quarter FRONT view, the body turned only about 20 degrees to the viewer's left, so the face, the chest forge, the hammer and the open hand are all clearly visible. Full body visible, centered, the figure fills about 80% of the image height, at least 8% empty margin on every side. Nothing touches or crosses the image edges. One single clear silhouette, no scene, no anvil, no props.

Detail budget: nothing smaller than 1/40 of the image width. Stone is 8 to 12 big flat facets, not rubble; no crack pattern, no runes, no rivets, no chains, no tools on a belt.
```

### Крок 2 · колір

```text
Now color THIS exact sketch. Keep every line, shape, proportion, the A-pose and the view unchanged.

Style: stylized fantasy game character concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted matte textures, like a premium board-game boss miniature painted by hand. Big simple chunky shapes, clear silhouette, readable as a small thumbnail. Flat matte colors with exactly ONE darker shade tone per color, no gradients. Clean dark outline of even weight (about 2 px at 1000 px width).
Detail budget: nothing smaller than 1/40 of the image width; large calm areas of one flat color.
Lighting: flat, even, matte light from the front-left. No shine, no rim light, no cast shadow.
Palette (use only these): stone body #8E8A82 with shade #6B675F, copper bands and copper patches #B8733E with shade #8A5530, hammer head #7C7870, leather apron #6B4A32 with shade #4E3524, beard #A39E94, the forge opening inside #C8642E as ONE flat orange color with a flat darker #8A3E1E shade (NOT glowing, no light cast on the body), eyes #B9B3C4 flat pale grey-violet (misty, sleepy), moths #2F2A3A, outline #2B2A33.
Background: plain flat light grey #D9D9D9 filling the whole image. No floor, no shadow, no text, no frame, no other objects.
The face is tired and confused like someone woken at night, a little sad, never angry: no teeth, no fangs, no red eyes, no fire breath.

NEGATIVE — do NOT use: glowing forge light, glowing eyes, embers, sparks, flying particles, smoke plumes, fire on the body, glow, bloom, lens flare, god rays, volumetric light, heat haze, glints, specular highlights, metallic shine, glossy or plastic surfaces, 3D render look, HDR, teal-and-orange grading, dramatic lighting, sunset or golden-hour light, forge, anvil or cave in the background, ground, cast shadow, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, cracks and rubble everywhere, runes, hyper-detailed texture, tiny repeated details, painterly brush noise, cropped feet or hammer, a second figure, text, labels, watermarks, signatures.
```

### Якщо поїхало

```text
Too detailed and glowing, looks AI-generated. Redo THIS exact giant as clean game art: bigger simpler stone facets, flat matte colors with one shade tone, the chest forge one flat orange with no light, no sparks or embers, whole body in A-pose with empty margin on all sides, plain light grey background, no shadow.
```

---

## Перевірити перед тим, як прийняти `v1.png`

- [ ] Рівно **одна** істота, видно цілу, нічого не обрізано і нічого не торкається країв.
- [ ] Пів-оберта спереду: морду й головні частини (роги, крила, молот) видно чітко.
- [ ] Рівний світло-сірий фон `#D9D9D9`, **без тіні**, без землі, без сцени й тексту.
- [ ] **Нічого не світиться**: очі, плями на крилах і горно — пласкі кольори.
- [ ] Великі прості форми, одна тінь на колір, без шерстинок, жилок і тріщин.
- [ ] Стиль поруч з концептом-референсом з Акту I виглядає як одна гра.
