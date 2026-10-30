# Marsh difficult-terrain clumps: reed stands and sedge tussocks in mud, broken stalks, cattails.
# exec after tp_lib.py and shapes.py; build_marsh(v) makes `rough-marsh-<v>` and its -hi.

MUD = ['#2a2218', '#30271c', '#261f16']
# Pass 2: pale straw reeds and yellow sedge, so a clump stands out from the dark olive mud and
# grass of the marsh floor (pass 1 was green on green and vanished in game).
STRAW = ['#d6c48e', '#c9b47c', '#e0cf9c', '#bfae78']
REEDG = ['#b0a85a', '#a29c50', '#bcb468']
SEDGE = ['#a8a24a', '#b8ae58', '#9a9a44', '#c4b464', '#8e9a40']
CATTAIL = ['#5a3a22', '#4e3220']


def _gax(d):
    d = [abs(x) for x in d]
    return d.index(max(d))


def _at(a, r, z=0.0):
    return Vector((math.cos(a) * r, math.sin(a) * r, z))


def mud(bm, hi, a0, a1, r0, r1, h, seed):
    """A lens of wet mud along the ring from angle a0 to a1, r0..r1 from the centre, h high in the
    middle, its outline wobbling; hi adds lumps, hoof-dips and small puddle hollows."""
    before = set(bm.faces)
    na, nr = (10, 3) if not hi else (72, 16)
    off = Vector((seed * 3.7, seed * 1.3, 0.5))
    rows = []
    for i in range(na + 1):
        u = i / na
        a = a0 + (a1 - a0) * u
        q = Vector((math.cos(a), math.sin(a), 0)) * 2.0 + off
        rin = r0 + 0.09 * mnoise.noise(q) + 0.03 * mnoise.noise(q * 3.0)
        rout = r1 + 0.07 * mnoise.noise(q + Vector((5, 0, 0))) + 0.03 * mnoise.noise(q * 3.0 + Vector((2, 0, 0)))
        mid = (rin + rout) / 2
        half = max(0.006, (rout - rin) / 2 * math.sin(math.pi * u) ** 0.55)
        row = []
        for j in range(nr + 1):
            s = -1 + 2 * j / nr
            r = mid + half * s
            z = h * (1 - s * s) * math.sin(math.pi * u) ** 0.5 - 0.004
            p = Vector((math.cos(a) * r, math.sin(a) * r, z))
            if hi and 0 < j < nr and 0 < i < na:
                k = (1 - s * s) * math.sin(math.pi * u) ** 0.5
                z += k * (0.006 * mnoise.fractal(p * 14 + off, 0.6, 2.0, 4) + 0.002 * mnoise.noise(p * 60 + off))
                f1, f2 = mnoise.voronoi(p * 9 + off)[0][:2]
                z -= k * 0.008 * max(0.0, 1 - f1 / 0.25)  # dips
                p.z = z
            row.append(bm.verts.new(p))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for j in range(nr):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    return _new_faces(bm, before)


