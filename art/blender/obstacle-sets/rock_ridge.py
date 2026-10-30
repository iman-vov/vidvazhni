# rock-ridge (2026-10-30): one low ridge of rock across two touching hexes (3.2 x 1.1 x 0.8 m),
# big blocks in the middle, smaller to the ends, scree at the foot; a variant per region: snow
# (granite, snow on the tops), cave (dark rock, crystal clusters), forest (moss on the tops,
# twigs and fern). exec os_lib.py, os_shapes.py, then this; step_blocks(region), step_foot(region).
import math, random
from mathutils import Vector, Matrix

REG = {
    'snow': dict(stone=['#646970', '#6E737A', '#5C6168'], cap='#E4EAEE', capz=0.72, keep=0.62, freq=1.4, seed=11),
    'cave': dict(stone=['#4A4650', '#58535E', '#423E48'], cap=None, capz=1.0, keep=0.0, seed=23),
    'forest': dict(stone=['#6E6A5E', '#7C786A', '#646054'], cap='#4E6234', capz=0.78, keep=0.6, seed=37),
}
LEN = 1.55          # half length along x


def capped(r, build):
    """Wraps a rock build: some of the faces facing up (normal z over capz, `keep` of them, in
    patches by position) take the region's cap colour: snow lying, moss growing."""
    def b(bm, hi):
        f = build(bm, hi)
        if not r['cap']:
            return f
        bm.normal_update()
        top = []
        for x in f:
            if not x.is_valid or x.normal.z <= r['capz']:
                continue
            c = x.calc_center_median()
            if mnoise.noise(c * r.get('freq', 4.0) + Vector((r['seed'], 0, 0))) * 0.5 + 0.5 < r['keep']:
                top.append(x)
        return [(top, 'stone', r['cap'])]
    return b


def step_blocks(region):
    """The ridge's body as nature leaves one: two big blocks that carry it, medium ones between and
    at the ends leaning outward, smaller stones against their flanks in a second line, and a flat
    slab fallen across the top of the big two. Spacing and sizes uneven."""
    r = REG[region]
    k = Kit(r['seed'])
    rnd = random.Random(r['seed'] * 3)
    sw = rnd.choice((-1, 1))          # which flank the second line runs along
    # (x, y, half sizes, tilt toward the end it is on)
    plan = [
        (-0.42 + rnd.uniform(-0.08, 0.08), 0.06 * sw, (0.5, 0.44, 0.62), 0.0),
        (0.58 + rnd.uniform(-0.08, 0.08), -0.08 * sw, (0.46, 0.4, 0.55), 0.0),
        (0.1, -0.02, (0.3, 0.34, 0.38), 0.0),
        (-1.08 + rnd.uniform(-0.05, 0.05), -0.05 * sw, (0.34, 0.32, 0.36), -0.25),
        (1.22 + rnd.uniform(-0.05, 0.05), 0.04 * sw, (0.3, 0.3, 0.3), 0.3),
        (-1.42, 0.12 * sw, (0.16, 0.18, 0.15), -0.35),
        (-0.62, 0.36 * sw, (0.24, 0.2, 0.26), 0.0),
        (0.22, 0.34 * sw, (0.2, 0.18, 0.2), 0.0),
        (0.92, -0.34 * sw, (0.18, 0.2, 0.2), 0.0),
    ]
    for i, (x, y, (sx, sy, sz), lean) in enumerate(plan):
        k_ = rnd.uniform(0.9, 1.1)
        s = (sx * k_, sy * rnd.uniform(0.9, 1.1), sz * rnd.uniform(0.9, 1.1))
        c = (x, y, s[2] * 0.5)
        sd = r['seed'] * 100 + i
        rot = rnd.uniform(0, math.pi)
        tilt = (rnd.uniform(-0.18, 0.18), lean + rnd.uniform(-0.12, 0.12))
        n = 16 if i < 5 else 12
        k.add(capped(r, lambda bm, hi, c=c, s=s, sd=sd, rot=rot, tilt=tilt, n=n:
                     rock(bm, hi, c, s, sd, n=n, sub_hi=3, rot=rot, tilt=tilt, bump=0.04, crack=0.05, sit=0.45)),
              'stone', rnd.choice(r['stone']), 2)
    # a flat slab fallen across the top of the big two
    sd = r['seed'] * 100 + 50
    k.add(capped(r, lambda bm, hi: rock(bm, hi, (0.12, 0.0, 0.7), (0.42, 0.3, 0.08), sd, n=14, sub_hi=3, rot=0.3, tilt=(0.12, -0.18), bump=0.03, crack=0.04, sit=0.9)),
          'stone', r['stone'][0], 2)
    return k.finish('rr-%s-blocks' % region)


