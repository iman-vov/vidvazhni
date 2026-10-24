# Cellar kit (scenario 1, «Ситий Гусак»). Run in Blender through the MCP after kitlib.py:
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\cellar.py', encoding='utf8').read())
#   build_cellar()
# Wall height 1.6 (data/environments/cellar.json walls.height), low wall 0.3.

WALL_LEN = 1.06
H = 1.6
LOW = 0.3
DEPTH = 0.3


def cellar_paints():
    C = hexc
    paint('stone', [C('#8c7862'), C('#76695e'), C('#96765a')], C('#261c17'), C('#c8b090'), 'stone', grain=(3, 3), edge=0.45)
    paint('stone_dark', [C('#74624f'), C('#605548'), C('#7a5e48')], C('#1e1612'), C('#b09a7c'), 'stone', grain=(3, 3), edge=0.4)
    paint('mortar', [C('#4a3c34'), C('#54443a')], C('#1c1411'), C('#7a6a5c'), 'stone', grain=(4, 4), edge=0.1, ao=0.5)
    paint('wood', [C('#9a6036'), C('#a8703c'), C('#8a5432')], C('#2e1a0e'), C('#eab070'), 'wood', grain=(9, 1.3), edge=0.6)
    paint('wood_dark', [C('#62402a'), C('#6e4a2c'), C('#563826')], C('#1e120a'), C('#b08050'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('iron', [C('#4c4e56'), C('#565258')], C('#16161a'), C('#b0b2bc'), 'metal', grain=(5, 5), edge=0.75)
    paint('wax', [C('#f0e2c4'), C('#e2d0a6')], C('#9a8460'), C('#fffaf0'), 'soft', grain=(4, 4), edge=0.3, ao=0.5, feet=0.1)
    paint('flame', [C('#fff4c4')], C('#ff7a1c'), C('#ff8a26'), 'emit')
    paint('glow', [C('#ffe2a0')], C('#ff9a40'), C('#ffb058'), 'emit')
    paint('onion', [C('#c88a3a'), C('#d8a452'), C('#b8742e')], C('#4a2e12'), C('#f8e0a0'), 'soft', grain=(2, 6), edge=0.5, feet=0.0)
    paint('garlic', [C('#ece2cc'), C('#dccdb2')], C('#8a7a64'), C('#ffffff'), 'soft', grain=(2, 6), edge=0.35, feet=0.0)
    paint('sausage', [C('#923e2a'), C('#a64c32'), C('#7e3424')], C('#36120c'), C('#e09070'), 'soft', grain=(3, 3), edge=0.5, feet=0.0)
    paint('rope', [C('#b89a68'), C('#a48858')], C('#4a3a22'), C('#ecd8a8'), 'wood', grain=(12, 2), edge=0.3, feet=0.0)
    paint('bottle', [C('#2e5444'), C('#4a2c46'), C('#3a4a2a')], C('#0e140e'), C('#a8e0c0'), 'metal', grain=(3, 3), edge=0.85, feet=0.2)
    paint('jar', [C('#b46a46'), C('#c88a58'), C('#a85a3c')], C('#42200f'), C('#f4c090'), 'soft', grain=(3, 3), edge=0.55, feet=0.2)
    paint('glass', [C('#5c8e70'), C('#6a8a5a'), C('#4e7a72')], C('#183024'), C('#dcf4e0'), 'metal', grain=(3, 3), edge=0.8, feet=0.2)
    paint('cloth', [C('#dcc69c'), C('#c8ae86')], C('#6a5434'), C('#fff2d0'), 'soft', grain=(3, 3), edge=0.35, feet=0.1)
    paint('web', [C('#dcdad4')], C('#a8a6a0'), C('#ffffff'), 'soft', grain=(3, 3), edge=0.0, ao=0.0, feet=0.0, streak=(0.95, 1.05))


def _free(x0, x1, z, h, holes):
    """Parts of the row x0..x1 (at height z..z+h) not covered by the holes."""
    segs = [(x0, x1)]
    for hole in holes:
        if len(hole) == 3:
            # Upper half of a circle (cx, cz, r): an arch ring and the opening under it.
            cx, cz, r = hole
            if z + h <= cz - 0.02 or z >= cz + r:
                continue
            zz = min(max(cz, z), z + h)
            hw = math.sqrt(max(0.0, r * r - (zz - cz) ** 2))
            hx0, hx1 = cx - hw, cx + hw
        else:
            hx0, hx1, hz0, hz1 = hole
            if not (z < hz1 and z + h > hz0):
                continue
        segs = [q for a0, a1 in segs for q in ((a0, min(a1, hx0)), (max(a0, hx1), a1)) if q[1] - q[0] > 0.06]
    return segs


def stone_courses(p, x0, x1, z0, z1, y_front=0.0, depth=0.14, seed=0, row_h=(0.2, 0.28), w=(0.24, 0.42), paint_name='stone', bevel=0.035, jitter=0.018, bulge=0.025, holes=()):
    """Fills a rectangle of the wall face (x0..x1, z0..z1) with staggered, chunky stones.
    holes: (hx0, hx1, hz0, hz1) rectangles or (cx, cz, r) arches kept free; each free stretch of a
    row is split into stones that fit it exactly, so no slivers appear next to openings."""
    rng = random.Random(seed)
    z = z0
    row = 0
    gap = 0.03
    while z < z1 - 0.05:
        h = rng.uniform(*row_h)
        if z1 - (z + h) < 0.12:
            h = z1 - z
        for a0, a1 in _free(x0, x1, z, h, holes):
            ln = a1 - a0
            n = max(1, round(ln / ((w[0] + w[1]) / 2)))
            ws = [rng.uniform(0.75, 1.25) for _ in range(n)]
            if row % 2 and n > 1:
                ws[0] *= 0.55
            k = ln / sum(ws)
            x = a0
            for wi in ws:
                sw = wi * k
                out = rng.uniform(0, bulge)
                p.box(paint_name, (sw - gap, depth, h - gap), (x + sw / 2, y_front + depth / 2 - out, z + h / 2),
                      rot=(rng.uniform(-0.03, 0.03), rng.uniform(-0.04, 0.04), rng.uniform(-0.03, 0.03)),
                      bevel=min(bevel, sw * 0.2), jitter=jitter, grain=0)
                x += sw
        z += h
        row += 1


def wall_core(p, h, length=WALL_LEN, depth=DEPTH):
    """Dark mortar body behind the stones; its front face sits slightly back from y = 0."""
    p.box('mortar', (length - 0.01, depth - 0.05, h - 0.02), (0, 0.05 + (depth - 0.05) / 2, h / 2 - 0.005), drop_bottom=True)


def coping(p, h, length=WALL_LEN, depth=DEPTH, seed=0, paint_name='stone_dark'):
    """Big flat capstones along the top: the part of a wall the game camera sees most."""
    rng = random.Random(seed + 99)
    x = -length / 2
    while x < length / 2 - 0.05:
        sw = rng.uniform(0.3, 0.45)
        if length / 2 - (x + sw) < 0.15:
            sw = length / 2 - x
        p.box(paint_name, (sw - 0.015, depth + 0.06, 0.12), (x + sw / 2, depth / 2, h - 0.06 + rng.uniform(-0.01, 0.01)),
              rot=(rng.uniform(-0.02, 0.02), rng.uniform(-0.03, 0.03), rng.uniform(-0.02, 0.02)), bevel=0.035, jitter=0.01)
        x += sw


def plinth(p, length=WALL_LEN, depth=DEPTH, seed=0):
    rng = random.Random(seed + 7)
    x = -length / 2
    while x < length / 2 - 0.05:
        sw = rng.uniform(0.32, 0.5)
        if length / 2 - (x + sw) < 0.18:
            sw = length / 2 - x
        p.box('stone_dark', (sw - 0.02, depth + 0.08, 0.2), (x + sw / 2, depth / 2 - 0.02, 0.1),
              rot=(0, 0, rng.uniform(-0.03, 0.03)), bevel=0.035, jitter=0.012, drop_bottom=True)
        x += sw


def stone_wall(name='cellar.stone-wall', h=H, seed=3):
    p = Piece(name, seed)
    wall_core(p, h)
    plinth(p, seed=seed)
    stone_courses(p, -WALL_LEN / 2, WALL_LEN / 2, 0.2, h - 0.12, seed=seed)
    coping(p, h, seed=seed)
    return p


def stone_wall_low(name='cellar.stone-wall-low', h=LOW, seed=5):
    """A wall cut down to the knee where it would hide the board: one course of big stones."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    p.box('mortar', (WALL_LEN - 0.01, DEPTH - 0.05, h - 0.04), (0, 0.05 + (DEPTH - 0.05) / 2, (h - 0.04) / 2), drop_bottom=True)
    x = -WALL_LEN / 2
    while x < WALL_LEN / 2 - 0.05:
        sw = rng.uniform(0.26, 0.4)
        if WALL_LEN / 2 - (x + sw) < 0.14:
            sw = WALL_LEN / 2 - x
        top = h + rng.uniform(-0.05, 0.03)
        p.box('stone_dark', (sw - 0.03, DEPTH + 0.06, top), (x + sw / 2, DEPTH / 2 - 0.01, top / 2),
              rot=(0, rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04)), bevel=0.035, jitter=0.02, drop_bottom=True)
        x += sw
    return p


def pillar(name, h, seed=7, low=False):
    """Corner column on a vertex of the outline: stacked blocks between a wide foot and a cap."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    cy = 0.1
    p.box('stone_dark', (0.5, 0.5, 0.18), (0, cy, 0.09), bevel=0.04, jitter=0.012, drop_bottom=True)
    z = 0.18
    top = h + 0.12 - (0.0 if low else 0.14)
    i = 0
    while z < top - 0.06:
        bh = min(rng.uniform(0.24, 0.32), top - z)
        p.box('stone', (0.4 + rng.uniform(-0.02, 0.02), 0.4 + rng.uniform(-0.02, 0.02), bh - 0.025),
              (rng.uniform(-0.01, 0.01), cy, z + bh / 2), rot=(0, 0, rng.uniform(-0.03, 0.03) + (0.03 if i % 2 else -0.03)),
              bevel=0.04, jitter=0.015)
        z += bh
        i += 1
    if not low:
        p.box('stone_dark', (0.52, 0.52, 0.14), (0, cy, top + 0.07), bevel=0.04, jitter=0.012)
    return p


def arch_ring(p, cx, cz, r_in, r_out, y0, depth, n=7, seed=0, paint_name='stone'):
    """Wedge stones around a semicircle (voussoirs), keystone on top a little proud."""
    rng = random.Random(seed)
    r = (r_in + r_out) / 2
    for i in range(n):
        a = math.pi * (i + 0.5) / n
        w = 2 * math.pi * r / (2 * n) - 0.018
        key = i == n // 2
        p.box(paint_name, (w * (1.15 if key else 1), depth + (0.03 if key else 0), (r_out - r_in) * (1.15 if key else 1)),
              (cx + math.cos(a) * r, y0 + depth / 2 - (0.03 if key else 0), cz + math.sin(a) * r),
              rot=(0, a - math.pi / 2 + rng.uniform(-0.03, 0.03), 0), bevel=0.03, jitter=0.01)


def candle(p, x, y, z, h, r=0.035, lit=True, seed=0):
    rng = random.Random(seed)
    p.cyl('wax', r, r * 0.95, h, 8, (x, y, z), bevel=0.008)
    # Drips down the side and a little pool at the foot.
    for k in range(2):
        a = rng.uniform(0, 2 * math.pi)
        p.blob('wax', r * 0.45, (x + math.cos(a) * r * 0.9, y + math.sin(a) * r * 0.9, z + h - rng.uniform(0.02, h * 0.5)), scale=(0.7, 0.7, 2.0), noise=0.1)
    p.blob('wax', r * 1.5, (x, y, z + 0.005), scale=(1, 1, 0.25), noise=0.15)
    p.cyl('wood_dark', 0.004, 0.004, 0.025, 4, (x, y, z + h), caps=False)
    if lit:
        p.blob('flame', 0.022, (x, y, z + h + 0.045), scale=(0.9, 0.9, 2.2), noise=0.05, emit_uv=True)


def stone_arch(name='cellar.stone-arch', h=H, seed=11):
    """Wall with an arched niche holding a candle."""
    p = Piece(name, seed)
    nx, nz0, nz1 = 0.27, 0.42, 0.8   # niche half-width, sill, spring of the arch
    # Mortar core around the niche, and a back deeper inside it.
    cd = DEPTH - 0.05
    p.box('mortar', (WALL_LEN / 2 - nx, cd, h - 0.02), (-(WALL_LEN / 2 + nx) / 2, 0.05 + cd / 2, h / 2 - 0.01), drop_bottom=True)
    p.box('mortar', (WALL_LEN / 2 - nx, cd, h - 0.02), ((WALL_LEN / 2 + nx) / 2, 0.05 + cd / 2, h / 2 - 0.01), drop_bottom=True)
    p.box('mortar', (2 * nx, cd, nz0), (0, 0.05 + cd / 2, nz0 / 2), drop_bottom=True)
    p.box('mortar', (2 * nx, cd, h - 1.0), (0, 0.05 + cd / 2, 1.0 + (h - 1.0) / 2))
    p.box('mortar', (2 * nx, 0.1, nz1 + nx - nz0), (0, 0.25, nz0 + (nz1 + nx - nz0) / 2))
    plinth(p, seed=seed)
    stone_courses(p, -WALL_LEN / 2, WALL_LEN / 2, 0.2, nz0, seed=seed, row_h=(0.22, 0.22))
    # Around the niche: straight sides beside it, then courses cut around the arch ring.
    stone_courses(p, -WALL_LEN / 2, WALL_LEN / 2, nz0, h - 0.12, seed=seed + 1,
                  holes=[(-nx, nx, nz0, nz1), (0.0, nz1, nx + 0.11)])
    arch_ring(p, 0, nz1, nx, nx + 0.17, -0.01, 0.17, n=7, seed=seed)
    # Sill and the candle on it.
    p.box('stone_dark', (2 * nx + 0.14, 0.26, 0.07), (0, 0.06, nz0 - 0.03), bevel=0.025, jitter=0.01)
    p.cyl('iron', 0.05, 0.055, 0.015, 8, (0.06, 0.08, nz0 + 0.005))
    candle(p, 0.06, 0.08, nz0 + 0.02, 0.14, 0.03, seed=seed)
    candle(p, -0.1, 0.12, nz0 + 0.005, 0.07, 0.025, lit=False, seed=seed + 1)
    coping(p, h, seed=seed)
    return p


def stone_doorway(name='cellar.stone-doorway', h=H, seed=13):
    """Arched stone doorway, open (the door itself is the Meshy dungeon-door prop)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    ox, spring, ring = 0.31, 0.99, 0.16
    cd = DEPTH - 0.05
    for sx in (-1, 1):
        p.box('mortar', (WALL_LEN / 2 - ox, cd, h - 0.02), (sx * (WALL_LEN / 2 + ox) / 2, 0.05 + cd / 2, h / 2 - 0.01), drop_bottom=True)
    p.box('mortar', (2 * ox, cd, h - spring - ox + 0.02), (0, 0.05 + cd / 2, spring + ox - 0.02 + (h - spring - ox + 0.02) / 2))
    # Jambs: full-depth blocks, alternately long and short, so the passage looks solid from the side.
    for sx in (-1, 1):
        z = 0.0
        i = 0
        while z < spring - 0.05:
            bh = min(rng.uniform(0.22, 0.3), spring - z)
            w = 0.17 if i % 2 else 0.22
            p.box('stone', (w, DEPTH + 0.06, bh - 0.03), (sx * (ox + w / 2), DEPTH / 2, z + bh / 2),
                  rot=(0, 0, rng.uniform(-0.03, 0.03)), bevel=0.035, jitter=0.012, drop_bottom=(i == 0))
            z += bh
            i += 1
    stone_courses(p, -WALL_LEN / 2, WALL_LEN / 2, 0.0, h - 0.12, seed=seed,
                  holes=[(-ox - 0.2, ox + 0.2, 0.0, spring - 0.02), (0.0, spring, ox + ring - 0.06)])
    arch_ring(p, 0, spring, ox, ox + ring, -0.02, DEPTH + 0.06, n=7, seed=seed)
    # Worn threshold stone.
    p.box('stone_dark', (2 * ox + 0.06, DEPTH + 0.06, 0.05), (0, DEPTH / 2, 0.025), bevel=0.02, jitter=0.008, drop_bottom=True)
    coping(p, h, seed=seed)
    return p


def floor_edge(name='cellar.floor-edge', seed=17):
    """The torn end of the floorboards where the cellar floor stops: planks over a beam."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    p.box('wood_dark', (WALL_LEN + 0.04, 0.14, 0.14), (0, 0.07, -0.08), bevel=0.025, jitter=0.01, grain=0)
    x = -WALL_LEN / 2
    while x < WALL_LEN / 2 - 0.05:
        w = rng.uniform(0.17, 0.24)
        if WALL_LEN / 2 - (x + w) < 0.1:
            w = WALL_LEN / 2 - x
        ln = rng.uniform(0.32, 0.6)
        p.box('wood', (w - 0.015, ln, 0.05), (x + w / 2, -0.06 + ln / 2, rng.uniform(-0.008, 0.008)),
              rot=(rng.uniform(-0.02, 0.02), rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03)), bevel=0.012, jitter=0.006, grain=1)
        p.cyl('iron', 0.012, 0.012, 0.008, 6, (x + w / 2, 0.03, 0.025))
        x += w
    return p


def stairs(name='cellar.stairs', seed=19):
    """Wooden stairs climbing away from the board (to +Y) up to the tavern door, which glows."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    n, rise, run, wd = 6, 0.235, 0.27, 0.8
    for i in range(n):
        y = 0.12 + i * run
        z = rise * (i + 1)
        p.box('wood', (wd + rng.uniform(-0.03, 0.03), run + 0.04, 0.06), (rng.uniform(-0.015, 0.015), y, z - 0.03),
              rot=(0, rng.uniform(-0.02, 0.02), rng.uniform(-0.03, 0.03)), bevel=0.015, jitter=0.006, grain=0)
        p.box('wood_dark', (wd - 0.06, 0.03, rise - 0.05), (0, y - run / 2 + 0.02, z - 0.06 - (rise - 0.05) / 2), grain=0)
    ln = math.hypot(n * run + 0.2, n * rise)
    ang = math.atan2(n * rise, n * run + 0.2)
    for sx in (-1, 1):
        p.box('wood_dark', (0.07, ln, 0.2), (sx * (wd / 2 + 0.035), (n * run + 0.2) / 2 - 0.03, n * rise / 2 - 0.06),
              rot=(ang, 0, 0), bevel=0.015, jitter=0.006, grain=1)
    # Hand rail on the left: posts and a rail.
    for i in (0, 3, 6):
        y = 0.05 + i * run
        z0 = rise * max(i, 1) - 0.02
        p.box('wood_dark', (0.06, 0.06, 0.75), (-wd / 2 - 0.035, y, z0 + 0.375), bevel=0.012, grain=2)
    p.box('wood', (0.06, ln, 0.05), (-wd / 2 - 0.035, (n * run) / 2 + 0.05, n * rise / 2 + 0.72),
          rot=(ang, 0, 0), bevel=0.015, grain=1)
    # Landing and the door frame at the top, door ajar with warm light behind.
    top = n * rise
    yd = 0.12 + n * run
    p.box('wood', (wd + 0.1, 0.3, 0.06), (0, yd, top - 0.03), bevel=0.015, grain=0)
    for sx in (-1, 1):
        p.box('wood_dark', (0.1, 0.12, 1.05), (sx * 0.4, yd + 0.12, top + 0.525), bevel=0.02, grain=2)
    p.box('wood_dark', (0.95, 0.14, 0.12), (0, yd + 0.12, top + 1.08), bevel=0.02, grain=0)
    p.box('glow', (0.7, 0.02, 1.0), (0, yd + 0.2, top + 0.5))
    p.box('wood', (0.36, 0.05, 0.98), (0.15, yd + 0.05, top + 0.5), rot=(0, 0, -0.9), bevel=0.012, grain=2)
    return p


def bottle(p, x, y, z, along=(math.pi / 2, 0, 0), r=0.042, ln=0.24, cork=True, seg=6):
    """Bottle lying with its neck towards the board (-Y), or standing with along=(0, 0, 0)."""
    rx = along[0]
    p.cyl('bottle', r, r, ln, seg, (x, y, z), rot=(rx, 0, 0))
    d = Vector((0, -math.sin(rx), math.cos(rx)))
    nb = Vector((x, y, z)) + d * ln
    p.cyl('bottle', r, r * 0.4, 0.05, seg, tuple(nb), rot=(rx, 0, 0), caps=False)
    nk = nb + d * 0.045
    p.cyl('bottle', r * 0.38, r * 0.38, 0.06, 5, tuple(nk), rot=(rx, 0, 0), caps=not cork)
    if cork:
        p.cyl('cloth', r * 0.4, r * 0.4, 0.02, 5, tuple(nk + d * 0.06), rot=(rx, 0, 0))


def wine_rack(name='cellar.wine-rack', seed=23):
    p = Piece(name, seed)
    rng = random.Random(seed)
    W, Hh, D = 1.0, 1.3, 0.36
    for sx in (-1, 1):
        p.box('wood_dark', (0.07, D, Hh), (sx * (W / 2 - 0.035), D / 2, Hh / 2), bevel=0.015, grain=2, drop_bottom=True)
    p.box('wood_dark', (W, 0.03, Hh - 0.05), (0, D - 0.015, Hh / 2), grain=2)
    rows = [0.06, 0.46, 0.86, 1.26]
    for z in rows:
        p.box('wood', (W - 0.1, D - 0.02, 0.04), (0, D / 2, z), bevel=0.012, grain=0)
    for x in (-0.15, 0.15):
        p.box('wood', (0.04, D - 0.04, Hh - 0.1), (x, D / 2, Hh / 2), bevel=0.01, grain=2)
    # Bottles, necks out, two layers per cubby.
    cub = [(-0.3, 0.27, 3), (0.0, 0.26, 2), (0.3, 0.27, 3)]
    for z0 in rows[:3]:
        for cx, cw, nb in cub:
            for k in range(nb):
                if rng.random() < 0.12:
                    continue
                bottle(p, cx - cw / 2 + (k + 0.5) * cw / nb, D - 0.04, z0 + 0.07, cork=False)
            for k in range(nb - 1):
                if rng.random() < 0.3:
                    continue
                bottle(p, cx - cw / 2 + (k + 1) * cw / nb, D - 0.06, z0 + 0.14, cork=False)
    p.box('wood_dark', (W + 0.04, D + 0.04, 0.06), (0, D / 2, Hh + 0.03), bevel=0.015, grain=0)
    return p


def hanging_food(name='cellar.hanging-food', seed=29):
    """Onion and garlic braids and sausages on a rail fixed to the wall face (wall decoration)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    zr = 1.38
    p.box('wood_dark', (0.92, 0.07, 0.1), (0, -0.035, zr), bevel=0.018, grain=0)
    for x in (-0.42, 0.42):
        p.cyl('iron', 0.016, 0.016, 0.02, 6, (x, -0.07, zr), rot=(math.pi / 2, 0, 0))

    def braid(x0, n, paint_name, r, ln):
        p.cyl('rope', 0.014, 0.014, ln + 0.08, 5, (x0, -0.1, zr - ln - 0.05))
        for k in range(n):
            t = k / max(1, n - 1)
            zz = zr - 0.09 - t * ln
            side = (1 if k % 2 else -1) * r * 0.75
            rr = r * rng.uniform(0.9, 1.1) * (1 - 0.15 * t)
            c = (x0 + side, -0.1 - rr * 0.7, zz)
            p.blob(paint_name, rr, c, scale=(1, 1, 0.9), subdiv=2, noise=0.06)
            p.cone(paint_name, rr * 0.3, rr * 0.9, 5, (c[0], c[1], zz + rr * 0.7))
    braid(-0.3, 9, 'onion', 0.068, 0.56)
    braid(0.32, 6, 'garlic', 0.052, 0.4)
    # Sausages: links hanging from the rail in a zigzag chain.
    for j, x0 in enumerate((-0.06, 0.1)):
        p.cyl('rope', 0.009, 0.009, 0.07, 4, (x0, -0.1, zr - 0.07))
        zz = zr - 0.07
        for k in range(3):
            ln = 0.16
            ang = 0.22 if (k + j) % 2 else -0.22
            p.blob('sausage', 0.038, (x0 + math.sin(ang) * ln / 2, -0.11, zz - ln / 2), scale=(1, 1, ln / 0.076), rot=(0, ang, 0), subdiv=2, noise=0.03)
            x0 = x0 + math.sin(ang) * ln
            zz -= ln * 0.97
    return p


def candles(name='cellar.candles', seed=31):
    """A cluster of candles on a rough stone, wax run down onto it."""
    p = Piece(name, seed)
    p.box('stone_dark', (0.38, 0.3, 0.14), (0, 0, 0.07), rot=(0, 0, 0.15), bevel=0.035, jitter=0.02, drop_bottom=True)
    spots = [(-0.08, -0.03, 0.26, 0.045, True), (0.06, 0.04, 0.2, 0.04, True), (0.1, -0.08, 0.11, 0.035, True),
             (-0.04, 0.09, 0.15, 0.035, False), (-0.15, -0.09, 0.08, 0.03, True)]
    for i, (x, y, h, r, lit) in enumerate(spots):
        candle(p, x, y, 0.14, h, r, lit=lit, seed=seed + i)
    p.blob('wax', 0.05, (0.13, -0.15, 0.1), scale=(1, 0.7, 0.9), noise=0.2)
    return p


def cobweb(name='cellar.cobweb', seed=37):
    """A web in the upper left corner of a wall face (wall decoration; mirror with scale.x = -1)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    ax, az = -WALL_LEN / 2 + 0.02, H - 0.14
    y = -0.03
    radials = [math.radians(a) for a in (-88, -66, -44, -24, -4)]
    lens = [0.5, 0.56, 0.6, 0.56, 0.48]
    for a, ln in zip(radials, lens):
        p.quad_strip('web', [(ax, y, az), (ax + math.cos(a) * ln, y, az + math.sin(a) * ln)], 0.012)
    for rr in (0.14, 0.25, 0.36, 0.46):
        pts = []
        for k, (a, ln) in enumerate(zip(radials, lens)):
            r = min(rr, ln) * (1 + rng.uniform(-0.03, 0.03))
            pts.append((ax + math.cos(a) * r, y, az + math.sin(a) * r))
            if k < len(radials) - 1:
                a2 = (a + radials[k + 1]) / 2
                pts.append((ax + math.cos(a2) * r * 0.88, y, az + math.sin(a2) * r * 0.88))
        p.quad_strip('web', pts, 0.01)
    p.quad_strip('web', [(ax + 0.3, y, az - 0.02), (ax + 0.42, y, az - 0.22), (ax + 0.5, y, az - 0.5)], 0.008)
    return p


def shelf(name='cellar.shelf', seed=41):
    """Small standing shelf with clay pots, glass jars with cloth lids and a bottle."""
    p = Piece(name, seed)
    W, Hh, D = 0.9, 1.1, 0.3
    for sx in (-1, 1):
        p.box('wood_dark', (0.06, D, Hh), (sx * (W / 2 - 0.03), D / 2, Hh / 2), bevel=0.014, grain=2, drop_bottom=True)
    p.box('wood_dark', (W - 0.06, 0.025, Hh - 0.1), (0, D - 0.0125, Hh / 2), grain=2)
    levels = [0.08, 0.45, 0.82]
    for z in levels:
        p.box('wood', (W - 0.04, D + 0.02, 0.035), (0, D / 2 - 0.01, z), bevel=0.01, grain=0)
    p.box('wood_dark', (W + 0.06, D + 0.04, 0.05), (0, D / 2, Hh + 0.025), bevel=0.014, grain=0)

    def pot(x, z, r, h):
        p.cyl('jar', r * 0.75, r, h * 0.6, 8, (x, D / 2, z), bevel=0.01)
        p.cyl('jar', r, r * 0.65, h * 0.4, 8, (x, D / 2, z + h * 0.6), caps=False)
        p.cyl('jar', r * 0.7, r * 0.72, 0.03, 8, (x, D / 2, z + h), bevel=0.006)

    def jar(x, z, r, h):
        p.cyl('glass', r, r, h, 8, (x, D / 2, z), bevel=0.01)
        p.cyl('cloth', r * 1.15, r * 1.05, 0.035, 8, (x, D / 2, z + h - 0.01), bevel=0.008)
        p.blob('cloth', r * 0.6, (x, D / 2, z + h + 0.03), scale=(1, 1, 0.5), noise=0.1)
    zl = [l + 0.0175 for l in levels]
    pot(-0.28, zl[0], 0.1, 0.24); jar(-0.05, zl[0], 0.07, 0.2); pot(0.2, zl[0], 0.085, 0.2)
    jar(-0.26, zl[1], 0.065, 0.18); jar(-0.1, zl[1], 0.055, 0.14); pot(0.12, zl[1], 0.07, 0.17)
    bottle(p, 0.3, D / 2, zl[1], along=(0, 0, 0), r=0.035, ln=0.17)
    pot(-0.22, zl[2], 0.08, 0.18); jar(0.02, zl[2], 0.07, 0.2)
    p.cyl('jar', 0.11, 0.07, 0.05, 8, (0.24, D / 2, zl[2]), bevel=0.01)
    p.cyl('jar', 0.11, 0.07, 0.05, 8, (0.24, D / 2, zl[2] + 0.045), bevel=0.01)
    return p


CELLAR_PIECES = [
    lambda: stone_wall(),
    lambda: stone_arch(),
    lambda: stone_wall_low(),
    lambda: pillar('cellar.stone-pillar', H),
    lambda: pillar('cellar.stone-pillar-low', LOW, seed=8, low=True),
    lambda: stone_doorway(),
    lambda: floor_edge(),
    lambda: stairs(),
    lambda: wine_rack(),
    lambda: hanging_food(),
    lambda: candles(),
    lambda: cobweb(),
    lambda: shelf(),
]


def build_cellar():
    cellar_paints()
    c = collection('cellar')
    objs = []
    for i, make in enumerate(CELLAR_PIECES):
        x = (i % 5) * 1.8
        y = -(i // 5) * 2.6
        objs.append(make().build((x, y, 0), c))
    return objs


def cellar_diorama():
    """Kit pieces around five hexes as the board would place them, for screenshots."""
    c = collection('cellar-diorama')
    for o in list(c.objects):
        bpy.data.objects.remove(o)
    floor(c, os.path.join(TEX_DIR, 'tavern-planks.1024.webp'), tint=hexc('#9a7860'))
    back = [(-SQ3, 0), (0, 0), (SQ3, 0)]
    hex_tiles(c, [(0, 0), (-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)])
    walls = ['stone-wall', 'stone-arch', 'stone-wall', 'stone-wall', 'stone-arch', 'stone-wall']
    k = 0
    for cx, cy in back:
        cen = Vector((cx, cy, 0))
        for a, b in ((2, 1), (1, 0)):
            wall_on_edge('cellar.' + walls[k], c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            if k == 2:
                wall_on_edge('cellar.hanging-food', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            if k == 3:
                wall_on_edge('cellar.cobweb', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            k += 1
        for v in (2, 1):
            place('cellar.stone-pillar', c, hex_vertex(cx, cy, v))
    place('cellar.stone-pillar', c, hex_vertex(SQ3, 0, 0))
    # Left: the doorway with the stairs up to the tavern behind it.
    lc = Vector((-SQ3, 0, 0))
    d = wall_on_edge('cellar.stone-doorway', c, hex_vertex(-SQ3, 0, 2), hex_vertex(-SQ3, 0, 3), lc)
    place('cellar.stairs', c, d.location + Vector((-0.32, 0, 0)), math.radians(90))
    place('cellar.stone-pillar', c, hex_vertex(-SQ3, 0, 3))
    # Right: plain wall.
    wall_on_edge('cellar.stone-wall', c, hex_vertex(SQ3, 0, 5), hex_vertex(SQ3, 0, 0), Vector((SQ3, 0, 0)))
    place('cellar.stone-pillar', c, hex_vertex(SQ3, 0, 5))
    # Front: the wall cut low so it does not hide the board.
    for cx, cy in ((-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)):
        cen = Vector((cx, cy, 0))
        for a, b in ((3, 4), (4, 5)):
            wall_on_edge('cellar.stone-wall-low', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
        for v in (3, 4, 5):
            place('cellar.stone-pillar-low', c, hex_vertex(cx, cy, v))
    # Dressing in the ring hexes left and right.
    place('cellar.wine-rack', c, (SQ3 + 0.15, 0.35, 0), math.radians(-30))
    place('cellar.shelf', c, (SQ3 + 0.55, -0.45, 0), math.radians(-90))
    place('cellar.candles', c, (-SQ3 + 0.2, 0.3, 0), math.radians(20))
    place('cellar.candles', c, (0.6, 0.45, 0), math.radians(-40))
    place('cellar.floor-edge', c, (0, -2.9, 0), math.radians(180))
    return c

