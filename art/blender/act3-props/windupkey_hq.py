# Act III wind-up-key v2 (high detail): a giant clockwork key stuck upright into an iron gear
# lying flat, built piece by piece in the live Blender on hq_lib (exec hq_lib.py first).
# Steps: step_gear, step_hub, step_shaft, step_bow; then join_parts('wind-up-key', KEY_PARTS).
# Front is -Y; the bow faces the camera.
import math
from mathutils import Vector, Matrix, Euler

IRON = '#3A3B40'
IRON_W = '#4A4B50'
BRASS = '#BC9748'
BRASS_D = '#9C7A3C'
GH = 0.075                    # gear thickness
KEY_PARTS = ['wk-gear', 'wk-hub', 'wk-shaft', 'wk-bow']


def ring_plate(bm, hi, outer, inner, t, m, bev=0.004, angle=30):
    """A flat ring between two closed 2D outlines of equal length (local XY, z from -t/2 to
    t/2), placed by matrix m, edges bevelled."""
    before = set(bm.faces)
    n = len(outer)
    lv = []
    for z in (-t / 2, t / 2):
        lv.append(([bm.verts.new(m @ Vector((x, y, z))) for x, y in outer],
                   [bm.verts.new(m @ Vector((x, y, z))) for x, y in inner]))
    (o0, i0), (o1, i1) = lv
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((o1[i], o1[j], i1[j], i1[i]))   # top
        bm.faces.new((o0[j], o0[i], i0[i], i0[j]))   # bottom
        bm.faces.new((o0[i], o0[j], o1[j], o1[i]))   # outer wall
        bm.faces.new((i0[j], i0[i], i1[i], i1[j]))   # inner wall
    f = [g for g in bm.faces if g not in before]
    bmesh.ops.recalc_face_normals(bm, faces=f)
    # convex edges only: a bevel in the concave roots between teeth folds into wedges
    es = [e for e in {e for g in f for e in g.edges}
          if len(e.link_faces) == 2 and e.is_convex and e.calc_face_angle(0) > math.radians(angle)]
    if es and bev > 0:
        bmesh.ops.bevel(bm, geom=es, offset=bev, segments=3 if hi else 1, profile=0.5, affect='EDGES', clamp_overlap=True)
    return [g for g in bm.faces if g not in before]


