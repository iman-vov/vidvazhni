# Акт III: промпти для ChatGPT (монстри, боси, ілюстрації місій)

План виробництва — у [docs/roadmap/act3.md](../../docs/roadmap/act3.md) (кроки A2.1 і A3.1). Дизайн фігур і місій — у [docs/design/act3.md](../../docs/design/act3.md).

Тут два готові повідомлення. Кожне вставляється в ChatGPT **цілим**, одним запитом: спершу спільні блоки STYLE і NEGATIVE, потім окремий блок TASK на кожну картинку з її шляхом. Ескізного проходу немає, ChatGPT одразу малює в кольорі. Правила проти «нейрослопу» взято з [ui/STYLE-LOCK.md](ui/STYLE-LOCK.md), а формат «одним проходом» — з [monsters-act2-onepass.md](monsters-act2-onepass.md).

- **Повідомлення 1** — 4 фігури для Meshy image-to-3D: монстри `marsh-hopper`, `brass-automaton`, боси `mist-queen`, `glass-guardian`. Стиль — мальована 3D-мініатюра, як концепти Акту I (`grey-wolf`, `bog-miller`): об'єм і м'яка світлотінь, **без контурів і без пласкої cel-заливки**.
- **Повідомлення 2** — 10 ілюстрацій місій s11–s20 для сюжетного інтро. Стиль — книжкова сцена «стиль A» з [ui/mission-art.md](ui/mission-art.md): тепла пласка мальовка з рівним контуром, темна нижня третина під діалог.

## Порядок і кредити Meshy

Meshy: ≈ 410 кредитів (нотатка meshy-batch-4, 2026-10-25), генерація ≈ 30, поновлення 2026-11-03.

1. `marsh-hopper` і `brass-automaton` — у Meshy **до 2026-11-03**. Якщо концепт двічі не вдався, бери запасну модель (перефарбований `bog-slime` ×0,9 / `stone-sentinel` ×0,8) і кредити не пали.
2. `mist-queen` і `glass-guardian` — концепти робимо зараз, щоб портрети й ілюстрації збігалися з фігурами. У грі до поновлення вони стоять на перефарбованих `night-moth` ×2,2 і `stone-sentinel` ×1,6, а власні моделі робимо після 2026-11-03.

## Повідомлення 1. Монстри й боси (одним запитом)

**Прикріпи до повідомлення:** `art/concepts/grey-wolf/front.png` і `art/concepts/bog-miller/front.png` (головні референси стилю для всіх чотирьох), а також референси до окремих задач: `art/concepts/bog-slime/front.png` (TASK 1), `art/concepts/stone-sentinel/front.png` (TASK 2 і 4), `art/concepts/night-moth/front.png` (TASK 3).

