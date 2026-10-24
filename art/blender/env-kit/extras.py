# Natural edges, door replacements, cave extras and the abandoned swamp house. Run in Blender through
# the MCP after kitlib.py and the location script whose list it extends, e.g. for the thorn path:
#   exec(open(r'...\kitlib.py', encoding='utf8').read())
#   exec(open(r'...\thorn_path.py', encoding='utf8').read())
#   exec(open(r'...\extras.py', encoding='utf8').read())
#   build_thorn_path()          # now also builds THORN_EXTRAS
# Frame as for every edge piece: along X (1.06), inner face on y = 0, body at y > 0.

EL = 1.06


# ─── Outdoor edges (thorn path; the mill reuses them by node) ───────────────

def thicket_corner(name='thorn-path.thicket-corner', h=1.0, seed=401):
    """Round bush mass for a vertex of the outline, centre at (0, -0.1) like a pillar."""
    p = Piece(name, seed)
    p.smooth = 75
    rng = random.Random(seed)
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        r = rng.uniform(0.24, 0.3)
        rv = h * 0.78 / 1.25
        p.blob(('leaf_dark', 'leaf_green', 'leaf_autumn')[i], r, (math.cos(a) * 0.12, 0.1 + math.sin(a) * 0.12, rv * 0.25 - 0.03),
               scale=(1.1, 1.1, rv / r), subdiv=2, noise=0.16, flat_bottom=True)
    p.blob('leaf_green', 0.2, (0, 0.1, h * 0.82), scale=(1.1, 1.1, 0.8), subdiv=2, noise=0.15)
    return p


def fallen_tree(name='thorn-path.fallen-tree', seed=411):
    """Edge barrier: a whole trunk lying along X with its root plate up on the left and broken branches."""
    p = Piece(name, seed)
    p.smooth = 75
    r = 0.2
    p.tube('bark', [(-0.62, 0.2, r + 0.05), (-0.1, 0.18, r + 0.02), (0.4, 0.2, r - 0.02), (0.75, 0.22, r - 0.06)], [r * 1.1, r, r * 0.92, r * 0.8], seg=8, cap_end=True)
    # Root plate standing on edge with earth caught in it.
    p.blob('mud', 0.36, (-0.7, 0.24, 0.36), scale=(0.35, 1.05, 1.0), subdiv=2, noise=0.18)
    for k in range(6):
        a = 2 * math.pi * k / 6
        p.tube('bark', [(-0.68, 0.24, 0.36), (-0.74, 0.24 + math.cos(a) * 0.38, 0.36 + math.sin(a) * 0.38)], [0.045, 0.012], seg=4)
    for x, a, ln in ((-0.05, 0.7, 0.42), (0.35, -0.6, 0.34), (0.15, 2.3, 0.3)):
        d = Vector((math.cos(a) * 0.3, -math.sin(abs(a)) * 0.6, 0.7)).normalized()
        b = Vector((x, 0.18, r * 1.7))
        p.tube('bark', [tuple(b), tuple(b + d * ln)], [0.05, 0.02], seg=5)
    p.blob('moss', 0.2, (0.1, 0.15, 2 * r + 0.02), scale=(2.4, 0.9, 0.3), subdiv=2, noise=0.12)
    return p


def rock_wall_low(name='thorn-path.rock-wall-low', seed=421):
    """Low dry-stone wall of field stones along X, height ≈ 0.45, with moss on top."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    x = -EL / 2
    while x < EL / 2 - 0.05:
        w = rng.uniform(0.22, 0.32)
        if EL / 2 - (x + w) < 0.12:
            w = EL / 2 - x
        p.rock('rock', w * 0.55, (x + w / 2, 0.16, w * 0.3), scale=(1.0, 1.2, 0.65), rot=(rng.random() * 0.3, 0, rng.random() * 3), subdiv=1)
        x += w
    for i in range(3):
        xx = -0.33 + i * 0.33 + rng.uniform(-0.05, 0.05)
        p.rock('rock', 0.15, (xx, 0.16, 0.34), scale=(1.4, 1.1, 0.6), rot=(0, 0, rng.random() * 3), subdiv=1)
    p.blob('moss', 0.16, (0.1, 0.16, 0.44), scale=(2.0, 1.0, 0.3), subdiv=1, noise=0.15)
    return p


def barricade(name='thorn-path.barricade', seed=431):
    """Door replacement: planks lashed to stakes across the opening (can be pushed aside)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    for x in (-0.44, 0.0, 0.42):
        lean = rng.uniform(-0.12, 0.12)
        p.tube('wood_dark', [(x, 0.12, -0.05), (x + lean * 0.5, 0.1, 0.55), (x + lean, 0.06, 1.0)], [0.05, 0.045, 0.012], seg=6)
    for k, z in enumerate((0.3, 0.62, 0.86)):
        tilt = rng.uniform(-0.12, 0.12)
        p.box('plank', (EL - 0.04, 0.04, 0.16), (rng.uniform(-0.04, 0.04), 0.05, z), rot=(0, tilt, 0), bevel=0.012, jitter=0.006, grain=0)
    p.box('plank', (0.9, 0.04, 0.13), (0, 0.02, 0.58), rot=(0, 0.75, 0), bevel=0.012, jitter=0.006, grain=0)
    for x in (-0.44, 0.0, 0.42):
        p.tube('rope', [(x - 0.05, 0.0, 0.6), (x + 0.05, 0.0, 0.66)], [0.015, 0.015], seg=4)
    return p


