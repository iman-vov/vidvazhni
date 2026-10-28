# pass-curtain assets

Built-in ImageGen, one final variant.

## background.png

```text
Use case: ui-mockup
Asset type: full-screen opaque background for a 4:3 pass-the-tablet curtain in a cozy fantasy tabletop game
Primary request: Create one clean, text-free, icon-free, character-free painted background only. It must fully cover the screen and conceal all prior game information. Leave a large calm, low-detail, gently lighter central zone occupying about 46% width and 62% height for a separately overlaid waist-up hero portrait. The background has an understated Lantern-Obereg motif: a small, unlit-to-softly-warm brass lantern emblem woven into the environment near the upper margin, not a UI icon and not a glowing magical effect. Use warm painted parchment, wood, and quiet midnight-blue/slate surroundings, with a subtle radial framing of simple timber beams and soft matte cloth or paper texture. No panels, no frames, no button shapes, no cards, no portraits, no people, no hands, no objects that read as gameplay UI.
Scene/backdrop: abstract warm hand-painted tabletop privacy curtain, calm and welcoming
Style/medium: clean stylized game art, warm light hand-painted illustration. Big simple shapes, flat matte colors, exactly one darker cel-shade per color, clean dark outlines. Warm parchment and wood backdrop A, compatible with translucent blue-slate panels and thin solid gold accents B.
Composition/framing: landscape 4:3. Symmetric but not rigid. Center intentionally quiet for portrait overlay; edge motif only. No text-safe UI panels.
Lighting/mood: even soft indoor daylight; warm and calm, not dramatic
Color palette: parchment #E9DFC6, deep slate #2C3A55, wood brown #795435, muted mist #B9B3C4, accent gold #D8A93A sparingly, outline #2B2A33
Materials/textures: matte painted paper, simple wood grain only at edges
Text (verbatim): none
Constraints: opaque full-screen raster; no baked text, numbers, symbols, letters, labels, icons, UI panels, buttons, cards, frames, characters, portraits, hands, devices, watermarks, or signatures. The hero portrait will be a separate layer.
NEGATIVE: Do NOT use: glowing lights, bloom, lens flare, god rays, volumetric light, sparkles, magical glow, glowing windows, neon, sunset or golden-hour sky, dramatic sky, clouds or fog framing the edges, vignette, burnt or torn paper edges, 3D render look, glossy or plastic surfaces, airbrush gradients, hyper-detailed texture everywhere, HDR, teal-and-orange grading, high saturation, purple evil castle cliché, depth-of-field blur, tiny repeated details, sparkle highlights, glints, specular highlights, glowing particles or fireflies, rim light, painterly brush noise, text, labels, watermarks, signatures. Leave generous empty paper space; not every area needs detail.
```

## Final cleanup edit

```text
Use case: precise-object-edit
Asset type: full-screen opaque 4:3 privacy-curtain background
Primary request: Edit the referenced background only. Remove the two decorative gold emblems on the left and right blue hanging fabric banners. Replace them with completely plain, unmarked matte blue fabric matching the existing banner material. Preserve the lantern, parchment center, timber framing, plain blue fabrics, composition, dimensions, and all other details exactly.
Constraints: no text, letters, numbers, labels, symbols, icons, crests, emblems, UI panels, buttons, frames, cards, people, portraits, hands, watermarks, or signatures. Keep the center fully clear for a separate hero portrait. Opaque raster background.
NEGATIVE: Do NOT add glowing lights, bloom, lens flare, god rays, volumetric light, sparkles, magical glow, neon, vignette, 3D render look, glossy surfaces, airbrush gradients, HDR, tiny repeated details, highlights, glints, particles, rim light, painterly brush noise, text, labels, icons, watermarks, signatures.
```

## portrait-frame.png

Built-in ImageGen, transparent output.