```text
Make 4 separate concept images of creatures for our family board game "Braves". Each image becomes a 3D model through Meshy image-to-3D, so the rules below are strict. One creature per image, each as a separate task. Paint directly in color in one pass: no sketch step, no line drawing first.

STYLE FOR ALL FOUR (match our Act I concepts exactly: grey-wolf and bog-miller are attached)
- A rendered fantasy MINIATURE, like a hand-sculpted and hand-painted premium board-game figure photographed on grey: real 3D volume, soft form shading, gentle ambient occlusion in creases, matte painted surface with slight hand-painted color variation. Chunky, cute-friendly proportions, big head-to-body ratio like the attached grey-wolf.
- NO black outlines, NO flat cel-shading, NO 2D cartoon or sticker look, NO vector art. It must read as a solid 3D object that a 3D model can be built from.
- Detail budget: nothing smaller than 1/30 of the image width. Big readable forms; skin, metal, glass and wings as large sculpted shapes or facets, never fine texture, never noise. At most 3 small accessories per creature.
- Lighting: soft even studio light from the front-left, matte. No shine, no rim light, no cast shadow on the floor.
- Square 1:1, at least 1024×1024. Three-quarter FRONT view (turned 20–30 degrees, never straight front or side). Full body visible, centered, at least 10% empty margin on every side; nothing touches or crosses the image edges. One single creature, no scene, no props unless listed.
- Background: plain flat light grey #D9D9D9 filling the whole image. No floor, no shadow, no frame.
- Faces are friendly-funny or sad-sleepy, never scary: no teeth, no fangs, no red eyes, no blood.
- Every part is OPAQUE and solid: glass and crystal are painted as frosted, milky, opaque surfaces with soft shading, never see-through.
- Colors: stay close to the palette given in each task, rendered with volume, not as flat fills.

NEGATIVE FOR ALL FOUR — do NOT use: glowing eyes, any glow, bloom, lens flare, god rays, volumetric light, sparkles, magical particles, embers, sparks, dust or pollen clouds, fireflies, light trails, glints, specular highlights, metallic shine, chrome, mirror reflections, transparency, see-through glass, refraction, caustics, iridescence, rainbow colors, glossy or plastic surfaces, wet look, slime drips, HDR, teal-and-orange grading, dramatic, moonlit, sunset or golden-hour light, any background scene (sky, marsh, water, reeds, lily pads, workshop, cave, ground), cast shadow, clouds or fog framing the edges, vignette, depth-of-field blur, high saturation, warts and bumps everywhere, rivets everywhere, gears everywhere, cracks everywhere, runes, wing veins, lace patterns, tiny repeated details, painterly brush noise, cropped parts, black outlines, flat cel-shading, 2D cartoon or vector look, a second creature, text, labels, numbers, watermarks, signatures.

TASK 1 — Marsh Hopper, a monster (file: art/concepts/marsh-hopper/front.png, copy as art/concepts/marsh-hopper/v1.png). Attach reference: bog-slime concept.
A plump marsh frog the size of a dog, cheeky and bouncy, not slimy. Pear-shaped body, as wide as it is tall; a big round head about half of the body height with two big round eyes on top like domes; a wide closed smiling mouth (no tongue showing). Front legs short and planted, hind legs big and folded, ready to jump, with broad simple webbed feet of 3 rounded toes each. Smooth skin with 5–7 big flat darker spots on the back, a pale belly. One small accessory only: a single round lily-pad leaf worn on the head like a cap.
Layout: sitting crouched on one ground line, body turned about 30 degrees to the viewer's left; the creature fills about 60% of the image width and 55% of the height, centered.
Palette only: skin #6E8A3E, shade #4E6630, back spots #4A5A2E, belly #D9C46A, belly shade #B8A050, eyes #E8E2C8 with flat pupil #2B2A33, feet #5E7834, lily-pad cap #7E9A55 with shade #5E7A40.

TASK 2 — Brass Automaton, a monster (file: art/concepts/brass-automaton/front.png, copy as art/concepts/brass-automaton/v1.png). Attach reference: stone-sentinel concept.
A short, sturdy wind-up clockwork guard made of brass, like an old toy soldier grown to the size of a dwarf. Barrel-shaped body built from 3 big brass rings, a round dome head about one fifth of the height with two round porthole eyes and a small flat visor, short thick legs about one third of the height, two thick arms; the right hand is a round brass fist, the left forearm carries a small round brass buckler. On its back a BIG simple wind-up key (two rounded loops, about as wide as the head), clearly sticking out behind the shoulder so it reads in the three-quarter view. Plates are joined by a few big flat bands, not by rivets. Calm, slightly sleepy expression in the eyes.
Layout: relaxed A-pose for rigging — arms angled down about 40 degrees away from the body, hands not touching the body, feet flat and slightly apart, body turned about 20 degrees to the viewer's left; the figure fills about 80% of the image height, centered.
Palette only: brass #B08A4A, brass shade #8A6A36, dark copper bands #6E4A2E, copper shade #4E3424, buckler #9C7A40, porthole eyes #C9D2CC flat pale (NOT glowing) with dark rim #3E3A36, wind-up key #8A6A36 with shade #6E5430.

TASK 3 — Mist Queen, a boss (file: art/concepts/mist-queen/front.png, copy as art/concepts/mist-queen/v1.png). Attach reference: night-moth concept.
The queen of the night moths, a huge pale moth the size of a person, sad and gentle, not evil — she is the first moth of a lonely boy, enchanted. Same build as the attached night moth but larger and calmer: a round fuzzy body of 3 soft segments, a round head with two big round sleepy eyes and a small kind face, a big soft fur collar like a royal cape, a small simple crown made of 5 rounded feathery antenna tips standing up, two long feathery antennae curving back. Four broad rounded wings: the front pair large like a long shawl, the back pair smaller; each front wing has ONE simple round pale eye-spot. Six short legs tucked under, barely visible; she holds one simple spindle (a short wooden stick with a ball of grey thread) in her front legs, the only accessory.
Layout: hovering calmly, wings spread wide and symmetric, slightly lowered like a cape, body upright; camera about 15 degrees above; body turned about 25 degrees to the viewer's left; wingspan about 75% of the image width, centered with empty margin.
Palette only: wings #D8DCE4, wing shade #B4B8C4, body #8A90A0, body shade #6A7080, fur collar #EEF0F2 with shade #C8CCD4, crown tips #B9B3C4, eye-spots #9A90B8 (flat, NOT glowing), eyes #3A3848 with a flat pale dot #D9D4E6, spindle wood #9C6B3F, thread #A8A8B0.

TASK 4 — Glass Guardian, a boss (file: art/concepts/glass-guardian/front.png, copy as art/concepts/glass-guardian/v1.png). Attach reference: stone-sentinel concept.
An old guardian automaton made of frosted crystal, a lantern-maker's helper who waited forty years for his master: big, slow, loyal, a little confused, not evil. Built like the attached stone sentinel but taller: broad chest, short thick legs about one third of the height, long heavy arms, a small square head about one sixth of the body height with two round frosted-glass eyes and a kind, tired face. The body is 10–14 big flat crystal facets of milky OPAQUE glass with soft shading, joined by a few simple dark brass bands at the shoulders, waist and knees. In the middle of the chest a round brass frame holding a big round crystal heart, painted as a flat violet stone, NOT glowing. On the left forearm a large flat hexagonal crystal shield. A single small dark moth sits on the right shoulder.
Layout: relaxed A-pose for rigging — arms angled down about 40 degrees away from the body, hands open and not touching the body, feet flat and slightly apart, body turned about 20 degrees to the viewer's left; the figure fills about 85% of the image height, centered.
Palette only: crystal body #A8D8E8, facet shade #7EB0C4, darker facet #5E8EA4, brass bands #8A6A36 with shade #6E5430, heart #6A62D0 with shade #4A42A0 (flat), eyes #E8F2F6 flat with pupil #2C3A55, shield #BCE2EE with shade #8EC0D2, moth #2F2A3A.

IF A RESULT DRIFTS, reply: "Too detailed and glossy, looks AI-generated. Redo THIS exact creature as a painted 3D miniature like the attached grey-wolf concept: real volume and soft shading, no outlines, no flat colors, nothing glowing or see-through, whole body with empty margin on all sides, plain light grey background, no shadow."

DELIVER: four PNG files, square, at least 1024×1024, saved at the paths given in each task, each also copied as v1.png in the same folder.
```

