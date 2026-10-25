# Іконки предметів: промпти для ChatGPT

> 60 предметів з [docs/design/items.md](../../docs/design/items.md): три повідомлення по 20. Кожне повідомлення вставляєш у ChatGPT-оркестратор **цілим**: спільний стиль, палітра, бюджет деталей, NEGATIVE, далі блоки TASK. Кожна картинка — один предмет, 512×512, прозорий фон, файл `art/items/<id>.png`. Рамку рідкості гра малює сама, тому в картинці її немає. Правила промптів — `C:\Users\Vova\.claude\CLAUDE.md` і [ui/STYLE-LOCK.md](ui/STYLE-LOCK.md).
>
> **Референс:** до кожного повідомлення прикріпи 1–2 справжні картинки: скриншот крамниці табору (`art/ui-mockups/camp/shop-v1.png`) і одну вже готову іконку, яка сподобалась (після першої партії — найкращу з неї). Одна справжня картинка тримає стиль краще за десять речень.
>
> **Якщо поїхало** (глянець, сяйво, дрібнота), відповідай одним рядком:
> `Too glossy and detailed, looks AI-generated. Redo the same items as flat matte painted game icons: bigger simpler shapes, one shadow tone per color, no glow or sparkles, half the details, plain transparent background, light from top-left.`

---

## Повідомлення 1 з 3: голова, тіло, кидалки, Чай Чаплі (20)

