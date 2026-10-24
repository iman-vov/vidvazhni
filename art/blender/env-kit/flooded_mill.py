# Flooded mill kit (scenario 3, «Затоплений млин»). Run in Blender through the MCP after kitlib.py
# and thorn_path.py (reuses its frond and foliage helpers):
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\thorn_path.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\flooded_mill.py', encoding='utf8').read())
#   build_flooded_mill()
# Mill hall wall height 1.5 (data/environments/flooded-mill.json walls.height), low wall 0.3.

MH = 1.5
MLOW = 0.3
ML = 1.06
MT = 0.16   # timber wall thickness


def mill_paints():
    C = hexc
    paint('wood', [C('#86684a'), C('#7a6650'), C('#927050')], C('#261a10'), C('#d0b08a'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('wood_dark', [C('#57412e'), C('#4e4034'), C('#5e4430')], C('#1a120a'), C('#a08060'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('plank', [C('#9a7a56'), C('#8a7660'), C('#a4825a')], C('#2e2014'), C('#e0c49a'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('stone', [C('#7e7a6e'), C('#6e7064'), C('#887e6c')], C('#1e1e1a'), C('#c8c4b0'), 'stone', grain=(3, 3), edge=0.45)
    paint('stone_dark', [C('#64625a'), C('#585a52')], C('#181814'), C('#aaa696'), 'stone', grain=(3, 3), edge=0.4)
    paint('moss', [C('#6a8240'), C('#5a7438'), C('#768a44')], C('#1a2410'), C('#c4d888'), 'leaf', grain=(3, 3), edge=0.4, feet=0.1)
    paint('reed', [C('#9ca25a'), C('#8a9650'), C('#b0aa62')], C('#2a3014'), C('#eef0b0'), 'leaf', grain=(10, 2), edge=0.2, ao=0.4, feet=0.45)
    paint('cattail', [C('#6a4228'), C('#7a4c2c')], C('#2a160a'), C('#b88a60'), 'soft', grain=(3, 3), edge=0.4, feet=0.0)
    paint('lily', [C('#5a8a4a'), C('#4e7e44'), C('#68944e')], C('#16280e'), C('#bcdc94'), 'leaf', grain=(3, 3), edge=0.45, ao=0.3, feet=0.0)
    paint('petal', [C('#f2d8e0'), C('#f8eef0')], C('#b07890'), C('#ffffff'), 'soft', grain=(3, 3), edge=0.3, feet=0.0)
    paint('pollen', [C('#f0c040')], C('#a07010'), C('#fff0a0'), 'soft', grain=(3, 3), edge=0.0, feet=0.0)
    paint('mud', [C('#5a4634'), C('#4e3e30'), C('#64503a')], C('#1a120c'), C('#9a8264'), 'stone', grain=(2, 2), edge=0.25, ao=0.6, feet=0.15)
    paint('rust', [C('#7a4a2e'), C('#6a4636')], C('#22140c'), C('#c08860'), 'metal', grain=(5, 5), edge=0.6)
    paint('rope', [C('#b49868'), C('#a08458')], C('#4a3a22'), C('#ecd8a8'), 'wood', grain=(12, 2), edge=0.3, feet=0.0)
    paint('glow', [C('#ffe2a0')], C('#ff9a40'), C('#ffb058'), 'emit')
    paint('shadow', [C('#1c1612')], C('#0c0806'), C('#2a2018'), 'soft', grain=(2, 2), edge=0.0, ao=0.0, feet=0.0)
    paint('leaf_green', [C('#6a8a36'), C('#58782e'), C('#7e963c')], C('#1a2610'), C('#d4e68a'), 'leaf', grain=(1.5, 1.5), edge=0.45, ao=0.7, feet=0.2)
    paint('grass', [C('#8a9a44'), C('#a0a04a'), C('#6e8a3a')], C('#2a3214'), C('#e6eaa0'), 'leaf', grain=(6, 2), edge=0.2, ao=0.4, feet=0.45)


def stone_plinth(p, length=ML, depth=MT + 0.08, h=0.2, seed=0, y0=-0.04):
    """Row of rough stones the timber wall stands on (keeps the wood out of the water)."""
    rng = random.Random(seed)
    x = -length / 2
    while x < length / 2 - 0.05:
        sw = rng.uniform(0.24, 0.36)
        if length / 2 - (x + sw) < 0.14:
            sw = length / 2 - x
        hh = h + rng.uniform(-0.03, 0.02)
        p.box('stone', (sw - 0.025, depth, hh), (x + sw / 2, y0 + depth / 2, hh / 2), rot=(0, 0, rng.uniform(-0.04, 0.04)),
              bevel=0.035, jitter=0.02, drop_bottom=True)
        x += sw


def boards(p, x0, x1, z0, z1, y=0.03, t=0.04, seed=0, paint_name='plank'):
    """Vertical board infill between x0 and x1, slightly uneven tops and gaps."""
    rng = random.Random(seed)
    n = max(1, round((x1 - x0) / 0.17))
    w = (x1 - x0) / n
    for i in range(n):
        x = x0 + (i + 0.5) * w
        top = z1 + rng.uniform(-0.01, 0.01)
        p.box(paint_name, (w - 0.012, t, top - z0), (x, y + t / 2, (z0 + top) / 2), rot=(0, rng.uniform(-0.015, 0.015), 0),
              bevel=0.01, jitter=0.004, grain=2)


def beam(p, a, b, size=0.1, paint_name='wood_dark', seed=0):
    """A squared timber from a to b (bevelled box along the segment)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    ln = d.length
    rot = d.to_track_quat('X', 'Z').to_euler()
    return p.box(paint_name, (ln, size, size), tuple((a + b) / 2), rot=tuple(rot), bevel=0.018, jitter=0.006, grain=0)


def timber_wall(name, h=MH, seed=101, window=False, door=False):
    """Mill hall wall: stone plinth, timber frame (sill, rail, top beam, brace), board infill."""
    p = Piece(name, seed)
    stone_plinth(p, seed=seed)
    zs = 0.2
    yc = MT / 2
    beam(p, (-ML / 2, yc, zs + 0.06), (ML / 2, yc, zs + 0.06), 0.13)
    beam(p, (-ML / 2, yc, h - 0.07), (ML / 2, yc, h - 0.07), 0.14)
    if door:
        ox, top = 0.31, 1.2
        for sx in (-1, 1):
            beam(p, (sx * (ox + 0.06), yc, zs), (sx * (ox + 0.06), yc, h - 0.12), 0.13)
            boards(p, sx * (ox + 0.12) if sx > 0 else -ML / 2, ML / 2 if sx > 0 else -(ox + 0.12), zs + 0.12, h - 0.13, seed=seed + sx)
        beam(p, (-ox - 0.12, yc, top + 0.06), (ox + 0.12, yc, top + 0.06), 0.13)
        boards(p, -ox, ox, top + 0.12, h - 0.13, seed=seed + 5)
        p.box('shadow', (2 * ox, 0.02, top - zs), (0, MT - 0.01, (top + zs) / 2))
        p.box('plank', (2 * ox + 0.1, MT + 0.1, 0.05), (0, yc, zs - 0.0), bevel=0.012, grain=0)
        return p
    rail = h * 0.55
    beam(p, (-ML / 2, yc, rail), (ML / 2, yc, rail), 0.1)
    boards(p, -ML / 2, ML / 2, zs + 0.12, rail - 0.05, seed=seed)
    if window:
        wx, wz, ww, wh = 0.0, rail + (h - rail) / 2, 0.42, 0.34
        boards(p, -ML / 2, wx - ww / 2 - 0.05, rail + 0.05, h - 0.14, seed=seed + 2)
        boards(p, wx + ww / 2 + 0.05, ML / 2, rail + 0.05, h - 0.14, seed=seed + 3)
        for sx in (-1, 1):
            beam(p, (wx + sx * (ww / 2 + 0.03), yc - 0.02, rail), (wx + sx * (ww / 2 + 0.03), yc - 0.02, h - 0.12), 0.07)
        p.box('wood_dark', (ww + 0.12, 0.1, 0.06), (wx, yc - 0.04, wz - wh / 2 - 0.02), bevel=0.012)
        p.box('glow', (ww, 0.02, wh), (wx, MT - 0.02, wz))
        p.box('wood_dark', (0.03, 0.04, wh), (wx, yc - 0.02, wz))
        p.box('wood_dark', (ww, 0.04, 0.03), (wx, yc - 0.02, wz))
        p.box('plank', (0.2, 0.035, wh + 0.04), (wx - ww / 2 - 0.12, -0.04, wz), rot=(0, 0, 0.35), bevel=0.008, grain=2)
    else:
        boards(p, -ML / 2, ML / 2, rail + 0.05, h - 0.14, seed=seed + 2)
        beam(p, (-ML / 2 + 0.06, yc - 0.03, zs + 0.12), (ML / 2 - 0.06, yc - 0.03, rail - 0.04), 0.08)
    return p


def timber_wall_low(name='flooded-mill.timber-wall-low', seed=111):
    p = Piece(name, seed)
    stone_plinth(p, seed=seed)
    beam(p, (-ML / 2, MT / 2, 0.25), (ML / 2, MT / 2, 0.25), 0.12)
    rng = random.Random(seed)
    for x in (-0.3, 0.05, 0.36):
        top = rng.uniform(0.32, 0.42)
        p.box('wood_dark', (0.09, 0.09, top - 0.2), (x, MT / 2, (0.2 + top) / 2), rot=(0, rng.uniform(-0.1, 0.1), 0), bevel=0.015, grain=2)
    return p


def timber_post(name, h, seed=113, low=False):
    """Corner post of the hall on a stone footing; centre at (0, -0.1) like the procedural one."""
    p = Piece(name, seed)
    cy = 0.1
    p.rock('stone', 0.24, (0, cy, 0.015), scale=(1.2, 1.2, 0.55))
    top = (h + 0.1) if not low else 0.42
    p.box('wood_dark', (0.2, 0.2, top - 0.1), (0, cy, 0.1 + (top - 0.1) / 2), rot=(0, 0, 0.04), bevel=0.025, jitter=0.008, grain=2)
    if not low:
        p.box('wood_dark', (0.28, 0.28, 0.08), (0, cy, top + 0.02), bevel=0.02)
        for sx in (-1, 1):
            beam(p, (0, cy, top - 0.35), (sx * 0.25, cy, top - 0.05), 0.07, seed=seed)
    else:
        p.cone('wood_dark', 0.12, 0.08, 4, (0, cy, top), rot=(0, 0, math.pi / 4))
    return p


def cattail(p, x, y, h, lean=(0, 0), seed=0):
    base = Vector((x, y, 0))
    tip = base + Vector((lean[0], lean[1], h))
    p.tube('reed', [tuple(base), tuple(base.lerp(tip, 0.6) + Vector((lean[0] * 0.2, lean[1] * 0.2, 0))), tuple(tip)], [0.012, 0.01, 0.007], seg=4)
    head = base.lerp(tip, 0.82)
    p.tube('cattail', [tuple(head - Vector((0, 0, 0.07))), tuple(head + Vector((0, 0, 0.07)))], [0.026, 0.026], seg=6, cap_start=True)


def reed_clump(p, cx, cy, n, h, seed, spread=0.14, cattails=2):
    rng = random.Random(seed)
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        r0 = rng.uniform(0, spread)
        c, s = math.cos(a), math.sin(a)
        hh = h * rng.uniform(0.6, 1.0)
        lean = rng.uniform(0.05, 0.2) * hh
        b = Vector((cx + c * r0, cy + s * r0, 0))
        pts = [b, b + Vector((c * lean * 0.2, s * lean * 0.2, hh * 0.5)), b + Vector((c * lean * 0.6, s * lean * 0.6, hh * 0.85)), b + Vector((c * lean, s * lean, hh))]
        p.frond('reed', [tuple(v) for v in pts], [0.02, 0.018, 0.012, 0.0], up=(c, s, 0.3), crease=0.5)
    for k in range(cattails):
        a = rng.uniform(0, 2 * math.pi)
        cattail(p, cx + math.cos(a) * spread * 0.5, cy + math.sin(a) * spread * 0.5, h * rng.uniform(1.0, 1.15), (rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08)))


def reeds(name='flooded-mill.reeds', seed=121, h=0.9):
    p = Piece(name, seed)
    p.smooth = 75
    reed_clump(p, 0, 0, 16, h, seed, spread=0.16, cattails=3)
    p.blob('mud', 0.16, (0, 0, 0.0), scale=(1.5, 1.4, 0.35), subdiv=1, noise=0.2)
    return p


def reeds_bank(name, h, seed):
    """Water edge along X: mud and stones with reeds standing in them."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    for i in range(3):
        p.blob('mud', 0.3, (-0.4 + i * 0.4, 0.12, 0.0), scale=(1.4, 1.1, 0.32), subdiv=2, noise=0.18)
    p.rock('stone', 0.14, (-0.28, -0.05, 0.05), scale=(1.3, 1, 0.7), rot=(0.3, 0.2, 0.5))
    p.rock('stone', 0.1, (0.42, -0.02, 0.04), scale=(1.2, 1.1, 0.7), rot=(0.1, 0.3, 1.2))
    for i, x in enumerate((-0.38, 0.0, 0.36)):
        reed_clump(p, x + rng.uniform(-0.05, 0.05), 0.1 + rng.uniform(-0.04, 0.06), 9, h, seed + i, spread=0.12, cattails=1 if h > 0.6 else 0)
    return p


def lilies(name='flooded-mill.lilies', seed=131):
    """Lily pads floating just above the board's water plane (y = 0.04) with two flowers."""
    p = Piece(name, seed)
    p.smooth = 60
    rng = random.Random(seed)
    pads = [(0, 0, 0.17), (0.28, 0.1, 0.13), (-0.24, 0.14, 0.12), (0.1, -0.24, 0.11), (-0.2, -0.18, 0.09)]
    for i, (x, y, r) in enumerate(pads):
        bm_before = len(p.bm.faces)
        # A disc with a notch: a fan of 9 segments around 330°.
        a0 = rng.uniform(0, 2 * math.pi)
        seg = 9
        bm = p.bm
        cen = bm.verts.new((x, y, 0.056))
        ring = []
        for k in range(seg + 1):
            a = a0 + math.radians(15) + k * math.radians(330) / seg
            ring.append(bm.verts.new((x + math.cos(a) * r, y + math.sin(a) * r, 0.05 + rng.uniform(-0.004, 0.004))))
        faces = [bm.faces.new((cen, ring[k], ring[k + 1])) for k in range(seg)]
        p._finish(faces, 'lily', Matrix.Identity(4), grain_axis=0)
        bm.normal_update()
        for f in faces:
            if f.normal.z < 0:
                f.normal_flip()
    for x, y in ((0.02, 0.02), (0.28, 0.1)):
        for k in range(6):
            a = k * math.pi / 3
            p.blob('petal', 0.035, (x + math.cos(a) * 0.035, y + math.sin(a) * 0.035, 0.085), scale=(1.6, 0.7, 0.6), rot=(0, -0.5, a), subdiv=1, noise=0.05)
        p.blob('pollen', 0.022, (x, y, 0.095), scale=(1, 1, 0.6), subdiv=1, noise=0.05)
    return p


def mud_bank(name='flooded-mill.mud-bank', seed=141):
    """Muddy bank along X where the yard meets the water: lumps of mud, stones, a few grass tufts."""
    p = Piece(name, seed)
    p.smooth = 70
    rng = random.Random(seed)
    for i in range(4):
        x = -0.45 + i * 0.3 + rng.uniform(-0.04, 0.04)
        p.blob('mud', rng.uniform(0.22, 0.28), (x, 0.12 + rng.uniform(-0.04, 0.04), 0.0), scale=(1.3, 1.2, 0.5), subdiv=2, noise=0.2)
    for x in (-0.35, 0.1, 0.45):
        p.rock('stone', rng.uniform(0.07, 0.11), (x, -0.08 + rng.uniform(-0.04, 0.04), 0.03), scale=(1.3, 1, 0.6), rot=(rng.random(), rng.random(), rng.random()))
    for i, x in enumerate((-0.25, 0.3)):
        rr = random.Random(seed + i)
        for k in range(7):
            a = rr.uniform(0, 2 * math.pi)
            c, s = math.cos(a), math.sin(a)
            b = Vector((x + c * 0.05, 0.18 + s * 0.05, 0.08))
            hh = rr.uniform(0.12, 0.22)
            p.frond('grass', [tuple(b), tuple(b + Vector((c * 0.03, s * 0.03, hh * 0.6))), tuple(b + Vector((c * 0.07, s * 0.07, hh)))], [0.018, 0.012, 0.0], up=(c, s, 0.4), crease=0.4)
    return p


def walkway(name='flooded-mill.walkway', seed=151):
    """Plank walkway along X on posts, deck at 0.18 (stands in shallow water)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    deck = 0.18
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.tube('wood_dark', [(sx * 0.42, sy * 0.26, -0.05), (sx * 0.42 + rng.uniform(-0.02, 0.02), sy * 0.26, deck + 0.06)], [0.05, 0.045], seg=6)
        beam(p, (sx * 0.42, -0.3, deck - 0.07), (sx * 0.42, 0.3, deck - 0.07), 0.08)
    n = 7
    for i in range(n):
        x = -ML / 2 + (i + 0.5) * ML / n
        ln = 0.62 + rng.uniform(-0.04, 0.04)
        p.box('plank', (ML / n - 0.018, ln, 0.04), (x, rng.uniform(-0.02, 0.02), deck + rng.uniform(-0.006, 0.006)),
              rot=(rng.uniform(-0.02, 0.02), 0, rng.uniform(-0.04, 0.04)), bevel=0.01, jitter=0.004, grain=1)
    p.blob('moss', 0.06, (0.42, -0.26, deck + 0.04), scale=(1.2, 1.2, 0.5), subdiv=1, noise=0.12)
    return p


def sluice(name='flooded-mill.sluice', seed=161):
    """Stone sluice along X: two piers, a plank gate in grooves, rusty bands, water slot at the foot."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    for sx in (-1, 1):
        z = 0
        i = 0
        while z < 0.95:
            hh = rng.uniform(0.2, 0.26)
            p.box('stone', (0.32, 0.42, hh - 0.025), (sx * 0.37, 0.18, z + hh / 2), rot=(0, 0, rng.uniform(-0.04, 0.04)), bevel=0.035, jitter=0.015, drop_bottom=(i == 0))
            z += hh
            i += 1
        p.box('stone_dark', (0.38, 0.48, 0.1), (sx * 0.37, 0.18, z + 0.05), bevel=0.03, jitter=0.01)
    # Gate boards between the piers, sitting in the grooves, with iron bands.
    for k in range(4):
        p.box('plank', (0.44, 0.06, 0.19), (0, 0.16, 0.18 + k * 0.19), bevel=0.012, jitter=0.004, grain=0)
    for z in (0.3, 0.75):
        p.box('rust', (0.46, 0.08, 0.04), (0, 0.16, z), bevel=0.008)
    p.box('shadow', (0.42, 0.3, 0.08), (0, 0.18, 0.04))
    # Lifting beam across the top with a rusty rack.
    beam(p, (-0.55, 0.16, 1.12), (0.55, 0.16, 1.12), 0.12)
    p.box('rust', (0.05, 0.05, 0.42), (0, 0.12, 1.0), bevel=0.008)
    p.blob('moss', 0.12, (-0.37, 0.05, 0.14), scale=(1.3, 0.6, 0.9), subdiv=1, noise=0.15)
    p.blob('moss', 0.1, (0.37, 0.05, 0.24), scale=(1.2, 0.6, 0.8), subdiv=1, noise=0.15)
    return p


def mooring_post(name='flooded-mill.post', seed=171):
    p = Piece(name, seed)
    p.smooth = 60
    p.tube('wood_dark', [(0, 0, -0.05), (0.02, 0.01, 0.4), (0.0, 0.0, 0.72)], [0.08, 0.075, 0.07], seg=7, cap_end=True)
    p.tube('rope', [(0.0, -0.075, 0.5), (0.075, 0.0, 0.52), (0.0, 0.075, 0.5), (-0.075, 0.0, 0.48), (0.0, -0.08, 0.5)], [0.018] * 5, seg=4, cap_end=False)
    p.tube('rope', [(0.0, -0.08, 0.5), (0.05, -0.2, 0.3), (0.12, -0.3, 0.02)], [0.016, 0.016, 0.016], seg=4)
    p.blob('moss', 0.08, (0, 0, 0.73), scale=(1, 1, 0.35), subdiv=1, noise=0.1)
    return p


def fence(name='flooded-mill.fence', seed=181):
    """Rough fence along X: two posts and two rails, one rail sagging."""
    p = Piece(name, seed)
    for x in (-0.48, 0.48):
        p.box('wood_dark', (0.08, 0.08, 0.72), (x, 0, 0.36), rot=(0, 0.04 * x, 0), bevel=0.015, grain=2)
        p.cone('wood_dark', 0.06, 0.06, 4, (x, 0, 0.72), rot=(0, 0, math.pi / 4))
    beam(p, (-0.52, -0.05, 0.55), (0.52, -0.05, 0.57), 0.06, 'wood')
    beam(p, (-0.52, -0.05, 0.28), (0.52, -0.05, 0.18), 0.06, 'wood')
    return p


def mill_pieces():
    return [
        lambda: timber_wall('flooded-mill.timber-wall', seed=101),
        lambda: timber_wall('flooded-mill.timber-window', seed=103, window=True),
        lambda: timber_wall('flooded-mill.timber-doorway', seed=105, door=True),
        lambda: timber_wall_low(),
        lambda: timber_post('flooded-mill.timber-post', MH),
        lambda: timber_post('flooded-mill.timber-post-low', MLOW, seed=115, low=True),
        lambda: sluice(),
        lambda: walkway(),
        lambda: reeds(),
        lambda: reeds_bank('flooded-mill.reeds-bank', 0.95, 123),
        lambda: reeds_bank('flooded-mill.reeds-low', 0.42, 125),
        lambda: lilies(),
        lambda: mud_bank(),
        lambda: mooring_post(),
        lambda: fence(),
    ]


def build_flooded_mill():
    mill_paints()
    c = collection('flooded-mill')
    objs = []
    for i, make in enumerate(mill_pieces()):
        objs.append(make().build(((i % 5) * 1.6, (i // 5) * 2.0, 0), c))
    return objs


def water_plane(coll, size=(14, 10), pos=(0, 0, 0.03)):
    """Shallow water for the diorama only (the board draws its own)."""
    me = bpy.data.meshes.new('dio.water')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            l[uvl].uv = (l.vert.co.x * size[0] / 4, l.vert.co.y * size[1] / 4)
    for v in bm.verts:
        v.co.x *= size[0] / 2; v.co.y *= size[1] / 2
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('dio.water', me)
    coll.objects.link(o)
    o.location = pos
    m = bpy.data.materials.new('dio.water')
    m.use_nodes = True
    nt = m.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = bpy.data.images.load(os.path.join(TEX_DIR, 'shallow-water.1024.webp'), check_existing=True)
    nt.links.new(tx.outputs[0], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.15
    bs.inputs['Alpha'].default_value = 0.72
    m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else None
    me.materials.append(m)
    o.visible_shadow = False
    return o


def mill_diorama():
    c = collection('flooded-mill-diorama')
    for o in list(c.objects):
        bpy.data.objects.remove(o)
    floor(c, os.path.join(TEX_DIR, 'swamp-mud.1024.webp'), tint=hexc('#a89880'))
    bpy.data.objects['dio.floor'].visible_shadow = False
    water_plane(c, size=(7, 4), pos=(-2.5, -2.6, 0.04))
    hex_tiles(c, [(0, 0), (-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)], paint_hex='#76705e')
    back = [(-SQ3, 0), (0, 0), (SQ3, 0)]
    walls = ['timber-wall', 'timber-window', 'timber-doorway', 'timber-wall', 'timber-window', 'timber-wall']
    k = 0
    for cx, cy in back:
        cen = Vector((cx, cy, 0))
        for a, b in ((2, 1), (1, 0)):
            wall_on_edge('flooded-mill.' + walls[k], c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            k += 1
        for v in (2, 1):
            place('flooded-mill.timber-post', c, hex_vertex(cx, cy, v))
    place('flooded-mill.timber-post', c, hex_vertex(SQ3, 0, 0))
    wall_on_edge('flooded-mill.sluice', c, hex_vertex(-SQ3, 0, 2), hex_vertex(-SQ3, 0, 3), Vector((-SQ3, 0, 0)))
    wall_on_edge('flooded-mill.reeds-bank', c, hex_vertex(SQ3, 0, 5), hex_vertex(SQ3, 0, 0), Vector((SQ3, 0, 0)))
    for cx, cy in ((-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)):
        cen = Vector((cx, cy, 0))
        for a, b in ((3, 4), (4, 5)):
            wall_on_edge('flooded-mill.reeds-low', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
    place('flooded-mill.lilies', c, (-2.4, -1.9, 0))
    place('flooded-mill.lilies', c, (-3.3, -0.9, 0), 1.2)
    place('flooded-mill.walkway', c, (-2.6, -0.6, 0), math.radians(60))
    place('flooded-mill.post', c, (-2.0, -1.2, 0))
    place('flooded-mill.reeds', c, (2.3, -1.4, 0))
    place('flooded-mill.reeds', c, (-1.7, -3.0, 0), 1.0)
    place('flooded-mill.mud-bank', c, (2.6, -2.4, 0), math.radians(-150))
    place('flooded-mill.fence', c, (3.4, -0.6, 0), math.radians(100))
    place('flooded-mill.timber-wall-low', c, (0.4, -3.6, 0), math.radians(180))
    return c

