# Glass Town difficult-terrain clumps: glass shards and broken window frames on limestone.
# exec after tp_lib.py, shapes.py and town.py (plank, brick_pts, _place); build_glass(v) makes
# `rough-glass-<v>` and its -hi.

LIME = ['#cfc6b4', '#ddd5c4', '#c2b8a4', '#d6cdb9']
GLASS = ['#a8d4dc', '#8cc2d0', '#b4dad6', '#9ccad4']
FRAME = ['#6a4a30', '#5a3e28', '#7a5436']
LEAD = '#4a4a4e'


def shard(bm, hi, size, seed, th=0.008):
    """A flat glass shard: a jagged 3-5 sided outline in the xy plane, th thick."""
    rnd = random.Random(seed)
    n = rnd.choice((3, 4, 4, 5))
    a0 = rnd.uniform(0, 6.28)
    pts = []
    for i in range(n):
        a = a0 + 2 * math.pi * i / n + rnd.uniform(-0.35, 0.35)
        r = size * rnd.uniform(0.55, 1.0) * (1.6 if i == 0 else 1.0)  # one long point
        pts.append((math.cos(a) * r, math.sin(a) * r))
    before = set(bm.faces)
    prism(bm, hi, pts, 'z', -th / 2, th / 2, bev=0.0015 if hi else 0.0, angle=30)
    return _new_faces(bm, before)