def brush_pile(name='thorn-path.brush-pile', seed=441):
    """Door replacement: a heap of cut branches and dry leaves across the path."""
    p = Piece(name, seed)
    p.smooth = 70
    rng = random.Random(seed)
    for k in range(9):
        x0 = rng.uniform(-0.5, 0.5)
        a = rng.uniform(-0.6, 0.6)
        z = rng.uniform(0.05, 0.4)
        ln = rng.uniform(0.5, 0.8)
        p.tube('bark', [(x0 - math.cos(a) * ln / 2, 0.1 + rng.uniform(-0.1, 0.1), z * 0.6), (x0 + math.cos(a) * ln / 2, 0.1 + rng.uniform(-0.1, 0.1), z)], [0.035, 0.015], seg=4)
    for i in range(5):
        x = -0.45 + i * 0.22
        p.blob(('leaf_autumn', 'leaf_dark', 'leaf_green')[i % 3], rng.uniform(0.14, 0.2), (x, 0.12 + rng.uniform(-0.06, 0.06), rng.uniform(0.2, 0.35)), scale=(1.2, 1, 0.7), subdiv=1, noise=0.18)
    return p


def mud_log(name='thorn-path.mud-log', seed=451):
    """Door replacement: a muddy log rolled across the path, sunk in a ridge of mud."""
    p = Piece(name, seed)
    p.smooth = 75
    r = 0.16
    p.tube('bark', [(-0.58, 0.05, r - 0.03), (0.0, 0.03, r - 0.01), (0.58, 0.06, r - 0.04)], [r, r * 1.04, r * 0.95], seg=8, cap_start=True, cap_end=True)
    for x in (-0.35, 0.05, 0.4):
        p.blob('mud', 0.2, (x, 0.05, 0.02), scale=(1.4, 1.3, 0.35), subdiv=2, noise=0.2)
    p.blob('mud', 0.12, (0.2, -0.05, 0.22), scale=(1.6, 0.8, 0.35), subdiv=1, noise=0.2)
    return p


# ─── Swamp: reed walls and the abandoned house ──────────────────────────────

def reed_wall(name='flooded-mill.reed-wall', h=1.3, seed=461):
    """Tall dense reeds along X standing in mud: an edge as high as a wall."""
    p = Piece(name, seed)
    p.smooth = 75
    for i in range(3):
        p.blob('mud', 0.28, (-0.38 + i * 0.38, 0.14, 0.0), scale=(1.4, 1.2, 0.3), subdiv=1, noise=0.18)
    for i in range(5):
        reed_clump(p, -0.44 + i * 0.22, 0.12 + (i % 2) * 0.06, 10, h, seed + i, spread=0.1, cattails=1)
    return p


def reed_corner(name='flooded-mill.reed-corner', h=1.3, seed=471):
    p = Piece(name, seed)
    p.smooth = 75
    p.blob('mud', 0.3, (0, 0.1, 0.0), scale=(1.3, 1.3, 0.3), subdiv=1, noise=0.18)
    reed_clump(p, 0, 0.1, 18, h, seed, spread=0.16, cattails=2)
    return p


