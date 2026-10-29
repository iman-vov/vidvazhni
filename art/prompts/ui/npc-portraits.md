# Портрети NPC для сюжету (ChatGPT)

Навіщо: сюжетні сцени (`src/app/screens/storyScene.ts`) показують мовця великим портретом, а репліки в бою й аутро — круглим значком. У героїв і пані Марти портрети вже є, у решти NPC поки стоїть сірий силует. Імена й характери взято з `docs/design/story.md`.

Куди класти результат: `art/ui-mockups/story/assets/npc/<id>.png` (по пояс) і `art/ui-mockups/story/assets/npc/<id>-token.png` (круглий значок), плюс `art/ui-mockups/story/assets/npc/manifest.json`.

## Черга

| id | Хто | Що потрібно |
|---|---|---|
| `marta` | пані Марта, корчмарка | готово (`marta-token.png`); значок у грі як `src/ui/game/assets/portraits/marta.webp` |
| `bruno` | мірошник Бруно, звільнений від туману | готово; значок у грі як `portraits/bruno.webp` (мовець `bruno` у s3.win) |
| `bog-miller` | Бруно під туманом (бос s3) | по пояс; значок уже є як фішка боса |
| `shadowhand` | Тінерук, чаклун, що краде світло | по пояс; значок уже є як фішка боса |
| `lumo` | Лумо, учень ліхтарника (Тінерук у минулому) | готово; значок `portraits/lumo.webp` чекає, поки Лумо заговорить |
| `lina` | Ліна, донька рудокопа (Акт II) | готово; значок у грі як `portraits/lina.webp` |
| `theo` | Тео, рудокоп, тато Ліни (Акт II) | готово; значок у грі як `portraits/theo.webp` |
| `heron` | стара Чапля з Сонних боліт | готово (`heron.png`, `heron-token.png`); значок уже в грі як `src/ui/game/assets/portraits/heron.webp` |
| `ida` | майстриня Іда, стара ліхтарниця (Акт III, Скляне місто) | по пояс + значок; промпт у розділі «Акт III» нижче |
| `mist-queen` | Королева Туману, бос s15 | по пояс + значок (значок = і фішка боса); промпт у розділі «Акт III» |
| `glass-guardian` | Скляний Сторож, бос s20, потім друг | по пояс + значок (значок = і фішка боса); промпт у розділі «Акт III» |

## Як просити

1. **Додай референси.** До кожного запиту прикріпи `art/ui-mockups/camp/assets/marta.png` і `art/ui-mockups/camp/assets/heroes/warden.png`: так генератор тримає той самий масштаб, мазок і пропорції голови. Одна справжня картинка важить більше, ніж десять речень.
2. **Два проходи.** Спершу чорно-білий ескіз (крок 1). Коли поза й обличчя влаштовують, у тому самому чаті проси розфарбувати **саме цей ескіз** (крок 2).
3. **Один персонаж на запит.** Спільні блоки нижче вставляй щоразу повністю, бо скорочений запит повертає генератор до його звичного «глянцевого» вигляду.
4. **Якщо результат поплив**, встав цей рядок:
   `Too glossy and detailed, looks AI-generated. Redo as the attached hero art: same flat warm light, two cel-shade tones per color, bigger simpler shapes, no glow, no sparkles, plain transparent background, same waist-up crop.`

### Блок STYLE (вставляти завжди)

```
Style: hand-painted 2D STORYBOOK character illustration for a family fantasy board game, matching the attached reference characters exactly (same head-to-body proportions, same soft rounded faces, same brush finish, same scale). Waist-up, three-quarter view, the character looks slightly to the side with a readable, kind or characterful expression. Big simple shapes and a clear silhouette; clean dark outline (#3A2A20) of even weight; every color has its base tone plus exactly ONE darker cel-shade tone, with no airbrush gradients.
Detail budget: nothing smaller than 1/40 of the image width. At most 3 accessories per character. Hair is drawn as 4–6 big locks, not strands. Cloth folds are 3–5 big shapes. The face stays the most detailed part.
Lighting: flat, even, matte daylight from the top-left. One soft shadow side. No rim light, no glow, no shine.
Canvas: 1024×1024, genuine transparent background (alpha), the figure cut off at the waist by the bottom edge, head top about 6% below the top edge, centered.
```

### Блок NEGATIVE (вставляти завжди)

