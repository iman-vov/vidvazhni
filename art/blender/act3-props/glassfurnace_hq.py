# Glass Town (2026-10-29): `glass-furnace`, a glassblower's beehive furnace for the s17 glassworks
# in place of the blacksmith's forge: pale refractory stone in courses on an octagonal plinth, a
# dome with a flue and a brass cap, brass bands, two arched glory holes glowing from inside, a
# rack of blowpipes with a hot gather on one. Built on hq_lib (exec hq_lib.py first).
# Steps: step_body, step_brass, step_holes, step_pipes; then join_parts('glass-furnace', GF_PARTS).
# Front is -Y, feet at z = 0. 'glass' faces are the glow (second material in the game).
import math
from mathutils import Vector, Matrix, Euler

STONE = '#CDBB9C'
STONE_D = '#A89A84'
SOOT = '#5A4A40'
BRASS = '#C29545'
IRON = '#4A4644'
GLOW = '#FF9A3C'
WOOD = '#6A4A30'
RB, Z0, ZC = 0.42, 0.12, 0.78    # body radius, top of the plinth, top of the cylinder
DOME = [(RB, ZC), (0.41, 0.88), (0.38, 0.98), (0.33, 1.08), (0.26, 1.17), (0.18, 1.24)]
GF_PARTS = ['gf-body', 'gf-brass', 'gf-holes', 'gf-pipes']
HOLES = [(-0.5, 0.42), (0.5, 0.42)]    # (angle from front in rad, centre height)