def _reed(rnd, root, sd, broken=False):
    """One reed stalk with two leaves; broken ones snap at a node and lie toward the outside."""
    out = []
    ht = rnd.uniform(0.15, 0.235)
    lean = Vector((rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), 0))
    if broken:
        bh = ht * rnd.uniform(0.35, 0.6)
        out_dir = Vector((root.x, root.y, 0)).normalized()
        a = math.atan2(out_dir.y, out_dir.x) + rnd.uniform(-1.2, 1.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        top = root + Vector((0, 0, bh)) + lean
        rest = ht - bh
        pts = [root, root + lean * 0.5 + Vector((0, 0, bh * 0.5)), top, top + d * rest * 0.45 + Vector((0, 0, -bh * 0.5)),
               top + d * rest * 0.95 + Vector((0, 0, -bh + 0.008))]
    else:
        pts = [root, root + lean * 0.3 + Vector((0, 0, ht * 0.35)), root + lean * 0.7 + Vector((0, 0, ht * 0.7)), root + lean + Vector((0, 0, ht))]
    pts = [Vector((p.x, p.y, max(p.z, 0.006))) for p in pts]
    col = rnd.choice(STRAW if broken or rnd.random() < 0.6 else REEDG)

    def st(bm, hi, pts=pts, sd=sd):
        fs = tube(bm, hi, pts, 0.017, 0.008, sides=(4, 8), k_hi=4, bark=0.04, seed=sd, cap0=False)
        if hi:  # nodes: thin rings every few cm
            pp = _resample(pts, 4)
            for k in range(2, len(pp) - 1, 3):
                t = (pp[k + 1] - pp[k - 1]).normalized()
                fs += tube(bm, True, [pp[k] - t * 0.004, pp[k] + t * 0.004], 0.0155, 0.0155, sides=(4, 8), k_hi=1)
        return fs
    out.append((st, 'wood', col, 2))
    for q in range(2 if not broken else 1):
        k = rnd.uniform(0.25, 0.6)
        base = pts[0].lerp(pts[2], k)
        la = rnd.uniform(0, 6.28)
        d = Vector((math.cos(la), math.sin(la), rnd.uniform(0.6, 1.3)))
        ln = rnd.uniform(0.13, 0.19)

        def lf(bm, hi, base=base, d=d, ln=ln):
            return blade(bm, hi, base, d, ln, 0.02, 0.55, segs=(3, 7), fold=0.35, twist=0.5)
        out.append((lf, 'leaf', rnd.choice(REEDG + STRAW[:1]), 2))
    return out


def _tussock(rnd, c, n, reach=0.24):
    """A sedge tussock: n arching blades from a tight root, the outer ones lower."""
    out = []
    c = Vector(c)
    for i in range(n):
        a = rnd.uniform(0, 6.28)
        up = rnd.uniform(0.5, 2.2)
        d = Vector((math.cos(a), math.sin(a), up))
        ln = reach * rnd.uniform(0.8, 1.25)
        base = c + Vector((math.cos(a), math.sin(a), 0)) * rnd.uniform(0.01, 0.035)

        def bl(bm, hi, base=base, d=d, ln=ln, tw=rnd.uniform(-0.6, 0.6)):
            return blade(bm, hi, base, d, ln, 0.03, 0.6, segs=(3, 7), fold=0.4, twist=tw)
        out.append((bl, 'leaf', rnd.choice(SEDGE), 2))
    return out


def _cattail(rnd, c, ang, sd):
    """A broken cattail lying on the mud: a stalk end and the brown head."""
    c = Vector(c)
    d = Vector((math.cos(ang), math.sin(ang), 0))
    a = c - d * 0.12 + Vector((0, 0, 0.012))
    m = c + Vector((0, 0, 0.026))
    b = c + d * 0.06 + Vector((0, 0, 0.03))
    e = b + d * 0.11 + Vector((0, 0, -0.004))

    def stalk(bm, hi, a=a, m=m, b=b, sd=sd):
        return tube(bm, hi, [a, m, b], 0.011, 0.009, sides=(4, 8), k_hi=3, seed=sd)

    def head(bm, hi, b=b, e=e, sd=sd):
        fs = tube(bm, hi, [b, b.lerp(e, 0.5), e], 0.03, 0.026, sides=(7, 14), k_hi=4, bark=0.12, seed=sd + 1)
        return fs
    return [(stalk, 'wood', rnd.choice(STRAW), _gax(d)), (head, 'cloth', rnd.choice(CATTAIL), _gax(d))]


def marsh_layout(v):
    rnd = random.Random(300 + v)
    R = math.radians
    P = []

    def stand(a, r, n, broken=0.3, spread=0.08):
        out = []
        for i in range(n):
            p = _at(a, r) + Vector((rnd.uniform(-spread, spread), rnd.uniform(-spread, spread), 0))
            out += _reed(rnd, p, v * 100 + i + int(a * 10), broken=rnd.random() < broken)
        return out

    if v == 1:
        P.append('mud')
        P.append((lambda bm, hi: mud(bm, hi, R(120), R(280), 0.42, 0.8, 0.028, 1), 'mud', MUD[0], 2))
        P.append('reeds and sedge')
        P += stand(R(200), 0.62, 12, 0.55, 0.15)
        P += _tussock(rnd, _at(R(200), 0.74), 12, 0.2)
        P += _tussock(rnd, _at(R(145), 0.62), 18)
        P += _tussock(rnd, _at(R(255), 0.6), 16)
        P += _tussock(rnd, _at(R(40), 0.66), 12, 0.2)
        P.append('cattails and stalks')
        P += _cattail(rnd, _at(R(300), 0.6), R(300) + 1.4, 7)
        P += _cattail(rnd, _at(R(95), 0.62), R(95) - 1.2, 11)
        P += stand(R(345), 0.64, 5, 0.7, 0.06)
    elif v == 2:
        P.append('mud')
        P.append((lambda bm, hi: mud(bm, hi, R(-40), R(70), 0.45, 0.8, 0.024, 2), 'mud', MUD[1], 2))
        P.append((lambda bm, hi: mud(bm, hi, R(150), R(240), 0.45, 0.78, 0.022, 3), 'mud', MUD[2], 2))
        P.append('reeds and sedge')
        P += stand(R(15), 0.62, 9, 0.55, 0.14)
        P += _tussock(rnd, _at(R(80), 0.66), 11, 0.2)
        P += _tussock(rnd, _at(R(50), 0.64), 16)
        P += _tussock(rnd, _at(R(-25), 0.6), 13, 0.2)
        P += stand(R(200), 0.62, 8, 0.55, 0.14)
        P += _tussock(rnd, _at(R(170), 0.62), 16)
        P += _tussock(rnd, _at(R(230), 0.64), 10, 0.2)
        P.append('cattails')
        P += _cattail(rnd, _at(R(110), 0.62), R(110) + 1.5, 8)
        P += _cattail(rnd, _at(R(280), 0.64), R(280) - 1.3, 9)
    else:
        P.append('mud')
        P.append((lambda bm, hi: mud(bm, hi, R(60), R(230), 0.42, 0.8, 0.026, 4), 'mud', MUD[0], 2))
        P.append('reeds and sedge')
        P += stand(R(100), 0.62, 12, 0.55, 0.15)
        P += _tussock(rnd, _at(R(70), 0.7), 12, 0.2)
        P += stand(R(185), 0.62, 9, 0.55, 0.14)
        P += _tussock(rnd, _at(R(215), 0.66), 11, 0.2)
        P += _tussock(rnd, _at(R(140), 0.66), 14)
        P += _tussock(rnd, _at(R(300), 0.64), 17)
        P += _tussock(rnd, _at(R(0), 0.62), 12, 0.2)
        P.append('cattails')
        P += _cattail(rnd, _at(R(220), 0.6), R(220) + 1.2, 10)
    return P


def build_marsh(v):
    name = 'rough-marsh-%d' % v
    k = Kit(seed=400 + v)
    for build, mat, col, gax in marsh_layout(v):
        k.add(build, mat, col, gax)
    lo, hi = k.finish(name, loc=((v - 2) * 2.2, 2.4, 0))
    return lo, hi
