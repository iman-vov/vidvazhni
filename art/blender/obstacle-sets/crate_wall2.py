# crate-wall v2 (2026-10-30): the stack of crates rebuilt with real construction in the game mesh,
# not only in the bake: plank faces with gaps, edge frames standing proud, Z braces, rope handles,
# burnt brand marks, an open slatted crate of apples on straw with its lid leaning on it, and a
# rope lashed over the stack. exec os_lib.py, os_shapes.py, crate_wall.py (pallets, TIERS, PH),
# then this; step_crates2(tier), step_top2().
import math, random
from mathutils import Vector, Matrix

WOODS = ['#9A7A50', '#8A6A44', '#7A5C3A', '#A88A5C', '#6E5234']
BRAND = '#2E2218'


def _place(bm, before, M):
    f = _new_faces(bm, before)
    move(bm, f, M)
    return f


def framed(k, rnd, c, size, rot=0.0, kind='z'):
    """A shipping crate: plank faces (planks with 5 mm gaps on the long faces and the lid), a frame
    of battens standing 12 mm proud round every face's edge, a Z brace on the long faces (kind 'z')
    or a cross ('x'), rope handles on the ends, a burnt brand on one long face."""
    w, d, h = size
    M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot, 4, 'Z')
    col = rnd.choice(WOODS)
    dark = [v * 0.72 for v in hexc(col)]

    def core(bm, hi):
        before = set(bm.faces)
        box(bm, hi, (0, 0, h / 2), (w - 0.024, d - 0.024, h - 0.024), 0.003 if hi else 0.0)
        _place(bm, before, M)
    k.add(core, 'wood', dark, 0)

    def planks(bm, hi):
        before = set(bm.faces)
        n = max(3, round(h / 0.1))
        ph = (h - 0.03 - 0.005 * (n - 1)) / n
        for sy in (-1, 1):
            for i in range(n):
                z = 0.015 + ph / 2 + i * (ph + 0.005)
                box(bm, hi, (0, sy * (d / 2 - 0.009), z), (w - 0.05, 0.018, ph), 0.003 if hi else 0.0)
        m = max(3, round(w / 0.11))
        pw = (w - 0.05 - 0.005 * (m - 1)) / m
        for i in range(m):
            x = -w / 2 + 0.025 + pw / 2 + i * (pw + 0.005)
            box(bm, hi, (x, 0, h - 0.009), (pw, d - 0.05, 0.018), 0.003 if hi else 0.0)
        _place(bm, before, M)
    k.add(planks, 'wood', col, 2)

    def frame(bm, hi):
        before = set(bm.faces)
        t, b = 0.022, 0.05
        for sy in (-1, 1):
            y = sy * (d / 2 - t / 2 + 0.006)
            for z in (b / 2, h - b / 2):
                box(bm, hi, (0, y, z), (w, t, b), 0.004 if hi else 0.0)
            for sx in (-1, 1):
                box(bm, hi, (sx * (w / 2 - b / 2), y, h / 2), (b, t, h - 2 * b), 0.004 if hi else 0.0)
            # brace across the long face
            if kind in ('z', 'x'):
                a = math.atan2(h - 2 * b, w - 2 * b)
                L = math.hypot(w - 2 * b, h - 2 * b)
                for s in ((1,) if kind == 'z' else (1, -1)):
                    bb = set(bm.faces)
                    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, y + sy * 0.002, h / 2)) @ Matrix.Rotation(-s * a * sy, 4, 'Y') @ Matrix.Diagonal((L, t, b * 0.85, 1)))
                    bevel_piece(bm, _new_faces(bm, bb), 0.004 if hi else 0.0, hi)
        # end frames
        for sx in (-1, 1):
            x = sx * (w / 2 - t / 2 + 0.006)
            for z in (b / 2, h - b / 2):
                box(bm, hi, (x, 0, z), (t, d - 0.02, b), 0.004 if hi else 0.0)
        _place(bm, before, M)
    k.add(frame, 'wood', [v * 0.86 for v in hexc(col)], 2)

    def handles(bm, hi):
        before = set(bm.faces)
        for sx in (-1, 1):
            x = sx * (w / 2 + 0.01)
            p = [Vector((x, -0.07, h * 0.62)), Vector((x + sx * 0.03, 0, h * 0.56)), Vector((x, 0.07, h * 0.62))]
            tube(bm, hi, p, 0.011, 0.011, sides=(5, 8))
        _place(bm, before, M)
    k.add(handles, 'rope', '#B89A64', 0)

    if rnd.random() < 0.6:
        def brand(bm, hi):
            before = set(bm.faces)
            sy = rnd.choice((-1, 1))
            # a burnt ring mark between the brace and the frame
            n = 12 if hi else 8
            r0, r1 = 0.045, 0.06
            yy = sy * (d / 2 + 0.001)
            vs = []
            for i in range(n):
                a = 2 * math.pi * i / n
                vs.append((bm.verts.new(Vector((w * 0.22 + r0 * math.cos(a), yy, h * 0.6 + r0 * math.sin(a)))),
                           bm.verts.new(Vector((w * 0.22 + r1 * math.cos(a), yy, h * 0.6 + r1 * math.sin(a))))))
            for i in range(n):
                a0, a1 = vs[i], vs[(i + 1) % n]
                f = bm.faces.new((a0[0], a1[0], a1[1], a0[1]))
                if f.normal.y * sy < 0:
                    f.normal_flip()
            _place(bm, before, M)
        k.add(brand, 'wood', BRAND, 0)
    details(k, rnd, M, w, d, h)