```text
Use case: ui-mockup
Asset type: one reusable transparent PNG portrait frame for a 4:3 fantasy pass-the-tablet screen
Primary request: Create exactly one square, empty portrait frame asset. The center aperture must be fully transparent. Exterior canvas must be fully transparent. Build only an even-width rectangular edge ring suitable for 9-slice scaling, with calm plain slate-blue #2C3A55, a single thin solid antique-gold #D8A93A line, understated square-corner construction and no visual content in the center. It must accept a runtime hero-color tint on a designated neutral slate layer, so no hero-specific color.
STYLE: clean stylized GAME ART, like the board and UI of a modern premium tabletop game or a polished mobile strategy game. Big, simple, chunky shapes with clear silhouettes. Flat matte colors with exactly ONE darker cel-shade tone per color, no gradients. Clean dark outlines of even weight (about 2 px at 1000 px width). Readability first: every element must be recognizable as a small thumbnail. Detail budget: nothing smaller than 1/60 of the image width. Even, flat daylight from top-left. Matte, no shine. Flat slate-blue panels #2C3A55 with a thin solid gold line #D8A93A, no bevel, no glow, no gradient.
Composition/framing: centered square edge ring; wide empty transparent aperture; symmetric; broad uniform corners for 9-slice scaling.
Text (verbatim): none.
Constraints: genuine transparent background outside the frame and in the center aperture; no text, numbers, letters, labels, icons, symbols, crests, characters, portraits, hands, cards, buttons, panels, objects, watermark, or signature.
NEGATIVE: Do NOT use: glowing lights, bloom, lens flare, god rays, volumetric light, sparkles, magical glow, glowing windows, neon, sunset or golden-hour sky, dramatic sky, clouds or fog framing the edges, vignette, burnt or torn paper edges, 3D render look, glossy or plastic surfaces, airbrush gradients, hyper-detailed texture everywhere, HDR, teal-and-orange grading, high saturation, purple evil castle cliché, depth-of-field blur, tiny repeated details, sparkle highlights, glints, specular highlights, glowing particles or fireflies, rim light, painterly brush noise, text, labels, watermarks, signatures. Leave generous empty paper space; not every area needs detail.
```

## background.png — Style Lock replacement

Built-in ImageGen, opaque output. The earlier background is retained at `history/background-pre-style-lock.png`.

```text
Use case: ui-mockup
Asset type: opaque 4:3 full-screen background for a pass-the-tablet secret-selection curtain
Primary request: Generate one clean background only, no UI. A warm tabletop privacy curtain that fully obscures the previous player's game. Create a large calm empty parchment center for an overlaid waist-up hero portrait. Keep decoration only at the outer edges: four simple chunky timber corner braces and two plain vertical slate-blue fabric strips at left and right, with no emblems, marks, icons, crests, objects, or patterns. At upper center, one small unlit brass Lantern-Obereg environmental motif, not an icon and without glow. No panels, frames, buttons, cards, characters, portraits, hands, game pieces, labels, or text.
STYLE: clean stylized GAME ART, like the board and UI of a modern premium tabletop game or a polished mobile strategy game. Big, simple, chunky shapes with clear silhouettes. Flat matte colors with exactly ONE darker cel-shade tone per color, no gradients. Clean dark outlines of even weight (about 2 px at 1000 px width). Readability first: every element must be recognizable as a small thumbnail. Detail budget: nothing smaller than 1/60 of the image width; large calm areas of a single flat color. Even, flat daylight from top-left. Matte, no shine. Palette: outline #2B2A33, paper/ground #E9DFC6, slate #2C3A55, earth #C99A55, wood brown #795435, accent gold #D8A93A sparingly. Flat slate-blue components #2C3A55 with a thin solid gold line #D8A93A, no bevel, no glow, no gradient.
Composition/framing: landscape 4:3, symmetric but not rigid. The center from x=22% to 78%, y=15% to 75% is a calm unbroken parchment field for a separate hero portrait. Decoration stays outside this field.
Lighting/mood: quiet, warm, clean, matte, privacy curtain
Text (verbatim): none
Constraints: opaque full-screen PNG; no baked text, numbers, letters, labels, UI icons, symbols, cards, panels, buttons, frames, characters, portraits, hands, devices, watermarks, or signatures.
NEGATIVE: Do NOT use: glowing lights, bloom, lens flare, god rays, volumetric light, sparkles, magical glow, glowing windows, neon, sunset or golden-hour sky, dramatic sky, clouds or fog framing the edges, vignette, burnt or torn paper edges, 3D render look, glossy or plastic surfaces, airbrush gradients, hyper-detailed texture everywhere, HDR, teal-and-orange grading, high saturation, purple evil castle cliché, depth-of-field blur, tiny repeated details, sparkle highlights, glints, specular highlights, glowing particles or fireflies, rim light, painterly brush noise, text, labels, watermarks, signatures. Leave generous empty paper space; not every area needs detail.
```
