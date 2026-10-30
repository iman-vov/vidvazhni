# Cave and mine difficult-terrain clumps: scree heaps of angular stones and gravel round the rim.
# exec after tp_lib.py and shapes.py; build_cave(v) makes `rough-cave-<v>` and its -hi.

STONE = ['#6e6a64', '#7a746a', '#5e5a56', '#857c6e', '#686058', '#746a5e', '#5a5550']
RUST = ['#7a6656', '#6e5c4e']
SLATE = ['#5a5a5e', '#646068', '#55524f']


def _gax2(ang):
    # long axis of a piece lying at angle ang: 0 along x, 1 along y
    return 0 if abs(math.cos(ang)) > abs(math.sin(ang)) else 1


def _heap(rnd, a, r, n_big, n_mid, n_grit, spread=0.17, seed=0, cols=STONE, label='heap'):
    """A scree heap centred at angle a, radius r: big stones at the bottom, smaller ones riding
    up on them toward the middle, grit round the foot. Returns a layout: a step name before each
    size class (big, mid, grit), then its piece tuples."""
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
        sx = rnd.uniform(0.12, 0.18)
        s = (sx, sx * rnd.uniform(0.6, 0.9), min(0.1, sx * rnd.uniform(0.5, 0.7)))
        p = spot(0.75)
        p.z = s[2] * 0.5
        out.append((p, s, 2, rnd.choice(cols)))
    for i in range(n_mid):
        sx = rnd.uniform(0.055, 0.095)
        s = (sx, sx * rnd.uniform(0.6, 0.95), sx * rnd.uniform(0.5, 0.75))
        p = spot(1.0)
        p.z = s[2] * 0.5 + 0.11 * height_at(p)
        out.append((p, s, 1, rnd.choice(cols)))
    for i in range(n_grit):
        sx = rnd.uniform(0.022, 0.042)
        s = (sx, sx * rnd.uniform(0.6, 1.0), sx * rnd.uniform(0.45, 0.8))
        p = spot(1.45)
        p.z = s[2] * 0.45 + 0.05 * height_at(p)
        out.append((p, s, 0, rnd.choice(cols)))
    L = []
    for cls, nm in ((2, 'big'), (1, 'mid'), (0, 'grit')):
        part = [(j, o) for j, o in enumerate(out) if o[2] == cls]
        if not part:
            continue
        L.append('%s %s' % (label, nm))
        for j, (p, s, sub, col) in part:
            rot = rnd.uniform(0, 6.28)
            tilt = (rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.35))
            n = 16 if sub == 2 else (12 if sub == 1 else 9)
            sd = seed * 1000 + j

            def st(bm, hi, p=p, s=s, sd=sd, rot=rot, tilt=tilt, n=n, sub=sub):
                return rock(bm, hi, p, s, sd, n=n, sub_hi=sub, rot=rot, tilt=tilt, bump=0.035, crack=0.04)
            L.append((st, 'stone', col, 2))
    return L


def _slabs(rnd, a, r, n, seed, label='slabs'):
    """Thin shale plates leaning on a heap's foot, tilted up toward the heap."""
    L = [label]
    for i in range(n):
        aa = a + rnd.uniform(-0.25, 0.25)
        rr = r + rnd.uniform(-0.05, 0.05)
        sx = rnd.uniform(0.12, 0.17)
        s = (sx, sx * rnd.uniform(0.55, 0.8), rnd.uniform(0.018, 0.026))
        p = Vector((math.cos(aa) * rr, math.sin(aa) * rr, s[2] + 0.02))
        tilt = (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5))

        def b(bm, hi, p=p, s=s, sd=seed * 1000 + i, rot=aa + 1.57, tilt=tilt):
            return rock(bm, hi, p, s, sd, n=12, sub_hi=1, bev=0.2, rot=rot, tilt=tilt, bump=0.02, crack=0.05, sit=0.3)
        L.append((b, 'stone', rnd.choice(SLATE), 2))
    return L


