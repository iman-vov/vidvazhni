# Акт III: референс-аркуші пропів (ChatGPT, одним повідомленням)

Навіщо: це не концепти для Meshy. Пропи моделюються вручну в Blender через MCP, а ці аркуші — креслення-референс: пропорції, конструкція, матеріали, знос. Кожен аркуш показує один проп у трьох видах на сірому тлі.

Правила проти «нейрослопу» — з [ui/STYLE-LOCK.md](../ui/STYLE-LOCK.md), формат «одним проходом» — з [act3-art.md](../act3-art.md). Ескізного проходу немає: ChatGPT одразу малює в кольорі.

## Як користуватися

1. **Прикріпи до повідомлення справжні фото-референси** (дає більше, ніж десять речень). Найкорисніші:
   - фото старої дубової книжкової шафи з книжками різної висоти (антикварний магазин, бібліотека);
   - фото напольного дзеркала-псише на поворотних шарнірах;
   - фото дерев'яного ручного візка з залізними ободами коліс;
   - фото старого бронзового дзвона з патиною;
   - фото ручного ткацького верстата;
   - фото справжнього кластера кварцу на породі.
   Додатково можна прикріпити `docs/art/weapons/warden.jpg` — рівень деталізації й матеріалів, з яким пропи мають стояти поряд.
2. Встав **увесь блок нижче** одним повідомленням. ChatGPT малює картинки по черзі; якщо зупиниться — напиши `Continue with the next TASK, same style rules.`
3. Збережи кожну картинку за шляхом з її TASK (`art/reference/props/<id>.png`). Сесія моделювання сама підхопить ті, що з'являться.
4. Якщо результат «поплив» у глянець і сяйво, встав цю корекцію:

```text
Too glossy, glowing and AI-looking. Redo as a matte hand-painted PBR game prop sheet: plain grey background, flat even light, no glow, no sparkles, no reflections of a scene, keep the three views and the same layout, bigger readable construction parts.
```

Якщо деталізація пішла в дрібну «кашу»:

```text
Too many tiny details. Keep the same prop and views, but nothing smaller than 1/80 of the image width; show construction (planks, joints, bands, rivets) as clear large readable shapes.
```

## Повідомлення (вставляти цілим)

