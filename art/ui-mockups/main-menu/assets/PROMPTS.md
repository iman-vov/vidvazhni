# Main-menu component notes

No ImageGen call was needed for this pass. Alpha verification found transparent corners (`A=0`) in the approved source logos, so each final asset is a direct copy that preserves the accepted lettering, Lantern symbol and composition:

- `logo-uk.png` from `../../logos/uk/final.png` — `Відважні`
- `logo-en.png` from `../../logos/en/v2.png` — `The Braveheart Guild`
- `logo-de.png` from `../../logos/de/v1.png` — `Die Mutherzen`

The three button states are reused by manifest reference from `../../pause-menu/assets/button-{normal,pressed,disabled}.png`. Labels and icons remain runtime layers.

If a future ImageGen repair is required, prepend the full `NEGATIVE` block from `prompts/ui/STYLE-LOCK.md`; brand text is the sole permitted text in a logo extraction prompt.