def r_at(z):
    if z <= ZC:
        return RB
    for (r0, z0), (r1, z1) in zip(DOME, DOME[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return DOME[-1][0]


def step_body():
    """Plinth, the body in courses (hi: separate rings with sunk joints), the dome, the flue."""
    k = Kit(91)

    def plinth(bm, hi):
        pts = [(0.5 * math.cos(math.pi / 8 + i * math.pi / 4), 0.5 * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]
        return prism(bm, hi, pts, 'z', 0.0, Z0, bev=0.012)
    k.add(plinth, 'stone', STONE_D)

    def body(bm, hi):
        f = []
        if not hi:
            prof = [(0, Z0), (RB, Z0)] + DOME + [(0.12, 1.26)]
            return lathe(bm, hi, prof, seg=16, cap_bot=False, cap_top=False)
        # courses: rings of blocks on the cylinder, frustum bands on the dome
        z = Z0
        row = 0
        while z < ZC - 0.01:
            h = min(0.11, ZC - z)
            n = 14
            off = (row % 2) * math.pi / n
            for i in range(n):
                a0 = off + 2 * math.pi * i / n + 0.012
                a1 = off + 2 * math.pi * (i + 1) / n - 0.012
                pts = []
                for t in range(4):
                    a = a0 + (a1 - a0) * t / 3
                    pts.append((RB * math.cos(a), RB * math.sin(a)))
                for t in range(3, -1, -1):
                    a = a0 + (a1 - a0) * t / 3
                    pts.append(((RB - 0.12) * math.cos(a), (RB - 0.12) * math.sin(a)))
                f += prism(bm, hi, pts, 'z', z + 0.004, z + h - 0.004, bev=0.008)
            z += h
            row += 1
        for (r0, z0), (r1, z1) in zip(DOME, DOME[1:]):
            f += lathe(bm, hi, [(r0 - 0.12, z0 + 0.004), (r0, z0 + 0.004), (r0 + (r1 - r0) * 0.5 + 0.004, (z0 + z1) / 2), (r1, z1 - 0.004), (r1 - 0.12, z1 - 0.004)], seg=24, seg_hi=48)
        f += lathe(bm, hi, [(0, ZC - 0.1), (RB - 0.1, ZC - 0.1), (RB - 0.1, 1.2), (0, 1.25)], seg=12, seg_hi=24)
        return f
    k.add(body, 'stone', STONE)
    # flue
    k.add(lambda bm, hi: lathe(bm, hi, [(0.13, 1.2), (0.12, 1.3), (0.11, 1.62), (0.13, 1.66), (0.13, 1.7), (0.0, 1.7)],
                               seg=10, seg_hi=24, cap_bot=False), 'stone', STONE_D)
    # soot at the flue mouth and over the holes on hi comes from the colour: a dark ring under the cap
    k.add(lambda bm, hi: lathe(bm, hi, [(0.1, 1.69), (0.1, 1.705), (0.0, 1.705)], seg=10, seg_hi=24, cap_bot=False), 'stone', SOOT)
    return k.finish('gf-body')


def ring_path(z, r, n=24):
    return [Vector((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]


def step_brass():
    """Brass bands round the body and dome, a brass cap on the flue with a little finial."""
    k = Kit(92)
    band = [(0.004, -0.02), (-0.012, -0.02), (-0.012, 0.02), (0.004, 0.02)]  # u > 0 points inward
    for z in (Z0 + 0.03, 0.52, ZC + 0.02, 1.04):
        k.add(lambda bm, hi, z=z: sweep(bm, hi, band, ring_path(z, r_at(z) + 0.002, 20 if not hi else 40), up=Vector((0, 0, 1)), closed=True), 'brass', BRASS, 0)
        # rivets on hi
        k.add(lambda bm, hi, z=z: sum((dome(bm, hi, (math.cos(a) * (r_at(z) + 0.015), math.sin(a) * (r_at(z) + 0.015), z), 0.006, 0.004,
                                            n=(math.cos(a), math.sin(a), 0)) for a in [2 * math.pi * i / 16 for i in range(16)]), []),
              'brass', BRASS, levels=('hi',))
    cap = [(0.0, 1.7), (0.15, 1.7), (0.16, 1.72), (0.12, 1.76), (0.06, 1.8), (0.03, 1.83), (0.0, 1.83)]
    k.add(lambda bm, hi: lathe(bm, hi, cap, seg=10, seg_hi=28), 'brass', BRASS)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        k.add(lambda bm, hi, a=a: box(bm, hi, (0.13 * math.cos(a), 0.13 * math.sin(a), 1.69), (0.02, 0.02, 0.05), bev=0.003), 'brass', BRASS)
    k.add(lambda bm, hi: lathe(bm, hi, [(0, 1.83), (0.018, 1.83), (0.022, 1.86), (0.008, 1.89), (0, 1.9)], seg=8, seg_hi=16), 'brass', BRASS)
    return k.finish('gf-brass')


def hole_frame(a, zc, w=0.13, h=0.16):
    """Arch outline of a glory hole on the body's surface: points in the local (u along the
    surface, v up) frame of angle a (0 = front, -Y)."""
    pts = [(-w, -h * 0.4), (w, -h * 0.4)]
    for i in range(9):
        t = i / 8 * math.pi
        pts.append((w * math.cos(t), h * 0.4 + w * math.sin(t) * 0.9))
    return pts


def to_surface(a, zc, u, v, out=0.0):
    """Local (u, v) on the body at angle a (from the front, -Y) and height zc -> world."""
    n = Vector((math.sin(a), -math.cos(a), 0))
    t = Vector((math.cos(a), math.sin(a), 0))
    return n * (RB + out) + t * u + Vector((0, 0, zc + v))


def step_holes():
    """Two glory holes: a glowing arch (glass = glow) inside a brass frame with a stone sill, soot."""
    k = Kit(93)
    for a, zc in HOLES:
        def glow(bm, hi, a=a, zc=zc):
            pts = hole_frame(a, zc, 0.11, 0.14)
            vs = [bm.verts.new(to_surface(a, zc, u, v, 0.017)) for u, v in pts]
            f = [bm.faces.new(vs)]
            n = Vector((math.sin(a), -math.cos(a), 0))
            if f[0].normal.dot(n) < 0:
                f[0].normal_flip()
            return f
        k.add(glow, 'glass', GLOW)
        # frame: a swept brass arch round the hole
        def frame(bm, hi, a=a, zc=zc):
            pts = hole_frame(a, zc, 0.125, 0.155)
            path = [to_surface(a, zc, u, v, 0.02) for u, v in pts]
            prof = [(-0.012, -0.008), (0.012, -0.008), (0.012, 0.012), (-0.012, 0.012)]
            n = Vector((math.sin(a), -math.cos(a), 0))
            return sweep(bm, hi, prof, path, up=n, closed=True)
        k.add(frame, 'brass', BRASS)
        # stone sill under the hole
        def sill(bm, hi, a=a, zc=zc):
            c = to_surface(a, zc, 0, -0.075, 0.03)
            return box(bm, hi, c, (0.3, 0.08, 0.035), bev=0.008, rot=Euler((0, 0, a)))
        k.add(sill, 'stone', STONE_D)
    return k.finish('gf-holes')


def step_pipes():
    """A small wooden rack on the right with three iron blowpipes leaning on the body; one carries
    a glowing gather, one a cooled blue bubble."""
    k = Kit(94)
    for y in (-0.12, 0.12):
        k.add(lambda bm, hi, y=y: box(bm, hi, (0.62, y, 0.3), (0.04, 0.04, 0.6), bev=0.004), 'wood', WOOD, 2)
    k.add(lambda bm, hi: box(bm, hi, (0.62, 0, 0.58), (0.05, 0.3, 0.04), bev=0.004), 'wood', WOOD, 1)
    k.add(lambda bm, hi: box(bm, hi, (0.62, 0, 0.05), (0.12, 0.36, 0.04), bev=0.004), 'wood', WOOD, 1)
    for i, y in enumerate((-0.09, 0.0, 0.09)):
        base = Vector((0.7, y, 0.06))
        top = Vector((0.5, y * 0.6, 1.2 - i * 0.05))
        k.add(lambda bm, hi, base=base, top=top: _pipe(bm, hi, base, top), 'iron', IRON, 2)
    k.add(lambda bm, hi: sphere(bm, hi, (0.7, -0.09, 0.07), 0.04, 8, 6), 'glass', GLOW)
    k.add(lambda bm, hi: sphere(bm, hi, (0.7, 0.09, 0.075), 0.045, 8, 6), 'crystal', '#5EA6C8')
    return k.finish('gf-pipes')


def _pipe(bm, hi, a, b):
    n = 10 if hi else 6
    prof = [(0.008 * math.cos(2 * math.pi * j / n), 0.008 * math.sin(2 * math.pi * j / n)) for j in range(n)]
    d = (b - a).normalized()
    up = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
    return sweep(bm, hi, prof, [a, b], up=up)