def step_foot(region):
    """Scree and stones at the ridge's foot, both sides, plus the region's own things."""
    r = REG[region]
    k = Kit(r['seed'] + 1)
    rnd = random.Random(r['seed'] * 5)
    for i in range(28):
        x = rnd.uniform(-LEN + 0.05, LEN - 0.05)
        side = rnd.choice((-1, 1))
        y = side * rnd.uniform(0.32, 0.5)
        s = rnd.uniform(0.07, 0.15)
        c = (x, y, s * 0.4)
        sd = r['seed'] * 1000 + i
        k.add(capped(r, lambda bm, hi, c=c, s=s, sd=sd: rock(bm, hi, c, (s * 1.2, s, s * 0.8), sd, n=12, sub_hi=2, bev=0.15, rot=sd * 0.7, bump=0.03, crack=0.04, sit=0.4)),
              'stone', rnd.choice(r['stone']), 0)
    if region == 'cave':
        # crystal clusters wedged between the blocks: hexagonal prisms with pointed tips
        for cx, cy, n in ((-0.6, 0.28, 4), (0.3, -0.3, 5), (1.05, 0.22, 3)):
            for j in range(n):
                a = rnd.uniform(0, 2 * math.pi)
                tl = (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5))
                h = rnd.uniform(0.16, 0.34)
                rr = rnd.uniform(0.025, 0.045)
                def crystal(bm, hi, cx=cx, cy=cy, a=a, tl=tl, h=h, rr=rr):
                    before = set(bm.faces)
                    prof = [(rr, 0.0), (rr, h * 0.75), (0.0, h)]
                    lathe(bm, hi, prof, (0, 0, 0), seg=6, seg_hi=6, cap_bot=False)
                    f = _new_faces(bm, before)
                    move(bm, f, Matrix.Translation((cx + 0.04 * math.cos(a), cy + 0.04 * math.sin(a), 0.05)) @ Matrix.Rotation(tl[0], 4, 'X') @ Matrix.Rotation(tl[1], 4, 'Y'))
                    for x in f:
                        x.smooth = False
                k.add(crystal, 'crystal', rnd.choice(['#7FD0E0', '#9AD8E8', '#6FB8D0']), 0)
    if region == 'forest':
        # fallen twigs and a few fern fronds at the foot
        for i in range(6):
            x = rnd.uniform(-1.3, 1.3)
            side = rnd.choice((-1, 1))
            p0 = Vector((x, side * rnd.uniform(0.3, 0.5), 0.02))
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.4, 0.4), 0)).normalized() * rnd.uniform(0.25, 0.4)
            k.add(lambda bm, hi, p0=p0, d=d: tube(bm, hi, [p0, p0 + d * 0.5 + Vector((0, 0, 0.015)), p0 + d], 0.012, 0.007, sides=(4, 8)), 'wood', '#6A5236', 0)
        for i in range(5):
            x = rnd.uniform(-1.2, 1.2)
            side = rnd.choice((-1, 1))
            base = Vector((x, side * rnd.uniform(0.32, 0.46), 0.01))
            for j in range(4):
                a = rnd.uniform(0, 2 * math.pi)
                dirv = Vector((math.cos(a) * 0.8, math.sin(a) * 0.8, 0.6)).normalized()
                k.add(lambda bm, hi, base=base, dirv=dirv, j=j: blade(bm, hi, base, dirv, 0.28, 0.07, 0.5, seed=j, leaf=True), 'cloth', '#4E6E34', 0)
    return k.finish('rr-%s-foot' % region)
