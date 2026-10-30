# rack-long (2026-10-30): an open storage rack one hex long (1.66 x 0.46 x 1.5 m), timber posts,
# plank shelves, braced bays, stocked with jars, bottles, crocks, small crates and cloth bolts.
# Racks on touching hexes meet end to end. exec os_lib.py, os_shapes.py, then this; one step_*()
# per MCP call.
import math, random
from mathutils import Vector, Matrix

L, DD, H = 1.66, 0.46, 1.5
P = 0.06                          # post section
XS = [-L / 2 + P / 2, 0.0, L / 2 - P / 2]
YS = [-DD / 2 + P / 2, DD / 2 - P / 2]
LEVELS = [0.1, 0.5, 0.9, 1.3]     # shelf plank bottoms
PT = 0.028                        # plank thickness
PINE, PINE2, PINE_D = '#7A5A3A', '#86643F', '#523A26'
IRON = '#3A3B40'
GLASS = ['#7FA8A0', '#8FB09A', '#6E8FA8', '#A8B88A']
CLAY = ['#9A5A3A', '#8A4E32', '#A86E4A', '#7A5A44']
CLOTH = ['#7A3A30', '#3E5A4A', '#C8B48A', '#4A4E6A', '#8A6A3A']


def step_frame():
    k = Kit(61)
    # posts on squat feet (the feet only on hi: baked into the posts' foot)
    for x in XS:
        for y in YS:
            k.add(lambda bm, hi, x=x, y=y: box(bm, hi, (x, y, H / 2), (P, P, H), 0.005), 'wood', PINE_D, 2)
            k.add(lambda bm, hi, x=x, y=y: box(bm, hi, (x, y, 0.015), (P + 0.02, P + 0.02, 0.03), 0.004), 'wood', PINE_D, 0, levels=('hi',))
    # bearers across the depth at every level and post line, and long rails front and back on top
    for z in LEVELS:
        for x in XS:
            k.add(lambda bm, hi, x=x, z=z: box(bm, hi, (x, 0, z - 0.03), (P + 0.012, DD - 0.004, 0.05), 0.004 if hi else 0.0), 'wood', PINE, 1)
    for y in YS:
        k.add(lambda bm, hi, y=y: box(bm, hi, (0, y, H - 0.025), (L, P - 0.006, 0.05), 0.004 if hi else 0.0), 'wood', PINE, 0)
    # shelf decks: three planks each with 6 mm gaps, a little proud of the posts at the ends
    for i, z in enumerate(LEVELS):
        pw = (DD - 0.012) / 3
        for j in range(3):
            y = -DD / 2 + pw / 2 + j * (pw + 0.006)
            def plank(bm, hi, y=y, z=z, j=j, i=i):
                box(bm, hi, (0, y, z + PT / 2), (L - 0.01, pw, PT), 0.003 if hi else 0.0)
            k.add(plank, 'wood', [PINE, PINE2, PINE][j], 0)
    # X braces in the back of both bays (two crossing slats), and on both ends
    def slat(bm, hi, a, b, w=0.05, t=0.016):
        a, b = Vector(a), Vector(b)
        d = b - a
        c = (a + b) / 2
        ln = d.length
        before = set(bm.faces)
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ d.to_track_quat('X', 'Z').to_matrix().to_4x4() @ Matrix.Diagonal((ln, t, w, 1)))
        f = _new_faces(bm, before)
        bevel_piece(bm, f, 0.003, hi)
    yb = DD / 2 + 0.008
    for x0, x1 in ((XS[0], XS[1]), (XS[1], XS[2])):
        k.add(lambda bm, hi, x0=x0, x1=x1: slat(bm, hi, (x0 + 0.03, yb, LEVELS[0] + 0.04), (x1 - 0.03, yb, LEVELS[2] - 0.04)), 'wood', PINE2, 0)
        k.add(lambda bm, hi, x0=x0, x1=x1: slat(bm, hi, (x1 - 0.03, yb + 0.016, LEVELS[0] + 0.04), (x0 + 0.03, yb + 0.016, LEVELS[2] - 0.04)), 'wood', PINE2, 0)
    for x in (XS[0] - P / 2 - 0.008, XS[2] + P / 2 + 0.008):
        k.add(lambda bm, hi, x=x: slat(bm, hi, (x, YS[0], LEVELS[0] + 0.04), (x, YS[1], LEVELS[1] - 0.04), 0.045), 'wood', PINE2, 0)
    # iron straps where the bearers meet the posts, with nail heads
    for x in XS:
        for y in YS:
            for z in LEVELS[1:3]:
                k.add(lambda bm, hi, x=x, y=y, z=z: box(bm, hi, (x, y + (0.033 if y > 0 else -0.033), z - 0.03), (0.04, 0.003, 0.07), 0.001 if hi else 0.0), 'iron', IRON, 0)
    return k.finish('rk-frame')