def details(k, rnd, M, w, d, h):
    """Small things on a crate: nail heads at the plank ends and iron corner plates (hi only, they
    come through the bake), a paper consignment note tacked on with a twine loop, chalk strokes."""
    n = max(3, round(h / 0.1))
    ph = (h - 0.03 - 0.005 * (n - 1)) / n

    def nails(bm, hi):
        before = set(bm.faces)
        for sy in (-1, 1):
            for i in range(n):
                z = 0.015 + ph / 2 + i * (ph + 0.005)
                for sx in (-1, 1):
                    dome(bm, hi, (sx * (w / 2 - 0.075), sy * (d / 2 + 0.001), z), 0.0065, 0.003, (0, sy, 0), 6)
        for sx in (-1, 1):
            for sy in (-1, 1):
                dome(bm, hi, (sx * (w / 2 - 0.025), sy * (d / 2 - 0.06), h + 0.001), 0.0065, 0.003, (0, 0, 1), 6)
        _place(bm, before, M)
    k.add(nails, 'iron', '#4A4B50', 0, levels=('hi',))

    def caps(bm, hi):
        before = set(bm.faces)
        for sx in (-1, 1):
            for sy in (-1, 1):
                for z in (0.03, h - 0.03):
                    box(bm, hi, (sx * (w / 2 - 0.03), sy * (d / 2 + 0.008), z), (0.06, 0.003, 0.06), 0.001)
                    box(bm, hi, (sx * (w / 2 + 0.008), sy * (d / 2 - 0.03), z), (0.003, 0.06, 0.06), 0.001)
        _place(bm, before, M)
    k.add(caps, 'iron', '#3A3B40', 0, levels=('hi',))

    if rnd.random() < 0.5:
        sy = rnd.choice((-1, 1))
        lx, lz = rnd.uniform(-w * 0.25, w * 0.25), h * rnd.uniform(0.35, 0.6)
        tilt = rnd.uniform(-0.12, 0.12)

        def label(bm, hi):
            before = set(bm.faces)
            box(bm, hi, (0, 0, 0), (0.12, 0.003, 0.085), 0.0)
            f = _new_faces(bm, before)
            move(bm, f, Matrix.Translation((lx, sy * (d / 2 + 0.004), lz)) @ Matrix.Rotation(tilt, 4, 'Y'))
            move(bm, f, M)
        k.add(label, 'paper', '#E6DCC0', 0)

        def writing(bm, hi):
            before = set(bm.faces)
            for j in range(3):
                box(bm, hi, (-0.01 + 0.006 * j, 0, 0.02 - 0.018 * j), (0.08 - 0.02 * j, 0.002, 0.005), 0.0)
            f = _new_faces(bm, before)
            move(bm, f, Matrix.Translation((lx, sy * (d / 2 + 0.0058), lz)) @ Matrix.Rotation(tilt, 4, 'Y'))
            move(bm, f, M)
        k.add(writing, 'paper', '#3A3028', 0, levels=('hi',))
    if rnd.random() < 0.4:
        sy = rnd.choice((-1, 1))
        cx, cz = rnd.uniform(-w * 0.3, w * 0.3), h * rnd.uniform(0.25, 0.7)

        def chalk(bm, hi):
            before = set(bm.faces)
            for j, (dx, dz, a) in enumerate(((0, 0, 0.3), (0.05, 0.01, -0.5), (0.1, 0, 0.2))):
                box(bm, hi, (cx + dx, sy * (d / 2 + 0.0035), cz + dz), (0.05, 0.002, 0.008), 0.0, rot=Matrix.Rotation(a, 4, 'Y'))
            _place(bm, before, M)
        k.add(chalk, 'paper', '#ECE8DC', 0, levels=('hi',))


