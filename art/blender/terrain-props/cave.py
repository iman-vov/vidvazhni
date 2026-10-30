# Cave and mine difficult-terrain clumps: scree heaps of angular stones and gravel round the rim.
# exec after tp_lib.py and shapes.py; build_cave(v) makes `rough-cave-<v>` and its -hi.

STONE = ['#6e6a64', '#7a746a', '#5e5a56', '#857c6e', '#686058', '#746a5e', '#5a5550']
RUST = ['#7a6656', '#6e5c4e']


def _heap(rnd, a, r, n_big, n_mid, n_grit, spread=0.17, seed=0, cols=STONE):
    """A scree heap centred at angle a, radius r: big stones at the bottom, smaller ones riding
    up on them toward the middle, grit round the foot. Returns piece tuples."""
    out = []
    c = Vector((math.cos(a) * r, math.sin(a) * r, 0))
    tang = Vector((-math.sin(a), math.cos(a), 0))
    rad = Vector((math.cos(a), math.sin(a), 0))

    def spot(k):
        # elongated along the rim: spread x along the tangent, 0.55 x across
        return c + tang * rnd.uniform(-spread, spread) * k + rad * rnd.uniform(-spread, spread) * 0.55 * k

    def height_at(p):
        d = ((p - c).dot(tang) / spread) ** 2 + ((p - c).dot(rad) / (spread * 0.55)) ** 2
        return max(0.0, 1 - math.sqrt(d))

    for i in range(n_big):
        sx = rnd.uniform(0.11, 0.16)
        s = (sx, sx * rnd.uniform(0.6, 0.9), min(0.09, sx * rnd.uniform(0.5, 0.7)))
        p = spot(0.75)
        p.z = s[2] * 0.5
        out.append((p, s, 2, rnd.choice(cols)))
    for i in range(n_mid):
        sx = rnd.uniform(0.055, 0.09)
        s = (sx, sx * rnd.uniform(0.6, 0.95), sx * rnd.uniform(0.5, 0.75))
        p = spot(1.0)
        p.z = s[2] * 0.5 + 0.1 * height_at(p)
        out.append((p, s, 1, rnd.choice(cols)))
    for i in range(n_grit):
        sx = rnd.uniform(0.022, 0.042)
        s = (sx, sx * rnd.uniform(0.6, 1.0), sx * rnd.uniform(0.45, 0.8))
        p = spot(1.4)
        p.z = s[2] * 0.45 + 0.05 * height_at(p)
        out.append((p, s, 0, rnd.choice(cols)))
    pieces = []
    for j, (p, s, sub, col) in enumerate(out):
        rot = rnd.uniform(0, 6.28)
        tilt = (rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.35))
        n = 16 if sub == 2 else (12 if sub == 1 else 9)
        sd = seed * 1000 + j

        def st(bm, hi, p=p, s=s, sd=sd, rot=rot, tilt=tilt, n=n, sub=sub):
            return rock(bm, hi, p, s, sd, n=n, sub_hi=sub, rot=rot, tilt=tilt, bump=0.035, crack=0.04)
        pieces.append((st, 'stone', col, 2))
    return pieces


def cave_layout(v):
    rnd = random.Random(500 + v)
    R = math.radians
    P = []
    if v == 1:
        # one long talus along a third of the rim, a small one opposite
        P += _heap(rnd, R(195), 0.6, 8, 15, 20, 0.44, 1)
        P += _heap(rnd, R(45), 0.62, 3, 6, 9, 0.22, 2)
        P += _heap(rnd, R(105), 0.66, 0, 3, 8, 0.14, 3)
    elif v == 2:
        # two heaps facing each other across the hex, grit between them along the rim
        P += _heap(rnd, R(300), 0.6, 5, 11, 14, 0.34, 4)
        P += _heap(rnd, R(125), 0.6, 5, 11, 14, 0.34, 5, STONE + RUST)
        P += _heap(rnd, R(215), 0.66, 0, 4, 8, 0.14, 6)
    else:
        # a ring of rubble: four small heaps round the rim
        P += _heap(rnd, R(20), 0.62, 3, 6, 8, 0.22, 7)
        P += _heap(rnd, R(110), 0.62, 2, 5, 8, 0.18, 8, STONE + RUST)
        P += _heap(rnd, R(195), 0.6, 4, 6, 9, 0.26, 9)
        P += _heap(rnd, R(285), 0.63, 1, 5, 8, 0.16, 10)
    return P


def build_cave(v):
    name = 'rough-cave-%d' % v
    k = Kit(seed=600 + v)
    for build, mat, col, gax in cave_layout(v):
        k.add(build, mat, col, gax)
    lo, hi = k.finish(name, loc=((v - 2) * 2.2, 4.8, 0))
    return lo, hi