def jar(k, rnd, x, y, z0):
    r = rnd.uniform(0.045, 0.065)
    h = rnd.uniform(0.11, 0.17)
    prof = [(0.0, 0), (r * 0.9, 0), (r, 0.01), (r, h * 0.82), (r * 0.78, h * 0.9), (r * 0.8, h), (0.0, h)]
    plo = [(r, 0), (r, h * 0.82), (r * 0.8, h), (0.0, h)]
    k.add(lambda bm, hi: lathe(bm, hi, [(a, z0 + b) for a, b in (prof if hi else plo)], (x, y, 0), seg=6, seg_hi=24, cap_bot=hi), 'glass', rnd.choice(GLASS), 1)
    # waxed cloth over the mouth, tied
    k.add(lambda bm, hi: cyl(bm, hi, (x, y, z0 + h + 0.006), r * 0.86, 0.012, 'z', 8 if hi else 6), 'cloth', rnd.choice(CLOTH), 0)


def bottle(k, rnd, x, y, z0):
    r = rnd.uniform(0.032, 0.042)
    h = rnd.uniform(0.2, 0.27)
    prof = [(0.0, 0), (r, 0), (r, h * 0.55), (r * 0.45, h * 0.72), (r * 0.32, h * 0.92), (r * 0.36, h), (0.0, h)]
    plo = [(r, 0), (r, h * 0.55), (r * 0.34, h * 0.78), (r * 0.34, h), (0.0, h)]
    k.add(lambda bm, hi: lathe(bm, hi, [(a, z0 + b) for a, b in (prof if hi else plo)], (x, y, 0), seg=6, seg_hi=20, cap_bot=hi), 'glass', rnd.choice(GLASS), 1)
    k.add(lambda bm, hi: cyl(bm, hi, (x, y, z0 + h + 0.008), r * 0.3, 0.02, 'z', 6), 'wood', '#8A6A44', 0, levels=('hi',))


def crock(k, rnd, x, y, z0):
    r = rnd.uniform(0.07, 0.09)
    h = rnd.uniform(0.16, 0.22)
    prof = [(0.0, 0), (r * 0.7, 0), (r, h * 0.35), (r * 0.95, h * 0.7), (r * 0.62, h * 0.9), (r * 0.7, h), (r * 0.6, h), (0.0, h * 0.96)]
    plo = [(r * 0.7, 0), (r, h * 0.4), (r * 0.62, h * 0.9), (r * 0.7, h), (0.0, h * 0.96)]
    k.add(lambda bm, hi: lathe(bm, hi, [(a, z0 + b) for a, b in (prof if hi else plo)], (x, y, 0), seg=8, seg_hi=28, cap_bot=hi), 'stone', rnd.choice(CLAY), 1)


def small_crate(k, rnd, x, y, z0):
    w, d, h = rnd.uniform(0.24, 0.32), rnd.uniform(0.2, 0.26), rnd.uniform(0.14, 0.2)
    def b(bm, hi):
        for i in range(3):
            zz = z0 + h * (i + 0.5) / 3
            box(bm, hi, (x, y, zz), (w, d, h / 3 - 0.006), 0.004)
        for sx in (-1, 1):
            box(bm, hi, (x + sx * (w / 2 - 0.012), y - d / 2 - 0.004, z0 + h / 2), (0.024, 0.008, h), 0.002)
            box(bm, hi, (x + sx * (w / 2 - 0.012), y + d / 2 + 0.004, z0 + h / 2), (0.024, 0.008, h), 0.002)
    k.add(b, 'wood', rnd.choice([PINE, PINE2, '#6E5236']), 2)


def bolt(k, rnd, x, y, z0):
    r = rnd.uniform(0.045, 0.06)
    ln = rnd.uniform(0.3, 0.38)
    k.add(lambda bm, hi: cyl(bm, hi, (x, y, z0 + r), r, ln, 'y', 10), 'cloth', rnd.choice(CLOTH), 1)


