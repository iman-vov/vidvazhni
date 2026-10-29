# Act III walk in the real UI (2026-10-29)

Dev shortcut: `?campaign=act3` builds a save after s10 (Act II through s6, heroes level 5 with XP for 6)
and opens the camp. Options: `&after=s11,s12` wins more scenarios, `&level=7`, `&heroes=warden,rogue`,
`&secondary=s13.bell-map` counts secondary goals as met (src/app/devCampaign.ts). The replay bot plays
through the screen with `window.__act` (dev only).

| Shot | What it shows |
|---|---|
| 01 | Camp after s10 |
| 02–04 | Map: s11 and s16 both open; the choice line «a win here closes …» |
| 05–07 | Level-up to 6 and 7: the new level cards are offered |
| 08–11 | s11: hand pick, intro (narrator, Marta), board |
| 12 | First bot run without the UI (lost; superseded by 13) |
| 13 | s11 won by the bot through the UI: outro with the ferryman, rewards |
| 15 | Map after s11: Glass Town closed, s12/s13 open |
| 16–18 | s16: intro, Master Ida speaking (silhouette until her portrait is drawn), board |
| 19 | Shop after `heron.saved`: Heron's Tea and Marsh Boots on sale |
| 20–23 | s15: intro, board, defeat screen with Marta's lines |
| 24–25 | After s15 / s20: s21 shows «далі буде» |
| 26 | Secret s14 opened by the bell-ringer's map |
| 27 | s12 intro: Old Heron with her portrait |
