# wreck-heap (2026-10-30): what is left where things were knocked over and smashed, on one hex
# (1.7 x 1.3 x 0.8 m): a rack fallen forward onto a crate, a smashed crate with its boards strewn,
# a barrel on its side, a slit sack with its grain spilt, shards of a crock.
# exec os_lib.py, os_shapes.py, then this; step_rack(), step_crates(), step_spill().
import math, random
from mathutils import Vector, Matrix, Euler

PINE, PINE2, PINE_D = '#8A6A44', '#7A5C3A', '#5A4028'


def board(bm, hi, c, size, eul, bev=0.003):
    before = set(bm.faces)
    box(bm, hi, (0, 0, 0), size, bev if hi else 0.0)
    f = _new_faces(bm, before)
    move(bm, f, Matrix.Translation(Vector(c)) @ Euler(eul).to_matrix().to_4x4())
    return f


def step_rack():
    """An open rack fallen forward: its two side frames and three shelves, leaning at 65 degrees on
    a crate, one shelf board snapped and hanging."""
    k = Kit(701)
    rnd = random.Random(702)
    tilt = math.radians(44)
    R = Matrix.Translation((-0.1, -0.15, 0.0)) @ Matrix.Rotation(-tilt, 4, 'X')   # pivot on its foot edge
    L, D, H = 1.3, 0.38, 1.2

    def frame(bm, hi):
        before = set(bm.faces)
        for x in (-L / 2 + 0.03, L / 2 - 0.03):
            for y in (0.0, -D):
                box(bm, hi, (x, y, H / 2), (0.05, 0.05, H), 0.004 if hi else 0.0)
            for z in (0.15, 0.6, 1.05):
                box(bm, hi, (x, -D / 2, z), (0.055, D, 0.04), 0.003 if hi else 0.0)
        f = _new_faces(bm, before)
        move(bm, f, R)
    k.add(frame, 'wood', PINE_D, 2)

    def shelves(bm, hi):
        before = set(bm.faces)
        for i, z in enumerate((0.17, 1.07)):
            for j in range(3):
                box(bm, hi, (0, -0.06 - j * 0.13, z), (L - 0.04, 0.12, 0.025), 0.003 if hi else 0.0)
        # the middle shelf snapped: two halves hanging down from their ends
        for s in (-1, 1):
            bb = set(bm.faces)
            box(bm, hi, (s * L / 4, -0.19, 0.0), (L / 2 - 0.04, 0.36, 0.025), 0.003 if hi else 0.0)
            ff = _new_faces(bm, bb)
            move(bm, ff, Matrix.Translation((0, 0, 0.62)) @ Matrix.Rotation(s * 0.35, 4, 'Y'))
        f = _new_faces(bm, before)
        move(bm, f, R)
    k.add(shelves, 'wood', PINE2, 0)
    return k.finish('wk-rack')


