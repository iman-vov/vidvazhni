# Forest difficult-terrain clumps: windfall boughs, piled dry sticks, brambles, dead leaves.
# exec after tp_lib.py and shapes.py; build_forest(v) makes `rough-forest-<v>` and its -hi.
# Sizes are for the board camera: thin things vanish there, so canes and twigs are thicker
# than life and leaves larger.

# Pass 2: bleached silver-grey deadwood and green brambles, so a clump stands out from the
# brown-orange leaf litter of the forest floor (pass 1 was brown on brown and vanished in game).
BARK = ['#9c9282', '#a89e8c', '#8e8474', '#b3a894']
DRY = ['#b8ad98', '#a99f8a', '#c2b7a0']   # bleached dry sticks
RAW = '#dccaa0'                          # broken ends
CANE = ['#8a3a30', '#7a3430']             # bramble canes, red-purple
LEAF = ['#4f7a2a', '#5e8a30', '#6e9438', '#466e28']
DEAD = ['#7a5a32', '#8a6a3a', '#6a4a2a', '#9a743e', '#5e4a2c']


def _gax(d):
    d = [abs(x) for x in d]
    return d.index(max(d))


def _clampr(p, rmax=0.79):
    r = math.hypot(p.x, p.y)
    if r > rmax:
        p.x *= rmax / r
        p.y *= rmax / r
    return p


def _branch_pieces(rnd, path, r0, r1, bark_cols, twigs, seed):
    """A lying bough along path with forked twigs; returns piece tuples."""
    out = []
    pts = [Vector(p) for p in path]
    col = rnd.choice(bark_cols)
    gax = _gax(pts[-1] - pts[0])

    def br(bm, hi, pts=pts, r0=r0, r1=r1, seed=seed):
        fs = tube(bm, hi, pts, r0, r1, sides=(7, 16), k_hi=6, bark=0.3, seed=seed)
        caps = [f for f in fs if f.is_valid and len(f.verts) > 4]
        return [(caps, 'wood', RAW)]
    out.append((br, 'wood', col, gax))
    L = len(pts)
    for t in range(twigs):
        i = rnd.uniform(0.15, 0.92) * (L - 1)
        j = int(i)
        p = pts[j].lerp(pts[min(j + 1, L - 1)], i - j)
        along = (pts[min(j + 1, L - 1)] - pts[j]).normalized()
        rr = r0 + (r1 - r0) * (i / (L - 1))
        side = along.cross(Vector((0, 0, 1))).normalized() * rnd.choice((-1, 1))
        d = (along * rnd.uniform(0.5, 1.1) + side * rnd.uniform(0.5, 1.0) + Vector((0, 0, rnd.uniform(0.1, 0.7)))).normalized()
        ln = rnd.uniform(0.16, 0.28)
        a = p + side * rr * 0.6 + Vector((0, 0, rr * 0.3))
        m = _clampr(a + d * ln * 0.5 + Vector((0, 0, rnd.uniform(-0.01, 0.02))))
        b = _clampr(a + d * ln + side * rnd.uniform(-0.04, 0.04))
        b.z = max(0.01, min(b.z, 0.2))
        m.z = max(0.012, min(m.z, 0.19))
        tr0 = max(0.016, rr * rnd.uniform(0.4, 0.55))
        sd = seed * 31 + t

        def tw(bm, hi, a=a, m=m, b=b, tr0=tr0, sd=sd):
            return tube(bm, hi, [a, m, b], tr0, 0.003, sides=(5, 10), k_hi=4, bark=0.2, seed=sd, cap0=False)
        out.append((tw, 'wood', rnd.choice(bark_cols), _gax(b - a)))
        if rnd.random() < 0.7:
            d2 = (d + side * rnd.uniform(-0.8, 0.8) + Vector((0, 0, rnd.uniform(-0.1, 0.3)))).normalized()
            c2 = _clampr(m + d2 * ln * rnd.uniform(0.45, 0.65))
            c2.z = max(0.012, min(c2.z, 0.2))

            def tw2(bm, hi, m=m, c2=c2, tr0=tr0, sd=sd):
                return tube(bm, hi, [m, m.lerp(c2, 0.5), c2], tr0 * 0.6, 0.002, sides=(4, 8), k_hi=3, bark=0.12, seed=sd + 5, cap0=False)
            out.append((tw2, 'wood', rnd.choice(bark_cols), _gax(c2 - m)))
    return out