def circle2(r, n, c=(0, 0)):
    return [(c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def gear_outline(teeth=12, r_root=0.33, r_tip=0.4):
    pts = []
    step = 2 * math.pi / teeth
    for i in range(teeth):
        a = i * step
        pts += [(r_root * math.cos(a - 0.13), r_root * math.sin(a - 0.13)),
                (r_tip * math.cos(a - 0.075), r_tip * math.sin(a - 0.075)),
                (r_tip * math.cos(a + 0.075), r_tip * math.sin(a + 0.075)),
                (r_root * math.cos(a + 0.13), r_root * math.sin(a + 0.13))]
    return pts


def step_gear():
    """The toothed rim (12 chunky teeth) with a raised inner lip, six spokes and rivets where
    the spokes meet the rim (hi)."""
    k = Kit(61)
    m = Matrix.Translation((0, 0, GH / 2))
    k.add(lambda bm, hi: ring_plate(bm, hi, gear_outline(), circle2(0.27, 48), GH, m, bev=0.006), 'iron', IRON)
    lip = Matrix.Translation((0, 0, GH / 2 + 0.004))
    k.add(lambda bm, hi: ring_plate(bm, hi, circle2(0.285, 32 if not hi else 64), circle2(0.255, 32 if not hi else 64),
                                    GH + 0.008, lip, bev=0.003), 'iron', IRON_W)
    for i in range(6):
        a = 2 * math.pi * i / 6 + math.pi / 6
        d = Vector((math.cos(a), math.sin(a), 0))
        k.add(lambda bm, hi, d=d, a=a: box(bm, hi, d * 0.18 + Vector((0, 0, GH * 0.45)), (0.2, 0.055, GH * 0.7), bev=0.006,
                                           rot=Euler((0, 0, a))), 'iron', IRON)

        def rivets(bm, hi, d=d, a=a):
            f = []
            side = Vector((-math.sin(a), math.cos(a), 0))
            for s in (-1, 1):
                f += dome(bm, hi, d * 0.262 + side * s * 0.016 + Vector((0, 0, GH)), 0.007, 0.004, (0, 0, 1))
            return f
        k.add(rivets, 'iron', IRON, levels=('hi',))
    return k.finish('wk-gear')


def step_hub():
    """Turned hub with a riveted top and the iron socket plate the key's shaft goes into."""
    k = Kit(62)
    hub = [(0.0, 0.0), (0.1, 0.0), (0.1, 0.085), (0.094, 0.097), (0.08, 0.102), (0.0, 0.102)]
    k.add(lambda bm, hi: lathe(bm, hi, hub, (0, 0, 0), seg=16, seg_hi=48), 'iron', IRON)

    def rivets(bm, hi):
        f = []
        for i in range(8):
            a = 2 * math.pi * (i + 0.5) / 8
            f += dome(bm, hi, (0.072 * math.cos(a), 0.072 * math.sin(a), 0.102), 0.008, 0.005, (0, 0, 1))
        return f
    k.add(rivets, 'iron', IRON, levels=('hi',))
    k.add(lambda bm, hi: box(bm, hi, (0, 0, 0.11), (0.105, 0.105, 0.02), bev=0.004), 'iron', IRON_W)
    for x in (-0.04, 0.04):
        for y in (-0.04, 0.04):
            k.add(lambda bm, hi, x=x, y=y: dome(bm, hi, (x, y, 0.12), 0.006, 0.004, (0, 0, 1)), 'iron', IRON,
                  levels=('hi',))
    return k.finish('wk-hub')


COLLAR = [(0.0, 0.43), (0.05, 0.43), (0.062, 0.442), (0.062, 0.468), (0.05, 0.48), (0.056, 0.49), (0.056, 0.508),
          (0.042, 0.52), (0.0, 0.52)]


def step_shaft():
    """Square brass shaft with chamfered arrises and a turned collar ring with a bead."""
    k = Kit(63)
    k.add(lambda bm, hi: box(bm, hi, (0, 0, 0.27), (0.066, 0.066, 0.32), bev=0.008, angle=40), 'brass', BRASS, 2)
    k.add(lambda bm, hi: lathe(bm, hi, COLLAR, (0, 0, 0), seg=16, seg_hi=48), 'brass', BRASS)
    return k.finish('wk-shaft')


BZ = 0.71                     # bow centre height
LX = 0.145                    # lobe centres at x = +-LX


def step_bow():
    """The two-lobed bow standing on a tapered neck: each lobe a raised outer rim, a thinner
    web and a raised inner rim round its piercing; a boss where the lobes meet."""
    k = Kit(64)
    m = lambda x: Matrix.Translation((x, 0, BZ)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    for x in (-LX, LX):
        k.add(lambda bm, hi, x=x: ring_plate(bm, hi, circle2(0.165, 64 if hi else 24), circle2(0.14, 64 if hi else 24), 0.058,
                                             m(x), bev=0.008), 'brass', BRASS)
        k.add(lambda bm, hi, x=x: ring_plate(bm, hi, circle2(0.15, 64 if hi else 24), circle2(0.1, 64 if hi else 24), 0.036,
                                             m(x), bev=0.004), 'brass', BRASS_D)
        k.add(lambda bm, hi, x=x: ring_plate(bm, hi, circle2(0.108, 48 if hi else 20), circle2(0.082, 48 if hi else 20), 0.05,
                                             m(x), bev=0.006), 'brass', BRASS)
    neck = [(-0.04, 0.505), (0.04, 0.505), (0.06, 0.6), (0.05, 0.65), (-0.05, 0.65), (-0.06, 0.6)]
    k.add(lambda bm, hi: prism(bm, hi, neck, 'y', -0.024, 0.024, bev=0.006), 'brass', BRASS)
    k.add(lambda bm, hi: cyl(bm, hi, (0, 0, BZ), 0.036, 0.07, 'y', 12, 0.006), 'brass', BRASS)
    k.add(lambda bm, hi: sphere(bm, hi, (0, -0.036, BZ), 0.022, 10, 6), 'brass', BRASS)
    return k.finish('wk-bow')
