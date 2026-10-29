# Act III crystal-heart v2 (high detail): a faceted lilac heart held by three bronze claws on a
# stepped stone pedestal, built piece by piece in the live Blender on hq_lib (exec hq_lib.py
# first). Steps: step_pedestal, step_band, step_claws, step_heart, step_crystals; then
# join_parts('crystal-heart', HEART_PARTS). Front is -Y.
import math
from mathutils import Vector, Matrix, Euler

STONE = '#8E8A82'
STONE_D = '#6E6A64'
BRONZE = '#8A6A35'
BRASS_W = '#B8924A'
LILAC = '#8C7BC4'
PALE = '#C9D6E8'
ZT = 0.70                     # pedestal top
HS = 0.0125                   # heart curve scale (width 0.4)
HZ = ZT + 0.035 + 17 * HS     # heart centre
HD = 0.1                      # heart half depth
HEART_PARTS = ['ch-pedestal', 'ch-band', 'ch-claws', 'ch-heart', 'ch-crystals']

PED = [(0.0, 0.0), (0.3, 0.0), (0.3, 0.058), (0.288, 0.072), (0.262, 0.08), (0.262, 0.128), (0.248, 0.142),
       (0.205, 0.15), (0.192, 0.165), (0.172, 0.18), (0.166, 0.2), (0.152, 0.55), (0.16, 0.563), (0.176, 0.578),
       (0.186, 0.598), (0.215, 0.604), (0.215, 0.67), (0.206, 0.69), (0.19, ZT), (0.0, ZT)]


def chip(bm, faces, az, width, depth, zmin, rmin, rnd):
    """Knocks a chip out of a rim: verts above zmin and beyond rmin, within `width` radians of
    azimuth az, go in and down by up to `depth`, a little ragged."""
    for v in {v for f in faces for v in f.verts}:
        r = math.hypot(v.co.x, v.co.y)
        if r < rmin or v.co.z < zmin:
            continue
        d = math.atan2(math.sin(math.atan2(v.co.y, v.co.x) - az), math.cos(math.atan2(v.co.y, v.co.x) - az))
        if abs(d) > width:
            continue
        w = (1 - abs(d) / width) ** 0.7 * (0.75 + 0.5 * rnd.random())
        k = (r - depth * w) / r
        v.co.x *= k
        v.co.y *= k
        v.co.z -= depth * 0.8 * w * min(1.0, (v.co.z - zmin) / 0.02)


def step_pedestal():
    """Turned stepped pedestal: plinth, step, a shaft with twelve flutes (hi), a capital with a
    big chip knocked off its front-right rim and a smaller one at the back."""
    k = Kit(51)

    def ped(bm, hi):
        prof = PED
        if hi:
            # extra rings up the shaft for the flutes to bite into
            i = PED.index((0.166, 0.2))
            mid = [(0.166 + (0.152 - 0.166) * (z - 0.2) / 0.35, z) for z in (0.222, 0.26, 0.31, 0.375, 0.44, 0.49, 0.528)]
            prof = PED[:i + 1] + mid + PED[i + 1:]
        f = lathe(bm, hi, prof, (0, 0, 0), seg=24, seg_hi=48)
        if hi:
            for v in {v for ff in f for v in ff.verts}:
                if 0.215 < v.co.z < 0.535:
                    t = math.atan2(v.co.y, v.co.x)
                    ends = min(1.0, (v.co.z - 0.215) / 0.03, (0.535 - v.co.z) / 0.03)
                    g = 1 - 0.09 * ends * max(0.0, math.cos(12 * t)) ** 2
                    v.co.x *= g
                    v.co.y *= g
        rnd = random.Random(5)
        chip(bm, f, math.radians(-60), 0.42, 0.03, 0.64, 0.17, rnd)
        chip(bm, f, math.radians(120), 0.25, 0.018, 0.65, 0.18, rnd)
        chip(bm, f, math.radians(-120), 0.3, 0.02, 0.05, 0.27, rnd)
        return f
    k.add(ped, 'stone', STONE)
    return k.finish('ch-pedestal')


