# Trap sets, one per region: what reads at a glance as «a trap here» stands out to the hex rim
# (stakes, spikes, caltrops, glass teeth), so a figure on the hex never hides it; the snare itself
# sits in the middle on a patch of disturbed ground. exec after tp_lib.py and shapes.py (it loads
# glass.py and town.py for their shard, plank and _place). trap_layout(v): 1 forest/marsh, 2 cave
# and mine, 3 town and forge, 4 Glass Town; models trap-<set>.

exec(open(D + 'town.py', encoding='utf8').read())
exec(open(D + 'glass.py', encoding='utf8').read())

TRAP_SETS = ['forest', 'cave', 'town', 'glass']
IRON_T = ['#8a8279', '#7e776f', '#958c80']             # worn steel, light enough to read on dark ground
RUST_T = ['#9a5e38', '#a8683e', '#8c5432']
STAKE = ['#b09872', '#a48c66', '#bca47c']
TIP = '#eedfb8'                                    # fresh-cut stake points
SOIL = ['#4a3826', '#55402a', '#3e2f20']
DEADL = ['#7a5a32', '#8a6a3a', '#6a4a2a', '#9a743e', '#5e4a2c']
GRIT = ['#5a5652', '#4e4a46', '#66605a']
PIT = '#16120e'
DUST = ['#8a8070', '#7e7466']


def ground(bm, hi, R0, h, seed, z0=0.0):
    """A low dome of disturbed ground, R0 across with a wobbling rim (±12 %), h high in the
    middle; hi adds clods and dips."""
    before = set(bm.faces)
    na, nr = (14, 2) if not hi else (72, 14)
    off = Vector((seed * 2.3, seed * 0.7, 1.5))
    centre = bm.verts.new((0, 0, h + z0))
    rings = []
    for j in range(1, nr + 1):
        t = j / nr
        ring = []
        for i in range(na):
            a = 2 * math.pi * i / na
            q = Vector((math.cos(a), math.sin(a), 0)) * 1.6 + off
            rr = R0 * (1 + 0.12 * mnoise.noise(q) + 0.05 * mnoise.noise(q * 3)) * t
            z = h * (1 - t * t) - 0.003 + z0
            p = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
            if hi and j < nr:
                k = 1 - t * t
                p.z += k * (0.008 * mnoise.fractal(p * 12 + off, 0.6, 2.0, 4) + 0.002 * mnoise.noise(p * 70 + off))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(na):
        bm.faces.new((centre, rings[0][i], rings[0][(i + 1) % na]))
    for a, b in zip(rings, rings[1:]):
        for i in range(na):
            k = (i + 1) % na
            bm.faces.new((a[i], b[i], b[k], a[k]))
    return _new_faces(bm, before)


def tooth(bm, hi, w, h, seed, th=0.012):
    """A glass tooth: a tall jagged blade in the xy plane, its point up +y, th thick."""
    rnd = random.Random(seed)
    pts = [(-w, -0.03), (w * rnd.uniform(0.7, 1.0), -0.03), (w * rnd.uniform(0.35, 0.6), h * rnd.uniform(0.45, 0.6)),
           (w * rnd.uniform(-0.05, 0.25), h), (-w * rnd.uniform(0.3, 0.55), h * rnd.uniform(0.35, 0.55))]
    before = set(bm.faces)
    prism(bm, hi, pts, 'z', -th / 2, th / 2, bev=0.002 if hi else 0.0, angle=30)
    return _new_faces(bm, before)


