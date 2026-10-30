# workbench-forge (2026-10-30): a smith's working place across two hexes (3.1 x 0.9 x 1.5 m): a
# heavy oak bench with a leg vise, a tool board behind it with hammers and tongs on pegs, stock and
# horseshoes on the top, an anvil on a stump at one end and a quench bucket at the other.
# exec os_lib.py, os_shapes.py, then this; step_bench(), step_board(), step_ends(), step_top().
import math, random
from mathutils import Vector, Matrix

OAK, OAK2, OAK_D = '#6A4A30', '#76543A', '#4A3222'
IRON, IRON2, STEEL = '#34353A', '#45464C', '#6A6E74'
BL = 2.1            # bench length (x), centred at BX
BX = 0.15
BD = 0.62           # bench depth
BH = 0.82           # top height


def step_bench():
    k = Kit(501)
    x0, x1 = BX - BL / 2, BX + BL / 2
    # top: four thick planks with gaps, worn
    pw = (BD - 0.015) / 4
    for j in range(4):
        y = -BD / 2 + pw / 2 + j * (pw + 0.005)
        k.add(lambda bm, hi, y=y: box(bm, hi, (BX, y, BH - 0.035), (BL, pw, 0.07), 0.006 if hi else 0.0), 'wood', [OAK, OAK2][j % 2], 0)
    # legs (four, square 0.1), stretchers, a lower shelf of boards
    for x in (x0 + 0.1, x1 - 0.1):
        for y in (-BD / 2 + 0.07, BD / 2 - 0.07):
            k.add(lambda bm, hi, x=x, y=y: box(bm, hi, (x, y, (BH - 0.07) / 2), (0.1, 0.1, BH - 0.07), 0.008 if hi else 0.0), 'wood', OAK_D, 2)
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, 0.16), (0.07, BD - 0.1, 0.07), 0.005 if hi else 0.0), 'wood', OAK_D, 0)
    for y in (-BD / 2 + 0.07, BD / 2 - 0.07):
        k.add(lambda bm, hi, y=y: box(bm, hi, (BX, y, 0.16), (BL - 0.3, 0.06, 0.07), 0.005 if hi else 0.0), 'wood', OAK_D, 0)
    for j in range(3):
        y = -0.18 + j * 0.18
        k.add(lambda bm, hi, y=y: box(bm, hi, (BX, y, 0.215), (BL - 0.3, 0.16, 0.03), 0.003 if hi else 0.0), 'wood', OAK2, 0)
    # leg vise on the front left: jaw, screw with a bar handle, the leg it hangs on
    vx = x0 + 0.35
    def vise(bm, hi):
        box(bm, hi, (vx, -BD / 2 - 0.05, BH - 0.06), (0.14, 0.05, 0.12), 0.006 if hi else 0.0)
        box(bm, hi, (vx, -BD / 2 - 0.04, BH * 0.45), (0.06, 0.04, BH * 0.85), 0.005 if hi else 0.0)
        cyl(bm, hi, (vx, -BD / 2 - 0.14, BH - 0.1), 0.018, 0.2, 'y', 8)
        cyl(bm, hi, (vx, -BD / 2 - 0.22, BH - 0.1), 0.01, 0.28, 'x', 6)
        for sx in (-1, 1):
            sphere(bm, hi, (vx + sx * 0.14, -BD / 2 - 0.22, BH - 0.1), 0.017, 8, 5)
    k.add(vise, 'iron', IRON, 2)
    # iron strapping on the front corners of the top
    for x in (x0 + 0.02, x1 - 0.02):
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, -BD / 2 - 0.002, BH - 0.035), (0.05, 0.004, 0.08), 0.001 if hi else 0.0), 'iron', IRON2, 0)
    return k.finish('wb-bench')