def step_band():
    """Brass band round the capital with twelve rivets (hi) and a bronze socket for the claws."""
    k = Kit(52)
    band = [(0.0, 0.0), (0.221, 0.0), (0.224, 0.006), (0.224, 0.034), (0.221, 0.04), (0.0, 0.04)]
    k.add(lambda bm, hi: lathe(bm, hi, [(r, z + 0.615) for r, z in band[1:-1]], (0, 0, 0), seg=24, seg_hi=48,
                               cap_top=False, cap_bot=False), 'brass', BRASS_W)

    def rivets(bm, hi):
        f = []
        for i in range(12):
            t = 2 * math.pi * (i + 0.5) / 12
            d = Vector((math.cos(t), math.sin(t), 0))
            f += dome(bm, hi, d * 0.224 + Vector((0, 0, 0.635)), 0.0065, 0.004, d)
        return f
    k.add(rivets, 'brass', BRASS_W, levels=('hi',))
    sock = [(0.0, ZT - 0.005), (0.075, ZT - 0.005), (0.08, ZT + 0.008), (0.07, ZT + 0.022), (0.05, ZT + 0.03),
            (0.0, ZT + 0.032)]
    k.add(lambda bm, hi: lathe(bm, hi, sock, (0, 0, 0), seg=12, seg_hi=36), 'brass', BRONZE)
    return k.finish('ch-band')


def tube(bm, hi, path, r0, r1, flat=0.75):
    """Tapered tube along a path (claws): elliptic section r0 at the start to r1 at the end,
    closed by a point at the tip."""
    before = set(bm.faces)
    path = [Vector(p) for p in path]
    m = 12 if hi else 8
    rings = []
    n = len(path)
    a = None
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        # parallel transport: carry the side axis along, so the section never flips where the
        # claw runs straight up
        if a is None:
            a = t.cross(Vector((0, 0, 1)))
            a = a.normalized() if a.length > 1e-4 else Vector((1, 0, 0))
        else:
            a = (a - t * a.dot(t)).normalized()
        b = a.cross(t).normalized()
        r = r0 + (r1 - r0) * (i / (n - 1)) ** 1.3
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * j / m) + b * flat * math.sin(2 * math.pi * j / m)) * r)
                      for j in range(m)])
    for ra, rb in zip(rings, rings[1:]):
        for j in range(m):
            jj = (j + 1) % m
            bm.faces.new((ra[j], ra[jj], rb[jj], rb[j]))
    tip = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * r1 * 1.5)
    for j in range(m):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % m], tip))
    bm.faces.new(rings[0][::-1])
    f = [g for g in bm.faces if g not in before]
    bmesh.ops.recalc_face_normals(bm, faces=f)
    return f


def claw_path(rho_z, d, hi):
    pts = [Vector((d.x * r, d.y * r, z)) for r, z in rho_z]
    # a smooth curve through the points: Catmull-Rom, finer on hi
    k = 4 if hi else 2
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        for s in range(k):
            t = s / k
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def step_claws():
    """Three curved bronze claws out of the socket: two hook the heart's lobes from the sides
    (a little behind, to keep the front clear), one climbs its back. Each has a knuckle ring."""
    k = Kit(53)
    side = [(0.05, ZT + 0.02), (0.12, ZT + 0.04), (0.2, ZT + 0.1), (0.243, ZT + 0.19), (0.236, ZT + 0.27),
            (0.198, ZT + 0.318), (0.158, ZT + 0.328)]
    back = [(0.04, ZT + 0.02), (0.1, ZT + 0.05), (0.135, ZT + 0.12), (0.128, ZT + 0.2), (0.092, ZT + 0.255)]
    for d, prof in ((Vector((1, 0, 0)), side), (Vector((-1, 0, 0)), side), (Vector((0, 1, 0)), back)):
        k.add(lambda bm, hi, d=d, prof=prof: tube(bm, hi, claw_path(prof, d, hi), 0.032, 0.011), 'brass', BRONZE)
        r, z = prof[1]
        k.add(lambda bm, hi, d=d, r=r, z=z: sphere(bm, hi, (d.x * r, d.y * r, z), 0.034, 8, 5), 'brass', BRONZE)
    return k.finish('ch-claws')