def glass_layout(v):
    rnd = random.Random(900 + v)
    R = math.radians
    P = []

    def at(a, r):
        return Vector((math.cos(a) * r, math.sin(a) * r, 0))

    def glass(c, size=None, upright=False, base=0.0):
        sd = rnd.randrange(10 ** 6)
        size = size or rnd.uniform(0.07, 0.11)
        ang = rnd.uniform(0, 6.28)
        roll = rnd.uniform(1.0, 1.35) if upright else rnd.uniform(-0.12, 0.12)
        pitch = rnd.uniform(-0.2, 0.2)
        c = Vector(c)

        def b(bm, hi, c=c, size=size, ang=ang, roll=roll, pitch=pitch, sd=sd):
            fs = shard(bm, hi, size, sd)
            _place(bm, fs, c, ang, roll, pitch, base - (size * 0.35 if upright else 0.0))
            return fs
        P.append((b, 'glass', rnd.choice(GLASS), 2))

    def lime(c, sx=None, slab=False, base=0.0):
        sd = rnd.randrange(10 ** 6)
        sx = sx or rnd.uniform(0.05, 0.1)
        s = (sx, sx * rnd.uniform(0.6, 0.9), sx * (rnd.uniform(0.22, 0.32) if slab else rnd.uniform(0.45, 0.65)))
        pts = brick_pts(rnd, s) if not slab else None
        c = Vector(c) + Vector((0, 0, base + s[2] * (0.9 if pts else 0.5)))
        tilt = (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2))

        def b(bm, hi, c=c, s=s, pts=pts, tilt=tilt, sd=sd):
            return rock(bm, hi, c, s, sd, n=14, sub_hi=2 if sx > 0.07 else 1, bev=0.1, crack=0.025, bump=0.025,
                        rot=rnd.uniform(0, 6), tilt=tilt, pts=pts)
        P.append((b, 'stone', rnd.choice(LIME), 2))

    def lath(c, ang, L, base=0.0, pitch=0.0, broken=1, W=0.058, T=0.04):
        sd = rnd.randrange(10 ** 6)

        def b(bm, hi, c=c, sd=sd):
            fs, ex = plank(bm, hi, L, W, T, sd, broken, 0)
            _place(bm, fs, c, ang, 0.0, pitch, base)
        P.append((b, 'wood', rnd.choice(FRAME), 0 if abs(math.cos(ang)) >= abs(math.sin(ang)) else 1))

    def frame_corner(c, ang, la, lb, base=0.0):
        """Two laths meeting at a right angle (a frame corner), with a shard still in the rebate."""
        d1 = Vector((math.cos(ang), math.sin(ang), 0))
        d2 = Vector((math.cos(ang + math.pi / 2), math.sin(ang + math.pi / 2), 0))
        c = Vector(c)
        lath(c + d1 * la / 2, ang, la, base)
        lath(c + d2 * lb / 2 + d1 * 0.029, ang + math.pi / 2, lb, base + 0.0005)
        # the muntin, snapped off short, and the panes still in the rebate
        lath(c + d1 * la * 0.55 + d2 * 0.09, ang + math.pi / 2, 0.15, base, broken=2, W=0.04, T=0.032)
        glass(c + d1 * 0.14 + d2 * 0.1 + Vector((0, 0, 0.02)), 0.085)
        glass(c + d1 * 0.3 + d2 * 0.1 + Vector((0, 0, 0.03)), 0.07, upright=True)

    def came(c, ang, n=3):
        """Lead came: a crumpled fragment of a diamond lattice, a quarrel of glass left in it."""
        c = Vector(c)
        for k, sk in enumerate((0.55, -0.55)):
            u = Vector((math.cos(ang + sk), math.sin(ang + sk), 0))
            w = Vector((-u.y, u.x, 0))
            for i in range(n):
                o = (i - (n - 1) / 2) * 0.085
                L = rnd.uniform(0.2, 0.27)
                lift = rnd.uniform(0.0, 0.05) if (i + k) % 2 else 0.0
                pts = [c + w * o + u * (L * (t / 3 - 0.5)) + Vector((0, 0, 0.006 + lift * max(0, t - 1) / 2)) for t in range(4)]

                def b(bm, hi, pts=pts):
                    return tube(bm, hi, pts, 0.009, 0.009, sides=(4, 8), k_hi=3, flat=0.45)
                P.append((b, 'iron', LEAD, 2))
        for i in range(3):
            q = c + Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), 0.012))
            glass(q, rnd.uniform(0.04, 0.055))

    if v == 1:
        # a heap of limestone slabs and blocks on one side, shards and a frame corner round the rest
        P.append('limestone heap')
        for i in range(4):
            lime(at(R(175 + i * 26), rnd.uniform(0.58, 0.68)), rnd.uniform(0.12, 0.16), slab=True, base=0.0)
        for i in range(8):
            lime(at(R(165 + rnd.uniform(0, 110)), rnd.uniform(0.55, 0.76)), rnd.uniform(0.05, 0.09), base=rnd.uniform(0, 0.035))
        P.append('frame corner')
        frame_corner(at(R(315), 0.68), R(315) + R(100), 0.46, 0.32)
        P.append('shards')
        for i in range(17):
            p, a = ring_pos(rnd, R(-30), R(160), 0.48, 0.76)
            glass(p, upright=rnd.random() < 0.3)
        P.append('chips')
        for i in range(6):
            p, a = ring_pos(rnd, R(170), R(280), 0.45, 0.78)
            lime(p, rnd.uniform(0.02, 0.035))
    elif v == 2:
        # a broken window lying along the rim: frame, a muntin, came and shards; limestone opposite
        c = at(R(140), 0.6)
        t = R(140) + R(90)
        d1 = Vector((math.cos(t), math.sin(t), 0))
        dr = Vector((math.cos(R(140)), math.sin(R(140)), 0))
        P.append('window frame')
        lath(c - dr * 0.13, t, 0.6, broken=1)
        lath(c + dr * 0.13 - d1 * 0.04, t, 0.5, broken=2)
        lath(c + d1 * 0.27, R(140), 0.32, broken=0)
        lath(c - d1 * 0.03, R(140), 0.28, base=0.004, broken=1, W=0.042, T=0.034)
        lath(c - d1 * 0.33 - dr * 0.02, R(140) + 0.5, 0.2, broken=2, pitch=0.1, base=0.01)
        P.append('window shards')
        for i in range(8):
            glass(c + d1 * rnd.uniform(-0.24, 0.22) + dr * rnd.uniform(-0.07, 0.07) + Vector((0, 0, 0.012)), rnd.uniform(0.075, 0.11),
                  upright=i % 4 == 3)
        P.append('lead came')
        came(at(R(60), 0.64), R(60) + 1.3)
        P.append('limestone')
        for i in range(6):
            lime(at(R(300 + rnd.uniform(-35, 35)), rnd.uniform(0.56, 0.74)), rnd.uniform(0.05, 0.1), slab=i < 2)
        P.append('loose shards')
        for i in range(12):
            p, a = ring_pos(rnd, R(190), R(300) if i < 7 else R(400), 0.48, 0.76)
            glass(p, upright=rnd.random() < 0.3)
        for i in range(5):
            p, a = ring_pos(rnd, R(200), R(290), 0.5, 0.76)
            lime(p, rnd.uniform(0.025, 0.045))
    else:
        # shards everywhere round the rim, a few stuck upright, limestone chips and a frame piece
        P.append('shards')
        for c0 in (R(30), R(150), R(290)):  # three drifts of shards
            for i in range(9):
                p, a = ring_pos(rnd, c0 - R(32), c0 + R(32), 0.5, 0.77)
                glass(p, rnd.uniform(0.065, 0.12), upright=rnd.random() < 0.3, base=0.004 * (i % 3))
        P.append('limestone')
        for i in range(4):
            lime(at(R(rnd.uniform(0, 360)), rnd.uniform(0.6, 0.74)), rnd.uniform(0.05, 0.08))
        for i in range(6):
            p, a = ring_pos(rnd, 0, 2 * math.pi, 0.5, 0.78)
            lime(p, rnd.uniform(0.02, 0.035))
        P.append('frame and came')
        lath(at(R(250), 0.64), R(250) + R(85), 0.38, broken=2, pitch=0.06)
        came(at(R(80), 0.64), R(80) + 1.6, 2)
    return P


def glass_steps(v):
    """The layout split at its step names: [(name, pieces)]."""
    out = []
    for it in glass_layout(v):
        if isinstance(it, str):
            out.append((it, []))
        else:
            out[-1][1].append(it)
    return out


def build_glass_step(v, i):
    """Builds step i of variant v as its own part `rough-glass-<v>-p<i>` (and -hi); returns the
    step name and the part objects."""
    name, pieces = glass_steps(v)[i]
    k = Kit(seed=1000 + v * 10 + i)
    for build, mat, col, gax in pieces:
        k.add(build, mat, col, gax)
    lo, hi = k.finish('rough-glass-%d-p%d' % (v, i), loc=((v - 2) * 2.2, 9.6, 0))
    return name, lo, hi


def join_glass(v):
    """Joins the step parts of variant v into `rough-glass-<v>` and its -hi."""
    parts = ['rough-glass-%d-p%d' % (v, i) for i in range(len(glass_steps(v)))]
    lo, hi = join_parts('rough-glass-%d' % v, parts)
    for o in (lo, hi):
        o.location = ((v - 2) * 2.2, 9.6, 0)
    for p in parts:
        for suf in ('', '-hi'):
            bpy.data.objects[p + suf].hide_set(True)
    return lo, hi
