# Pause menu layout

`v1.png` is 1448x1086. It shows the runtime dimmer over no baked battlefield, then the central panel at `(344, 123)` sized `760x840`.

The top runtime information well occupies panel-local `(70, 68, 620, 108)`. Place the scenario title in `(86, 82, 588, 40)` and round in `(86, 126, 588, 34)`.

Place the four `600x112` button bases at `(424, 325)`, `(424, 465)`, `(424, 605)`, `(424, 745)`. Their labels are runtime-only, in order: Continue, Rules and hints, Settings, Save and exit. Localized Ukrainian strings are supplied by runtime; no text is baked into any image.

Use the exact same panel and button assets for settings. Add existing SVG icons only at runtime. The game draws `#111827` at 72% opacity over the live battlefield before this stack; it must not request or use a pause-specific battlefield background.