def heart_outline(n):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append(Vector((x * HS, 0, z * HS + HZ)))
    return out


def step_heart():
    """The faceted heart: an outline ring, an inner ring on each face and a centre point, all
    flat facets; facets alternate lilac shades with a few pale ones."""
    k = Kit(54)
    rnd = random.Random(9)

    def heart(bm, hi):
        before = set(bm.faces)
        n = 18
        rim = [bm.verts.new(p) for p in heart_outline(n)]
        c = Vector((0, 0, HZ - 0.01))
        faces = []
        for sgn in (-1, 1):
            inner = [bm.verts.new(c + (p - c) * 0.58 + Vector((0, sgn * HD * 0.72, 0))) for p in heart_outline(n)]
            mid = bm.verts.new(c + Vector((0, sgn * HD, 0.02)))
            for i in range(n):
                j = (i + 1) % n
                q = [rim[i], rim[j], inner[j], inner[i]]
                if sgn > 0:
                    q = q[::-1]
                faces.append(bm.faces.new((q[0], q[1], q[2])))
                faces.append(bm.faces.new((q[0], q[2], q[3])))
                tri = (inner[i], inner[j], mid) if sgn < 0 else (inner[j], inner[i], mid)
                faces.append(bm.faces.new(tri))
        f = [g for g in bm.faces if g not in before]
        bmesh.ops.recalc_face_normals(bm, faces=f)
        if hi:
            bevel_piece(bm, f, 0.0018, hi, angle=8, segs_hi=2)
        return [g for g in bm.faces if g not in before]

    def build(bm, hi):
        f = heart(bm, hi)
        r = random.Random(9)
        out = []
        for g in f:
            if g.calc_area() < 2e-4:
                continue
            pick = r.random()
            col = PALE if pick > 0.86 else ('#7A6AB4' if pick < 0.35 else ('#9C8CD0' if pick < 0.6 else LILAC))
            out.append(([g], 'crystal', col))
        return out
    k.add(build, 'crystal', LILAC)
    return k.finish('ch-heart')


def raw_crystal(bm, hi, base, d, r, h):
    """A raw six-sided crystal with a pointed tip, growing from base along d."""
    prof = [(0.0, -0.02), (r, -0.02), (r * 1.05, h * 0.7), (r * 0.55, h * 0.88), (0.0, h)]
    f = lathe(bm, hi, prof, (0, 0, 0), seg=6, seg_hi=6)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    move(bm, f, Matrix.Translation(Vector(base)) @ q.to_matrix().to_4x4() @ Matrix.Rotation(r * 40, 4, 'Z'))
    if hi:
        before = set(bm.faces) - set(f)
        bevel_piece(bm, f, 0.0015, hi, angle=20, segs_hi=2)
        f = [g for g in bm.faces if g not in before]
    return f


def step_crystals():
    """Two clusters of raw lilac crystals out of cracks in the plinth, front-left and right."""
    k = Kit(55)
    clusters = [(math.radians(-130), 0.08), (math.radians(-20), 0.08), (math.radians(150), 0.13)]
    rnd = random.Random(4)
    for az, z in clusters:
        out = Vector((math.cos(az), math.sin(az), 0))
        for i in range(3 if z < 0.1 else 2):
            a = az + (i - 1) * 0.16
            o = Vector((math.cos(a), math.sin(a), 0))
            base = o * (0.24 if z < 0.1 else 0.19) + Vector((0, 0, z))
            d = o * (0.55 + 0.4 * rnd.random()) + Vector((0, 0, 1))
            r = 0.016 + 0.014 * rnd.random() * (1.4 if i == 1 else 1)
            h = r * (4.2 + 1.6 * rnd.random())
            col = '#8C7BC4' if i != 2 else '#A597D4'
            k.add(lambda bm, hi, base=base, d=d, r=r, h=h: raw_crystal(bm, hi, base, d, r, h), 'crystal', col)
    return k.finish('ch-crystals')