def step_crates():
    """The crate the rack fell on, and a smashed crate: three sides standing, its boards strewn."""
    k = Kit(703)
    rnd = random.Random(704)
    # whole crate the rack leans on
    k.add(lambda bm, hi: box(bm, hi, (-0.1, 0.5, 0.2), (0.5, 0.4, 0.4), 0.006), 'wood', PINE, 2)
    for z in (0.08, 0.2, 0.32):
        k.add(lambda bm, hi, z=z: box(bm, hi, (-0.1, 0.5 - 0.205, z), (0.5, 0.012, 0.1), 0.002 if hi else 0.0), 'wood', PINE2, 0)
    # smashed crate at the right: base, back and one side standing, the rest strewn
    cx, cy = 0.55, 0.15
    def remains(bm, hi):
        box(bm, hi, (cx, cy, 0.015), (0.48, 0.42, 0.03), 0.003 if hi else 0.0)
        box(bm, hi, (cx, cy + 0.2, 0.18), (0.48, 0.025, 0.33), 0.003 if hi else 0.0)
        board(bm, hi, (cx + 0.23, cy, 0.14), (0.025, 0.42, 0.25), (0, 0.18, 0))
    k.add(remains, 'wood', PINE, 2)
    for i in range(9):
        c = (rnd.uniform(-0.6, 0.85), rnd.uniform(-0.45, 0.5), 0.012 + i * 0.002)
        if abs(c[0] + 0.1) < 0.3 and abs(c[1] - 0.5) < 0.25:
            c = (c[0] + 0.5, c[1] - 0.4, c[2])
        eul = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.12, 0.12), rnd.uniform(0, math.pi))
        k.add(lambda bm, hi, c=c, eul=eul, i=i: board(bm, hi, c, (rnd.uniform(0.3, 0.5), 0.1, 0.014), eul), 'wood', rnd.choice([PINE, PINE2, '#9A7A50']), 0)
    # a barrel on its side, rolled against the smashed crate
    def barrel(bm, hi):
        before = set(bm.faces)
        prof = [(0.0, 0), (0.17, 0), (0.2, 0.12), (0.21, 0.25), (0.2, 0.38), (0.17, 0.5), (0.0, 0.5)]
        lathe(bm, hi, prof, (0, 0, 0), seg=10, seg_hi=28)
        f = _new_faces(bm, before)
        move(bm, f, Matrix.Translation((0.35, -0.38, 0.2)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(0.3, 4, 'X') @ Matrix.Translation((0, 0, -0.25)))
    k.add(barrel, 'wood', '#7A5634', 2)
    for t in (0.1, 0.4):
        def hoop(bm, hi, t=t):
            before = set(bm.faces)
            cyl(bm, hi, (0, 0, t), 0.205, 0.025, 'z', 10 if hi else 8)
            f = _new_faces(bm, before)
            move(bm, f, Matrix.Translation((0.35, -0.38, 0.2)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(0.3, 4, 'X') @ Matrix.Translation((0, 0, -0.25)))
        k.add(hoop, 'iron', '#3A3B40', 0)
    return k.finish('wk-crates')


def step_spill():
    """A slit sack with grain spilt from it, and the shards of a crock."""
    k = Kit(705)
    rnd = random.Random(706)
    def sack(bm, hi):
        before = set(bm.faces)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        f = _new_faces(bm, before)
        for v in {v for x in f for v in x.verts}:
            v.co = Vector((v.co.x * 0.28, v.co.y * 0.18, max(v.co.z, -0.5) * 0.14))
        move(bm, f, Matrix.Translation((-0.55, -0.3, 0.07)) @ Matrix.Rotation(0.6, 4, 'Z'))
    k.add(sack, 'cloth', '#B8A47A', 2)
    def grain(bm, hi):
        before = set(bm.faces)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        f = _new_faces(bm, before)
        for v in {v for x in f for v in x.verts}:
            v.co = Vector((v.co.x * 0.3, v.co.y * 0.22, max(v.co.z, 0.0) * 0.06))
        move(bm, f, Matrix.Translation((-0.25, -0.42, 0.0)) @ Matrix.Rotation(0.4, 4, 'Z'))
    k.add(grain, 'cloth', '#D8BE7A', 0)
    for i in range(7):
        c = Vector((rnd.uniform(0.0, 0.5), rnd.uniform(-0.55, -0.3), 0.01))
        a0 = rnd.uniform(0, 2 * math.pi)
        def shard(bm, hi, c=c, a0=a0, i=i):
            before = set(bm.faces)
            n = 4 if hi else 3
            r = rnd.uniform(0.08, 0.1)
            span = rnd.uniform(0.6, 1.1)
            prof = []
            vs = []
            for u in range(n + 1):
                a = a0 + span * u / n
                vs.append((bm.verts.new(c + Vector((r * math.cos(a) * 0.4, r * math.sin(a) * 0.4, 0.0))),
                           bm.verts.new(c + Vector((r * math.cos(a) * 0.4, r * math.sin(a) * 0.4, rnd.uniform(0.05, 0.09))))))
            for u in range(n):
                bm.faces.new((vs[u][0], vs[u + 1][0], vs[u + 1][1], vs[u][1]))
        k.add(shard, 'stone', rnd.choice(['#9A5A3A', '#8A4E32']), 0)
    return k.finish('wk-spill')