def house_wall(name, h=1.5, seed=481, window=False, door=False):
    """Abandoned swamp house: planks sagging off a rotten frame, a broken window or an empty door frame."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    stone_plinth(p, seed=seed, h=0.14)
    yc = MT / 2
    sag = 0.12
    beam(p, (-ML / 2, yc, 0.2), (ML / 2, yc, 0.2), 0.11)
    beam(p, (-ML / 2, yc, h - 0.05), (ML / 2, yc, h - 0.05 - sag), 0.12)   # top beam sagging to the right
    beam(p, (-ML / 2 + 0.05, yc, 0.2), (-ML / 2 + 0.03, yc, h - 0.05), 0.11)
    beam(p, (ML / 2 - 0.05, yc, 0.2), (ML / 2 - 0.1, yc, h - 0.05 - sag), 0.1)
    holes = []
    if window:
        holes.append((-0.18, 0.2, 0.75, 1.15))
    if door:
        holes.append((-0.3, 0.3, 0.2, 1.2))
    n = 7
    w = ML / n
    for i in range(n):
        x0 = -ML / 2 + i * w
        x = x0 + w / 2
        top = h - 0.1 - sag * (x + ML / 2) / ML
        segs = [(0.24, top)]
        for hx0, hx1, hz0, hz1 in holes:
            if x0 + w > hx0 and x0 < hx1:
                segs = [(a, b) for a, b in ((0.24, hz0), (hz1, top)) if b - a > 0.05]
        if rng.random() < 0.15 and not holes:
            segs = [(0.24, top * rng.uniform(0.5, 0.8))]   # a board fallen away
        for a, b in segs:
            p.box('plank', (w - 0.02, 0.035, b - a), (x, 0.03, (a + b) / 2), rot=(0, rng.uniform(-0.06, 0.06), 0), bevel=0.008, jitter=0.006, grain=2)
    if window:
        p.box('wood_dark', (0.46, 0.08, 0.05), (0.01, 0.02, 0.73), bevel=0.01)
        p.box('wood_dark', (0.05, 0.08, 0.42), (-0.2, 0.02, 0.95), bevel=0.01)
        p.box('wood_dark', (0.05, 0.08, 0.42), (0.22, 0.02, 0.94), rot=(0, 0.12, 0), bevel=0.01)
        p.box('shadow', (0.36, 0.02, 0.38), (0.01, 0.12, 0.95))
        p.box('wood_dark', (0.03, 0.03, 0.4), (0.0, 0.0, 0.95), rot=(0, 0.6, 0))   # broken mullion
        p.box('plank', (0.2, 0.03, 0.4), (-0.3, -0.06, 0.9), rot=(0.2, 0, 0.5), bevel=0.008, grain=2)   # hanging shutter
    if door:
        for sx, lean in ((-1, 0.04), (1, -0.08)):
            beam(p, (sx * 0.33, yc - 0.02, 0.18), (sx * 0.33 + lean, yc - 0.02, 1.25), 0.09)
        beam(p, (-0.38, yc - 0.02, 1.24), (0.32, yc - 0.02, 1.2), 0.1)
        p.box('shadow', (0.58, 0.02, 1.0), (0, 0.13, 0.7))
        p.blob('moss', 0.1, (-0.33, -0.02, 0.25), scale=(1.0, 0.6, 1.6), subdiv=1, noise=0.15)
    p.blob('moss', 0.12, (0.3, 0.0, 0.25), scale=(1.8, 0.6, 0.6), subdiv=1, noise=0.15)
    return p


# ─── Cave extras ────────────────────────────────────────────────────────────

def rubble_pile(name='gloom-heart.rubble-pile', seed=491):
    """Door replacement: a fallen heap of rock blocking a passage, along X, up to 0.9."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    for i in range(7):
        x = rng.uniform(-0.45, 0.45)
        z = 0.15 if i < 4 else 0.45
        r = rng.uniform(0.16, 0.26) * (1 if i < 4 else 0.85)
        p.rock('rock' if i % 2 else 'rock_dark', r, (x, 0.18 + rng.uniform(-0.08, 0.08), z), scale=(1.2, 1.0, 0.8), rot=(rng.random(), rng.random(), rng.random() * 3), subdiv=1, cut_bottom=(i < 4))
    p.rock('rock', 0.18, (0.05, 0.22, 0.75), scale=(1.3, 1, 0.7), rot=(0.4, 0.2, 1.0), subdiv=1, cut_bottom=False)
    for k in range(6):
        p.rock('rock_dark', rng.uniform(0.04, 0.07), (rng.uniform(-0.5, 0.5), rng.uniform(-0.15, 0.0), 0.02), scale=(1.2, 1, 0.7))
    return p


