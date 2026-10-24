# Audio credits

Every recorded sound and music file in `public/audio/` is **CC0 1.0** (public domain,
https://creativecommons.org/publicdomain/zero/1.0/). Credit is not required; it is given here anyway.
The raw downloads stay in `art/audio-source/` (not in git). The files were trimmed, faded and
re-encoded to MP3 (SFX mono 64 kbps, music stereo 64 kbps / 32 kHz) with ffmpeg.

## Sound effects — Kenney (kenney.nl), CC0

| File | Pack | Source file |
|---|---|---|
| `sfx/ui-open.mp3` | [interface-sounds](https://kenney.nl/assets/interface-sounds) | `open_001.ogg` |
| `sfx/ui-error.mp3` | [interface-sounds](https://kenney.nl/assets/interface-sounds) | `error_004.ogg` |
| `sfx/card-slide.mp3` | [casino-audio](https://kenney.nl/assets/casino-audio) | `card-slide-3.ogg` |
| `sfx/card-shuffle.mp3` | [casino-audio](https://kenney.nl/assets/casino-audio) | `card-shuffle.ogg` (first 1.4 s, faded) |
| `sfx/step-1.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `footstep00.ogg` |
| `sfx/step-2.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `footstep02.ogg` |
| `sfx/step-3.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `footstep04.ogg` |
| `sfx/hit-1.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactPunch_medium_000.ogg` |
| `sfx/hit-2.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactPunch_medium_002.ogg` |
| `sfx/miss.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `knifeSlice2.ogg` |
| `sfx/shield.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactMetal_light_002.ogg` |
| `sfx/hurt.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactSoft_medium_001.ogg` |
| `sfx/heal.mp3` | [interface-sounds](https://kenney.nl/assets/interface-sounds) | `confirmation_002.ogg` |
| `sfx/die-small.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactSoft_medium_003.ogg` |
| `sfx/die-medium.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactSoft_heavy_001.ogg` |
| `sfx/die-large.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactWood_heavy_002.ogg` |
| `sfx/hero-down.mp3` | [interface-sounds](https://kenney.nl/assets/interface-sounds) | `minimize_003.ogg` |
| `sfx/door.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `doorOpen_1.ogg` |
| `sfx/chest.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `metalLatch.ogg` |
| `sfx/coins-1.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `handleCoins.ogg` |
| `sfx/coins-2.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `handleCoins2.ogg` |
| `sfx/lever.mp3` | [rpg-audio](https://kenney.nl/assets/rpg-audio) | `metalClick.ogg` |
| `sfx/trap.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactMetal_heavy_001.ogg` |
| `sfx/break.mp3` | [impact-sounds](https://kenney.nl/assets/impact-sounds) | `impactPlank_medium_001.ogg` |
| `sfx/goal.mp3` | [music-jingles](https://kenney.nl/assets/music-jingles) | `Pizzicato jingles/jingles_PIZZI10.ogg` |
| `sfx/round.mp3` | [interface-sounds](https://kenney.nl/assets/interface-sounds) | `bong_001.ogg` |

## Music — OpenGameArt.org, CC0

| File | Used for | Track, author | Source | Edit |
|---|---|---|---|---|
| `music/camp.mp3` | menu, camp, map, story | «Medieval: The Old Tower Inn» (loop version), RandomMind | https://opengameart.org/content/medieval-the-old-tower-inn | as is, seamless loop |
| `music/village.mp3` | Copperdale | «Medieval: Market Day» (loop version), RandomMind | https://opengameart.org/content/medieval-market-day | as is, seamless loop |
| `music/cellar.mp3` | cellar | «Medieval: Exploration», RandomMind | https://opengameart.org/content/medieval-exploration | 0–92 s, 3 s fade |
| `music/forest.mp3` | thorn path, mountain pass | «Medieval: Harvest Season», RandomMind | https://opengameart.org/content/medieval-harvest-season | 0–103.5 s, 3 s fade |
| `music/marsh.mp3` | flooded mill | «Happy Swamp», shggothslave | https://opengameart.org/content/happy-swamp | 0–96.5 s, 3 s fade |
| `music/tower.mp3` | watchtower | «Dreams of a Silver Tower», Tsorthan Grove | https://opengameart.org/content/dreams-of-a-silver-tower | full, 2 s fade |
| `music/gloom.mp3` | gloom heart | «Fantasy: Rising Moon», RandomMind | https://opengameart.org/content/fantasy-rising-moon | 0–103 s, 3 s fade |
| `music/caves.mp3` | mine tunnel, old forge, dark depths | «Cave Theme», haeldb (CC0 / OGA-BY, used under CC0) | https://opengameart.org/content/cave-theme | 0–91.5 s, 3 s fade |
| `music/battle.mp3` | boss fights | «Medieval: Battle», RandomMind | https://opengameart.org/content/medieval-battle | 0–71 s |
| `music/defeat.mp3` | defeat stinger | «Medieval: Defeat Theme», RandomMind | https://opengameart.org/content/medieval-defeat-theme | 0–12 s, 3 s fade |

Tracks marked «fade» are not seamless loops: the engine starts the next pass 3 s before the end
and fades it in (`loop: "crossfade"` in `data/audio.json`).

## Original — made for «Відважні» (no files)

These are generated in code at play time (WebAudio), written for this game; nothing is downloaded.
They are the project's own work, under the project's licence.

| Piece | Where | What |
|---|---|---|
| UI click, back, card pick | `src/audio/synth.ts` (`click`, `back`, `cardPick`) | sfxr-style tones and filtered noise |
| Orb charge | `synth.ts` `orb` | a rising glassy tone, a fifth, a bell |
| «Наснага» gained / spent | `synth.ts` `momentum`, `surge` | a warm major-chord swell; a bright run |
| Level up | `synth.ts` `levelUp` | the Lantern theme's opening, fast, and a chord |
| Initiative die tumble | `synth.ts` `die` | wooden knocks that come faster and softer |
| «Ліхтарик» (the Lantern theme) | `src/audio/motif.ts` | an 8-bar folk waltz in D major on a pluck synth: in full before the menu music, slower before the camp music, its second half as the victory stinger |
| Ambient beds | `src/audio/ambient.ts`, `data/audio.json` `ambient` | drone, wind, water, cave drips, birds, fire crackle per location, under the music; louder wind and a brighter drone as more monsters are awake |