```
Do NOT use: glow, bloom, lens flare, god rays, light beams, sparkles, magic particles, fireflies, glowing eyes, glowing objects, neon, sunset or golden-hour light, dramatic backlight, rim light, vignette, cloud or fog frame, smoke frame, background scenery, floor shadow, frame or border, gloss, plastic skin, 3D render look, HDR, teal-and-orange grading, oversaturated colors, depth-of-field blur, hyper-detailed texture, tiny repeated details, embroidery patterns, jewelry clutter, weapons drawn, blood, scary faces, text, letters, labels, watermark, signature.
```

### Блок «деталі для гри» (додавати до кроку 2)

```
Also give me, as separate files on a transparent background, with no text baked in:
1. <id>.png — the waist-up figure, 1024×1024, exactly as above.
2. <id>-token.png — a round token portrait 512×512: head and shoulders of the SAME character, centered, filling a circle of 470 px diameter; outside the circle fully transparent; no frame or ring (the game draws the ring).
3. manifest.json: [{ "file": "<id>.png", "size": [1024,1024], "use": "story scene portrait, waist-up" }, { "file": "<id>-token.png", "size": [512,512], "use": "round speaker badge", "circle": { "cx": 256, "cy": 256, "r": 235 } }].
```

## Промпти персонажів

У кожному запиті: **Крок 1** = рядок «Sketch» нижче + `Black-and-white clean ink line sketch only, no color, no shading, no hatching, transparent background.` **Крок 2** = `Now color THIS exact sketch. Keep every line, shape and position unchanged.` + STYLE + NEGATIVE + рядок «Palette» персонажа + блок «деталі для гри».

### `marta`: лише значок

```
Use the attached marta.png as the ONLY source of the face, hair and clothes. Make <id>-token.png only (see the game-parts block): her head and shoulders, same white headscarf, curly brown hair, rosy round face, gentle smile, brown apron straps over a cream blouse. Do not include the lantern.
Palette (only these): skin #F2C3A0, skin shade #D99A7A, hair #7A4A2A, hair shade #5A3420, headscarf #EFE6D2, apron #7B4B2E, blouse #F1E6CC, outline #3A2A20.
```

### `bruno`: мірошник, уже вільний

```
Sketch: BRUNO THE MILLER, a tired, kind old miller of about 60, large and round-shouldered, a big grey moustache, bald crown with grey hair at the sides, bushy eyebrows, flour dust on his cheeks shown as 3 simple pale patches, a rumpled linen shirt with rolled sleeves, a patched brown waistcoat, a flour sack held against his chest with both arms. A relieved, slightly embarrassed smile.
Palette (only these): skin #EBB898, skin shade #C98E70, hair and moustache #B8B2A8, shirt #E9E2D0, waistcoat #6E5134, patches #8C6A3F, sack #D9CBA8, flour #F6F2E8, outline #3A2A20.
```

### `bog-miller`: Бруно під туманом (бос s3)

```
Sketch: the BOG MILLER, the same old miller Bruno (big moustache, bald crown, round shoulders) but under a curse: draped in hanging pond weed and reeds, his clothes soaked and dark, a mill-wheel paddle in one hand held upright like a staff, eyes half-closed and confused (not evil), mouth open mid-grumble. Funny, not scary: a child should feel sorry for him.
Palette (only these): skin #B7B48F, skin shade #8F8C6C, weed #5E7F45, weed shade #3F5B30, wet cloth #4B4A3E, paddle wood #7A5A3A, mud #6B5A3E, outline #2B2A33. The curse is shown only by these muted green colors and the weed, not by any glow or smoke.
```

### `shadowhand`: Тінерук

```
Sketch: SHADOWHAND, a tall, thin sorcerer in a long hooded cloak of layered dark cloth, the hood down to show a pale, narrow, polite face with a thin smile and calm half-lowered eyelids; one gloved hand raised at chest height with fingers spread elegantly; a round glass orb hangs on a chain on his chest (dark inside, NOT glowing). Courteous and arrogant, never monstrous. The cloak's lower edge breaks into 5–6 simple moth-wing shapes.
Palette (only these): face #DCD3D8, face shade #B3A8B2, cloak #3B3550, cloak shade #2A2540, lining #5B4F78, glove #2B2A33, chain #9A968C, orb glass #8FA4B8, outline #1F1D26.
```

### `lumo`: Лумо, учень ліхтарника

```
Sketch: LUMO, a shy apprentice lantern-maker of about 14, the young Shadowhand before the fall: thin, big worried eyes, messy dark hair falling over his forehead, a too-big leather work apron over a sky-blue shirt, rolled sleeves, a small unlit lantern frame and a pair of pliers held close to his chest. Hopeful, a little scared.
Palette (only these): skin #F0C9A8, skin shade #CFA07E, hair #3B3550, shirt #8FB3CF, shirt shade #6F93AF, apron #8A5E3B, lantern brass #C99A4A, outline #3A2A20.
```