def mine_cart(name='gloom-heart.mine-cart', seed=501):
    """Mine cart on a short rail piece along X (rails 1.06 long, cart ≈ 0.7 × 0.55)."""
    p = Piece(name, seed)
    p.smooth = 50
    # Sleepers and rails.
    for x in (-0.42, -0.14, 0.14, 0.42):
        p.box('wood_dark', (0.1, 0.62, 0.05), (x, 0, 0.025), bevel=0.01, grain=1, drop_bottom=True)
    for y in (-0.2, 0.2):
        p.box('iron', (EL, 0.04, 0.04), (0, y, 0.07), bevel=0.008)
    # Wheels.
    for x in (-0.22, 0.22):
        for y in (-0.2, 0.2):
            p.cyl('iron', 0.09, 0.09, 0.04, 8, (x, y + (0.02 if y > 0 else -0.02), 0.18), rot=(math.pi / 2, 0, 0), bevel=0.01)
    # Tub: tapered box, wooden planks with iron corners, ore inside.
    p.box('wood', (0.68, 0.52, 0.34), (0, 0, 0.42), taper=-0.08, bevel=0.02, jitter=0.006, grain=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box('iron', (0.05, 0.05, 0.36), (sx * 0.34, sy * 0.27, 0.42), bevel=0.008)
    p.box('iron', (0.76, 0.6, 0.04), (0, 0, 0.6), bevel=0.01)
    for i in range(5):
        p.rock('rock_dark', 0.1, (-0.2 + i * 0.1, (i % 2 - 0.5) * 0.15, 0.6), scale=(1.1, 1, 0.8), subdiv=1)
    crystal_cluster(p, (0.12, 0.05, 0.6), 0.45, seed, n=3)
    return p


def mining_crate(name='gloom-heart.mining-crate', seed=511):
    """Reinforced mining crate: dark planks, iron bands and corners, a pick burnt into the front."""
    p = Piece(name, seed)
    S = 0.56
    p.box('wood_dark', (S, S, S), (0, 0, S / 2), bevel=0.02, jitter=0.004, grain=0, drop_bottom=True)
    for z in (0.12, S - 0.12):
        p.box('iron', (S + 0.02, S + 0.02, 0.05), (0, 0, z), bevel=0.008)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box('iron', (0.06, 0.06, S + 0.01), (sx * (S / 2 - 0.02), sy * (S / 2 - 0.02), S / 2), bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cyl('iron', 0.015, 0.015, 0.01, 6, (sx * 0.2, -S / 2 - 0.005, 0.12 + (sy + 1) * 0.16), rot=(math.pi / 2, 0, 0))
    # Pick symbol on the front: a handle and a curved head in pale paint.
    y = -S / 2 - 0.006
    p.box('cloth', (0.035, 0.012, 0.3), (0, y, 0.3), rot=(0, 0.6, 0))
    p.tube('cloth', [(-0.13, y, 0.32), (-0.04, y, 0.4), (0.06, y, 0.43), (0.15, y, 0.38)], [0.016, 0.022, 0.022, 0.01], seg=4)
    # Lid hasp and a lamp hook.
    p.box('iron', (0.08, 0.02, 0.1), (0, -S / 2 - 0.01, S - 0.06), bevel=0.006)
    return p


THORN_EXTRAS = [thicket_corner, fallen_tree, rock_wall_low, barricade, brush_pile, mud_log]
MILL_EXTRAS = [reed_wall, reed_corner,
               lambda: house_wall('flooded-mill.house-wall', seed=481),
               lambda: house_wall('flooded-mill.house-window', seed=483, window=True),
               lambda: house_wall('flooded-mill.house-doorframe', seed=485, door=True)]
GLOOM_EXTRAS = [rubble_pile, mine_cart, mining_crate]

if 'thorn_pieces' in globals():
    _thorn_base = thorn_pieces
    thorn_pieces = lambda: _thorn_base() + THORN_EXTRAS
if 'mill_pieces' in globals():
    _mill_base = mill_pieces
    mill_pieces = lambda: _mill_base() + MILL_EXTRAS
if 'gloom_pieces' in globals():
    _gloom_base = gloom_pieces
    gloom_pieces = lambda: _gloom_base() + GLOOM_EXTRAS