def step_goods(level):
    """What stands on one shelf level (0 bottom .. 3 top), both bays, front to back."""
    k = Kit(70 + level)
    rnd = random.Random(170 + level * 13)
    z0 = LEVELS[level] + PT
    for x0, x1 in ((XS[0] + P / 2 + 0.03, XS[1] - P / 2 - 0.03), (XS[1] + P / 2 + 0.03, XS[2] - P / 2 - 0.03)):
        x = x0
        kinds = ['crate', 'crock', 'crock', 'bolt'] if level == 0 else ['jar', 'bottle', 'jar', 'crate', 'crock', 'bottle'] if level < 3 else ['jar', 'bolt', 'crate']
        while x < x1 - 0.08:
            kind = rnd.choice(kinds)
            y = rnd.uniform(-0.06, 0.06)
            if kind == 'crate':
                w = 0.3
                if x + w > x1:
                    break
                small_crate(k, rnd, x + w / 2, y, z0)
                x += w + rnd.uniform(0.02, 0.06)
            elif kind == 'bolt':
                if x + 0.12 > x1:
                    break
                for j in range(rnd.randint(1, 2)):
                    bolt(k, rnd, x + 0.06, 0.0, z0 + j * 0.105)
                x += 0.14
            elif kind == 'crock':
                crock(k, rnd, x + 0.09, y, z0)
                x += 0.2
            else:
                n = rnd.randint(2, 4)
                for j in range(n):
                    (jar if kind == 'jar' else bottle)(k, rnd, x + 0.06, -0.09 + j * 0.06 + rnd.uniform(-0.01, 0.01), z0)
                    x += 0.03
                x += 0.1
            if rnd.random() < 0.18:
                x += rnd.uniform(0.08, 0.16)
    return k.finish('rk-goods-%d' % level)


def step_top():
    """A plank deck on the top rails and what is stored on it, as the board camera sees it: a crate
    with a loose lid, a wicker basket, a cloth bolt, a coil of rope and a stack of empty sacks."""
    k = Kit(80)
    rnd = random.Random(81)
    zt = H
    pw = (DD - 0.012) / 3
    for j in range(3):
        y = -DD / 2 + pw / 2 + j * (pw + 0.006)
        k.add(lambda bm, hi, y=y: box(bm, hi, (0, y, zt + PT / 2), (L - 0.01, pw, PT), 0.003 if hi else 0.0), 'wood', [PINE2, PINE, PINE2][j], 0)
    z0 = zt + PT
    small_crate(k, rnd, -0.55, 0.0, z0)
    # the crate's lid, slid half off
    k.add(lambda bm, hi: box(bm, hi, (-0.5, 0.03, z0 + 0.21), (0.3, 0.24, 0.016), 0.003), 'wood', PINE2, 0)
    # wicker basket: a tapered tub with a rim
    def basket(bm, hi):
        prof = [(0.0, 0), (0.1, 0), (0.13, 0.13), (0.14, 0.14), (0.125, 0.14), (0.1, 0.02), (0.0, 0.02)]
        lathe(bm, hi, [(r, z0 + z) for r, z in prof], (-0.12, 0.0, 0), seg=10, seg_hi=32)
    k.add(basket, 'rope', '#A88A56', 2)
    bolt(k, rnd, 0.22, 0.0, z0)
    # coil of rope: a flat torus
    def coil(bm, hi):
        n, m = (24, 8) if hi else (10, 5)
        R, r = 0.1, 0.025
        rings = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rings.append([bm.verts.new(Vector((0.48 + (R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), z0 + r + r * math.sin(b))))
                          for b in [2 * math.pi * j / m for j in range(m)]])
        for i in range(n):
            A, B = rings[i], rings[(i + 1) % n]
            for j in range(m):
                bm.faces.new((A[j], A[(j + 1) % m], B[(j + 1) % m], B[j]))
    k.add(coil, 'rope', '#B89A64', 2)
    # folded empty sacks
    for i in range(3):
        k.add(lambda bm, hi, i=i: box(bm, hi, (0.72, -0.02 + i * 0.01, z0 + 0.012 + i * 0.022), (0.24 - i * 0.02, 0.3 - i * 0.03, 0.022), 0.006), 'cloth', '#B8A47A', 2)
    return k.finish('rk-top')