### `lina`: донька рудокопа

```
Sketch: LINA, a brave miner's daughter of about 10, round face with freckles, two short thick braids, a too-big miner's helmet with an unlit candle holder pushed back on her head, a mustard-yellow scarf, a dark-green work jacket with rolled sleeves, a small pickaxe resting on her shoulder (head pointing back). A big determined grin.
Palette (only these): skin #F2C7A2, skin shade #D49F7C, hair #8A4B2A, helmet #9A968C, scarf #D8A93A, jacket #4E6B45, jacket shade #3A5234, pickaxe wood #7A5A3A, outline #3A2A20.
```

### `theo`: рудокоп, тато Ліни

```
Sketch: THEO, a broad-shouldered miner of about 40, Lina's father: short dark beard, kind tired eyes, the same freckles as Lina, a grey wool cap, a soot-grey canvas jacket with a leather shoulder pad, a coil of rope over one shoulder, a hand on his belt. Warm, calm, dependable.
Palette (only these): skin #E3B08E, skin shade #BF8A6A, beard and hair #4A3426, cap #7D7A73, jacket #6C6A66, jacket shade #4F4D4A, leather #7A5A3A, rope #C9B07A, outline #3A2A20.
```

### `heron`: стара Чапля

```
Sketch: OLD HERON, a tall, very old marsh wise-woman with a long neck and a long sharp nose, grey hair in a high bun stuck with two reed stalks, small round spectacles, a long grey-blue shawl like folded wings, a wooden staff topped with a carved heron head. A dry, knowing half-smile.
Palette (only these): skin #E6CDB8, skin shade #C4A894, hair #C9C5BE, shawl #7F96A6, shawl shade #5F7686, dress #5E6B55, staff #7A5A3A, reed #9AA868, outline #2B2A33.
```

## Акт III: один спільний запит (`ida`, `mist-queen`, `glass-guardian`)

Цей розділ іде за правилом із `STYLE-LOCK.md`, але **без ескізного проходу**: генератор малює одразу в кольорі, всі три персонажі в одному повідомленні. Спільні стиль і заборони стоять один раз зверху, далі по блоку на кожного з шляхом до файлу. Стара Чапля вже намальована (`heron.png`), її сюди не додавай: вона потрібна лише як референс.

**Перед відправкою прикріпи 3 картинки:** `art/ui-mockups/story/assets/npc/heron.png`, `art/ui-mockups/camp/assets/marta.png`, `art/ui-mockups/camp/assets/heroes/warden.png`. Чапля задає той самий пласкіший «книжковий» мазок, що в усіх NPC; Марта й Вартовий тримають масштаб голови.

**Куди класти результат:** `art/ui-mockups/story/assets/npc/<id>.png` і `<id>-token.png`, рядки додай у `manifest.json` там же. Значок `<id>-token.png` потім перетворюється на `src/ui/game/assets/portraits/<id>.webp` (160×160, як `heron.webp`): у Королеви й Сторожа це водночас і фішка боса на полі, і значок мовця в сюжеті. Код уже шукає ці файли за id, тож нічого більше міняти не треба.

**Якщо результат поплив**, встав цей рядок:
`Too glossy and too detailed, looks AI-generated. Redo all three exactly like the attached heron.png: flat matte colors with ONE darker shade each, even dark outline, big simple shapes, no glow, no sparkles, no particles, transparent background, same waist-up crop.`

### Повідомлення (копіюй цілим)

