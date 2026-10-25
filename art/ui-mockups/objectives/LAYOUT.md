# Objectives runtime layout

`v1.png` is a structure preview only. Its five large blank plates, top to bottom, map to `kill-all`, `escort-lina-to-exit`, `defend-mill-rounds`, `collect-crystals`, and `escape`. The smaller blank plate below is the additional-objective component.

All displayed content is runtime content. Use `runtimeZones` in `assets/manifest.json`; do not rasterize text, numbers or icons.

| Type | Existing SVG | Runtime fields | Component |
| --- | --- | --- | --- |
| kill-all | `objective-flag.svg` | `title` | primary |
| escort-lina-to-exit | `escort.svg` | `title` | primary |
| defend-mill-rounds | `defend-point.svg` | `title`, `counterCurrent`, `counterTotal` | primary |
| collect-crystals | `loot.svg` | `title`, `counterCurrent`, `counterTotal` | primary |
| escape | `door.svg` | `title` | primary |
| additional objective | scenario-provided existing SVG | `title` | additional |

The primary counter zone stays empty for types without a counter. It is a fixed runtime compartment, not a baked value.