def trap_layout(v):
    rnd = random.Random(1100 + v)
    R = math.radians
    P = []
    step = P.append

    def at(a, r, z=0.0):
        return Vector((math.cos(a) * r, math.sin(a) * r, z))

    def patch(R0, h, cols, mat='mud'):
        # The ground under a trap is the board's own ragged patch (boardTiles overlay:trap), not
        # part of the model: a modelled disc reads as a plate. Its draws are kept so the rest of
        # the layout stays the same.
        rnd.randrange(10 ** 6)
        rnd.choice(cols)

    def stake(a, r, L, lean, rr=0.046):
        # a sharpened stake leaning out from the trap, its cut point pale
        base = at(a, r, -0.01)
        d = Vector((math.cos(a) * math.sin(lean), math.sin(a) * math.sin(lean), math.cos(lean)))
        mid = base + d * L * 0.78
        top = base + d * L
        sd = rnd.randrange(10 ** 6)
        P.append((lambda bm, hi, p=[base, base + d * L * 0.4, mid], sd=sd: tube(bm, hi, p, rr, rr * 0.9, sides=(5, 10), k_hi=4, bark=0.12, seed=sd, cap1=False), 'wood', rnd.choice(STAKE), 2))
        P.append((lambda bm, hi, p=[mid, top], sd=sd: tube(bm, hi, p, rr * 0.9, 0.002, sides=(5, 10), k_hi=3, seed=sd + 1, cap0=False), 'wood', TIP, 2))

    def spike(c, L, lean_a, lean, r0=0.016, col=None, mat='iron'):
        d = Vector((math.cos(lean_a) * math.sin(lean), math.sin(lean_a) * math.sin(lean), math.cos(lean)))
        p = [c, c + d * L * 0.5, c + d * L]
        P.append((lambda bm, hi, p=p: tube(bm, hi, p, r0, 0.0015, sides=(4, 8), k_hi=3, seed=7), mat, col or rnd.choice(IRON_T), 2))

    def leaf(c, la, ll):
        def lf(bm, hi, c=c, la=la, ll=ll):
            d = Vector((math.cos(la), math.sin(la), 0.08))
            return blade(bm, hi, c, d, ll, ll * 0.34, -0.04, segs=(3, 6), fold=0.4, twist=0.35, leaf=True)
        P.append((lf, 'leaf', rnd.choice(DEADL), 2))

    def rock_at(c, s, cols, sub=1):
        sd = rnd.randrange(10 ** 6)
        rot = rnd.uniform(0, 6)
        c = Vector(c) + Vector((0, 0, s[2] * 0.5))
        P.append((lambda bm, hi, c=c, s=s, sd=sd, rot=rot: rock(bm, hi, c, s, sd, n=12, sub_hi=sub, rot=rot, bump=0.03, crack=0.03), 'stone', rnd.choice(cols), 2))

    if v == 1:
        # forest and marsh: an open bear trap half under leaves on dug soil, chained to a stake,
        # a ring of sharpened stakes leaning out round it
        patch(0.6, 0.022, SOIL)
        step('jaws')
        Rj, op = 0.29, R(36)
        for side in (1, -1):
            arc = [Vector((Rj * math.cos(t), side * Rj * math.sin(t) * math.cos(op), 0.02 + Rj * math.sin(t) * math.sin(op)))
                   for t in [math.pi * i / 10 for i in range(11)]]
            P.append((lambda bm, hi, p=arc: tube(bm, hi, p, 0.027, 0.027, sides=(5, 10), k_hi=3, flat=0.6, seed=3), 'iron', rnd.choice(IRON_T), 2))
        P.append((lambda bm, hi: tube(bm, hi, [Vector((-0.34, 0, 0.012)), Vector((0, 0, 0.012)), Vector((0.34, 0, 0.012))], 0.018, 0.018, sides=(5, 10), k_hi=3, flat=0.5, seed=4), 'iron', IRON_T[1], 0))
        sd = rnd.randrange(10 ** 6)
        P.append((lambda bm, hi, sd=sd: rock(bm, hi, Vector((0, 0, 0.018)), (0.075, 0.075, 0.012), sd, n=14, sub_hi=1, bev=0.3, crack=0.0, bump=0.01), 'iron', RUST_T[0], 2))
        step('teeth')
        for side in (1, -1):
            n = Vector((0, -side * math.sin(op), math.cos(op)))
            for i in range(1, 10):
                t = math.pi * i / 10
                p = Vector((Rj * math.cos(t), side * Rj * math.sin(t) * math.cos(op), 0.02 + Rj * math.sin(t) * math.sin(op)))
                inward = Vector((0, -p.y, -(p.z - 0.02))).normalized()
                d = (n * -side * 0.0 + inward * 0.55 + Vector((0, -side, 0)) * 0.6).normalized()
                P.append((lambda bm, hi, p=p, d=d: tube(bm, hi, [p, p + d * 0.03, p + d * 0.065], 0.013, 0.001, sides=(4, 6), k_hi=2, seed=5), 'iron', IRON_T[2], 2))
        step('springs')
        for sx in (1, -1):
            pts = [Vector((sx * 0.27, 0, 0.02)), Vector((sx * 0.4, 0.02, 0.035)), Vector((sx * 0.52, 0.0, 0.03)), Vector((sx * 0.58, -0.03, 0.018))]
            P.append((lambda bm, hi, p=pts: tube(bm, hi, p, 0.017, 0.013, sides=(5, 10), k_hi=4, flat=0.4, seed=6), 'iron', rnd.choice(RUST_T), 0))
        step('chain')
        ca, cr = R(18), 0.84
        a0 = Vector((0.58, -0.03, 0.012))
        b0 = at(ca, cr, 0.02)
        for i in range(9):
            t0, t1 = i / 9, (i + 0.9) / 9
            p0 = a0.lerp(b0, t0)
            p1 = a0.lerp(b0, t1)
            p0.z = p1.z = 0.012 + 0.006 * (i % 2)
            P.append((lambda bm, hi, p=[p0, p1], fl=(0.35 if i % 2 else 1.0): tube(bm, hi, p, 0.011, 0.011, sides=(4, 8), k_hi=2, flat=fl, seed=8), 'iron', rnd.choice(RUST_T), 2))
        stake(ca, cr + 0.02, 0.16, R(12), 0.022)
        step('stakes')
        for a in (75, 128, 182, 236, 292, 338):
            stake(R(a + rnd.uniform(-10, 10)), rnd.uniform(0.7, 0.84), rnd.uniform(0.25, 0.27), R(rnd.uniform(20, 26)))
        step('leaves')
        for i in range(18):
            p, a = ring_pos(rnd, 0, 6.28, 0.12, 0.62)
            p.z = 0.004 + rnd.uniform(0, 0.012)
            leaf(p, rnd.uniform(0, 6.28), rnd.uniform(0.07, 0.1))
    elif v == 2:
        # cave and mine: a spiked pit with a rubble lip, rotten boards half over it, stakes outside
        patch(0.66, 0.012, GRIT, 'stone')
        step('pit')
        P.append((lambda bm, hi: ground(bm, hi, 0.34, 0.002, 41, 0.004), 'mud', PIT, 2))
        step('lip')
        for i in range(13):
            a = R(i * 360 / 13 + rnd.uniform(-8, 8))
            sx = rnd.uniform(0.05, 0.085)
            rock_at(at(a, rnd.uniform(0.36, 0.44)), (sx, sx * rnd.uniform(0.6, 0.9), sx * rnd.uniform(0.5, 0.7)), GRIT + DUST)
        step('spikes')
        for i in range(12):
            c = at(R(rnd.uniform(0, 360)), rnd.uniform(0.0, 0.27), 0.0)
            spike(c, rnd.uniform(0.15, 0.21), rnd.uniform(0, 6.28), R(rnd.uniform(0, 14)), 0.027, mat='wood' if i % 3 == 0 else 'iron', col=STAKE[0] if i % 3 == 0 else None)
        step('boards')
        for (a, r, ang, L, pitch) in ((200, 0.22, 100, 0.5, 0.06), (250, 0.3, 160, 0.34, -0.1)):
            sd = rnd.randrange(10 ** 6)

            def b(bm, hi, c=at(R(a), r), ang=R(ang), L=L, pitch=pitch, sd=sd):
                fs, ex = plank(bm, hi, L, 0.1, 0.028, sd, 2, 1)
                _place(bm, fs, c, ang, 0.0, pitch, 0.02)
                return [(ex, 'iron', NAIL)] if ex else None
            P.append((b, 'wood', rnd.choice(PLANK), _gax2(R(ang))))
        step('stakes')
        for a in (40, 130, 300):
            stake(R(a + rnd.uniform(-10, 10)), rnd.uniform(0.72, 0.84), rnd.uniform(0.2, 0.24), R(rnd.uniform(20, 30)))
    elif v == 3:
        # town and forge: a sprung iron plate with toothed bars, caltrops strewn to the rim,
        # a trip wire on two pegs
        patch(0.62, 0.012, DUST, 'stone')
        step('plate')
        P.append((lambda bm, hi: rock(bm, hi, Vector((0, 0, 0.012)), (0.2, 0.2, 0.014), 91, sub_hi=1, bev=0.08, crack=0.0, bump=0.008,
                                      pts=[Vector((x, y, z)) for x in (-0.2, 0.2) for y in (-0.2, 0.2) for z in (-0.012, 0.012)]), 'iron', IRON_T[0], 2))
        for sy in (1, -1):
            P.append((lambda bm, hi, sy=sy: tube(bm, hi, [Vector((-0.24, sy * 0.23, 0.02)), Vector((0.24, sy * 0.23, 0.02))], 0.018, 0.018, sides=(4, 8), k_hi=2, flat=0.6, seed=9), 'iron', rnd.choice(RUST_T), 0))
        step('teeth')
        for sy in (1, -1):
            for i in range(7):
                x = -0.2 + i * 0.4 / 6
                spike(Vector((x, sy * 0.23, 0.03)), 0.1, math.atan2(-sy, 0), R(30), 0.015)
        step('caltrops')
        for i in range(14):
            p, a = ring_pos(rnd, 0, 6.28, 0.42, 0.92)
            for k, d in enumerate(((0, 0, 1), (0.94, 0, -0.33), (-0.47, 0.82, -0.33), (-0.47, -0.82, -0.33))):
                d = Matrix.Rotation(a, 3, 'Z') @ Vector(d)
                c = p + Vector((0, 0, 0.028))
                P.append((lambda bm, hi, c=c, d=d: tube(bm, hi, [c, c + d * 0.08], 0.014, 0.0015, sides=(3, 6), k_hi=3, seed=10), 'iron', IRON_T[k % 3], 2))
        step('trip wire')
        pa, pb = at(R(115), 0.84), at(R(295), 0.84)
        for p in (pa, pb):
            P.append((lambda bm, hi, p=p: tube(bm, hi, [p - Vector((0, 0, 0.01)), p + Vector((0, 0, 0.05)), p + Vector((0, 0, 0.1))], 0.016, 0.012, sides=(5, 8), k_hi=2, seed=11), 'wood', STAKE[1], 2))
        P.append((lambda bm, hi: tube(bm, hi, [pa + Vector((0, 0, 0.085)), (pa + pb) * 0.5 + Vector((0, 0, 0.07)), pb + Vector((0, 0, 0.085))], 0.0045, 0.0045, sides=(4, 6), k_hi=3, seed=12), 'rope', '#a89a7a', 2))
    else:
        # Glass Town: glass teeth jutting from a cracked limestone slab, leaning in round a
        # fallen pane
        patch(0.64, 0.016, LIME, 'stone')
        step('teeth')
        for i in range(16):
            a = R(i * 22.5 + rnd.uniform(-7, 7))
            c = at(a, rnd.uniform(0.52, 0.8))
            w, h = rnd.uniform(0.05, 0.07), rnd.uniform(0.15, 0.22)
            sd = rnd.randrange(10 ** 6)
            roll = R(rnd.uniform(72, 84))

            def g(bm, hi, c=c, a=a, w=w, h=h, sd=sd, roll=roll):
                fs = tooth(bm, hi, w, h, sd)
                # stood up facing the centre, leaning in a little, its foot sunk in the slab
                _place(bm, fs, c, a + math.pi / 2, roll, 0.0, -0.01)
                return fs
            P.append((g, 'glass', rnd.choice(GLASS), 2))
        step('pane')
        for i in range(5):
            c = at(R(rnd.uniform(0, 360)), rnd.uniform(0.05, 0.3), 0.02)
            size = rnd.uniform(0.06, 0.09)
            sd = rnd.randrange(10 ** 6)
            turn = (rnd.uniform(0, 6.28), rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1))

            def g(bm, hi, c=c, size=size, sd=sd, turn=turn):
                fs = shard(bm, hi, size, sd)
                _place(bm, fs, c, turn[0], turn[1], turn[2], 0.003)
                return fs
            P.append((g, 'glass', rnd.choice(GLASS), 2))
        step('inner teeth')
        for i in range(7):
            a = R(i * 51 + rnd.uniform(-12, 12))
            c = at(a, rnd.uniform(0.3, 0.4))
            w, h = rnd.uniform(0.035, 0.05), rnd.uniform(0.1, 0.15)
            sd = rnd.randrange(10 ** 6)
            roll = R(rnd.uniform(70, 84))

            def g(bm, hi, c=c, a=a, w=w, h=h, sd=sd, roll=roll):
                fs = tooth(bm, hi, w, h, sd, 0.01)
                _place(bm, fs, c, a + math.pi / 2, roll, 0.0, -0.01)
                return fs
            P.append((g, 'glass', rnd.choice(GLASS), 2))
        step('frame')
        # the pane's broken frame: three bars of a window lying askew, one snapped short
        fa = R(rnd.uniform(0, 360))
        corners = [Vector((-0.2, -0.16, 0)), Vector((0.2, -0.16, 0)), Vector((0.2, 0.16, 0)), Vector((-0.06, 0.16, 0))]
        corners = [Matrix.Rotation(fa, 3, 'Z') @ q + Vector((0, 0, 0.014)) for q in corners]
        for q0, q1 in zip(corners, corners[1:]):
            P.append((lambda bm, hi, p=[q0, (q0 + q1) * 0.5, q1]: tube(bm, hi, p, 0.018, 0.018, sides=(4, 8), k_hi=3, flat=0.6, bark=0.08, seed=13), 'wood', rnd.choice(FRAME), 2))
        step('chips')
        for i in range(14):
            p, a = ring_pos(rnd, 0, 6.28, 0.3, 0.8)
            sx = rnd.uniform(0.03, 0.05)
            rock_at(p, (sx, sx * 0.8, sx * 0.55), LIME)
        step('blocks')
        for a in (60, 200, 320):
            sx = rnd.uniform(0.06, 0.08)
            rock_at(at(R(a + rnd.uniform(-15, 15)), rnd.uniform(0.84, 0.92)), (sx, sx * 0.75, sx * 0.6), LIME)
    return P
