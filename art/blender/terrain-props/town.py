# Town and forge difficult-terrain clumps: broken planks, roof tiles, brick and stone rubble, scrap.
# exec after tp_lib.py and shapes.py; build_town(v) makes `rough-town-<v>` and its -hi.
# plank/shell/brick are reused by glass.py (window frames, limestone).

PLANK = ['#7a6248', '#6a5440', '#8a7458', '#5e4c3a']
BEAM = ['#4a3c30', '#3e332a']
TILE = ['#9a5a3a', '#8a4e34', '#a8664a', '#7e4a32']
BRICK = ['#8a4a36', '#7a4434', '#965840']
RUBBLE = ['#9a948a', '#8a847a', '#a69e90']
NAIL = '#3a3632'
IRON = ['#4a4440', '#3e3a36']


def _gax2(ang):
    return 0 if abs(math.cos(ang)) >= abs(math.sin(ang)) else 1


def _place(bm, faces, c, ang, roll=0.0, pitch=0.0, base=None):
    """Turns a piece built round the origin (long axis x) and sets it at c; base: lift so its
    lowest point sits at that height."""
    m = Matrix.Translation(Vector(c)) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'Y') @ Matrix.Rotation(roll, 4, 'X')
    move(bm, faces, m)
    if base is not None:
        vs = {v for f in faces for v in f.verts}
        dz = base - min(v.co.z for v in vs)
        for v in vs:
            v.co.z += dz


def plank(bm, hi, L, W, T, seed, broken=1, nails=2):
    """A board along x (L x W x T), its +x end (and -x if broken=2) snapped in splinters; hi has
    nail heads near the ends. Returns (faces, extra) for Kit."""
    rnd = random.Random(seed)
    x0, x1 = -L / 2, L / 2

    def jag(x, sgn):
        k = 4
        out = []
        for i in range(k + 1):
            y = -W / 2 + W * i / k
            d = rnd.uniform(0.0, 0.05) if 0 < i < k else rnd.uniform(0, 0.02)
            out.append((x + sgn * (d if i % 2 else -d * 0.5), y))
        return out
    right = jag(x1, 1) if broken >= 1 else [(x1, -W / 2), (x1, W / 2)]
    left = jag(x0, -1)[::-1] if broken >= 2 else [(x0, W / 2), (x0, -W / 2)]
    pts = right + left
    before = set(bm.faces)
    prism(bm, hi, pts, 'z', -T / 2, T / 2, bev=min(0.006, T * 0.25))
    faces = _new_faces(bm, before)
    extra = []
    if hi and nails:
        for sx in ((x0 + 0.035, x1 - 0.06) if nails >= 2 else (x0 + 0.035,)):
            for sy in (-W * 0.25, W * 0.25):
                b2 = set(bm.faces)
                dome(bm, True, (sx + rnd.uniform(-0.006, 0.006), sy, T / 2 - 0.0005), 0.0075, 0.004, n=(0, 0, 1), seg=6)
                extra += _new_faces(bm, b2)
        faces = _new_faces(bm, before)
    return faces, extra


def shell(bm, hi, L, r, arc, th, seed):
    """A curved roof tile (a slice of tube) along x, edges on z = 0, crown up."""
    rnd = random.Random(seed)
    nu, nv = (1, 4) if not hi else (6, 14)
    before = set(bm.faces)
    z0 = r * math.cos(arc / 2)

    def P(u, v, rr):
        x = -L / 2 + L * u
        ph = -arc / 2 + arc * v
        w = 0.0
        if hi:
            w = 0.0012 * mnoise.noise(Vector((x * 40 + seed, ph * 6, rr * 10)))
        return Vector((x, (rr + w) * math.sin(ph), (rr + w) * math.cos(ph) - z0))
    outer = [[bm.verts.new(P(i / nu, j / nv, r)) for j in range(nv + 1)] for i in range(nu + 1)]
    inner = [[bm.verts.new(P(i / nu, j / nv, r - th)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]))
            bm.faces.new((inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j]))
    for i in range(nu):  # long edges
        bm.faces.new((outer[i][0], inner[i][0], inner[i + 1][0], outer[i + 1][0]))
        bm.faces.new((outer[i + 1][nv], inner[i + 1][nv], inner[i][nv], outer[i][nv]))
    for j in range(nv):  # ends
        bm.faces.new((outer[0][j + 1], inner[0][j + 1], inner[0][j], outer[0][j]))
        bm.faces.new((outer[nu][j], inner[nu][j], inner[nu][j + 1], outer[nu][j + 1]))
    f = _new_faces(bm, before)
    bmesh.ops.recalc_face_normals(bm, faces=f)
    return f