```
Paint 20 separate game ITEM ICONS for a family fantasy board game «Brave Ones» (players: a parent and a 7-year-old). Paint each directly in full color in one pass, no sketch stage. Output 20 separate PNG files, 512×512 px each, with the file name given in each TASK.

STYLE (same for every icon):
- Hand-painted game-item illustration that matches a warm, friendly painted fantasy UI (like the item cards of a premium modern tabletop game). Not a photo, not a 3D render, not pixel art, not anime.
- ONE object per image, centred, in a 3/4 view from slightly above, filling about 70% of the canvas with even empty margins. Clear, chunky silhouette that is readable at 64×64 px.
- Transparent background (alpha). No ground, no table, no scenery, no cast shadow on a floor; at most a tiny soft contact shadow directly under the object.
- Light: one soft, even, matte light from the TOP-LEFT on every icon. Each color has exactly one darker shade tone; no gradients beyond that, no shine.
- Clean dark outline of even weight (about 4 px at 512 px) around the whole silhouette and the main inner shapes.
- NO frame, border, badge, card or circle behind the object: the game adds its own rarity frame.
- Friendly, slightly rounded, toy-like proportions; a little bit funny where the TASK says so. Not scary, not gritty.

PALETTE (use only these, HEX): outline #2B2A33; leather #8A5A3B; dark leather #5E3B27; wood #B07A45; steel #9AA3AD; dark steel #5F6873; brass #C9A04A; copper #A65E2E; cloth red #B5533C; cloth blue #3B6FB6; cloth green #5E7F45; cream #E9DFC6; white #F4F1E8; glass blue #8FC1D9; potion red #C23B4E; potion green #6FAF5A; potion violet #7E4FC4; gold accent #D8A93A (small areas only).

DETAIL BUDGET: nothing smaller than 1/25 of the image width (about 20 px). At most 3–4 big shapes plus 2–3 medium details per object. No engraving, no filigree, no stitches drawn one by one, no texture noise. Large calm areas of one flat color.

NEGATIVE (never): glow, bloom, magical aura, lens flare, rim light, sparkles, glints, star-shaped highlights, specular hotspots, glossy or plastic look, wet look, metallic chrome reflections, HDR, 3D render, octane/unreal look, photorealism, depth-of-field blur, sunset or golden-hour light, colored backlight, smoke or mist around the object, clouds or fog framing, vignette, background scene, floor, table, pedestal, frame, border, circle badge, card, ribbon banner, text, letters, numbers, runes, labels, watermark, signature, tiny repeated details, ornament everywhere, scratches and dirt texture, multiple objects when one is asked, hands or characters holding the item.

Paint these 20 icons, one file each:

TASK 1 — file art/items/leather-helmet.png
A simple round brown leather cap-helmet with a darker leather rim and two big chunky stitched seams drawn as single lines, a short leather chin strap hanging down. Sturdy and plain.

TASK 2 — file art/items/bucket-helmet.png
A FUNNY dented grey metal bucket worn as a helmet: two round eye-holes cut in the front, the wire handle hanging under like a chin strap, one big dent on the side. Should make a child laugh.

TASK 3 — file art/items/miner-helmet.png
A rounded brass-yellow miner's hard hat with a small round lamp on the front (the lamp glass is a flat pale cream disc, NOT glowing), a leather strap around the back.

TASK 4 — file art/items/feather-hat.png
A jaunty green felt hat with a wide brim and one huge curly red feather sweeping backwards, a brass buckle on the band. Playful and quick-looking.

TASK 5 — file art/items/owl-hood.png
A soft brown-and-cream hooded cowl shaped like an owl: two big round cream eye patches with dark centres on the hood, two small ear tufts on top, a tiny brass beak clasp at the neck.

TASK 6 — file art/items/snow-hat.png
A white knitted winter hat that looks like a snowman: a carrot-orange nose stitched on the front, two coal-black button eyes, a pale-blue pompom on top and a pale-blue folded brim. Cosy and cute.

TASK 7 — file art/items/diving-helmet.png
A round old-fashioned copper diving helmet with one big round glass window at the front (flat pale glass-blue with one simple diagonal highlight stripe), four chunky bolts around the window, a short air hose curling from the side.

TASK 8 — file art/items/shadow-mask.png
A smooth dark violet half-mask with long sweeping cheek points and narrow eye-slits, a thin gold edge line, a small dark ribbon tie. Mysterious but friendly, not creepy. Legendary item of the Shadowhand.

TASK 9 — file art/items/chainmail.png
A short-sleeved steel chainmail shirt laid flat, the rings suggested by a simple big scale-like pattern of 6–8 rows (not hundreds of tiny rings), a brown leather collar band.

TASK 10 — file art/items/shadow-cloak.png
A hooded deep violet-grey cloak hanging as if on an invisible hanger, the hem fading into three soft pointed tails, a small round silver clasp at the neck.

TASK 11 — file art/items/heavy-armor.png
A chunky steel breastplate with big rounded shoulder plates, three wide horizontal belly plates and four large round rivets; a red cloth trim at the neck. Heavy and solid.

TASK 12 — file art/items/hedgehog-vest.png
A brown leather vest covered on the back and shoulders with rows of big blunt cartoon hedgehog spines (cream with dark tips), a small hedgehog-face patch on the chest. Funny, not sharp-scary.

TASK 13 — file art/items/shepherd-cloak.png
A thick cream-white woollen shepherd's cloak with a puffy sheep-wool collar, a wooden toggle button and a small brass bell hanging from the collar.

TASK 14 — file art/items/forge-apron.png
A heavy dark leather blacksmith's apron with a big front pocket holding a small hammer and tongs, scorch marks drawn as two simple darker patches, a brass buckle on the neck strap.

TASK 15 — file art/items/turtle-shell.png
A big green-and-brown turtle shell worn as armour, seen from the back at 3/4: large hexagon plates (only 7–9 of them), leather straps on the sides. Friendly and round.

TASK 16 — file art/items/queen-veil.png
A flowing pale grey-violet veil of mist-coloured cloth, draped from a thin silver circlet with one small pale pearl; the cloth ends in soft wavy edges. Calm and elegant, NOT glowing. Legendary item of the Mist Queen.

TASK 17 — file art/items/pepper-pouch.png
A small red cloth drawstring pouch tied with a string, a little puff of reddish-brown pepper dust coming out of the top as three simple round blobs, one dried red chili pepper sewn on the front.

TASK 18 — file art/items/goo-jar.png
A chunky glass jar with a cork stopper, filled with thick lime-green goo; a big drip of goo runs down the outside of the jar. Gooey and funny.

TASK 19 — file art/items/thunder-popper.png
A fat paper party-popper firecracker wrapped in red and cream stripes, a short twisted fuse on top, a painted yellow lightning zig-zag on the side. No sparks, no explosion.

TASK 20 — file art/items/heron-tea.png
A small round clay teapot in pale blue with a heron's head and long beak forming the spout, a wooden lid knob, a sprig of green herbs tied to the handle. No steam.

Also give me a manifest.json listing the 20 files: [{ "file": "art/items/<id>.png", "id": "<id>", "size": [512, 512], "background": "transparent" }].
```