def _timber(rnd, a, r, length, label='timber'):
    """A broken mine prop lying along the rim: a thick split log, its snapped-off end lying askew
    beyond it, an iron cramp hammered over the log."""
    tang = Vector((-math.sin(a), math.cos(a), 0))
    rad = Vector((math.cos(a), math.sin(a), 0))
    c = Vector((math.cos(a) * r, math.sin(a) * r, 0.055))
    p0 = c - tang * length * 0.5
    p1 = c + tang * length * 0.5 + Vector((0, 0, 0.02))
    pts = [p0, (p0 + p1) * 0.5 + Vector((0, 0, 0.006)), p1]

    def log(bm, hi, pts=pts):
        return tube(bm, hi, pts, 0.062, 0.056, sides=(7, 16), k_hi=6, bark=0.16, seed=77, flat=0.9)
    # the snapped-off end: short, turned 35 degrees, lying a little lower and out past the rim
    d = (tang * math.cos(0.6) + rad * math.sin(0.6)).normalized()
    q0 = p1 + tang * 0.05 + rad * 0.02 - Vector((0, 0, 0.012))
    stub = [q0, q0 + d * 0.1, q0 + d * 0.2 - Vector((0, 0, 0.006))]

    def chunk(bm, hi, pts=stub):
        return tube(bm, hi, pts, 0.05, 0.047, sides=(6, 14), k_hi=4, bark=0.2, seed=79, flat=0.9)
    q = p0 + tang * 0.12
    band = [q + rad * 0.066 - Vector((0, 0, 0.04)), q + rad * 0.045 + Vector((0, 0, 0.045)),
            q + Vector((0, 0, 0.07)), q - rad * 0.045 + Vector((0, 0, 0.045)), q - rad * 0.066 - Vector((0, 0, 0.04))]

    def cramp(bm, hi, pts=band):
        return tube(bm, hi, pts, 0.014, 0.014, sides=(4, 8), k_hi=3, flat=0.45, seed=78)
    g = _gax2(a + 1.5708)
    return [label, (log, 'wood', '#6a5440', g), (chunk, 'wood', '#5e4c3a', g), (cramp, 'iron', '#4a4440', 2)]


def cave_layout(v):
    rnd = random.Random(520 + v)
    R = math.radians
    P = []
    if v == 1:
        # one long talus along a third of the rim, spilling past it; a small heap opposite
        P += _heap(rnd, R(195), 0.72, 8, 15, 22, 0.46, 1, label='talus')
        P += _slabs(rnd, R(185), 0.5, 3, 11)
        P += _heap(rnd, R(45), 0.74, 3, 6, 10, 0.24, 2, label='heap')
        P += _heap(rnd, R(105), 0.8, 0, 3, 8, 0.14, 3, label='spill')
    elif v == 2:
        # a heap one side, a broken mine timber and rusty stones the other
        P += _heap(rnd, R(300), 0.72, 5, 11, 14, 0.36, 4, label='heap')
        P += _timber(rnd, R(130), 0.74, 0.62)
        P += _heap(rnd, R(125), 0.8, 2, 7, 12, 0.3, 5, STONE + RUST, label='round timber')
        P += _slabs(rnd, R(215), 0.74, 3, 12)
    else:
        # a ring of rubble: four small heaps round the rim
        P += _heap(rnd, R(20), 0.74, 3, 6, 8, 0.24, 7, label='heap ne')
        P += _heap(rnd, R(110), 0.74, 2, 5, 8, 0.2, 8, STONE + RUST, label='heap n')
        P += _heap(rnd, R(195), 0.72, 4, 6, 9, 0.28, 9, label='heap w')
        P += _heap(rnd, R(285), 0.76, 1, 5, 8, 0.18, 10, label='heap s')
        P += _slabs(rnd, R(240), 0.7, 2, 13)
    return P


def build_cave(v):
    name = 'rough-cave-%d' % v
    k = Kit(seed=600 + v)
    for build, mat, col, gax in cave_layout(v):
        k.add(build, mat, col, gax)
    lo, hi = k.finish(name, loc=((v - 2) * 2.2, 4.8, 0))
    return lo, hi