def slatted_open(k, rnd, c, size, rot=0.0):
    """An open slatted crate (slats with wide gaps), straw in it and apples heaped on the straw; its
    lid lies leaning against the crate's long face."""
    w, d, h = size
    M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot, 4, 'Z')

    def slats(bm, hi):
        before = set(bm.faces)
        n = 3
        sh = 0.05
        gap = (h - n * sh) / (n - 1)
        for i in range(n):
            z = sh / 2 + i * (sh + gap)
            for sy in (-1, 1):
                box(bm, hi, (0, sy * (d / 2 - 0.009), z), (w, 0.018, sh), 0.003 if hi else 0.0)
            for sx in (-1, 1):
                box(bm, hi, (sx * (w / 2 - 0.009), 0, z), (0.018, d - 0.036, sh), 0.003 if hi else 0.0)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(bm, hi, (sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), h / 2), (0.04, 0.04, h), 0.004 if hi else 0.0)
        box(bm, hi, (0, 0, 0.01), (w - 0.03, d - 0.03, 0.02), 0.0)
        _place(bm, before, M)
    k.add(slats, 'wood', '#A88A5C', 2)

    def straw(bm, hi):
        before = set(bm.faces)
        box(bm, hi, (0, 0, h * 0.62), (w - 0.04, d - 0.04, 0.02), 0.0)
        _place(bm, before, M)
    k.add(straw, 'cloth', '#D8C07A', 0)
    rr = random.Random(7)
    for i in range(14):
        x = rr.uniform(-w / 2 + 0.06, w / 2 - 0.06)
        y = rr.uniform(-d / 2 + 0.06, d / 2 - 0.06)
        z = h * 0.62 + 0.035 + rr.uniform(0, 0.03) + (0.04 if abs(x) < w * 0.25 else 0)
        def apple(bm, hi, x=x, y=y, z=z):
            before = set(bm.faces)
            sphere(bm, hi, (x, y, z), 0.038, 10 if hi else 6, 6 if hi else 4)
            _place(bm, before, M)
        k.add(apple, 'cloth', rr.choice(['#A8322A', '#B84A2E', '#8A9A34', '#C0602E']), 0)

    def lid(bm, hi):
        before = set(bm.faces)
        m = 4
        pw = (w - 0.015) / m
        for i in range(m):
            x = -w / 2 + pw / 2 + i * (pw + 0.005)
            box(bm, hi, (x, 0, 0), (pw, 0.018, d), 0.003 if hi else 0.0)
        for z in (-d / 2 + 0.04, d / 2 - 0.04):
            box(bm, hi, (0, 0.018, z), (w, 0.018, 0.05), 0.003 if hi else 0.0)
        f = _new_faces(bm, before)
        move(bm, f, Matrix.Translation((0, -d / 2 - 0.12, d / 2 * 0.92)) @ Matrix.Rotation(0.32, 4, 'X'))
        _place_m = M
        move(bm, f, _place_m)
    k.add(lid, 'wood', '#9A7A50', 2)