def step_board():
    """A tool board at the back: two posts, a plank panel, pegs, hammers and tongs hanging."""
    k = Kit(502)
    yb = BD / 2 + 0.03
    x0, x1 = BX - BL / 2 + 0.15, BX + BL / 2 - 0.15
    for x in (x0, x1):
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, yb, 1.05), (0.08, 0.08, 0.7), 0.006 if hi else 0.0), 'wood', OAK_D, 2)
    for j in range(5):
        z = BH + 0.07 + j * 0.122
        k.add(lambda bm, hi, z=z: box(bm, hi, ((x0 + x1) / 2, yb + 0.01, z), (x1 - x0 + 0.08, 0.025, 0.118), 0.003 if hi else 0.0), 'wood', [OAK2, OAK][j % 2], 0)
    k.add(lambda bm, hi: box(bm, hi, ((x0 + x1) / 2, yb + 0.01, BH + 0.66), (x1 - x0 + 0.2, 0.05, 0.05), 0.005 if hi else 0.0), 'wood', OAK_D, 0)
    rnd = random.Random(503)
    tools = ['hammer', 'tongs', 'shoes', 'hammer', 'saw', 'tongs', 'shoes', 'hammer', 'tongs']
    for i, t in enumerate(tools):
        x = x0 + 0.15 + i * (x1 - x0 - 0.3) / (len(tools) - 1)
        zt = BH + 0.48
        k.add(lambda bm, hi, x=x: cyl(bm, hi, (x, yb - 0.03, zt), 0.008, 0.06, 'y', 6), 'wood', OAK_D, 0)
        if t == 'hammer':
            k.add(lambda bm, hi, x=x: box(bm, hi, (x, yb - 0.05, zt - 0.36), (0.15, 0.055, 0.055), 0.005 if hi else 0.0), 'iron', STEEL, 0)
            k.add(lambda bm, hi, x=x: cyl(bm, hi, (x, yb - 0.05, zt - 0.17), 0.017, 0.34, 'z', 6), 'wood', '#8A6A44', 0)
        elif t == 'tongs':
            def tongs(bm, hi, x=x):
                for s in (-1, 1):
                    tube(bm, hi, [Vector((x + s * 0.02, yb - 0.05, zt - 0.02)), Vector((x + s * 0.035, yb - 0.05, zt - 0.3)), Vector((x + s * 0.012, yb - 0.05, zt - 0.45))], 0.011, 0.009, sides=(5, 6))
                sphere(bm, hi, (x, yb - 0.05, zt - 0.32), 0.016, 8, 5)
            k.add(tongs, 'iron', IRON, 0)
        elif t == 'shoes':
            def shoes(bm, hi, x=x):
                for j in range(3):
                    n = 10 if hi else 6
                    zz = zt - 0.08 - j * 0.11
                    pts = [Vector((x + 0.055 * math.cos(math.pi * (0.1 + 0.8 * i / n) + math.pi), yb - 0.045, zz + 0.06 * math.sin(math.pi * (0.1 + 0.8 * i / n) + math.pi))) for i in range(n + 1)]
                    tube(bm, hi, pts, 0.011, 0.011, sides=(4, 6))
            k.add(shoes, 'iron', IRON2, 0)
        elif t == 'saw':
            def saw(bm, hi, x=x):
                box(bm, hi, (x, yb - 0.04, zt - 0.25), (0.11, 0.004, 0.38), 0.0)
                box(bm, hi, (x, yb - 0.045, zt - 0.03), (0.13, 0.03, 0.07), 0.004 if hi else 0.0)
            k.add(saw, 'iron', STEEL, 0)
        else:
            k.add(lambda bm, hi, x=x: box(bm, hi, (x, yb - 0.045, zt - 0.18), (0.022, 0.008, 0.3), 0.002 if hi else 0.0), 'iron', STEEL, 0)
    return k.finish('wb-board')