### Перевірити перед тим, як прийняти `v1.png`

- Видно все тіло, від краю не менше 10%; фон рівно сірий, тіні на підлозі немає.
- Об'єм і м'яка світлотінь, як у `grey-wolf`; жодного чорного контуру й пласкої заливки.
- Нічого не світиться: очі, серце Сторожа, плями на крилах — пласкі кольори.
- Скло й кристал непрозорі (Meshy не будує прозорість, і модель вийде з дірками).
- Автомат і Сторож у A-позі, руки не торкаються тіла (риг Humanoid). Жаба сидить на одній лінії (Quadruped або Smart Rig).
- Ключ-завод автомата видно збоку: це окремий жорсткий аксесуар, що крутиться під час `windUp`.
- Якщо поплив стиль — рядок «IF A RESULT DRIFTS» вище. Якщо поплив силует — у тому самому чаті: `Keep the style, fix only the silhouette: <що саме>.`

## Повідомлення 2. Ілюстрації місій s11–s20 (одним запитом)

**Прикріпи до повідомлення:** `art/ui-mockups/camp/assets/background.png` (стиль A), портрети героїв з `art/ui-mockups/camp/assets/heroes/` (`warden.png`, `wind-archer.png`, `herbalist.png`, `rogue.png`, `elementalist.png`, `tinker.png`), `art/ui-mockups/camp/assets/marta.png`. Якщо вже є портрети мовців з [ui/npc-portraits.md](ui/npc-portraits.md) — додай `art/ui-mockups/story/assets/npc/heron.png` і `ida.png`, а для босів — `art/concepts/mist-queen/v1.png` і `art/concepts/glass-guardian/v1.png` з повідомлення 1. Якщо ChatGPT не бере 10 картинок за раз, він видає їх по одній, але спільні блоки лишаються ті самі.