```text
Make 14 separate REFERENCE SHEETS of game props for our family tabletop-style video game "Braves" (a hex-grid co-op board game seen from a top-down 3/4 camera). Each sheet is one prop shown in three views. A 3D artist will model each prop by hand from these sheets, so they must be clear, accurate and believable, not moody illustrations. One image per TASK, in order. Paint directly in color in one pass: no sketch step, no line drawing first.

STYLE FOR ALL SHEETS
- Stylized-realistic GAME PROP, hand-painted PBR texturing, like a high-quality prop sheet for a modern tabletop-style fantasy video game. Believable real-world construction and proportions, slightly chunky and friendly, never cartoon-flat. Think: real oak furniture, real cast bronze, real blown glass, real woven cloth — painted by hand with clear readable shapes.
- Construction must be visible and logical: planks with small gaps, mortise-and-tenon or dowel joints, nail heads and rivets in rows where a carpenter would put them, iron or brass bands, carved trims, chamfered/bevelled edges on every hard edge.
- Wear and age, moderate and believable: chipped corners, darker dirt in crevices and joints, light scratches on edges, slightly faded paint, worn lighter edges on wood and metal where hands touch. Not ruined, not dirty everywhere.
- Material read: wood with visible grain direction (dark oak or warm walnut), aged bronze/brass with green-brown patina in recesses and brighter worn edges, dark iron with light rust in seams, glass with visible THICKNESS and a pale blue-green tint on its edges, cloth with visible thread weave.
- Detail budget: nothing smaller than 1/80 of the image width. Detail goes into construction (joints, bands, rivets, trims, wear on edges), never into noise or ornament covering every surface. Large calm areas of plain material are welcome.
- Lighting: flat, even, matte studio light from the front-left, one soft shadow tone per material. No cast shadow on the floor. No reflections of a room or sky anywhere.
- Layout of every sheet (landscape 3:2, at least 1536×1024): three views of the SAME prop side by side at the SAME scale, each with at least 6% empty margin around it, nothing touching the image edges.
  LEFT third: straight FRONT view (orthographic, no perspective).
  MIDDLE third: THREE-QUARTER view from the front-left and about 35 degrees above, like the game camera.
  RIGHT third: straight TOP view (looking straight down).
- Background: plain flat medium grey #9A9A9A filling the whole image. No floor, no scene, no frame, no grid.
- One prop per sheet. Nothing else in the picture except what the TASK lists.

PALETTE (stay close, shade with these; HEX):
oak dark #4A3020, oak mid #6E4A2E, oak worn edge #9C7650, walnut #5A3A26,
iron #3A3B40, iron worn #6C6E72, rust #7A4A2A,
bronze #8A6A35, brass worn #C8A050, patina green #5E7F6A,
glass tint #A9CFCF, glass edge #5E9C9A, glass deep #3F6F72,
crystal lilac #8C7BC4, crystal pale #C9D6E8,
stone #8E8A82, stone dark #5D5A55,
cloth undyed #CBB994, cloth faded blue #5F7894, cloth faded red #9A4A3E,
book leathers #7A2E28 #2F4A3A #2E3E62 #6A4E2A #4A2E46, paper #E3D7B8,
moss #5E7F45, lily green #4F7A3A, lily pink #D99AA8, silk white #E8E3D6.

NEGATIVE FOR ALL SHEETS — do NOT use: glow, bloom, lens flare, god rays, volumetric light, sparkles, magical particles, glints, star highlights, sunset or golden-hour light, dramatic or moody lighting, rim light, cloud or fog frame, vignette, depth-of-field blur, HDR, teal-and-orange grading, high saturation, glossy plastic look, chrome, mirror reflecting a room or a person, rainbow or iridescent glass, caustics, glowing crystals, glowing windows or lanterns lit up, candles burning, smoke, cobwebs, ivy, skulls, runes, filigree covering everything, rivets everywhere, gears everywhere, cracks everywhere, tiny repeated ornament, painterly brush noise, sketch lines, black cartoon outlines, flat cel-shading, isometric pixel art, a room or ground plane, characters, hands, animals (unless listed), extra props, text, labels, measurements, arrows, numbers, watermarks, signatures.

TASK 1 — bookshelf (file: art/reference/props/bookshelf.png)
A free-standing oak bookcase about 1.4 m tall, 0.9 m wide, 0.35 m deep. Two side panels made of vertical planks with thin visible gaps, a thick top board with a carved moulding along its front, a plinth base with a simple cut-out arch between two block feet. Three shelves; each shelf board has a front lip and sits on visible dowel pegs. Back made of vertical boards with small gaps. Iron L-brackets with nail heads at the top corners. Books: about 12–14 per shelf, different heights and thicknesses, leather spines in the listed book colours with raised spine bands and faded gold lines; on each shelf a few books lean at an angle against the others, one shelf has a short horizontal stack of 3 books. On top: a small stack of 2 books and a clear glass sphere on a brass stand.

TASK 2 — mirror (file: art/reference/props/mirror.png)
A free-standing cheval mirror about 1.2 m tall. Oval mirror glass (about 0.75 m high) in a thick carved walnut frame with a moulded inner lip and a small carved crest on top; the glass shows a thick bevelled edge and a pale cool grey-blue surface, NOT reflecting anything. The frame hangs between two turned walnut posts with brass ball finials, on two brass pivot knobs. The posts stand on a sturdy trestle base: two feet with chamfered ends joined by a stretcher bar with visible pegged joints. Mirror tilted back about 20 degrees.

TASK 3 — glass-cart (file: art/reference/props/glass-cart.png)
A two-wheeled hand cart of a glassmaker, about 0.9 m tall, 1.3 m long with handles. Plank bed with side rails, plank gaps and nail rows; iron corner straps. Two spoked wooden wheels (8 spokes) with iron tyres held by rivets and a brass hub cap. An A-frame rack on the bed holding 4 large glass panes on edge, each pane with visible thickness, slightly green-blue edges, separated by thin felt strips; panes tied by a rope. Two long handles at the back with worn lighter grips, and a fold-down prop leg.

TASK 4 — crystal-heart (file: art/reference/props/crystal-heart.png)
A faceted lilac crystal heart (about 0.4 m wide) held upright by three curved aged-bronze claws, on a round stepped stone pedestal (about 0.7 m tall) with a chipped edge and a brass band with rivets around its top. A few small raw lilac crystals grow from cracks at the pedestal base. The heart is matte-faceted, opaque-looking with lighter facets, never glowing.

TASK 5 — wind-up-key (file: art/reference/props/wind-up-key.png)
A giant clockwork wind-up key, about 0.9 m tall, stuck upright into a heavy iron gear lying flat on the ground (gear about 0.8 m across, 12 chunky teeth, spokes and a hub with rivets). The key: a square shaft of brass with a collar ring, and a wide two-lobed bow (like a figure eight) with a raised rim and a pierced centre. Aged brass with darker patina in recesses and bright worn edges.

TASK 6 — blueprint (file: art/reference/props/blueprint.png)
A wooden drafting trestle about 0.75 m tall: two A-frame legs joined by a stretcher, a slanted board on top. A large rolled blueprint lies on the board, partly unrolled so one sheet hangs over the front edge; the sheet is deep blue paper with simple pale lines of a gear and a tower (no readable text), curled corners, two red cloth ties around the roll, a brass weight and a pair of brass dividers on the board.

TASK 7 — loom (file: art/reference/props/loom.png)
A small upright marsh weaver's loom about 1.2 m tall: two heavy oak uprights on foot blocks, a top beam with wooden pegs, a warp beam and a cloth beam at the bottom. Warp threads run vertically and are clearly visible; the lower third has woven cloth in a faded blue and undyed check pattern with visible thread texture. A shuttle hangs on a cord; a small wicker basket with balls of yarn stands at its foot.

TASK 8 — bell (file: art/reference/props/bell.png)
A bronze bell about 0.5 m tall hanging from a sturdy oak frame (two posts with diagonal braces, a top beam with iron straps and bolts). The bell: classic profile with a thick lip, two raised rings near the shoulder and one near the lip, a crown loop bolted to the beam. Aged bronze with green patina streaks running down from the rings and brighter worn bronze on the lip. A short rope hanging from the clapper.

TASK 9 — cocoon (file: art/reference/props/cocoon.png)
Two big silk cocoons (the largest about 0.6 m long) hanging from a gnarled dead branch that rises from a mossy root mound. The cocoons are wrapped in visible spiral bands of silk thread, off-white with grey-green dirt in the grooves; one hangs lower and is partly covered by moss. Matte, no glow, no web strands everywhere.

TASK 10 — lily-pads (file: art/reference/props/lily-pads.png)
A set of three water-lily arrangements shown side by side instead of three views: (a) one big pad (about 0.7 m) with a pink water-lily flower, (b) one big and one small pad with a closed bud, (c) three small pads. Each pad has the typical V-shaped notch, raised radial veins, slightly curled-up edges, darker green with a lighter rim and small brownish damage spots. Show every arrangement from the 3/4 game camera only, on grey, no water.

TASK 11 — glass-crystals (file: art/reference/props/glass-crystals.png)
Two variants side by side instead of three views, 3/4 game camera only: (a) a cluster of 4 large pale blue-white quartz crystals and 4 small ones growing from a broken grey stone base; (b) one tall lilac crystal spire with two smaller ones and a few loose shards around a low stone base. Crystals are hexagonal prisms with pointed tips, with visible thickness, slight inner cloudiness and lighter edges, matte, never glowing.

TASK 12 — glass-lantern (file: art/reference/props/glass-lantern.png)
A city street lantern post about 1.5 m tall: an octagonal stepped stone base, a dark iron post with a brass collar, a curved iron arm with a scroll bracket, and a hanging hexagonal lantern with six glass panes (thick, slightly green edges), a brass cap with a finial and a ring. The lantern is NOT lit.

TASK 13 — glass-workbench (file: art/reference/props/glass-workbench.png)
A glassmaker's lens workbench about 1.1 m tall: a thick oak top with a front vise, four square legs with a low stretcher shelf holding a wooden box of glass offcuts. On the top: a brass magnifying lens on an adjustable arm, a few round lenses lying on felt, two glass bottles, a glass-blowing pipe, small brass tools. Worn top with knife scratches and darker stains.

TASK 14 — glass-panes (file: art/reference/props/glass-panes.png)
A wooden storage rack for glass panes about 0.8 m tall: a slotted oak frame (two end frames, a top rail and a base with slot dividers), holding 4 upright glass panes of different heights; each pane shows thickness and a green-blue edge. Two loose panes wrapped in cloth and tied with string lie in front of the rack.
```
