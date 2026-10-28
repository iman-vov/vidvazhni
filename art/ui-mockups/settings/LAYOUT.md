# Settings layout

Both previews are 1448×1086, blank UI composition only. Runtime supplies all labels, values, locale text, numeric values, icons and hero portraits.

- Tabs: General, Sound, Rules. Each is 300×72, so targets exceed 44 px.
- General: language UK/EN/DE; graphics quality minimum/medium/maximum; six independent hero-hint controls. Hero ordering comes from runtime, not from artwork.
- Sound: music, effects and voice each use `slider-track.png` and `slider-thumb.png`.
- Rules: six independent toggles, all ON by default: elemental orbs, monster intents, initiative die, Pick Up, Inspiration, Revive a Friend.
- `v1.png` shows General selected. `rules-v1.png` shows Rules selected. Neither preview contains readable labels or icons.

Use rectangles and state mapping from `assets/manifest.json`. The shared `../pause-menu/assets/panel.png` and `button-*.png` now exist and replace neutral preview surfaces at runtime; settings does not own replacements. Sound slider geometry is local to each declared sound row. Rule toggle geometry is local to each 464×80 rule row (`[294, 4, 160, 72]`).
