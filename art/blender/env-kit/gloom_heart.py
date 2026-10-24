# Gloom heart kit (scenario 5, «Серце Мороку»: a cave under the mountains). Run in Blender through
# the MCP after kitlib.py:
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\gloom_heart.py', encoding='utf8').read())
#   build_gloom_heart()
# Wall height 1.9 (data/environments/gloom-heart.json walls.height), low wall 0.4.

GH = 1.9
GLOW = 0.4


def gloom_paints():
    C = hexc
    paint('rock', [C('#625e6c'), C('#56525f'), C('#6c6470')], C('#121016'), C('#b4acc4'), 'stone', grain=(2.5, 2.5), edge=0.45, ao=0.8)
    paint('rock_dark', [C('#45414e'), C('#3c3946'), C('#4a4450')], C('#0c0a10'), C('#8c86a0'), 'stone', grain=(2.5, 2.5), edge=0.4, ao=0.8)
    paint('moss', [C('#4e5a52'), C('#46544a')], C('#141a16'), C('#94a89a'), 'leaf', grain=(3, 3), edge=0.35, feet=0.1)
    paint('crystal', [C('#5a2aa8')], C('#2a1060'), C('#e4d0ff'), 'emit')
    paint('crystal_dim', [C('#3a1a70')], C('#1a0a40'), C('#a888e8'), 'emit')
    paint('glow_cold', [C('#2a7a9a')], C('#0e3a4a'), C('#c8f4ff'), 'emit')
    paint('mush_stem', [C('#a8b4c0'), C('#98a4b4')], C('#3a4450'), C('#e0eaf4'), 'soft', grain=(3, 3), edge=0.3, feet=0.2)
    paint('iron', [C('#44464e'), C('#4c4850')], C('#121216'), C('#a8aab4'), 'metal', grain=(5, 5), edge=0.75)
    paint('wood', [C('#6e5038'), C('#7a5a3c')], C('#20140c'), C('#c09468'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('wood_dark', [C('#4a3426'), C('#54392a')], C('#160c06'), C('#94704c'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('cloth', [C('#e0d2b0'), C('#d4c4a0')], C('#6a5a3c'), C('#fff4d8'), 'soft', grain=(3, 3), edge=0.3, feet=0.0)
    paint('shadow', [C('#0e0c12')], C('#060508'), C('#1c1a22'), 'soft', grain=(2, 2), edge=0.0, ao=0.0, feet=0.0)


def cliff(p, length, h, seed, crystal=False, depth=0.45):
    """Cave wall along X: big faceted boulders stacked into a cliff, inner face near y = 0."""
    rng = random.Random(seed)
    # Base boulders, then a middle and a top row set further back so the face leans away.
    rows = [(0.0, 3, 0.36, 0.05), (h * 0.38, 3, 0.32, 0.12), (h * 0.7, 2, 0.3, 0.2)]
    for zi, (z0, n, r, yb) in enumerate(rows):
        for i in range(n):
            x = -length / 2 + length * (i + 0.5) / n + rng.uniform(-0.06, 0.06)
            rr = r * rng.uniform(0.95, 1.15)
            sz = (h * 0.42 if zi < 2 else h * 0.36) / (2 * rr)
            pn = 'rock' if (i + zi + seed) % 3 else 'rock_dark'
            p.rock(pn, rr, (x, yb + rr * 0.55 + rng.uniform(0, 0.06), z0 + rr * sz * 0.85), scale=(1.3, 1.0, sz * 1.2),
                   rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3)), noise=0.2, subdiv=2, cut_bottom=(zi == 0))
    # A filler slab behind so nothing shows through between boulders.
    p.box('rock_dark', (length, 0.2, h * 0.92), (0, depth, h * 0.46), bevel=0.04, jitter=0.03, drop_bottom=True)
    if crystal:
        crystal_cluster(p, (rng.uniform(-0.2, 0.2), -0.02, 0.38), 0.75, seed + 3, tilt_y=-0.5)
        crystal_cluster(p, (0.32, 0.08, 1.05), 0.5, seed + 5, tilt_y=-0.6)


def crystal_cluster(p, base, s, seed, tilt_y=0.0, n=6):
    """Violet crystals: hexagonal prisms with pointed tips fanning out of a point."""
    rng = random.Random(seed)
    bx, by, bz = base
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
        tilt = rng.uniform(0.15, 0.6)
        ln = s * rng.uniform(0.22, 0.42) * (1.4 if i == 0 else 1)
        r = s * rng.uniform(0.035, 0.06) * (1.3 if i == 0 else 1)
        if i == 0:
            tilt = 0.08
        d = Vector((math.sin(tilt) * math.cos(a), math.sin(tilt) * math.sin(a) + tilt_y * 0.4, math.cos(tilt))).normalized()
        start = Vector((bx, by, bz)) + Vector((math.cos(a), math.sin(a), 0)) * r * 0.6
        mid = start + d * ln
        tip = start + d * (ln + r * 2.2)
        p.tube('crystal' if i % 3 else 'crystal_dim', [tuple(start - d * 0.03), tuple(mid), tuple(tip)], [r, r, 0.001], seg=6, cap_start=True, cap_end=False)


def rock_wall(name, h=GH, seed=301, crystal=False):
    p = Piece(name, seed)
    cliff(p, 1.06, h, seed, crystal=crystal)
    return p


def rock_low(name='gloom-heart.rock-low', seed=311):
    p = Piece(name, seed)
    rng = random.Random(seed)
    for i in range(3):
        x = -0.36 + i * 0.36 + rng.uniform(-0.04, 0.04)
        r = rng.uniform(0.2, 0.26)
        p.rock('rock' if i % 2 else 'rock_dark', r, (x, 0.12, r * 0.5), scale=(1.4, 1.1, 0.9), rot=(rng.random(), rng.random(), rng.random() * 3), subdiv=2, noise=0.2)
    p.blob('moss', 0.12, (-0.1, 0.1, 0.38), scale=(1.6, 1.1, 0.3), subdiv=1, noise=0.15)
    return p


def rock_pillar(name, h, seed=321, low=False):
    """Corner: a leaning spire of rock on a wide foot, centre at (0, -0.1)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    cy = 0.1
    p.rock('rock_dark', 0.3, (0, cy, 0.12), scale=(1.25, 1.2, 0.7), rot=(0.2, 0.1, 0.5), subdiv=2, noise=0.18)
    if low:
        p.rock('rock', 0.2, (0.02, cy, 0.32), scale=(1.1, 1, 1.0), rot=(0.4, 0.2, 1.0), subdiv=2, noise=0.2)
        return p
    z = 0.25
    r = 0.24
    k = 0
    while z < h + 0.1:
        sz = 0.3
        p.rock('rock' if k % 2 else 'rock_dark', r, (rng.uniform(-0.03, 0.03), cy + rng.uniform(-0.03, 0.03), z + r * sz * 1.2), scale=(1.1, 1.05, sz * 2.6),
               rot=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(0, 3)), subdiv=2, noise=0.18, cut_bottom=False)
        z += r * sz * 2.2
        r *= 0.9
        k += 1
    p.cone('rock', r * 0.9, 0.3, 6, (0, cy, z - 0.05), jitter=0.02)
    return p


def cave_mouth(name='gloom-heart.cave-mouth', h=GH, seed=331):
    """Opening in the cave wall (entrance/exit): two rock jambs, a lintel boulder, darkness behind."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    for sx in (-1, 1):
        for k in range(3):
            r = 0.22 - k * 0.02
            p.rock('rock' if (k + (sx > 0)) % 2 else 'rock_dark', r, (sx * 0.43, 0.15, 0.2 + k * 0.42), scale=(0.8, 1.2, 1.1),
                   rot=(rng.random(), rng.random(), rng.random() * 3), subdiv=2, noise=0.2, cut_bottom=(k == 0))
    p.rock('rock_dark', 0.42, (0, 0.18, 1.45), scale=(1.45, 0.8, 0.55), rot=(0.1, 0.05, 0.2), subdiv=2, noise=0.18, cut_bottom=False)
    p.rock('rock', 0.3, (0.1, 0.32, 1.8), scale=(1.4, 0.9, 0.5), rot=(0.3, 0.2, 1.0), subdiv=2, noise=0.2, cut_bottom=False)
    p.box('shadow', (0.7, 0.02, 1.25), (0, 0.42, 0.62))
    p.box('shadow', (0.7, 0.4, 0.02), (0, 0.22, 0.005))
    stalactite_row(p, (0, 0.05, 1.22), 0.5, 4, seed, 0.18)
    return p


def stalactite_row(p, at, width, n, seed, length=0.3):
    rng = random.Random(seed)
    x0, y0, z0 = at
    for i in range(n):
        x = x0 - width / 2 + width * (i + 0.5) / n + rng.uniform(-0.03, 0.03)
        ln = length * rng.uniform(0.6, 1.2)
        r = 0.03 + ln * 0.12
        p.cone('rock', r, ln, 6, (x, y0 + rng.uniform(-0.03, 0.03), z0 + 0.02), rot=(math.pi + rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0), jitter=0.005)


def stalactites(name='gloom-heart.stalactites', seed=341, h=GH):
    """Wall decoration: a rock overhang at the top of the wall face with stalactites hanging from it."""
    p = Piece(name, seed)
    p.rock('rock_dark', 0.32, (0, -0.05, h - 0.02), scale=(1.7, 0.85, 0.45), rot=(0.1, 0.0, 0.1), subdiv=2, noise=0.2, cut_bottom=False)
    stalactite_row(p, (0, -0.14, h - 0.12), 0.8, 7, seed, 0.42)
    return p


def stalagmites(name, seed, big=False):
    p = Piece(name, seed)
    rng = random.Random(seed)
    spots = [(0, 0, 1.0), (0.18, 0.1, 0.62), (-0.16, 0.08, 0.5), (0.06, -0.16, 0.42)] if big else [(0, 0, 0.55), (0.14, 0.06, 0.35), (-0.1, 0.1, 0.28)]
    for i, (x, y, hh) in enumerate(spots):
        hh *= (1.6 if big else 1.0)
        r = 0.07 + hh * 0.11
        p.cone('rock' if i % 2 else 'rock_dark', r, hh, 7, (x, y, -0.02), rot=(rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), rng.random() * 3), jitter=0.01)
        p.cyl('rock_dark', r * 1.35, r * 1.05, hh * 0.18, 7, (x, y, -0.02), jitter=0.01)
    return p


def crystals(name='gloom-heart.crystals', seed=351):
    """Violet crystal cluster on a rock (light ≈ (0, 0.45, 0))."""
    p = Piece(name, seed)
    p.rock('rock_dark', 0.22, (0, 0, 0.08), scale=(1.4, 1.2, 0.6), rot=(0.2, 0.1, 0.4), subdiv=2, noise=0.2)
    crystal_cluster(p, (0, 0, 0.14), 1.0, seed, n=7)
    crystal_cluster(p, (0.2, -0.08, 0.06), 0.55, seed + 1, n=4)
    return p


def glow_mushrooms(name='gloom-heart.glow-mushrooms', seed=361):
    p = Piece(name, seed)
    p.smooth = 70
    rng = random.Random(seed)
    for x, y, s in ((0, 0, 1.0), (0.12, 0.07, 0.7), (-0.1, 0.09, 0.6), (0.04, -0.12, 0.5), (-0.14, -0.06, 0.45)):
        p.tube('mush_stem', [(x, y, 0), (x + rng.uniform(-0.02, 0.02), y, 0.16 * s)], [0.022 * s, 0.018 * s], seg=5)
        p.blob('glow_cold', 0.075 * s, (x, y, 0.16 * s), scale=(1, 1, 0.5), subdiv=2, noise=0.05, flat_bottom=True, emit_uv=True)
    p.blob('moss', 0.12, (0, 0, 0.0), scale=(1.8, 1.5, 0.3), subdiv=1, noise=0.15)
    return p


def boulder(name='gloom-heart.rock', seed=371):
    p = Piece(name, seed)
    p.rock('rock', 0.3, (0, 0, 0.17), scale=(1.25, 1.0, 0.8), rot=(0.2, 0.3, 0.6), subdiv=2, noise=0.2)
    p.rock('rock_dark', 0.16, (0.3, -0.12, 0.08), scale=(1.2, 1, 0.75), rot=(0.1, 0.2, 1.4), subdiv=1)
    return p


def gloom_pieces():
    return [
        lambda: rock_wall('gloom-heart.rock-wall', seed=301),
        lambda: rock_wall('gloom-heart.rock-wall-b', seed=303),
        lambda: rock_wall('gloom-heart.rock-wall-crystal', seed=305, crystal=True),
        lambda: rock_low(),
        lambda: rock_pillar('gloom-heart.rock-pillar', GH),
        lambda: rock_pillar('gloom-heart.rock-pillar-low', GLOW, seed=323, low=True),
        lambda: cave_mouth(),
        lambda: stalactites(),
        lambda: stalagmites('gloom-heart.stalagmite', 381),
        lambda: stalagmites('gloom-heart.stalagmite-big', 383, big=True),
        lambda: crystals(),
        lambda: glow_mushrooms(),
        lambda: boulder(),
    ]


def build_gloom_heart():
    gloom_paints()
    c = collection('gloom-heart')
    objs = []
    for i, make in enumerate(gloom_pieces()):
        objs.append(make().build(((i % 5) * 1.8, (i // 5) * 2.4, 0), c))
    return objs


def gloom_diorama():
    c = collection('gloom-heart-diorama')
    for o in list(c.objects):
        bpy.data.objects.remove(o)
    floor(c, os.path.join(TEX_DIR, 'cave-rock.1024.webp'), tint=hexc('#8a8496'))
    bpy.data.objects['dio.floor'].visible_shadow = False
    hex_tiles(c, [(0, 0), (-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)], paint_hex='#5c5866')
    back = [(-SQ3, 0), (0, 0), (SQ3, 0)]
    walls = ['rock-wall', 'rock-wall-crystal', 'rock-wall-b', 'cave-mouth', 'rock-wall', 'rock-wall-b']
    k = 0
    for cx, cy in back:
        cen = Vector((cx, cy, 0))
        for a, b in ((2, 1), (1, 0)):
            wall_on_edge('gloom-heart.' + walls[k], c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            if k in (0, 4):
                wall_on_edge('gloom-heart.stalactites', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            k += 1
        for v in (2, 1):
            place('gloom-heart.rock-pillar', c, hex_vertex(cx, cy, v), rng_rot(cx + v))
    place('gloom-heart.rock-pillar', c, hex_vertex(SQ3, 0, 0))
    wall_on_edge('gloom-heart.rock-wall-crystal', c, hex_vertex(-SQ3, 0, 2), hex_vertex(-SQ3, 0, 3), Vector((-SQ3, 0, 0)))
    wall_on_edge('gloom-heart.rock-wall', c, hex_vertex(SQ3, 0, 5), hex_vertex(SQ3, 0, 0), Vector((SQ3, 0, 0)))
    place('gloom-heart.rock-pillar', c, hex_vertex(-SQ3, 0, 3), 1.0)
    place('gloom-heart.rock-pillar', c, hex_vertex(SQ3, 0, 5), 2.0)
    for cx, cy in ((-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)):
        cen = Vector((cx, cy, 0))
        for a, b in ((3, 4), (4, 5)):
            wall_on_edge('gloom-heart.rock-low', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
        for v in (3, 4, 5):
            place('gloom-heart.rock-pillar-low', c, hex_vertex(cx, cy, v), rng_rot(v))
    place('gloom-heart.crystals', c, (-1.9, -0.6, 0), 0.5)
    place('gloom-heart.crystals', c, (2.2, -1.3, 0), 2.0)
    place('gloom-heart.glow-mushrooms', c, (1.5, 0.45, 0))
    place('gloom-heart.stalagmite-big', c, (-2.3, 0.5, 0))
    place('gloom-heart.stalagmite', c, (2.4, 0.2, 0), 1.0)
    place('gloom-heart.stalagmite', c, (-0.6, -2.9, 0), 2.0)
    place('gloom-heart.rock', c, (0.9, -3.0, 0), 1.0)
    return c


def rng_rot(k):
    return (k * 2.399) % (2 * math.pi)