def step_ends():
    """An anvil on its stump at the right end, a quench bucket on a block at the left."""
    k = Kit(504)
    ax = BX + BL / 2 + 0.4
    def stump(bm, hi):
        prof = [(0.0, 0), (0.25, 0), (0.24, 0.05), (0.22, 0.45), (0.21, 0.5), (0.0, 0.5)]
        lathe(bm, hi, prof, (ax, 0, 0), seg=10, seg_hi=28)
    k.add(stump, 'wood', '#5A4028', 2)
    def anvil(bm, hi):
        z0 = 0.5
        box(bm, hi, (ax, 0, z0 + 0.06), (0.24, 0.18, 0.12), 0.01 if hi else 0.0)     # foot
        box(bm, hi, (ax, 0, z0 + 0.16), (0.14, 0.1, 0.1), 0.008 if hi else 0.0)      # waist
        box(bm, hi, (ax, 0, z0 + 0.25), (0.36, 0.13, 0.08), 0.008 if hi else 0.0)    # face
        # horn: a tapering cone off the -x end
        before = set(bm.faces)
        lathe(bm, hi, [(0.05, 0.0), (0.035, 0.08), (0.012, 0.16), (0.0, 0.17)], (0, 0, 0), seg=8, seg_hi=20, cap_bot=True)
        f = _new_faces(bm, before)
        move(bm, f, Matrix.Translation((ax - 0.17, 0, z0 + 0.255)) @ Matrix.Rotation(-math.pi / 2, 4, 'Y'))
    k.add(anvil, 'iron', IRON, 2)
    bx = BX - BL / 2 - 0.38
    k.add(lambda bm, hi: box(bm, hi, (bx, 0, 0.12), (0.4, 0.4, 0.24), 0.01 if hi else 0.0), 'wood', OAK_D, 2)
    def bucket(bm, hi):
        prof = [(0.0, 0.24), (0.15, 0.24), (0.17, 0.58), (0.16, 0.58), (0.14, 0.27), (0.0, 0.27)]
        lathe(bm, hi, prof, (bx, 0, 0), seg=10, seg_hi=28)
    k.add(bucket, 'wood', '#6A4A30', 2)
    for z in (0.3, 0.52):
        k.add(lambda bm, hi, z=z: cyl(bm, hi, (bx, 0, z), 0.165 if z > 0.4 else 0.155, 0.02, 'z', 10 if hi else 8), 'iron', IRON2, 0)
    k.add(lambda bm, hi: cyl(bm, hi, (bx, 0, 0.53), 0.145, 0.01, 'z', 10 if hi else 8), 'glass', '#3A5A62', 0)
    return k.finish('wb-ends')