---

## Повідомлення 2 з 3: ноги, одна рука, зілля (20)

```
Paint 20 more ITEM ICONS for the same game «Brave Ones», in exactly the same style as the first 20 (attached reference). Paint each directly in full color in one pass, no sketch stage. 20 separate PNG files, 512×512 px.

STYLE, PALETTE, DETAIL BUDGET and NEGATIVE: exactly the same blocks as in message 1 — repeat them here:

STYLE: hand-painted game-item illustration matching a warm friendly painted fantasy UI; ONE object, centred, 3/4 view from slightly above, ~70% of the canvas; transparent background; only a tiny soft contact shadow; one soft even matte light from the TOP-LEFT; one darker shade tone per color; clean dark outline (~4 px at 512 px); NO frame, border, badge or card; friendly, slightly rounded, toy-like.
PALETTE (HEX only): outline #2B2A33; leather #8A5A3B; dark leather #5E3B27; wood #B07A45; steel #9AA3AD; dark steel #5F6873; brass #C9A04A; copper #A65E2E; cloth red #B5533C; cloth blue #3B6FB6; cloth green #5E7F45; cream #E9DFC6; white #F4F1E8; glass blue #8FC1D9; potion red #C23B4E; potion green #6FAF5A; potion violet #7E4FC4; gold accent #D8A93A (small areas only).
DETAIL BUDGET: nothing smaller than 1/25 of the width (~20 px); 3–4 big shapes + 2–3 medium details; no engraving, filigree, texture noise.
NEGATIVE: glow, bloom, magical aura, lens flare, rim light, sparkles, glints, star highlights, specular hotspots, glossy/plastic/wet look, chrome reflections, HDR, 3D render, photorealism, depth-of-field blur, sunset light, colored backlight, smoke or mist around the object, fog frame, vignette, background scene, floor, table, pedestal, frame, border, badge, card, ribbon, text, letters, numbers, runes, labels, watermark, signature, tiny repeated details, ornament everywhere, dirt texture, extra objects, hands or characters.

For potions: the bottle glass is flat and matte, the liquid is one flat color with one shade tone and at most one simple straight highlight stripe. Liquid does NOT glow, no bubbles rising, no vapour.

TASK 1 — file art/items/swift-boots.png
A pair of light brown leather ankle boots leaning forward as if running, small white wings on the heels (simple 3-feather shapes), a red lace.

TASK 2 — file art/items/quiet-boots.png
A pair of soft dark-grey felt boots with thick padded soles and pointed toes curling up slightly, one tied with a small cream ribbon. They look like they would make no sound.

TASK 3 — file art/items/frog-socks.png
A pair of bright green striped knee socks with frog faces on the toes (two round eyes on top, a wide smile), the socks bouncy and curved like jumping. Very funny.

TASK 4 — file art/items/kick-boots.png
A pair of sturdy brown boots with reinforced brass toe caps and two small curly ram horns sticking out of the sides of the boots. Strong and a bit silly.

TASK 5 — file art/items/slippy-trousers.png
A pair of shiny-looking but MATTE-painted blue trousers with two big wavy darker-blue stripes, one leg kicking out as if slipping, a few flat water-drop shapes falling off the hem.

TASK 6 — file art/items/marsh-boots.png
A pair of tall dark-green rubber-like wading boots reaching up to the knee, a muddy brown band on the soles, a small reed tucked into one boot top.

TASK 7 — file art/items/wind-runners.png
A pair of light grey-blue cloth boots with long cream scarf-like ribbons streaming backwards from the ankles as if blown by wind; three simple curved wind lines behind them (flat strokes, not glowing).

TASK 8 — file art/items/seven-league-boots.png
A pair of tall red leather boots with gold buckles and long pointed toes, one boot in mid-stride far ahead of the other. Fairy-tale magic boots, legendary, but NOT glowing.

TASK 9 — file art/items/dagger.png
A short simple dagger with a straight steel blade, a brown leather-wrapped grip and a round brass pommel, lying diagonally (tip to the top-right).

TASK 10 — file art/items/buckler.png
A small round wooden shield with a steel rim and a big round steel boss in the middle, four rivets. Viewed from the front at a slight angle.

TASK 11 — file art/items/torch.png
A wooden torch with a cloth-wrapped top and a flame drawn as three flat orange-and-yellow tongues with one darker shade tone. The flame is a flat painted shape: NO glow, no light spill, no sparks.

TASK 12 — file art/items/frying-pan.png
A big black cast-iron frying pan with a long handle, one comic dent on the bottom shaped like a bump. Funny kitchen weapon.

TASK 13 — file art/items/magnet.png
A big red horseshoe magnet with steel-grey tips, a wooden grip at the curve, and two small iron nails stuck to the tips. Three simple curved lines show the pull (flat strokes, no glow).

TASK 14 — file art/items/gear-shield.png
A round copper shield shaped like a big gear wheel with chunky teeth around the edge, a smaller brass gear in the centre. Tinker style.

TASK 15 — file art/items/glass-shield.png
A kite-shaped shield of pale blue glass in a silver frame, made of 5–6 large flat facets, each facet one flat tone of glass blue. Clear and calm, NO sparkle, NO shine. Legendary item of the Glass Guardian.

TASK 16 — file art/items/lumo-lantern.png
A small child-sized hand lantern with a brass frame, a round handle on top and cream-colored glass panes; a tiny painted firefly on one pane. It looks well-loved, a little scuffed. The panes are flat cream, NOT glowing. Legendary keepsake of little Lumo.

TASK 17 — file art/items/healing-potion.png
A round-bottomed glass potion flask with a cork, filled with flat red liquid, a small cream paper heart tied to the neck with string.

TASK 18 — file art/items/strength-potion.png
A sturdy square glass bottle with flat orange liquid and a cork, a tiny brass flexed-arm charm hanging from the neck.

TASK 19 — file art/items/agility-potion.png
A tall slim glass vial with flat green liquid and a cork, with a small white feather tied to its neck.

TASK 20 — file art/items/luck-potion.png
A small heart-shaped glass bottle with flat violet liquid and a cork, a tiny four-leaf clover painted on the glass.

Also give me manifest.json for these 20 files, same format as before.
```

