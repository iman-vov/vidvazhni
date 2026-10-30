# crate-wall (2026-10-30): a stack of crates across two touching hexes (3.1 x 0.9 x 1.3 m), on two
# pallets, two tiers and a short third, stepped down to the ends; a sack on top and a crowbar
# leaning on the end. exec os_lib.py, os_shapes.py, then this; step_pallets(), step_crates(tier),
# step_extras().
import math, random
from mathutils import Vector, Matrix

PINE, PINE2, PINE3, PINE_D = '#8A6A44', '#7A5C3A', '#94744C', '#5A4028'
IRON = '#3A3B40'
PH = 0.13                 # pallet height


def crate(k, rnd, c, size, rot=0.0):
    """One crate centred at c (bottom at c.z): lo a box; hi planks with gaps on every face, corner
    battens, iron corner caps."""
    w, d, h = size
    M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot, 4, 'Z')
    col = rnd.choice([PINE, PINE2, PINE3])

    def body(bm, hi):
        before = set(bm.faces)
        if not hi:
            box(bm, hi, (0, 0, h / 2), (w, d, h), 0.006)
        else:
            n = max(2, round(h / 0.11))
            ph = (h - 0.006 * (n - 1)) / n
            for i in range(n):
                z = ph / 2 + i * (ph + 0.006)
                box(bm, hi, (0, 0, z), (w - 0.004, d - 0.004, ph), 0.004)
            # lid planks
            m = max(2, round(w / 0.12))
            pw = (w - 0.006 * (m - 1)) / m
            for i in range(m):
                x = -w / 2 + pw / 2 + i * (pw + 0.006)
                box(bm, hi, (x, 0, h - 0.008), (pw, d, 0.018), 0.003)
        f = _new_faces(bm, before)
        move(bm, f, M)
    k.add(body, 'wood', col, 2)

    def battens(bm, hi):
        before = set(bm.faces)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(bm, hi, (sx * (w / 2 - 0.02), sy * (d / 2 + 0.006), h / 2), (0.04, 0.014, h), 0.003)
        f = _new_faces(bm, before)
        move(bm, f, M)
    k.add(battens, 'wood', PINE_D, 0)

    def caps(bm, hi):
        before = set(bm.faces)
        for sx in (-1, 1):
            for sy in (-1, 1):
                for z in (0.02, h - 0.02):
                    box(bm, hi, (sx * (w / 2 - 0.018), sy * (d / 2 + 0.014), z), (0.05, 0.003, 0.045), 0.001)
        f = _new_faces(bm, before)
        move(bm, f, M)
    k.add(caps, 'iron', IRON, 0, levels=('hi',))


def step_pallets():
    k = Kit(91)
    for x0 in (-0.78, 0.78):
        for y in (-0.36, 0.0, 0.36):
            k.add(lambda bm, hi, x0=x0, y=y: box(bm, hi, (x0, y, 0.035), (1.42, 0.1, 0.07), 0.004 if hi else 0.0), 'wood', PINE_D, 0)
        for i in range(7):
            x = x0 - 0.63 + i * 0.21
            k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, 0.1), (0.17, 0.86, 0.04), 0.003 if hi else 0.0), 'wood', PINE2, 0)
    return k.finish('cw-pallets')


# tiers: (x, y, (w, d, h)) bottoms on the tier's floor; the wall steps down to the ends
TIERS = [
    [(-1.18, 0.0, (0.6, 0.8, 0.48)), (-0.58, 0.0, (0.56, 0.8, 0.5)), (0.0, -0.18, (0.56, 0.44, 0.46)), (0.0, 0.22, (0.5, 0.38, 0.4)),
     (0.6, 0.0, (0.6, 0.8, 0.52)), (1.2, 0.0, (0.56, 0.78, 0.46))],
    [(-0.9, 0.04, (0.62, 0.7, 0.44)), (-0.28, 0.0, (0.56, 0.76, 0.46)), (0.32, -0.02, (0.6, 0.72, 0.42)), (0.92, 0.06, (0.5, 0.6, 0.38))],
    [(-0.55, 0.0, (0.52, 0.6, 0.36)), (0.05, 0.05, (0.48, 0.5, 0.32))],
]


def step_crates(tier):
    k = Kit(100 + tier)
    rnd = random.Random(200 + tier)
    z = PH
    for t in range(tier):
        z += min(c[2][2] for c in TIERS[t])
    for x, y, size in TIERS[tier]:
        crate(k, rnd, (x, y, z if tier == 0 else z - 0.002), size, rnd.uniform(-0.03, 0.03))
    return k.finish('cw-crates-%d' % tier)


def step_extras():
    """A full sack lying on the top, a coil of rope on a lower step, a crowbar leaning on the end."""
    k = Kit(110)
    rnd = random.Random(111)
    ztop = PH + min(c[2][2] for c in TIERS[0]) + min(c[2][2] for c in TIERS[1]) + 0.36
    def sack(bm, hi):
        before = set(bm.faces)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        f = _new_faces(bm, before)
        for v in {v for x in f for v in x.verts}:
            v.co = Vector((v.co.x * 0.26, v.co.y * 0.17, max(v.co.z, -0.6) * 0.12))
        move(bm, f, Matrix.Translation((0.45, -0.05, ztop - 0.02)) @ Matrix.Rotation(0.4, 4, 'Z'))
    k.add(sack, 'cloth', '#B8A47A', 2)
    # rope coil on the second step at the right end
    zr = PH + min(c[2][2] for c in TIERS[0])
    def coil(bm, hi):
        n, m = (24, 8) if hi else (10, 5)
        R, r = 0.11, 0.024
        rings = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rings.append([bm.verts.new(Vector((1.25 + (R + r * math.cos(b)) * math.cos(a), 0.1 + (R + r * math.cos(b)) * math.sin(a), zr + r + r * math.sin(b))))
                          for b in [2 * math.pi * j / m for j in range(m)]])
        for i in range(n):
            A, B = rings[i], rings[(i + 1) % n]
            for j in range(m):
                bm.faces.new((A[j], A[(j + 1) % m], B[(j + 1) % m], B[j]))
    k.add(coil, 'rope', '#B89A64', 2)
    # crowbar leaning on the left end
    p0, p1 = Vector((-1.62, 0.18, 0.0)), Vector((-1.5, 0.18, 0.62))
    k.add(lambda bm, hi: tube(bm, hi, [p0, (p0 + p1) / 2, p1, p1 + Vector((0.05, 0, 0.03))], 0.012, 0.01, sides=(5, 8)), 'iron', IRON, 0)
    return k.finish('cw-extras')