def step_crates2(tier):
    k = Kit(300 + tier)
    rnd = random.Random(400 + tier)
    z = PH
    for t in range(tier):
        z += min(c[2][2] for c in TIERS[t])
    for i, (x, y, size) in enumerate(TIERS[tier]):
        if tier == 2 and i == 1:
            continue   # the open crate of apples stands here (step_top2)
        kind = rnd.choice(['z', 'z', 'x', 'none'])
        framed(k, rnd, (x, y, z if tier == 0 else z - 0.002), size, rnd.uniform(-0.03, 0.03), kind)
    return k.finish('cw2-crates-%d' % tier)


def step_top2():
    """The open crate of apples on the top tier, the sack, the rope lashing over the stack and the
    crowbar leaning on the end."""
    k = Kit(320)
    rnd = random.Random(321)
    z2 = PH + min(c[2][2] for c in TIERS[0]) + min(c[2][2] for c in TIERS[1]) - 0.004
    x, y, size = TIERS[2][1]
    slatted_open(k, rnd, (x + 0.02, y - 0.05, z2), (0.5, 0.42, 0.3), 0.05)
    # rope lashed over the stack at x=-0.55: up one long face, across the top, down the other
    zt = z2 + TIERS[2][0][2][2] + 0.01
    pts = [Vector((-0.62, -0.42, 0.14)), Vector((-0.6, -0.42, zt - 0.1)), Vector((-0.58, -0.31, zt)), Vector((-0.56, 0.31, zt)),
           Vector((-0.55, 0.42, zt - 0.1)), Vector((-0.54, 0.42, 0.14))]
    k.add(lambda bm, hi: tube(bm, hi, pts, 0.012, 0.012, sides=(5, 8), cap0=False, cap1=False), 'rope', '#B89A64', 0)
    p0, p1 = Vector((-1.62, 0.18, 0.0)), Vector((-1.5, 0.18, 0.62))
    k.add(lambda bm, hi: tube(bm, hi, [p0, (p0 + p1) / 2, p1, p1 + Vector((0.05, 0, 0.03))], 0.012, 0.01, sides=(5, 8)), 'iron', '#3A3B40', 0)
    # straw poking out between the slats of the apple crate
    cx, cy = x + 0.02, y - 0.05
    for i in range(10):
        a = rnd.uniform(0, 2 * math.pi)
        base = Vector((cx + 0.25 * math.cos(a) * 0.95, cy + 0.21 * math.sin(a) * 0.95, z2 + rnd.uniform(0.08, 0.24)))
        dirv = Vector((math.cos(a), math.sin(a), rnd.uniform(-0.3, 0.4))).normalized()
        k.add(lambda bm, hi, base=base, dirv=dirv, i=i: blade(bm, hi, base, dirv, rnd.uniform(0.06, 0.1), 0.012, 0.3, seed=i), 'cloth', '#D8C07A', 0)
    # a storm lantern on the top of the left crate: base, glass, cap and bail
    lx, ly, lz = TIERS[2][0][0] - 0.12, 0.05, z2 + TIERS[2][0][2][2] + 0.004
    def lantern(bm, hi):
        prof = [(0.0, 0), (0.06, 0), (0.06, 0.03), (0.045, 0.04), (0.045, 0.15), (0.05, 0.16), (0.03, 0.2), (0.012, 0.22), (0.0, 0.22)]
        lathe(bm, hi, [(r, lz + z) for r, z in prof], (lx, ly, 0), seg=8, seg_hi=24)
    k.add(lantern, 'iron', '#3E3A34', 2)
    k.add(lambda bm, hi: cyl(bm, hi, (lx, ly, lz + 0.095), 0.044, 0.11, 'z', 8 if hi else 6), 'glass', '#E8C070', 0)
    k.add(lambda bm, hi: tube(bm, hi, [Vector((lx - 0.045, ly, lz + 0.16)), Vector((lx, ly, lz + 0.28)), Vector((lx + 0.045, ly, lz + 0.16))], 0.004, 0.004, sides=(4, 6)), 'iron', '#3E3A34', 0)
    return k.finish('cw2-top')