Куди класти: оригінал `art/ui-mockups/story/missions/<id>.png`, 1920×1080; у гру — `public/story/<id>.webp` (якість ≈ 82, крок A3.2 роадмапу).

```text
Make 10 separate full-screen illustrations for the story intros of our family fantasy co-op board game "Braves", one image per task below. Paint each directly in color in one pass: no sketch step, no line drawing first. The style, negative list and composition rules below apply to EVERY image; each task adds only its scene, palette accents and file name.

STYLE (for all images)
Style: hand-painted 2D STORYBOOK scene for a family fantasy co-op board game, matching the attached camp background exactly: warm parchment-and-wood world, soft painted shapes, the same brush finish and the same scale of characters. Big simple chunky shapes with clear silhouettes; clean dark-brown outline (#3A2A20) of even weight on characters and key objects only; every color has its base tone plus exactly ONE darker cel-shade tone, no airbrush gradients.
Detail budget: nothing smaller than 1/60 of the image width. Trees are 3–5 big rounded blobs, reeds are 5–8 simple strokes per clump, stones are big simple shapes, planks are wide boards (at most 8 visible per wall), books are simple blocks in rows of at most 10, glass and crystal are big flat facets, no texture noise. At least 35% of the picture is calm flat areas of one color.
Lighting: flat, even, matte, cool-neutral daylight or a plain warm interior light from the top-left. One soft shadow side. Light sources (lanterns, fires, fireflies, windows, light beams) are drawn as simple flat shapes with a flat lighter color around them, NOT glowing.
Canvas: 1920×1080, landscape 16:9, a full-bleed painting with no frame and no border.
Base palette (use mostly these): outline #3A2A20, parchment #E9DFC6, warm wood #9C6B3F, dark wood #5E3F27, stone #9A968C, moss green #7E9A55, forest #4F6B3C, water #6F8FA0, earth #B98A55, roof red #A9503A, mist lilac #B9B3C4, shadow navy #2C3A55, accent gold #D8A93A (sparingly).
Heroes must match the attached portraits exactly: same faces, hair, clothes and colors.

NEGATIVE (for all images)
Do NOT use: glow, bloom, lens flare, god rays, light beams with soft edges, volumetric light, sparkles, magic particles, glowing fireflies, glowing eyes, glowing runes, glowing windows, glowing crystals, rainbow refractions, prisms splitting light, neon, sunset or golden-hour sky, dramatic sky, backlight, rim light, vignette, clouds or fog framing the edges, smoke frame, torn or burnt paper edges, frame, border, gloss, plastic look, glass reflections everywhere, 3D render look, HDR, teal-and-orange grading, oversaturated colors, depth-of-field blur, hyper-detailed texture everywhere, tiny repeated details, scattered coins, sparkle highlights, specular highlights, blood, gore, scary faces, close-up faces, text, letters, numbers, signs with writing, book titles, labels, UI, watermark, signature.

COMPOSITION RULES (for all images)
- The LOWER THIRD (bottom 360 px) is calm and darker: plain floor, water, grass or shadow in one or two flat dark tones (#2C3A55 / #3A2A20 range), no figures, no key objects, no high contrast there. A dialogue box will cover it.
- The key location and the key object of the mission sit in the UPPER-MIDDLE band (between 15% and 60% of the height), readable at a glance.
- Characters, if any, are small to medium (at most 30% of the image height), in the mid-ground, standing on the line at about 62% of the height, seen from behind or in three-quarter view. Nobody looks at the viewer.
- Leave the top-right corner (about 300×120 px) simple and quiet: a «Skip» button sits there.
- No text of any kind anywhere in the picture.

TASK s11 — The Misty Causeway (file: art/ui-mockups/story/missions/s11.png)
Scene: a long wooden plank causeway crossing a grey autumn marsh. Upper-middle: the causeway runs from the left mid-ground to a small ferryman's farm on stilts at the far right (one hut, one roof, one jetty); halfway along it a tiny island with one big willow (3 blobs) and a small bell on a post. Parallel to the causeway, on the water to the right of it, a line of 7 big round lily pads like stepping stones, and on one of them a big cheeky frog (a frog leader) crouching, ready to jump. Low flat mist bands lie over the water on both sides, as 3 long flat lilac shapes, not covering the edges. Mid-ground left: the Wind Archer and the Herbalist (as in the portraits) step onto the causeway, seen from behind.
Palette accents: marsh water #5C7A80, reeds #9CA25A and #7E8248, planks #8A6A48, willow #6E8A50, lily pads #7E9A55, frog #6E8A3E with belly #D9C46A, mist bands #C2C8CA flat.

TASK s12 — Old Heron's Island (file: art/ui-mockups/story/missions/s12.png)
Scene: a small marsh island. Upper-middle left: a crooked hut on four tall stilts with a reed roof and a ladder; in front of it a small herb garden of 5 round herb bushes behind a low woven wattle fence. Upper-middle right: a thick reed bed with two flat mist bands lying in it, and beyond it a short jetty with a small flat-bottomed boat. Old Heron (as in heron.png if attached: a tall very old wise-woman with a long neck, grey hair in a high bun with two reed stalks, round spectacles, a grey-blue shawl, a staff with a carved heron head) stands at the bottom of the ladder, leaning on her staff. Mid-ground: the Warden and the Herbalist next to her, three-quarter view from behind, ready to walk her to the boat.
Palette accents: hut wood #7E5B3B, reed roof #B8A060, herb bushes #7E9A55 and #5E7F45, wattle #9C7A50, shawl #7A8AA0, boat #6E4A2E, mist #C2C8CA flat.

TASK s13 — The Firefly Pond (file: art/ui-mockups/story/missions/s13.png)
Scene: a round forest clearing at night, calm and cosy rather than spooky. Upper-middle centre: a small round pond with lily pads; above it, scattered in the air, about 12 fireflies drawn as small flat pale-yellow dots each with a flat lighter ring (no glow, no rays, no blur). Three narrow paths lead to the pond from the left, the back and the right between big rounded bushes; on each path an old tree stump with a hanging grey moth cocoon (an oval shape with 3 simple wrap lines). Three dark night moths as simple shapes fly in from the far right. Mid-ground: the Elementalist and the Warden stand by the pond, seen from behind, the Warden's shield raised.
Palette accents: night sky #2C3A55, trees #3E5636 and #2E4430, pond #4E6E7E, fireflies #E8D88A flat with ring #B8B070, cocoons #A8A098, moths #2F2A3A, grass #4F6B3C.

TASK s14 — The Sunken Belfry (file: art/ui-mockups/story/missions/s14.png)
Scene: inside an old stone bell tower half sunk in the marsh. Upper-middle: a round stone room seen from the doorway; three big bronze bells hang from heavy wooden beams in a half-circle, each of a different size (large left, medium centre, small right). Water covers the lower part of the floor as one flat calm blue-grey shape, with a few stone steps rising out of it. On the wall behind the bells a simple painted picture of three bells with dots above them (a hint of the order: 1, 2, 3 dots, no digits). At the top right a narrow spiral staircase goes up to a square hatch in the ceiling. Mid-ground: the Rogue and the Tinker wading in, seen from behind; the Rogue points at the bells.
Palette accents: tower stone #8A8478, beams #5E3F27, bells #B0803E with shade #8A5E2E, water #5C7A80, wall painting #A9503A flat, hatch #7E5B3B.

TASK s15 — The Mist Queen (file: art/ui-mockups/story/missions/s15.png)
Scene: the heart of the mist in the marsh at night. Upper-middle centre: the Mist Queen (as in mist-queen v1.png if attached: a huge pale moth with a fur collar like a royal cape, a small crown of feathery antenna tips, a sad gentle face, a spindle of grey thread) hovering above a low mound. Around her in a half-circle stand three tall old weaving looms made of dark wood, each with long grey threads running from it to her, drawn as simple flat lines. Between the looms, two flat bands of mist. A willow alley leads to the mound from the left. A few small dark moths as simple shapes near the looms. Mid-ground: the Herbalist and the Elementalist facing her, seen from behind; the Herbalist holds a small teapot.
Palette accents: night #2C3A55, mist #C8CCD4 flat, queen wings #D8DCE4, queen body #8A90A0, looms #5E4A38, threads #A8A8B0, willows #4E6640, teapot #A9503A.

TASK s16 — The Crystal Road (file: art/ui-mockups/story/missions/s16.png)
Scene: a mountain road in early winter leading to a town of glass. Upper-middle: the road runs from the left mid-ground across a short stone bridge to a tall city gate on the right; the gate and the roofs behind it are made of simple pale crystal shapes (big flat facets, no reflections). Along the road, 6 flat hexagonal mirror tiles set into the paving, drawn as pale blue-grey shapes. Patches of snow on rocks, two bare pines. On the bridge a small gremlin lookout peeks over the railing. Mid-ground: Master Ida (as in ida.png if attached: an old lantern-maker woman in a long brown apron with goggles on her forehead) pulls a small two-wheeled cart loaded with lanterns and glass crates; the Warden pushes it from behind and the Wind Archer walks beside, three-quarter view from behind.
Palette accents: snow #EEF0F2, rocks #8A8A88, road #9A968C, mirror tiles #B8D0DA flat, crystal town #A8D8E8 and #7EB0C4, cart #8A6A48, lanterns #D8A93A flat, pines #4F6B3C.

TASK s17 — The Lantern-Maker's Workshop (file: art/ui-mockups/story/missions/s17.png)
Scene: a big old glass workshop. Upper-middle left: two round brick glass kilns with flat orange openings (fire as flat shapes, no glow). Centre: a storeroom behind a wide arch where three brass clockwork automatons stand asleep in a row, heads lowered, each with a big wind-up key on its back; two floor levers stand in front of them. Upper-middle right: a wooden staircase climbs to an attic platform where a rolled paper blueprint lies on a table (a simple roll with one blue band, no writing). Shelves with simple lantern shapes. Mid-ground: the Tinker and the Rogue, seen from behind; the Tinker reaches out to pat an automaton.
Palette accents: brick #8A5A44, kiln fire #D8893A flat, workshop wood #7E5B3B, automatons #B08A4A with shade #8A6A36, blueprint #E9DFC6 with band #5E7EA0, lanterns #D8A93A flat.

TASK s18 — The Library of Light (file: art/ui-mockups/story/missions/s18.png)
Scene: a tall, quiet library at night. Upper-middle: a long hall with tall bookshelves on both sides (books as simple coloured blocks in rows); on four of the shelves a few books have small sleepy faces on their spines (two closed eyes as simple lines), and one book has opened one eye. At the far end, a gallery with tall windows and a reading desk under a single lamp with a thick old diary on it. Two pale ghosts float asleep near the ceiling as simple rounded shapes with closed eyes. Mid-ground: the Elementalist tiptoes with a finger at the lips, the Herbalist right behind, both seen from behind.
Palette accents: shelves #5E3F27, books #A9503A, #5E7EA0, #7E9A55, #D8A93A, floor #4E3826, windows #8AA0B8 flat, lamp area #E7C27A flat, ghosts #C8CCD8, diary #6E4A2E.

TASK s19 — The Mirror Hall (file: art/ui-mockups/story/missions/s19.png)
Scene: a cold, high stone hall. Upper-middle: a tall arched window on the left lets in ONE straight light beam drawn as a flat pale-yellow band with hard edges (no glow, no dust); it hits a tall standing mirror on a wooden swivel stand, bounces at an angle to a second mirror, and stops short of a third one, which is turned the wrong way. In the far right corner a closed door made of big crystal facets. Mid-ground: the Tinker turns the second mirror by its frame and the Elementalist points to the third one, both seen from behind; a brass automaton stands still in the background.
Palette accents: hall stone #8A8E96, beam #EADB9A flat with hard edges, mirror glass #B8D0DA flat, mirror frames #7E5B3B, crystal door #A8D8E8 and #7EB0C4, automaton #B08A4A.

TASK s20 — The Glass Guardian (file: art/ui-mockups/story/missions/s20.png)
Scene: a crystal dome, quiet and cold. Upper-middle centre: the Glass Guardian (as in glass-guardian v1.png if attached: a big kind crystal automaton made of milky opaque facets with brass bands, a round violet crystal heart in the chest, a hexagonal crystal shield) stands on a round platform, head slightly tilted as if waiting for someone. Around the dome three tall arched windows with simple stained-glass shapes (3–4 flat coloured panes each, no glow) and four crystal columns. A single small dark moth sits on his shoulder. Mid-ground: the Warden salutes him and the Elementalist stands ready, both seen from behind.
Palette accents: dome #A8B8C8 and #7E90A4, guardian #A8D8E8 with shade #7EB0C4, heart #6A62D0 flat, brass #8A6A36, windows #A9503A, #5E7EA0, #D8A93A flat, columns #BCE2EE, floor #2C3A55.

IF A RESULT DRIFTS, reply: "Too glossy, glowing and detailed, looks AI-generated. Redo as the attached camp background: flat warm matte light, one cel-shade tone per color, bigger simpler shapes, half the details, no glow, no sparkles, calm dark lower third, no text."
IF THE HEROES DO NOT MATCH, reply: "The heroes must match the attached portraits exactly: same faces, hair, clothes and colors. Keep them small, mid-ground, seen from behind or in three-quarter view."

DELIVER: 10 PNG files, 1920×1080 each, at the paths given in the tasks. Also give me art/ui-mockups/story/missions/manifest-act3.json with one entry per image:
{ "file": "<id>.png", "size": [1920, 1080], "use": "story intro background, full screen behind the dialogue", "safeArea": { "dialogBand": [0, 720, 1920, 1080], "skipButton": [1620, 0, 1920, 120] } }
```

### Перевірити перед тим, як прийняти

- Нижня третина (360 px) темна й рівна, без фігур; правий верхній кут спокійний.
- Нічого не світиться: світлячки, вікна, промінь у s19 — пласкі форми з жорстким краєм.
- Герої збігаються з портретами, малі, спиною чи в три чверті; боси збігаються з концептами з повідомлення 1.
- Жодного тексту: ні на мапі дзвонаря, ні на корінцях книжок, ні на кресленні.
- Якщо результат поплив — рядки «IF … » вище. Найкраще допомагає прикріплений `background.png`: справжня картинка-приклад важить більше, ніж десять речень.