```
Make 3 character portraits for a family fantasy board game, all in ONE consistent style. Paint them directly in final color (no sketch step). The attached heron.png is the exact style target: copy its line weight, flat colors, face proportions and finish. The attached marta.png and warden.png show the head size and proportions to match.

SHARED STYLE (applies to all three):
- Technique: hand-painted 2D storybook cartoon, like the character art of a modern family tabletop game; clean dark outline of even weight (#3A2A20, about 3 px at 1024 px), flat matte fills, every color = base tone + exactly ONE darker cel-shade tone. No airbrush gradients, no texture brushes.
- Pose and crop: waist-up, three-quarter view, head top about 6% below the top edge, the body cut off by the bottom edge, centered; the character looks slightly to the side with a readable, friendly or characterful face. Nobody looks scary: a 6-year-old must like every one of them.
- Detail budget: nothing smaller than 1/40 of the image width. At most 3 accessories per character. Hair or wings = 4–6 big shapes, cloth folds = 3–5 big shapes. The face is the most detailed part; everything else stays simple.
- Lighting: flat, even, matte daylight from the top-left; one soft shadow side; no rim light, no shine, no highlights on glass or metal beyond one flat lighter shape.
- Background: genuine transparent background (alpha). No scenery, no floor, no shadow under the figure, no frame.
- Shared palette (plus each character's own colors below, nothing else): outline #3A2A20, skin #EBC2A2, skin shade #C99A7E, warm white #F1E8D6.

NEGATIVE (for all three): no glow, no bloom, no lens flare, no god rays, no light beams, no sparkles, no magic particles, no fireflies, no glowing eyes, no glowing objects, no neon, no sunset or golden-hour light, no dramatic backlight, no rim light, no vignette, no cloud, fog or smoke framing the figure, no background scenery, no floor shadow, no frame or border, no gloss, no plastic skin, no 3D-render look, no HDR, no teal-and-orange grading, no oversaturated colors, no depth-of-field blur, no hyper-detailed texture, no tiny repeated details, no embroidery patterns, no jewelry clutter, no crystals sticking out everywhere, no weapons drawn, no blood, no scary faces, no sharp teeth, no text, no letters, no labels, no watermark, no signature.

TASK 1, file ida.png (1024×1024, transparent):
MASTER IDA, an old lantern-maker of about 75, small and wiry, a strict but warm teacher. Short white hair in a tight bun with a pencil stuck through it, round brass work goggles pushed up on her forehead, sharp grey eyes, a thin raised eyebrow and a tiny half-smile. A long leather work apron with one big front pocket over a dusty-blue blouse with rolled sleeves. She holds a small UNLIT glass lantern up in one hand at shoulder height, as if checking a seam; the glass is drawn as one flat pale-blue shape with one lighter stripe, nothing shining.
Her colors only: hair #E9E4DA, hair shade #C7C1B6, goggles brass #C9A04A, goggles shade #9C7A33, apron #7B5236, apron shade #5C3C27, blouse #6F8FAF, blouse shade #56738F, lantern glass #CFE3EE, lantern frame #4A4A52.

TASK 2, file mist-queen.png (1024×1024, transparent):
THE MIST QUEEN, a tall, graceful moth-woman: a calm, sleepy, slightly sad face with big soft dark eyes and a small closed-mouth smile; two short feathery moth antennae curving back from her forehead like a tiara; long pale lilac hair falling in 4 big waves. Two large soft moth wings rise behind her shoulders, each wing ONE flat grey-lilac shape with ONE simple darker eye-spot (no patterns, no veins). A loose gown of layered grey-white veils. In both hands at chest height she holds a simple wooden weaving shuttle with a single grey thread hanging down. She is a gentle dreamer, not a villain: soft, quiet, a little lonely.
Her colors only: skin #E8DDE6, skin shade #C9BACA, hair #C8B6D8, hair shade #A391B8, wings #9C93AE, wing shade #7C7392, eye-spot #5B5470, gown #E4E1E8, gown shade #BDB8C8, shuttle wood #8A6A48.

TASK 3, file glass-guardian.png (1024×1024, transparent):
THE GLASS GUARDIAN, a big friendly clockwork automaton made of brass and clear glass panels, built by a lonely young inventor long ago. Round barrel-shaped glass chest with ONE simple brass heart-shaped gear visible inside; a rounded glass dome head with two big round brass "eyes" like lenses and a short straight mouth slot that reads as a shy smile; broad round shoulders with brass rivets drawn as 3–4 simple dots per plate; big mitten-like brass hands, one raised in a careful wave. Glass is drawn as flat pale blue-grey shapes with one lighter stripe each; brass is flat. He looks loyal and a bit sad, like a big gentle dog.
His colors only: glass #CFE0E8, glass shade #A9C2CE, brass #C9A04A, brass shade #9C7A33, dark metal #4A4A52, heart gear #B5533C, lens #2F3A4A.

ALSO GIVE ME, as separate transparent PNG files with no text baked in:
- ida-token.png, mist-queen-token.png, glass-guardian-token.png: 512×512 round token portraits, the head and shoulders of the SAME character, centered, filling a circle of 470 px diameter; fully transparent outside the circle; no ring or frame (the game draws the ring). For the Mist Queen include the top of the wings; for the Guardian the whole dome head and the shoulders.
- manifest.json listing all 6 files: [{ "file": "<id>.png", "size": [1024,1024], "use": "story scene portrait, waist-up" }, { "file": "<id>-token.png", "size": [512,512], "use": "round speaker badge and board token", "circle": { "cx": 256, "cy": 256, "r": 235 } }].
```
