# NPC portrait prompts

Generation uses built-in ImageGen, two passes per character (clean ink sketch, then exact-sketch color), with `camp/assets/marta.png` and `camp/assets/heroes/warden.png` as style references. The full shared STYLE, NEGATIVE, character prompts, and palettes are in `prompts/ui/npc-portraits.md`.

For identity-preserving corrections, `docs/art/meshy-batch-3/bog-miller-meshy.png` and `shadowhand-meshy.png` override conflicting prose. The approved concept portraits are secondary identity references; `bruno.png` is the cleaned version of Bog Miller, not a new character design.

## Marta

`marta-token.png`: generated from the Marta-only identity prompt; resized to 512×512 and clipped to the required alpha circle (`cx: 256`, `cy: 256`, `r: 235`). No lantern.

## Lumo

`lumo.png` and `lumo-token.png`: two-pass built-in ImageGen from the exact `npc-portraits.md` Lumo prompt and palette; `bruno.png`/`bog-miller.png` supplied shared 2D style, while `shadowhand.png` supplied only subtle family resemblance. Sketch: `_sketches/lumo.png`.
