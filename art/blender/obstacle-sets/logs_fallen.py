# logs-fallen (2026-10-30): trunks fallen one way on one hex (1.7 x 0.9 x 0.6 m): two thick logs side
# by side and a thinner one across their top, bark, a sawn end with rings, a broken end with
# splinters, branch stubs, moss in patches on the tops, fern and mushrooms at the foot.
# exec os_lib.py, os_shapes.py, then this; step_logs(), step_foot().
import math, random
from mathutils import Vector, Matrix
from mathutils import noise as mnoise

BARK, BARK2, WOOD_END = '#7E6448', '#6E563C', '#C8A070'
MOSS = '#6A8A3E'


def mossy(build, keep=0.58):
    def b(bm, hi):
        f = build(bm, hi)
        bm.normal_update()
        top = []
        for x in f:
            if x.is_valid and x.normal.z > 0.6:
                c = x.calc_center_median()
                if mnoise.noise(c * 4.5) * 0.5 + 0.5 < keep:
                    top.append(x)
        return [(top, 'stone', MOSS)]
    return b


def log(k, rnd, p0, p1, r0, r1, seed, sawn=True):
    side0 = Vector((0, 0, 1)).cross((p1 - p0).normalized()).normalized()
    pts = [p0] + [p0.lerp(p1, t) + side0 * rnd.uniform(-0.035, 0.035) + Vector((0, 0, rnd.uniform(-0.015, 0.02))) for t in (0.2, 0.4, 0.6, 0.8)] + [p1]

    def body(bm, hi):
        before = set(bm.faces)
        tube(bm, hi, pts, r0, r1, sides=(9, 22), k_hi=6, bark=0.14, seed=seed, cap0=False, cap1=False, flat=0.9)
        return _new_faces(bm, before)
    k.add(mossy(body), 'wood', rnd.choice([BARK, BARK2]), 2)
    d = (p1 - p0).normalized()

    def end_disc(bm, hi, c, r, n):
        before = set(bm.faces)
        cyl(bm, hi, (0, 0, 0), r * 0.98, 0.012, 'z', 10 if hi else 8)
        f = _new_faces(bm, before)
        move(bm, f, Matrix.Translation(c) @ n.to_track_quat('Z', 'Y').to_matrix().to_4x4())
        return f
    # a sawn end with the light end grain
    k.add(lambda bm, hi: end_disc(bm, hi, p0 - d * 0.004, r0, -d), 'wood', WOOD_END, 0)
    # the broken end: a disc and splinters standing out of it
    k.add(lambda bm, hi: end_disc(bm, hi, p1 + d * 0.004, r1, d), 'wood', '#8A6A44', 0)
    for i in range(5 if sawn else 7):
        a = 2 * math.pi * i / 5 + rnd.uniform(-0.3, 0.3)
        side = Vector((0, 0, 1)).cross(d).normalized()
        up = d.cross(side).normalized()
        base = p1 + (side * math.cos(a) + up * math.sin(a)) * r1 * rnd.uniform(0.2, 0.8)
        k.add(lambda bm, hi, base=base, i=i: blade(bm, hi, base, (d + up * rnd.uniform(-0.2, 0.3)).normalized(), rnd.uniform(0.07, 0.15), 0.035, 0.0, seed=seed + i), 'wood', '#9A7A50', 0)
    # a broken fork of a branch on the thick logs, and branch stubs
    if r0 > 0.15:
        t = rnd.uniform(0.45, 0.6)
        c = p0.lerp(p1, t)
        side = Vector((0, 0, 1)).cross(d).normalized() * -1
        q0 = c + (side * 0.6 + Vector((0, 0, 0.6))).normalized() * r0 * 0.8
        q1 = q0 + (side * 0.7 + Vector((0, 0, 0.5)) + d * 0.2).normalized() * 0.3
        q2 = q1 + (side * 0.3 + Vector((0, 0, 0.9)) - d * 0.3).normalized() * 0.16
        q3 = q1 + (side + d * 0.6).normalized() * 0.2
        k.add(lambda bm, hi: tube(bm, hi, [q0, (q0 + q1) / 2, q1, q2], 0.05, 0.02, sides=(6, 12), bark=0.1, seed=seed + 40), 'wood', BARK2, 2)
        k.add(lambda bm, hi: tube(bm, hi, [q1, q3], 0.03, 0.015, sides=(5, 10), bark=0.1, seed=seed + 41), 'wood', BARK2, 0)
    for i in range(2):
        t = rnd.uniform(0.3, 0.8)
        c = p0.lerp(p1, t)
        side = Vector((0, 0, 1)).cross(d).normalized() * rnd.choice((-1, 1))
        dirv = (side + Vector((0, 0, rnd.uniform(0.3, 0.9)))).normalized()
        r = (r0 + (r1 - r0) * t)
        q0 = c + dirv * r * 0.7
        q1 = q0 + dirv * rnd.uniform(0.1, 0.18)
        k.add(lambda bm, hi, q0=q0, q1=q1: tube(bm, hi, [q0, (q0 + q1) / 2, q1], 0.035, 0.022, sides=(5, 10), bark=0.1, seed=seed + 20 + i), 'wood', BARK2, 0)


def step_logs():
    k = Kit(601)
    rnd = random.Random(602)
    log(k, rnd, Vector((-0.8, -0.2, 0.17)), Vector((0.78, -0.24, 0.16)), 0.18, 0.15, 11)
    log(k, rnd, Vector((-0.72, 0.2, 0.15)), Vector((0.82, 0.18, 0.14)), 0.155, 0.12, 12, sawn=False)
    log(k, rnd, Vector((-0.55, -0.01, 0.36)), Vector((0.62, 0.02, 0.32)), 0.11, 0.08, 13)
    return k.finish('lf-logs')


def step_foot():
    k = Kit(603)
    rnd = random.Random(604)
    for i in range(6):
        x = rnd.uniform(-0.7, 0.7)
        side = rnd.choice((-1, 1))
        base = Vector((x, side * rnd.uniform(0.36, 0.44), 0.01))
        for j in range(4):
            a = rnd.uniform(0, 2 * math.pi)
            dirv = Vector((math.cos(a) * 0.8, side * abs(math.sin(a)) * 0.8 + side * 0.3, 0.6)).normalized()
            k.add(lambda bm, hi, base=base, dirv=dirv, j=j: blade(bm, hi, base, dirv, 0.26, 0.065, 0.5, seed=j, leaf=True), 'cloth', '#4E6E34', 0)
    # a cluster of mushrooms on the thick log's side and two at its foot
    for c, s in (((0.2, -0.38, 0.14), 1.0), ((0.28, -0.42, 0.0), 0.8), ((-0.4, 0.37, 0.0), 0.9)):
        def mush(bm, hi, c=c, s=s):
            prof = [(0.0, 0), (0.012 * s, 0), (0.012 * s, 0.04 * s), (0.04 * s, 0.045 * s), (0.03 * s, 0.065 * s), (0.0, 0.07 * s)]
            lathe(bm, hi, prof, c, seg=6, seg_hi=16)
        k.add(mush, 'cloth', '#C8A06A', 0)
    return k.finish('lf-foot')
