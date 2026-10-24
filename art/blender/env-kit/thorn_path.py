# Thorn path kit (scenario 2, «Тернова стежка»). Run in Blender through the MCP after kitlib.py:
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\thorn_path.py', encoding='utf8').read())
#   build_thorn_path()
# Edge height 1.0 (data/environments/thorn-path.json walls.height), low edge 0.4.

TP_LEN = 1.06


def thorn_paints():
    C = hexc
    paint('bark', [C('#5e4632'), C('#6a503a'), C('#4e3a2a')], C('#1a120c'), C('#b0906a'), 'wood', grain=(8, 1.2), edge=0.4)
    paint('wood_cut', [C('#c89a62'), C('#b88a56')], C('#6a4a2a'), C('#f0d0a0'), 'soft', grain=(6, 6), edge=0.4, feet=0.1)
    paint('leaf_autumn', [C('#c8642a'), C('#dc9a34'), C('#b8442a')], C('#3a1a0e'), C('#ffd27a'), 'leaf', grain=(1.5, 1.5), edge=0.45, ao=0.7, feet=0.2)
    paint('leaf_green', [C('#6a8a36'), C('#58782e'), C('#7e963c')], C('#1a2610'), C('#d4e68a'), 'leaf', grain=(1.5, 1.5), edge=0.45, ao=0.7, feet=0.2)
    paint('leaf_dark', [C('#3e5632'), C('#4a6236'), C('#34482a')], C('#101a0c'), C('#9ab86a'), 'leaf', grain=(1.5, 1.5), edge=0.4, ao=0.7, feet=0.3)
    paint('pine', [C('#2e5034'), C('#3a5e3a'), C('#284630')], C('#0c180e'), C('#8ab87a'), 'leaf', grain=(2, 2), edge=0.45, ao=0.6, feet=0.2)
    paint('moss', [C('#6f8a42'), C('#5e7a3a'), C('#7a9046')], C('#1e2a10'), C('#c8dc8a'), 'leaf', grain=(3, 3), edge=0.4, feet=0.1)
    paint('rock', [C('#8a8478'), C('#787470'), C('#928472')], C('#24201c'), C('#d6cebe'), 'stone', grain=(3, 3), edge=0.45)
    paint('grass', [C('#8a9a44'), C('#a0a04a'), C('#6e8a3a')], C('#2a3214'), C('#e6eaa0'), 'leaf', grain=(6, 2), edge=0.2, ao=0.4, feet=0.45)
    paint('fern', [C('#5a8a3a'), C('#4e7a34'), C('#6a9440')], C('#142410'), C('#b8dc84'), 'leaf', grain=(6, 2), edge=0.2, ao=0.4, feet=0.4)
    paint('thorn', [C('#3a2a20'), C('#4a3424')], C('#100a06'), C('#8a6a4a'), 'wood', grain=(8, 1.2), edge=0.4)
    paint('berry', [C('#c03028'), C('#d84a30')], C('#4a0c08'), C('#ffb090'), 'soft', grain=(3, 3), edge=0.4, feet=0.0)
    paint('mush_cap', [C('#c8402c'), C('#d8603a'), C('#b83a2a')], C('#4a1208'), C('#ffc0a0'), 'soft', grain=(3, 3), edge=0.4, feet=0.0)
    paint('mush_stem', [C('#e8dcc0'), C('#dccca8')], C('#8a7a5a'), C('#fffaf0'), 'soft', grain=(3, 3), edge=0.2, feet=0.3)
    paint('dots', [C('#f4f0e4')], C('#c8c0b0'), C('#ffffff'), 'soft', grain=(3, 3), edge=0.0, ao=0.2, feet=0.0)
    paint('straw', [C('#c9a560'), C('#b89450'), C('#d0b070')], C('#4a3818'), C('#f8e4a8'), 'wood', grain=(10, 1.5), edge=0.45)
    paint('logwall', [C('#7a5a3c'), C('#8a6844'), C('#6a4c34')], C('#24160c'), C('#c8a070'), 'wood', grain=(8, 1.2), edge=0.5)
    paint('wood', [C('#8a5c36'), C('#9a6a3c'), C('#7a5032')], C('#2a180c'), C('#d8a468'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('wood_dark', [C('#5a3c26'), C('#664429')], C('#1e120a'), C('#a87a4e'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('stone_dark', [C('#7a7068'), C('#6a625c'), C('#82746a')], C('#1e1a16'), C('#c0b4a4'), 'stone', grain=(3, 3), edge=0.45)
    paint('iron', [C('#3e4048'), C('#46424a')], C('#121216'), C('#a0a2ac'), 'metal', grain=(5, 5), edge=0.7)
    paint('glow', [C('#ffe6a8')], C('#ff9a40'), C('#ffb860'), 'emit')
    paint('flame', [C('#fff4c4')], C('#ff7a1c'), C('#ff8a26'), 'emit')


def canopy(p, paint_name, centre, size, n=6, seed=0, alt=None):
    """A cloud-like canopy: a big central blob and n lumps around it, flat-ish underneath."""
    rng = random.Random(seed)
    cx, cy, cz = centre
    p.blob(paint_name, size, (cx, cy, cz), scale=(1.1, 1.05, 0.78), subdiv=2, noise=0.1)
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
        rr = size * rng.uniform(0.5, 0.68)
        d = size * rng.uniform(0.7, 0.9)
        z = cz + size * rng.uniform(-0.35, 0.3)
        pn = alt if (alt and i % 3 == 1) else paint_name
        p.blob(pn, rr, (cx + math.cos(a) * d, cy + math.sin(a) * d, z), scale=(1, 1, 0.82), subdiv=2, noise=0.12)
    p.blob(paint_name, size * 0.55, (cx + rng.uniform(-0.1, 0.1), cy + rng.uniform(-0.1, 0.1), cz + size * 0.6), scale=(1, 1, 0.8), subdiv=2, noise=0.1)
    leaf_tufts(p, paint_name, (cx, cy, cz), size * 0.98, 8, rng, alt)


def leaf_tufts(p, paint_name, centre, radius, n, rng, alt=None, squash=0.8, min_z=-0.2):
    """Small leaf clumps scattered over a foliage mass so its outline is leafy, not round."""
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        z = rng.uniform(min_z, 0.9)
        rr = math.sqrt(max(0.0, 1 - z * z))
        d = Vector((math.cos(a) * rr, math.sin(a) * rr, z * squash))
        pn = alt if (alt and i % 4 == 0) else paint_name
        p.blob(pn, radius * rng.uniform(0.22, 0.3), tuple(Vector(centre) + d * radius), scale=(1, 1, 0.8), subdiv=2, noise=0.14)


def root_flares(p, r0, n=4, seed=0, reach=0.28, paint_name='bark'):
    """Buttress roots: thick where they leave the trunk, sinking into the ground close by."""
    rng = random.Random(seed)
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.4, 0.4)
        c, s = math.cos(a), math.sin(a)
        rr = reach * rng.uniform(0.8, 1.1)
        p.tube(paint_name, [(c * r0 * 0.5, s * r0 * 0.5, 0.24), (c * rr * 0.65, s * rr * 0.65, 0.06), (c * rr, s * rr, -0.04)],
               [r0 * 0.55, r0 * 0.42, r0 * 0.22], seg=5)


def tree(name, leaves, seed, h=3.0, alt=None):
    """Deciduous tree: bent trunk with root flares, two branches into a lumpy canopy."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    lean = (rng.uniform(-0.12, 0.12), rng.uniform(-0.08, 0.08))
    top = h * 0.68
    pts = [(0, 0, -0.05), (lean[0] * 0.3, lean[1] * 0.3, h * 0.25), (lean[0], lean[1], h * 0.48), (lean[0] * 0.6, lean[1] * 0.6, top)]
    p.tube('bark', pts, [0.2, 0.15, 0.12, 0.08], seg=7)
    root_flares(p, 0.22, 4, seed)
    for k, (a, z) in enumerate(((0.6, 0.5), (3.6, 0.58))):
        c, s = math.cos(a), math.sin(a)
        p.tube('bark', [(lean[0], lean[1], h * z), (c * 0.3 + lean[0], s * 0.3, h * z + 0.3), (c * 0.55, s * 0.5, h * z + 0.55)],
               [0.07, 0.05, 0.03], seg=5)
    canopy(p, leaves, (lean[0] * 0.6, lean[1] * 0.6, h * 0.76), h * 0.25, n=8, seed=seed, alt=alt)
    return p


def pine(name='thorn-path.pine', seed=51, h=3.2):
    p = Piece(name, seed)
    rng = random.Random(seed)
    p.tube('bark', [(0, 0, -0.05), (0.02, 0, h * 0.5), (0, 0.02, h * 0.95)], [0.14, 0.09, 0.03], seg=6)
    root_flares(p, 0.16, 4, seed, reach=0.32)
    tiers = 5
    for i in range(tiers):
        t = i / (tiers - 1)
        r = 0.78 * (1 - t) + 0.22
        z = 0.55 + t * (h - 1.3)
        p.cone('pine', r, 0.85 - 0.25 * t, 8, (rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), z), jitter=0.04)
    return p


def roots(name='thorn-path.roots', seed=53):
    """Gnarled roots arching out of the forest floor, a little moss in between."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    for i in range(4):
        a = 2 * math.pi * i / 4 + rng.uniform(-0.4, 0.4)
        c, s = math.cos(a), math.sin(a)
        ln = rng.uniform(0.35, 0.5)
        mid = rng.uniform(0.06, 0.12)
        p.tube('bark', [(-c * 0.05, -s * 0.05, -0.08), (c * ln * 0.3, s * ln * 0.3, mid), (c * ln * 0.7, s * ln * 0.7, mid * 0.7), (c * ln, s * ln, -0.06)],
               [0.085, 0.08, 0.065, 0.05], seg=6, cap_end=False)
    p.blob('moss', 0.12, (0.05, 0.02, 0.0), scale=(1.4, 1.2, 0.45), subdiv=2, noise=0.15)
    p.blob('moss', 0.08, (-0.22, 0.12, 0.0), scale=(1.3, 1, 0.4), subdiv=1, noise=0.15)
    return p


def rock_cluster(name='thorn-path.rock', seed=57, s=1.0, moss=True):
    p = Piece(name, seed)
    p.rock('rock', 0.3 * s, (0, 0, 0.17 * s), scale=(1.25, 1.0, 0.78), rot=(0.2, 0.3, 0.6))
    p.rock('rock', 0.17 * s, (0.3 * s, -0.12 * s, 0.08 * s), scale=(1.2, 1, 0.75), rot=(0.1, 0.2, 1.4))
    p.rock('rock', 0.12 * s, (-0.28 * s, -0.16 * s, 0.05 * s), scale=(1.1, 1.2, 0.7), rot=(0.4, 0, 0.2))
    if moss:
        p.blob('moss', 0.22 * s, (-0.03 * s, 0.04 * s, 0.37 * s), scale=(1.2, 1.0, 0.3), subdiv=2, noise=0.15)
    return p


def log(name='thorn-path.log', seed=59):
    """Fallen log along X with a sawn end, a broken end, a branch stub, moss and bracket fungus."""
    p = Piece(name, seed)
    p.smooth = 75
    r = 0.17
    pts = [(-0.66, 0, r), (-0.2, 0.02, r + 0.01), (0.25, -0.02, r), (0.66, 0, r - 0.01)]
    p.tube('bark', pts, [r, r * 1.02, r * 0.98, r * 0.95], seg=8, cap_start=False, cap_end=False)
    p.cyl('wood_cut', r * 0.95, r * 0.95, 0.02, 8, (0.66, 0, r - 0.01), rot=(0, math.pi / 2, 0))
    # Broken end: jagged splinters.
    for i in range(5):
        a = 2 * math.pi * i / 5
        p.cone('wood_cut', 0.07, 0.14 + 0.06 * (i % 2), 4, (-0.66, math.cos(a) * r * 0.6, r + math.sin(a) * r * 0.6), rot=(0, -math.pi / 2, 0))
    p.cyl('wood_cut', r * 0.9, r * 0.9, 0.02, 8, (-0.66, 0, r), rot=(0, -math.pi / 2, 0))
    p.tube('bark', [(0.1, -0.1, r + 0.1), (0.18, -0.28, r + 0.22)], [0.05, 0.03], seg=5)
    p.blob('moss', 0.16, (-0.2, 0.0, 2 * r - 0.02), scale=(2.2, 0.9, 0.35), subdiv=2, noise=0.12)
    for x, z in ((0.35, 0.2), (0.45, 0.13)):
        p.blob('mush_stem', 0.07, (x, -r * 0.95, z), scale=(1, 0.6, 0.25), subdiv=1, noise=0.05)
    return p


def fern(name='thorn-path.fern', seed=61, n=8, size=1.0, paint_name='fern'):
    """Fern clump: arching fronds with a raised midrib, radiating from the centre."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.25, 0.25)
        c, s = math.cos(a), math.sin(a)
        L = size * rng.uniform(0.38, 0.5)
        hgt = size * rng.uniform(0.24, 0.34)
        pts = [(c * 0.02, s * 0.02, 0.0), (c * L * 0.3, s * L * 0.3, hgt * 0.85), (c * L * 0.65, s * L * 0.65, hgt), (c * L, s * L, hgt * 0.55)]
        p.frond(paint_name, pts, [0.015, 0.06 * size, 0.05 * size, 0.0], crease=0.35)
    return p


def grass(name='thorn-path.grass', seed=63, n=16, size=1.0, paint_name='grass'):
    """Grass tuft: tapered blades leaning out from a small patch."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        r0 = rng.uniform(0, 0.12) * size
        c, s = math.cos(a), math.sin(a)
        hgt = rng.uniform(0.16, 0.32) * size
        lean = rng.uniform(0.05, 0.16) * size
        base = Vector((c * r0, s * r0, 0))
        pts = [base, base + Vector((c * lean * 0.3, s * lean * 0.3, hgt * 0.55)), base + Vector((c * lean, s * lean, hgt))]
        p.frond(paint_name, [tuple(v) for v in pts], [0.022 * size, 0.016 * size, 0.0], up=(c, s, 0.4), crease=0.4)
    return p


def thicket(name, h, seed, thorns=False, low=False):
    """Edge of the path: dense bushes along X (inner face z = 0), autumn and dark leaves mixed."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    n = 4 if low else 5
    for i in range(n):
        x = -0.46 + 0.92 * (i + 0.5) / n + rng.uniform(-0.04, 0.04)
        r = rng.uniform(0.28, 0.36) if not low else rng.uniform(0.24, 0.3)
        # Vertical radius so that the squashed bottom sits on the ground and the top reaches h.
        rv = (h * (0.82 if not low else 1.0) + 0.02) / 1.25
        zc = rv * 0.25 - 0.03
        # Mostly dark and olive leaves; autumn colour only here and there.
        pn = ('leaf_dark', 'leaf_green', 'leaf_dark', 'leaf_autumn', 'leaf_green')[(i + seed) % 5]
        p.blob(pn, r, (x, rng.uniform(0.08, 0.2), zc), scale=(1.15, 1.0, rv / r), subdiv=2, noise=0.16, flat_bottom=True)
    if not low:
        for i in range(3):
            x = -0.36 + i * 0.36 + rng.uniform(-0.05, 0.05)
            p.blob(('leaf_green', 'leaf_autumn', 'leaf_dark')[(i + seed) % 3], rng.uniform(0.2, 0.26), (x, rng.uniform(0.15, 0.28), h * 0.82), scale=(1.1, 1, 0.8), subdiv=2, noise=0.16)
    # Smaller lumps low in front so the bushes meet the ground.
    for i in range(2):
        x = -0.25 + i * 0.5 + rng.uniform(-0.06, 0.06)
        p.blob('leaf_dark' if i else 'leaf_green', 0.17, (x, -0.04, 0.17 * 0.85 * 0.25 - 0.02), scale=(1.3, 1.0, 0.85), subdiv=2, noise=0.12, flat_bottom=True)
    if thorns:
        for i in range(5):
            x0 = -0.45 + i * 0.22
            a = rng.uniform(-0.5, 0.5)
            pts = [(x0, 0.15, h * 0.25), (x0 + 0.08 * math.sin(a), -0.08, h * 0.55), (x0 + 0.18 * math.sin(a), -0.18, h * 0.35 + rng.uniform(0, 0.25))]
            p.tube('thorn', pts, [0.022, 0.018, 0.01], seg=4)
            for k in range(3):
                t = (k + 1) / 4
                q = Vector(pts[0]).lerp(Vector(pts[2]), t) + Vector((0, -0.02, 0.05 * math.sin(t * math.pi)))
                p.cone('thorn', 0.012, 0.06, 4, tuple(q), rot=(rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2), 0))
        for i in range(4):
            c = Vector((-0.38 + i * 0.25, -0.12, h * rng.uniform(0.4, 0.7)))
            for k in range(3):
                p.blob('berry', 0.026, tuple(c + Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.02, 0.0), rng.uniform(-0.03, 0.03)))), subdiv=1, noise=0.05)
    return p


def forest_gap(name='thorn-path.forest-gap', seed=67):
    """Opening in the edge (entrance/exit): two mossy rocks with ferns and grass either side."""
    p = Piece(name, seed)
    p.rock('rock', 0.2, (-0.5, 0.05, 0.12), scale=(1.1, 1, 0.8), rot=(0.2, 0.4, 0.3))
    p.blob('moss', 0.15, (-0.5, 0.05, 0.25), scale=(1.2, 1, 0.3), subdiv=1, noise=0.12)
    p.rock('rock', 0.16, (0.52, 0.0, 0.09), scale=(1.2, 1, 0.75), rot=(0.1, 0.2, 1.1))
    for side, x in ((-1, -0.42), (1, 0.38)):
        for i in range(5):
            a = 2 * math.pi * i / 5 + side
            c, s = math.cos(a), math.sin(a)
            L = 0.28
            p.frond('fern', [(x + c * 0.02, 0.12 + s * 0.02, 0.0), (x + c * L * 0.35, 0.12 + s * L * 0.35, 0.2), (x + c * L, 0.12 + s * L, 0.1)], [0.012, 0.045, 0.0])
    return p


def lantern_post(name='thorn-path.lantern-post', seed=71):
    """Bent post with an arm and a hanging lantern (entrance); light at (0.32, 1.32, 0)."""
    p = Piece(name, seed)
    p.tube('wood_dark', [(0, 0, -0.05), (0.02, 0.01, 0.8), (-0.01, 0, 1.6)], [0.06, 0.055, 0.045], seg=6)
    p.tube('wood_dark', [(-0.02, 0, 1.52), (0.2, 0, 1.56), (0.36, 0, 1.54)], [0.03, 0.03, 0.025], seg=5)
    p.cyl('iron', 0.006, 0.006, 0.08, 4, (0.32, 0, 1.46))
    p.box('iron', (0.16, 0.16, 0.03), (0.32, 0, 1.455), bevel=0.01)
    p.box('iron', (0.18, 0.18, 0.03), (0.32, 0, 1.22), bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box('iron', (0.018, 0.018, 0.22), (0.32 + sx * 0.07, sy * 0.07, 1.335))
    p.box('glow', (0.12, 0.12, 0.2), (0.32, 0, 1.335))
    p.cone('iron', 0.1, 0.08, 4, (0.32, 0, 1.47), rot=(0, 0, math.pi / 4))
    p.rock('rock', 0.14, (0.04, 0.06, 0.05), scale=(1.3, 1.1, 0.6))
    p.blob('moss', 0.1, (0.04, 0.06, 0.1), scale=(1.3, 1.1, 0.35), subdiv=1, noise=0.12)
    return p


def stump(name='thorn-path.stump', seed=73):
    p = Piece(name, seed)
    p.smooth = 75
    p.tube('bark', [(0, 0, -0.03), (0.01, 0, 0.2), (0, 0.01, 0.36)], [0.27, 0.25, 0.24], seg=8, cap_end=False)
    p.cyl('wood_cut', 0.235, 0.235, 0.02, 8, (0, 0.01, 0.345))
    root_flares(p, 0.26, 4, seed, reach=0.42)
    p.blob('moss', 0.12, (0.12, -0.08, 0.36), scale=(1.4, 1, 0.3), subdiv=1, noise=0.15)
    return p


def mushrooms(name='thorn-path.mushrooms', seed=79):
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    for x, y, s in ((0, 0, 1.0), (0.14, 0.08, 0.7), (-0.1, 0.1, 0.55), (0.05, -0.12, 0.45)):
        p.cyl('mush_stem', 0.03 * s, 0.04 * s, 0.16 * s, 6, (x, y, 0))
        p.blob('mush_cap', 0.1 * s, (x, y, 0.16 * s), scale=(1, 1, 0.6), subdiv=2, noise=0.05, flat_bottom=True)
        for k in range(3 if s > 0.6 else 0):
            a = rng.uniform(0, 2 * math.pi)
            p.blob('dots', 0.016 * s, (x + math.cos(a) * 0.055 * s, y + math.sin(a) * 0.055 * s, 0.16 * s + 0.045 * s), scale=(1, 1, 0.5), subdiv=1, noise=0.0)
    p.blob('moss', 0.1, (0.02, 0.0, 0.0), scale=(1.8, 1.5, 0.3), subdiv=1, noise=0.15)
    return p


def hut(name='thorn-path.hut', seed=83):
    """Forester's hut: log walls, thick thatch, stone chimney, door, a warm window, a woodpile.
    Front (door and window) towards the board; 2.0 × 1.7, roof ridge at 2.6."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    W, D, Hw = 2.0, 1.7, 1.35
    r = 0.095
    # Log walls: front/back logs along X, side logs along Y, crossing at the corners.
    n = int(Hw / (2 * r))
    for i in range(n):
        z = r + i * 2 * r
        for yy in (-D / 2, D / 2):
            p.tube('logwall', [(-W / 2 - 0.12, yy, z), (W / 2 + 0.12, yy, z)], [r, r * 0.95], seg=6, cap_start=True)
        for xx in (-W / 2, W / 2):
            p.tube('logwall', [(xx, -D / 2 - 0.12, z + r), (xx, D / 2 + 0.12, z + r)], [r * 0.95, r], seg=6, cap_start=True)
    # Gables (planks) and the thatch.
    ridge = 2.6
    for yy in (-D / 2 - 0.01, D / 2 + 0.01):
        for k in range(4):
            t0, t1 = k / 4, (k + 1) / 4
            zc = Hw + (ridge - 0.12 - Hw) * (t0 + t1) / 2
            wd = W * (1 - (t0 + t1) / 2)
            p.box('wood_dark', (wd, 0.04, (ridge - 0.12 - Hw) / 4 - 0.01), (0, yy, zc))
    slope = math.atan2(ridge - Hw, W / 2)
    ln = math.hypot(ridge - Hw, W / 2) + 0.35
    for side in (-1, 1):
        for k in range(3):
            off = k * 0.06
            p.box('straw', (ln - k * 0.1, D + 0.5, 0.16), (side * (W / 4 + 0.08), 0, (Hw + ridge) / 2 + 0.06 - off * 0.5 + 0.08),
                  rot=(0, side * slope, 0), bevel=0.06, jitter=0.03, grain=0)
    p.tube('straw', [(0, -D / 2 - 0.28, ridge + 0.02), (0, D / 2 + 0.28, ridge + 0.02)], [0.12, 0.12], seg=6, cap_start=True)
    # Chimney at the back right.
    for i in range(7):
        p.box('stone_dark', (0.36 + rng.uniform(-0.03, 0.03), 0.36, 0.22), (0.62, 0.35, 1.6 + i * 0.2), rot=(0, 0, rng.uniform(-0.1, 0.1)), bevel=0.035, jitter=0.015)
    # Door with frame and a stone step; window with shutters and warm light.
    y0 = -D / 2 - r
    for x in (-0.68, -0.22):
        p.box('wood_dark', (0.08, 0.1, 1.02), (x, y0, 0.51), bevel=0.015, grain=2)
    p.box('wood_dark', (0.56, 0.1, 0.09), (-0.45, y0, 1.04), bevel=0.015, grain=0)
    for k in range(3):
        p.box('wood', (0.12, 0.05, 0.95), (-0.6 + k * 0.13, y0 - 0.02, 0.48), bevel=0.012, grain=2)
    p.box('iron', (0.3, 0.02, 0.03), (-0.47, y0 - 0.05, 0.3))
    p.box('iron', (0.3, 0.02, 0.03), (-0.47, y0 - 0.05, 0.75))
    p.rock('stone_dark', 0.2, (-0.45, y0 - 0.22, 0.02), scale=(1.4, 0.8, 0.35))
    p.box('wood_dark', (0.5, 0.1, 0.44), (0.45, y0, 0.92), bevel=0.015, grain=0)
    p.box('glow', (0.36, 0.02, 0.3), (0.45, y0 - 0.055, 0.92))
    p.box('wood_dark', (0.03, 0.05, 0.32), (0.45, y0 - 0.07, 0.92))
    p.box('wood_dark', (0.36, 0.05, 0.03), (0.45, y0 - 0.07, 0.92))
    for sx in (-1, 1):
        p.box('wood', (0.2, 0.04, 0.42), (0.45 + sx * 0.33, y0 - 0.06, 0.92), rot=(0, 0, sx * 0.25), bevel=0.01, grain=2)
    p.box('wood_dark', (0.6, 0.12, 0.05), (0.45, y0 - 0.04, 0.68), bevel=0.012)
    # Woodpile against the left wall.
    for i in range(6):
        row = 0 if i < 3 else 1
        k = i if i < 3 else i - 3
        x = -W / 2 - 0.2
        y = -0.35 + k * 0.17 + row * 0.085
        z = 0.08 + row * 0.15
        p.tube('logwall', [(x - 0.3, y, z), (x + 0.0, y, z)], [0.075, 0.075], seg=6, cap_start=True)
    return p


def thorn_pieces():
    return [
        lambda: tree('thorn-path.tree', 'leaf_autumn', 41, alt='leaf_green'),
        lambda: tree('thorn-path.tree-green', 'leaf_green', 43, h=3.0, alt='leaf_dark'),
        lambda: pine(),
        lambda: roots(),
        lambda: rock_cluster(),
        lambda: log(),
        lambda: fern(size=1.35),
        lambda: grass(size=1.5),
        lambda: thicket('thorn-path.thicket', 1.0, 91),
        lambda: thicket('thorn-path.thicket-thorn', 1.0, 93, thorns=True),
        lambda: thicket('thorn-path.thicket-low', 0.42, 95, low=True),
        lambda: forest_gap(),
        lambda: lantern_post(),
        lambda: stump(),
        lambda: mushrooms(),
        lambda: hut(),
    ]


def build_thorn_path():
    thorn_paints()
    c = collection('thorn-path')
    objs = []
    for i, make in enumerate(thorn_pieces()):
        x = (i % 6) * 2.4
        y = (i // 6) * 3.0
        objs.append(make().build((x, y, 0), c))
    return objs


def thorn_diorama():
    """Kit pieces around five hexes of a forest path, for screenshots."""
    c = collection('thorn-path-diorama')
    for o in list(c.objects):
        bpy.data.objects.remove(o)
    floor(c, os.path.join(TEX_DIR, 'forest-floor.1024.webp'), tint=hexc('#a89a80'))
    bpy.data.objects['dio.floor'].visible_shadow = False
    hex_tiles(c, [(0, 0), (-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)], paint_hex='#7e7058')
    back = [(-SQ3, 0), (0, 0), (SQ3, 0)]
    edges = ['thicket', 'thicket-thorn', 'forest-gap', 'thicket', 'thicket-thorn', 'thicket']
    k = 0
    for cx, cy in back:
        cen = Vector((cx, cy, 0))
        for a, b in ((2, 1), (1, 0)):
            wall_on_edge('thorn-path.' + edges[k], c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            k += 1
    wall_on_edge('thorn-path.thicket', c, hex_vertex(-SQ3, 0, 2), hex_vertex(-SQ3, 0, 3), Vector((-SQ3, 0, 0)))
    wall_on_edge('thorn-path.thicket-thorn', c, hex_vertex(SQ3, 0, 5), hex_vertex(SQ3, 0, 0), Vector((SQ3, 0, 0)))
    for cx, cy in ((-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)):
        cen = Vector((cx, cy, 0))
        for a, b in ((3, 4), (4, 5)):
            wall_on_edge('thorn-path.thicket-low', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
    # Beyond the edge: trees, the hut at the far end of the path, the lantern at the entrance.
    place('thorn-path.hut', c, (0.0, 3.1, 0), math.radians(8))
    place('thorn-path.tree', c, (-2.6, 2.0, 0), 0.4)
    place('thorn-path.tree-green', c, (2.4, 2.2, 0), 1.3)
    place('thorn-path.pine', c, (-4.2, 0.6, 0))
    place('thorn-path.tree', c, (4.0, 0.4, 0), 2.2)
    place('thorn-path.tree-green', c, (-1.6, 3.6, 0), 2.0)
    place('thorn-path.lantern-post', c, (-2.6, -1.3, 0), math.radians(200))
    # Dressing in the ring.
    place('thorn-path.rock', c, (-1.9, -0.5, 0), 0.6)
    place('thorn-path.log', c, (2.1, -0.6, 0), math.radians(-25))
    place('thorn-path.fern', c, (-0.9, 0.55, 0))
    place('thorn-path.fern', c, (1.4, 0.75, 0), 1.0)
    place('thorn-path.grass', c, (0.5, -2.7, 0))
    place('thorn-path.grass', c, (-1.3, -2.6, 0), 1.0)
    place('thorn-path.grass', c, (2.0, -1.9, 0), 2.0)
    place('thorn-path.mushrooms', c, (-1.55, 0.2, 0))
    place('thorn-path.stump', c, (2.7, -1.6, 0))
    place('thorn-path.roots', c, (-2.4, 0.3, 0), 0.8)
    return c

