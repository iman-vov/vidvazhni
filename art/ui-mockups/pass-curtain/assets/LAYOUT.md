# Pass curtain runtime layout

`v1.png` is a composition sample only. It intentionally contains no baked text, numbers, or runtime icons.

All rectangles use `x, y, width, height` in 1448×1086 pixels and normalized 0–1 screen coordinates.

| Layer, back to front | Pixel rect | Normalized rect | Source | Runtime content |
| --- | --- | --- | --- | --- |
| Opaque privacy background | `0, 0, 1448, 1086` | `0, 0, 1, 1` | `background.png` | None. Required privacy boundary. |
| Handoff title zone | `468, 64, 512, 88` | `0.323, 0.059, 0.354, 0.081` | Runtime | Handoff phrase and selected hero name. |
| Hero portrait | `363, 138, 722, 622` | `0.251, 0.127, 0.499, 0.573` | One `heroSources` PNG | Selected hero only. |
| Portrait frame | `363, 138, 722, 622` | `0.251, 0.127, 0.499, 0.573` | `portrait-frame.png` | Tint slate fill with selected `heroSources.tint`; retain gold line. |
| Ready button | `484, 790, 480, 90` | `0.334, 0.727, 0.331, 0.083` | Shared pause-menu button state | Runtime ready label. |
| Other-player intent strip | `132, 934, 1184, 96` | `0.091, 0.860, 0.818, 0.088` | Shared pause-menu panel | Existing SVG icons plus coarse non-secret intent and presence only. |

Portrait-frame 9-slice cap insets: `155, 155, 155, 155` at native 1254×1254. Do not place text, icons, or interaction inside its transparent aperture.

Secret-selection rule: all previous-player layers are absent below `background.png`; do not treat the curtain as a translucent modal.