def _stick(rnd, c, ang, ln, r, seed, cols, lift=0.0):
    d = Vector((math.cos(ang), math.sin(ang), 0))
    a = _clampr(Vector(c) - d * ln / 2) + Vector((0, 0, r))
    b = _clampr(Vector(c) + d * ln / 2) + Vector((0, 0, r + lift))
    m = a.lerp(b, 0.5) + d.cross(Vector((0, 0, 1))) * rnd.uniform(-0.03, 0.03)

    def st(bm, hi, a=a, m=m, b=b, r=r, seed=seed):
        fs = tube(bm, hi, [a, m, b], r, r * 0.75, sides=(6, 12), k_hi=4, bark=0.22, seed=seed)
        caps = [f for f in fs if f.is_valid and len(f.verts) > 4]
        return [(caps, 'wood', RAW)]
    return (st, 'wood', rnd.choice(cols), _gax(b - a))


def _pile(rnd, c, ang, n, seed):
    """A heap of dry sticks thrown crosswise round c (each layer a little higher)."""
    out = []
    for i in range(n):
        off = Vector((rnd.uniform(-0.07, 0.07), rnd.uniform(-0.07, 0.07), 0))
        a = ang + rnd.uniform(-0.9, 0.9) + (math.pi / 2 if i % 2 else 0)
        r = rnd.uniform(0.018, 0.026)
        z = 0.0 if i < 3 else r * 1.6 * ((i - 1) // 2)
        out.append(_stick(rnd, Vector(c) + off + Vector((0, 0, z)), a, rnd.uniform(0.22, 0.34), r, seed + i,
                          DRY + BARK, lift=rnd.uniform(-0.005, 0.03)))
    return out


def _bramble(rnd, c, ang, n, seed, reach=0.32):
    """Arching bramble canes from a root at c, leaning toward ang, with thorns (hi) and leaves."""
    out = []
    root = Vector(c)
    for i in range(n):
        a = ang + rnd.uniform(-0.9, 0.9)
        d = Vector((math.cos(a), math.sin(a), 0))
        ln = reach * rnd.uniform(0.75, 1.1)
        top = rnd.uniform(0.14, 0.2)
        pts = [root.copy(), root + d * ln * 0.28 + Vector((0, 0, top * 0.85)),
               root + d * ln * 0.58 + Vector((0, 0, top)), root + d * ln * 0.92 + Vector((0, 0, top * 0.4)),
               root + d * ln * 1.06 + Vector((0, 0, 0.008))]
        side = d.cross(Vector((0, 0, 1)))
        pts = [_clampr(p + side * rnd.uniform(-0.025, 0.025)) for p in pts]
        sd = seed * 17 + i

        def cane(bm, hi, pts=pts, sd=sd):
            fs = tube(bm, hi, pts, 0.015, 0.007, sides=(5, 10), k_hi=5, bark=0.05, seed=sd, cap0=False)
            if hi:
                rr = random.Random(sd)
                pp = _resample(pts, 5)
                for k in range(2, len(pp) - 2):
                    t = (pp[k + 1] - pp[k - 1]).normalized()
                    for _ in range(2):
                        o = t.orthogonal().normalized()
                        o.rotate(Matrix.Rotation(rr.uniform(0, 6.28), 3, t))
                        base = pp[k] + o * 0.0075
                        tip = base + (o * 0.9 - t * 0.5).normalized() * 0.011
                        w = o.cross(t)
                        tri = [bm.verts.new(base + w * 0.0028), bm.verts.new(base - w * 0.0028), bm.verts.new(base + t * 0.003)]
                        tv = bm.verts.new(tip)
                        for q in range(3):
                            bm.faces.new((tri[q], tri[(q + 1) % 3], tv))
            return fs
        out.append((cane, 'wood', rnd.choice(CANE), _gax(pts[-1] - pts[0])))
        # leaves: trifoliate sprays along the cane
        for k in (1, 2, 3, 4):
            if rnd.random() < 0.2:
                continue
            p = pts[k] + Vector((0, 0, 0.004))
            lc = rnd.choice(LEAF)
            base_a = rnd.uniform(0, 6.28)
            for q in range(3):
                la = base_a + q * 2.0 + rnd.uniform(-0.3, 0.3)
                ld = Vector((math.cos(la), math.sin(la), rnd.uniform(-0.25, 0.25)))
                ll = rnd.uniform(0.08, 0.11) * (1.15 if q == 0 else 0.9)

                def leaf(bm, hi, p=p, ld=ld, ll=ll):
                    return blade(bm, hi, p, ld, ll, ll * 0.36, 0.22, segs=(3, 6), fold=0.3, twist=0.3, leaf=True)
                out.append((leaf, 'leaf', lc, 2))
    return out


def _litter(rnd, a0, a1, n, r0=0.3, r1=0.8):
    """Dead leaves flat on the ground in a sector."""
    out = []
    for i in range(n):
        p, a = ring_pos(rnd, a0, a1, r0, r1)
        p.z = 0.004 + rnd.uniform(0, 0.008)
        la = rnd.uniform(0, 6.28)
        ll = rnd.uniform(0.07, 0.1)

        def lf(bm, hi, p=p, la=la, ll=ll):
            d = Vector((math.cos(la), math.sin(la), 0.06))
            q = _clampr(p - d * ll * 0.4, 0.8 - ll)
            return blade(bm, hi, q, d, ll, ll * 0.34, -0.05, segs=(3, 6), fold=0.4, twist=0.35, leaf=True)
        out.append((lf, 'leaf', rnd.choice(DEAD), 2))
    return out


def _arc(c_ang, span, r, z0, z1, n=5, wob=0.03, rnd=None):
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = c_ang - span / 2 + span * t
        rr = r + (rnd.uniform(-wob, wob) if rnd else 0)
        pts.append(Vector((math.cos(a) * rr, math.sin(a) * rr, z0 + (z1 - z0) * t)))
    return pts


def _at(a, r):
    return Vector((math.cos(a) * r, math.sin(a) * r, 0))


def forest_layout(v):
    rnd = random.Random(100 + v)
    P = []
    R = math.radians
    if v == 1:
        # a big windfall bough along the rim, its end propped on a stick pile; brambles at its foot
        P.append('bough')
        P += _branch_pieces(rnd, _arc(R(185), R(115), 0.6, 0.085, 0.12, 6, 0.04, rnd), 0.085, 0.04, BARK, 7, 1)
        P.append('stick piles')
        P += _pile(rnd, _at(R(250), 0.6), R(250) + 1.5, 5, 40)
        P += _pile(rnd, _at(R(320), 0.62), R(320) + 1.2, 4, 50)
        P.append('brambles')
        P += _bramble(rnd, _at(R(120), 0.6), R(120) - 1.2, 6, 3)
        P += _bramble(rnd, _at(R(30), 0.64), R(30) + 1.4, 4, 4, 0.28)
        P.append('litter')
        P += _litter(rnd, R(0), R(360), 10)
    elif v == 2:
        # two crossed boughs on one side, a stick pile and brambles on the other
        P.append('boughs')
        P += _branch_pieces(rnd, _arc(R(250), R(85), 0.58, 0.07, 0.07, 5, 0.03, rnd), 0.07, 0.034, BARK, 5, 2)
        P += _branch_pieces(rnd, [Vector((0.12, -0.74, 0.06)), Vector((0.34, -0.6, 0.09)), Vector((0.55, -0.42, 0.12)), Vector((0.72, -0.2, 0.1))], 0.06, 0.03, BARK, 4, 3)
        P.append('stick pile')
        P += _pile(rnd, _at(R(100), 0.6), R(100) + 1.5, 6, 60)
        P.append('brambles')
        P += _bramble(rnd, _at(R(160), 0.62), R(160) + 1.3, 5, 4, 0.3)
        P += _bramble(rnd, _at(R(30), 0.64), R(30) - 1.4, 4, 5, 0.28)
        P.append('litter')
        P += _litter(rnd, 0, 2 * math.pi, 10)
    else:
        # a bramble thicket round one side, a short broken bough and sticks round the rest
        P.append('bramble thicket')
        P += _bramble(rnd, _at(R(30), 0.62), R(30) + 1.7, 6, 5, 0.34)
        P += _bramble(rnd, _at(R(95), 0.64), R(95) - 1.5, 5, 6, 0.3)
        P += _bramble(rnd, _at(R(300), 0.64), R(300) + 1.6, 4, 8, 0.26)
        P.append('bough and sticks')
        P += _branch_pieces(rnd, _arc(R(205), R(70), 0.6, 0.06, 0.09, 4, 0.03, rnd), 0.06, 0.03, BARK, 4, 7)
        P += _pile(rnd, _at(R(255), 0.62), R(255) + 1.4, 4, 70)
        P.append('litter')
        P += _litter(rnd, 0, 2 * math.pi, 8)
    return P


def build_forest(v):
    name = 'rough-forest-%d' % v
    k = Kit(seed=200 + v)
    for build, mat, col, gax in forest_layout(v):
        k.add(build, mat, col, gax)
    lo, hi = k.finish(name, loc=((v - 2) * 2.2, 0, 0))
    return lo, hi