def step_top():
    """On the bench top: bar stock, a row of horseshoes, a hammer lying, a leather apron folded, a
    file and punches in a box."""
    k = Kit(505)
    rnd = random.Random(506)
    zt = BH
    for i in range(4):
        y = -0.05 + i * 0.035
        k.add(lambda bm, hi, y=y, i=i: box(bm, hi, (BX + 0.55, y, zt + 0.012), (0.7 - i * 0.05, 0.022, 0.022), 0.002 if hi else 0.0), 'iron', STEEL, 0)
    for i in range(5):
        x = BX - 0.6 + i * 0.13
        def shoe(bm, hi, x=x):
            n = 10 if hi else 6
            pts = [Vector((x + 0.05 * math.cos(math.pi * (0.1 + 0.8 * j / n)), -0.12 + 0.06 * math.sin(math.pi * (0.1 + 0.8 * j / n)), zt + 0.008)) for j in range(n + 1)]
            tube(bm, hi, pts, 0.01, 0.01, sides=(4, 6))
        k.add(shoe, 'iron', IRON2, 0)
    def ham(bm, hi):
        before = set(bm.faces)
        cyl(bm, hi, (0, 0, 0), 0.014, 0.3, 'x', 6)
        box(bm, hi, (0.17, 0, 0), (0.05, 0.11, 0.045), 0.004 if hi else 0.0)
        f = _new_faces(bm, before)
        move(bm, f, Matrix.Translation((BX - 0.1, 0.16, zt + 0.02)) @ Matrix.Rotation(0.5, 4, 'Z'))
    k.add(ham, 'iron', STEEL, 0)
    k.add(lambda bm, hi: box(bm, hi, (BX - 0.75, 0.12, zt + 0.02), (0.3, 0.24, 0.04), 0.012), 'leather', '#5A3A24', 2)
    def tbox(bm, hi):
        box(bm, hi, (BX + 0.95, 0.15, zt + 0.05), (0.22, 0.14, 0.1), 0.004 if hi else 0.0)
    k.add(tbox, 'wood', OAK2, 0)
    # a coil of chain, a sword blank and a lantern on the top
    def chain(bm, hi):
        for i in range(10 if hi else 7):
            a = 2 * math.pi * i / (10 if hi else 7)
            c = Vector((BX - 0.35 + 0.08 * math.cos(a), -0.12 + 0.08 * math.sin(a), zt + 0.015))
            before = set(bm.faces)
            n, m = (10, 5) if hi else (6, 4)
            rings = []
            for u in range(n):
                b = 2 * math.pi * u / n
                rings.append([bm.verts.new(c + Matrix.Rotation(a + (i % 2) * 1.2, 3, 'Z') @ Vector(((0.025 + 0.007 * math.cos(v)) * math.cos(b), (0.016 + 0.007 * math.cos(v)) * math.sin(b), 0.007 * math.sin(v))))
                              for v in [2 * math.pi * w / m for w in range(m)]])
            for u in range(n):
                A, B = rings[u], rings[(u + 1) % n]
                for w in range(m):
                    bm.faces.new((A[w], A[(w + 1) % m], B[(w + 1) % m], B[w]))
    k.add(chain, 'iron', IRON2, 0)
    k.add(lambda bm, hi: box(bm, hi, (BX + 0.2, -0.2, zt + 0.006), (0.7, 0.045, 0.012), 0.002 if hi else 0.0, rot=Matrix.Rotation(0.12, 4, 'Z')), 'iron', STEEL, 0)
    lx, ly = BX + BL / 2 - 0.12, -0.18
    def lantern(bm, hi):
        prof = [(0.0, 0), (0.06, 0), (0.06, 0.03), (0.045, 0.04), (0.045, 0.15), (0.05, 0.16), (0.03, 0.2), (0.012, 0.22), (0.0, 0.22)]
        lathe(bm, hi, [(r, zt + z) for r, z in prof], (lx, ly, 0), seg=8, seg_hi=24)
    k.add(lantern, 'iron', '#3E3A34', 2)
    k.add(lambda bm, hi: cyl(bm, hi, (lx, ly, zt + 0.095), 0.044, 0.11, 'z', 8 if hi else 6), 'glass', '#E8C070', 0)
    # under the bench: a box of coal and a bundle of bar stock
    def coalbox(bm, hi):
        box(bm, hi, (BX - 0.45, 0.0, 0.23 + 0.12), (0.5, 0.4, 0.24), 0.005 if hi else 0.0)
    k.add(coalbox, 'wood', OAK_D, 2)
    rr = random.Random(9)
    for i in range(12):
        c = (BX - 0.45 + rr.uniform(-0.2, 0.2), rr.uniform(-0.15, 0.15), 0.48 + rr.uniform(0, 0.04))
        k.add(lambda bm, hi, c=c, i=i: rock(bm, hi, c, (0.05, 0.045, 0.035), 900 + i, n=8, sub_hi=1, bev=0.2, bump=0.02, crack=0.0), 'stone', '#1E1E22', 0)
    for i in range(6):
        y, z = -0.12 + (i % 3) * 0.04, 0.26 + (i // 3) * 0.035
        k.add(lambda bm, hi, y=y, z=z: box(bm, hi, (BX + 0.45, y, z), (0.9, 0.03, 0.03), 0.002 if hi else 0.0), 'iron', STEEL, 0)
    for i in range(4):
        k.add(lambda bm, hi, i=i: cyl(bm, hi, (BX + 0.88 + i * 0.045, 0.15, zt + 0.12), 0.007, 0.12, 'z', 6), 'iron', STEEL, 0)
    return k.finish('wb-top')