def brick_pts(rnd, s):
    """Corners of a brick (half-sizes s) with one or two knocked off."""
    sx, sy, sz = s
    pts = []
    cut = set(rnd.sample(range(8), rnd.choice((1, 2))))
    for i in range(8):
        c = Vector(((1 if i & 1 else -1) * sx, (1 if i & 2 else -1) * sy, (1 if i & 4 else -1) * sz))
        if i in cut:
            k = rnd.uniform(0.3, 0.6)
            for ax in range(3):
                q = c.copy()
                q[ax] *= 1 - k * (2 if ax == 0 else 1.2)
                pts.append(q)
        else:
            pts.append(c + Vector((rnd.uniform(-1, 1) * 0.003, rnd.uniform(-1, 1) * 0.003, 0)))
    return pts


def town_layout(v):
    rnd = random.Random(700 + v)
    R = math.radians
    P = []

    def board(c, ang, L, W=0.1, T=0.03, broken=1, roll=0.0, pitch=0.0, base=0.0, cols=PLANK, nails=2):
        sd = rnd.randrange(10 ** 6)

        def b(bm, hi):
            fs, ex = plank(bm, hi, L, W, T, sd, broken, nails)
            _place(bm, fs, c, ang, roll, pitch, base)
            return [(ex, 'iron', NAIL)] if ex else None
        P.append((b, 'wood', rnd.choice(cols), _gax2(ang)))

    def tile(c, ang, up=True, base=0.0, L=None):
        sd = rnd.randrange(10 ** 6)
        L = L or rnd.uniform(0.15, 0.22)
        roll = 0.0 if up else math.pi
        tl = rnd.uniform(-0.25, 0.25)

        def t(bm, hi):
            fs = shell(bm, hi, L, 0.075, R(150), 0.015, sd)
            _place(bm, fs, c, ang, roll + tl, rnd.uniform(-0.15, 0.15), base)
        P.append((t, 'clay', rnd.choice(TILE), 2))

    def brick(c, ang, base=0.0, cols=BRICK, s=None):
        sd = rnd.randrange(10 ** 6)
        s = s or (rnd.uniform(0.06, 0.08), rnd.uniform(0.032, 0.04), rnd.uniform(0.022, 0.027))
        pts = brick_pts(rnd, s)
        tilt = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3))
        c = Vector(c) + Vector((0, 0, base + s[2]))

        def b(bm, hi, c=c, s=s, pts=pts, tilt=tilt):
            return rock(bm, hi, c, s, sd, sub_hi=1, bev=0.15, crack=0.0, bump=0.02, rot=ang, tilt=tilt, pts=pts)
        P.append((b, 'clay', rnd.choice(cols), 2))

    def stone(c, sz=None, base=0.0):
        sd = rnd.randrange(10 ** 6)
        sx = sz or rnd.uniform(0.04, 0.09)
        s = (sx, sx * rnd.uniform(0.6, 0.9), sx * rnd.uniform(0.45, 0.7))
        c = Vector(c) + Vector((0, 0, base + s[2] * 0.5))

        def b(bm, hi, c=c, s=s):
            return rock(bm, hi, c, s, sd, n=12, sub_hi=1, rot=rnd.uniform(0, 6), bump=0.03, crack=0.03)
        P.append((b, 'stone', rnd.choice(RUBBLE), 2))

    def strap(pts):
        pts = [Vector(p) for p in pts]

        def b(bm, hi, pts=pts):
            return tube(bm, hi, pts, 0.016, 0.014, sides=(4, 10), k_hi=4, flat=0.22, bark=0.06, seed=3)
        P.append((b, 'iron', rnd.choice(IRON), 2))

    def at(a, r):
        return Vector((math.cos(a) * r, math.sin(a) * r, 0))

    def scatter(a0, a1, n, fn, r0=0.5, r1=0.78):
        for i in range(n):
            p, a = ring_pos(rnd, a0, a1, r0, r1)
            fn(p, rnd.uniform(0, 6.28))

    if v == 1:
        # two broken boards crossed over a heap of brick and tile, loose tiles round the rim
        board(at(R(200), 0.6), R(200) + R(80), 0.5, broken=1, pitch=0.05)
        board(at(R(225), 0.58), R(225) + R(115), 0.44, W=0.09, broken=2, pitch=-0.16, base=0.025)
        for i in range(9):
            brick(at(R(160 + i * 11), rnd.uniform(0.58, 0.74)), rnd.uniform(0, 6), base=0.03 * (i % 3 == 1))
        for i in range(8):
            tile(at(R(250 + i * 10), rnd.uniform(0.56, 0.74)), rnd.uniform(0, 6), up=rnd.random() < 0.6)
        scatter(R(20), R(130), 7, lambda p, a: tile(p, a, rnd.random() < 0.5))
        scatter(R(-40), R(140), 6, lambda p, a: stone(p))
        scatter(R(160), R(300), 5, lambda p, a: stone(p, rnd.uniform(0.02, 0.035)))
    elif v == 2:
        # a rubble heap (stone, brick, mortar lumps) one side, planks and a bent iron band the other
        for i in range(9):
            stone(at(R(100 + rnd.uniform(-30, 30)), rnd.uniform(0.56, 0.76)), rnd.uniform(0.045, 0.08))
        for i in range(6):
            brick(at(R(100 + rnd.uniform(-35, 35)), rnd.uniform(0.55, 0.76)), rnd.uniform(0, 6), base=rnd.uniform(0.0, 0.05))
        for i in range(5):
            stone(at(R(100 + rnd.uniform(-20, 20)), rnd.uniform(0.6, 0.7)), rnd.uniform(0.03, 0.05), base=0.05)
        board(at(R(280), 0.6), R(280) + R(95), 0.46, broken=1)
        board(at(R(300), 0.62), R(300) + R(70), 0.36, W=0.065, broken=2, pitch=0.12, base=0.018)
        board(at(R(240), 0.66), R(240) + R(60), 0.28, W=0.07, broken=1, nails=1)
        strap([at(R(320), 0.66) + Vector((0, 0, 0.004)), at(R(335), 0.62) + Vector((0, 0, 0.03)), at(R(352), 0.6) + Vector((0, 0, 0.012)), at(R(5), 0.64) + Vector((0, 0, 0.004))])
        scatter(R(180), R(230), 5, lambda p, a: tile(p, a, rnd.random() < 0.5))
        scatter(R(20), R(60), 4, lambda p, a: brick(p, a))
    else:
        # a slid roof: a charred beam end, tiles stacked and sliding off it, nails, tiles all round
        board(at(R(150), 0.62), R(150) + R(90), 0.52, W=0.1, T=0.09, broken=2, cols=BEAM, nails=0)
        for i in range(5):
            tile(at(R(135 + i * 7), 0.62) + Vector((0, 0, 0)), R(150) + rnd.uniform(-0.3, 0.3), up=True, base=0.09 + i * 0.012, L=0.15)
        for i in range(8):
            tile(at(R(175 + i * 11), rnd.uniform(0.56, 0.75)), rnd.uniform(0, 6), up=rnd.random() < 0.55)
        for i in range(5):
            tile(at(R(85 + i * 10), rnd.uniform(0.58, 0.74)), rnd.uniform(0, 6), up=rnd.random() < 0.55)
        board(at(R(300), 0.62), R(300) + R(85), 0.4, broken=1, pitch=0.04)
        scatter(R(260), R(360), 4, lambda p, a: brick(p, a))
        scatter(R(0), R(80), 5, lambda p, a: stone(p, rnd.uniform(0.025, 0.045)))
    return P


def build_town(v):
    name = 'rough-town-%d' % v
    k = Kit(seed=800 + v)
    for build, mat, col, gax in town_layout(v):
        k.add(build, mat, col, gax)
    lo, hi = k.finish(name, loc=((v - 2) * 2.2, 7.2, 0))
    return lo, hi