---

## Повідомлення 3 з 3: дві руки, обереги, кубики (20)

```
Paint the last 20 ITEM ICONS for the game «Brave Ones», in exactly the same style as the previous 40 (attached references). Paint each directly in full color in one pass, no sketch stage. 20 separate PNG files, 512×512 px.

STYLE: hand-painted game-item illustration matching a warm friendly painted fantasy UI; ONE object, centred, 3/4 view from slightly above, ~70% of the canvas (long two-handed items lie diagonally from bottom-left to top-right); transparent background; only a tiny soft contact shadow; one soft even matte light from the TOP-LEFT; one darker shade tone per color; clean dark outline (~4 px at 512 px); NO frame, border, badge or card; friendly, slightly rounded, toy-like.
PALETTE (HEX only): outline #2B2A33; leather #8A5A3B; dark leather #5E3B27; wood #B07A45; steel #9AA3AD; dark steel #5F6873; brass #C9A04A; copper #A65E2E; cloth red #B5533C; cloth blue #3B6FB6; cloth green #5E7F45; cream #E9DFC6; white #F4F1E8; glass blue #8FC1D9; potion red #C23B4E; potion green #6FAF5A; potion violet #7E4FC4; gold accent #D8A93A (small areas only); dice ivory #F1E6CF.
DETAIL BUDGET: nothing smaller than 1/25 of the width (~20 px); 3–4 big shapes + 2–3 medium details; no engraving, filigree, texture noise.
NEGATIVE: glow, bloom, magical aura, lens flare, rim light, sparkles, glints, star highlights, specular hotspots, glossy/plastic/wet look, chrome reflections, HDR, 3D render, photorealism, depth-of-field blur, sunset light, colored backlight, smoke or mist around the object, fog frame, vignette, background scene, floor, table, pedestal, frame, border, badge, card, ribbon, text, letters, numbers or pips except where a TASK asks for dice faces, runes, labels, watermark, signature, tiny repeated details, ornament everywhere, dirt texture, extra objects, hands or characters.

For dice: a d12 is a twelve-sided die drawn simply, showing 3 faces; faces carry big plain dark numbers only where the TASK says.

TASK 1 — file art/items/yew-bow.png
A tall wooden longbow of warm yew wood with a leather grip in the middle and a taut cream string, lying diagonally.

TASK 2 — file art/items/hammerfist-hammer.png
A huge two-handed blacksmith's war hammer: a big dark steel head with one flat face and one rounded face, a thick wooden handle wrapped in leather, a brass band under the head. Legendary item of Hammerfist; heavy and chunky.

TASK 3 — file art/items/broom.png
A witchy-but-friendly straw broom with a crooked wooden handle and a fat bundle of straw tied with a red cord, two small coins caught in the straw.

TASK 4 — file art/items/door-shield.png
A FUNNY big shield that is actually a small wooden door: plank boards, two black iron hinges, a round brass door knob and a tiny peephole. Carried like a tower shield.

TASK 5 — file art/items/fishing-rod.png
A bent wooden fishing rod with a reel, the line ending in a hook that has caught a single gold coin. Lying diagonally.

TASK 6 — file art/items/herbal-staff.png
A tall light-wood staff with a curled top, bunches of green herbs and a few small white blossoms tied around the curl with string, a small cloth pouch hanging below.

TASK 7 — file art/items/courage-drum.png
A round marching drum with a red body, cream drum skin, brass rim with zig-zag cords on the side and two wooden drumsticks crossed on top.

TASK 8 — file art/items/friend-banner.png
A wooden pole with a square cloth banner in blue and cream showing two simple clasped hands in the centre, the cloth gently waving. Simple heraldry, no text.

TASK 9 — file art/items/grappling-rope.png
A coiled brown rope with a three-pronged steel grappling hook at one end, the coil neat and round.

TASK 10 — file art/items/light-amulet.png
A round brass amulet on a short leather cord with a big flat cream-yellow sun-shaped stone set in the middle. The stone is flat painted, NOT glowing.

TASK 11 — file art/items/partner-whistle.png
A small wooden whistle shaped like a little bird, on a short red cord loop.

TASK 12 — file art/items/clover.png
A single big four-leaf clover with a short stem, pressed in a small round frame of honey-colored resin like a keepsake charm, tied with a thin cream ribbon. A gift from a kind old lady.

TASK 13 — file art/items/firefly-jar.png
A round glass jar with a cloth top tied with string, five small cute fireflies inside drawn as yellow-green round bodies with tiny wings. The fireflies are flat painted dots, NO glow, no light halo.

TASK 14 — file art/items/prism-lens.png
A triangular glass prism in a small brass holder with a handle, the glass shown as 3 flat facets in glass blue tones; one flat stripe of 3 colors (red, yellow, blue) coming out of one side like a painted ribbon. No glow.

TASK 15 — file art/items/hourglass.png
A wooden-framed hourglass with two glass bulbs and cream sand, more sand in the bottom bulb, the frame with two turned wooden posts.

TASK 16 — file art/items/lucky-bone.png
A small cartoon bone-shaped charm in ivory with a red string tied in a bow around its middle, one tiny gold dot on each end.

TASK 17 — file art/items/winking-die.png
A cute ivory d12 die with one face showing a big painted WINKING face (one eye open, one closed, a smile) instead of a number; the two other visible faces show simple numbers 6 and 7. Playful.

TASK 18 — file art/items/bell-clapper.png
A small brass hand bell with a wooden handle, its clapper visible under the rim, a short faded blue ribbon tied to the handle. From an old sunken bell tower; a few flat painted water drops on it.

TASK 19 — file art/items/mist-pearl.png
A big round pale grey-lavender pearl resting in an open small seashell, the pearl with one soft flat highlight spot. Calm, NOT glowing, no mist around it.

TASK 20 — file art/items/crystal-die.png
A clear pale glass-blue d12 die made of crystal, faces as flat facets in 3 tones of glass blue, two visible faces show the numbers 3 and 10 in dark ink. Legendary. NO sparkle, NO shine.

Also give me manifest.json for these 20 files, same format as before.
```
