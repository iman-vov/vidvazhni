# Walls between rooms: straight, as in Jaws of the Lion

Rule: a wall between rooms is one straight line from outer wall to outer wall (or to another such
wall), through the doorway hex. The hexes the line would cut are left out of the map, so the rules
see the same board as the picture: rooms touch only at their doors. No zig-zag along hex edges, no
gaps, no barrels at the ends. Each location builds its walls from its own divider: masonry indoors,
a fence, hedge, reeds or rock outside.

## What was wrong, and why

- **Thin walls in the data.** s0 walled the yard off with 8 thin walls along hex edges. Hex edges
  never make a straight line, so the wall zig-zagged.
- **`gapPartitions()` only knew strips that line up.** It ran a wall down a strip of left-out hexes
  only for rooms joined by a door, with all the strip hexes in one row. Rooms with no door between
  them got no wall at all, and so did strips that do not line up (s8). Ends were carried on to the
  outer wall only within 4 units, so some halves stopped short (s9).
- **Outdoor walls were drawn only at their ends.** For thicket, reeds and rock, `boardTiles` drew a
  partition only where it was carried on to the outer wall. The rest was missing, and the bushes
  of the strip read as a crooked band (s2, s3, s5, s7).

## The fix

- `src/render/environment/walls.ts` `roomWalls()` replaces `partitions()` and `gapPartitions()`.
  For every pair of rooms within 3 hexes of each other, it tries six directions (every 30°) through
  the doorway, or midway between the rooms when there is no door. It takes a line with one room
  wholly on each side and the widest margin, and runs it both ways to the outer wall or to a wall
  already placed. A line that would go into any playable hex is refused. Walls on one line become
  one wall with several doorways. It works from the room hexes alone, so a new scenario gets its
  walls without code; the test below fails if its map cannot have them.
- Dividers are part of the environment kit (`pieces.ts`, procedural):

  | Divider | Piece | Locations |
  | --- | --- | --- |
  | brick | `divider-brick` | cellar (s0, s1), old forge (s10) |
  | stone | `divider-stone` | watchtower (s4) |
  | palisade | `divider-palisade` | thorn path (s2) |
  | reed fence | `reed-fence` | flooded mill (s3) |
  | planks | `divider-planks` | mine tunnel (s6), the mill hall in s3 (an indoor room) |
  | rock ridge | `divider-rock-ridge` | gloom heart (s5), dark depths (s9) |
  | stone fence | `divider-stone-fence` | mountain pass (s7) |
  | wattle | `divider-wattle` | Copperdale (s8) |
  | hedge | `thicket-hedge` | any other forest location |

  The choice is `dividerFor()` in `environment/index.ts`. A location can name its own with
  `divider` in its file (schema updated); none does yet. A room with an indoor edge inside an
  outdoor location is walled off as indoors.
- `boardTiles` builds every partition as the location's divider, one piece per metre along the
  line. A door in a wall stands across the wall's line.
- s0 (tutorial): the wall is the row z = 2.5. The door moves (2,1) → (3,1); the yard loses (1,2),
  the cellar loses (0,3), (2,2) and (4,1); the 8 thin walls go. Start hex (1,2) → (2,1), and the
  tutorial's «open the door» step points at (3,1).
- `tests/render/room-walls.test.ts`, on every map s0–s10:
  - no thin walls, and rooms touch only at the doorway hexes that join them (the rules side);
  - each wall is one straight segment that goes into no playable hex;
  - every pair of rooms sharing floor has a wall, and every doorway stands on its wall's line;
  - each end meets the outer wall, another wall or a doorway: no gaps;
  - every location's divider is a kit piece, with no masonry outdoors.

## Before / after

Dev board (`dev/board.html?board=sN`, all rooms shown), medium quality, the same camera in both.
Screenshots are in `docs/art/walls/`.

| Map | Before | After |
| --- | --- | --- |
| s0 tutorial | ![](walls/s0-before.jpg) zig-zag stone wall along hex edges | ![](walls/s0-after.jpg) one brick wall across, door in it |
| s1 cellar | ![](walls/s1-before.jpg) thin post line | ![](walls/s1-after.jpg) brick wall, outer wall to outer wall |
| s2 thorn path | ![](walls/s2-before.jpg) no wall, thicket band | ![](walls/s2-after.jpg) two straight palisades |
| s3 flooded mill | ![](walls/s3-before.jpg) reeds only below the door | ![](walls/s3-after.jpg) reed fence and a plank wall to the mill hall |
| s4 watchtower | ![](walls/s4-before.jpg) thin walls | ![](walls/s4-after.jpg) two stone walls |
| s5 gloom heart | ![](walls/s5-before.jpg) rocks only below the door | ![](walls/s5-after.jpg) rock ridge, end to end |
| s6 mine tunnel | ![](walls/s6-before.jpg) thin posts, no wall at the cart niche | ![](walls/s6-after.jpg) three plank walls (adit, cart niche, lift) |
| s7 mountain pass | ![](walls/s7-before.jpg) no walls | ![](walls/s7-after.jpg) two stone fences |
| s8 Copperdale | ![](walls/s8-before.jpg) no walls, only door posts | ![](walls/s8-after.jpg) three wattle fences, one between the storerooms |
| s9 dark depths | ![](walls/s9-before.jpg) one half stops short | ![](walls/s9-after.jpg) two rock ridges |
| s10 old forge | ![](walls/s10-before.jpg) thin wall | ![](walls/s10-after.jpg) brick wall |

The floors and props in the after shots also show other sessions' work in progress (visual audit,
obstacle clusters).
