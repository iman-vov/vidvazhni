# Floors, mine edge, s7 light (2026-10-25)

`<scenario>-before.jpg` — before, from the dev board (`?board=sN&quality=high`, 1024×768, no UI).
`<scenario>-after.png` — after, headless Chrome on the same page (the dev panel shows at the top).

- s0, s1 (`flagstones`), s4, s10 (`worn-stone`): random ashlar instead of courses — no tile grid, no repeat visible across a room.
- s8 (`cobblestone`): rounded cobbles packed the same way.
- s6, s9: rock face with timber sets and hung lamps every 2–3 segments, rubble on the near side (procedural stand-ins until the Blender kit).
- s7: warm low sun, darker rock, more contrast.

# A room's floor wall to wall, grid on planks (2026-10-28)

`rooms-<scenario>-<quality>-<view>-before.jpg` / `-after.jpg`: dev board, headless Chrome 1180×820;
`wide` is the home view, the others zoom in on the middle of that room.

- Grid on planks: the plank patch's depth pull hid the grid at the board's camera angle; the grid
  and terrain now sit above it, and the line has a thin dark band inside it so it reads on light
  wood as on dark stone (same on low, medium, high).
- Stone by the outer walls: walls run straight out to the zigzag's outer corners; the strip
  between is floored with the room's floor now, only where a straight wall stands.
- Door between two floors: the floor changes on the wall's line through the door.
- Strip between two rooms that neither floored (s8 north storeroom / office): each room takes
  its side of the wall.
- No stone decals (slabs, cracks, rubble) or pebbles on wooden floors: planks, stains, chips.
- Before shots exist for s8 high only (the user's report); s8 low and s9 are after-only.
