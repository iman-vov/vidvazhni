# Glass Town dressing (2026-10-29): `glassware-shelf`, a glassmaker's walnut étagère with brass
# galleries, full of glass: flasks, bottles, a retort, jars with brass lids, orbs on stands, an
# hourglass and a big green carboy below. Built piece by piece in the live Blender on hq_lib (exec
# hq_lib.py first, then this file). Steps: step_frame, step_brass, step_glass_top, step_glass_mid,
# step_glass_low; then join_parts('glassware-shelf', GS_PARTS). Front is -Y, feet at z = 0.
# The glass is opaque coloured 'crystal' (it must read from the board camera, and it stays one
# material); clear bits are 'glass' only on -hi, so they bake in as pale tints.
import math
from mathutils import Vector, Matrix, Euler

WOOD = '#5C3B26'
BRASS = '#C29545'
GLASS = {'green': '#4E9472', 'amber': '#C6812E', 'blue': '#3F74B4', 'violet': '#7C5CB8', 'clear': '#A8D2D4',
         'teal': '#3F9C9E', 'rose': '#C07890'}
W, DP = 0.92, 0.3              # width (x), depth (y)
SH = [0.1, 0.52, 0.92]         # shelf tops
TOP = 1.28                     # top of the posts
PX, PY = W / 2 - 0.025, DP / 2 - 0.025
GS_PARTS = ['gs-frame', 'gs-brass', 'gs-top', 'gs-mid', 'gs-low']


def scaled(prof, s):
    return [(r * s, z * s) for r, z in prof]


FLASK = [(0, 0), (0.03, 0.003), (0.055, 0.03), (0.06, 0.06), (0.05, 0.095), (0.02, 0.115), (0.014, 0.13),
         (0.014, 0.175), (0.019, 0.18), (0.012, 0.185), (0, 0.185)]
BOTTLE = [(0, 0), (0.034, 0), (0.04, 0.01), (0.04, 0.14), (0.03, 0.17), (0.013, 0.19), (0.013, 0.225),
          (0.017, 0.23), (0, 0.232)]
DECANTER = [(0, 0), (0.03, 0), (0.05, 0.02), (0.062, 0.06), (0.055, 0.1), (0.03, 0.13), (0.016, 0.15),
            (0.016, 0.2), (0.024, 0.21), (0, 0.212)]
JAR = [(0, 0), (0.044, 0), (0.05, 0.01), (0.05, 0.1), (0.043, 0.11), (0.043, 0.118), (0, 0.118)]
LID = [(0, 0.116), (0.05, 0.116), (0.05, 0.132), (0.03, 0.14), (0.012, 0.142), (0.012, 0.155), (0.018, 0.16),
       (0, 0.165)]
CARBOY = [(0, 0), (0.09, 0), (0.12, 0.03), (0.135, 0.11), (0.125, 0.2), (0.08, 0.26), (0.035, 0.29),
          (0.03, 0.33), (0.036, 0.34), (0, 0.342)]


def turned(bm, hi, prof, c, seg=10):
    f = lathe(bm, hi, prof, (0, 0, 0), seg=max(6, seg - 2), seg_hi=seg * 2 + 4)
    move(bm, f, Matrix.Translation(Vector(c)))
    return f


def step_frame():
    """Four square posts with a turned foot, three shelves with front lips, a back panel of boards,
    side rails and a shaped crest board."""
    k = Kit(71)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.add(lambda bm, hi, sx=sx, sy=sy: box(bm, hi, (sx * PX, sy * PY, (TOP + 0.04) / 2 + 0.02), (0.045, 0.045, TOP - 0.02), bev=0.005), 'wood', WOOD, 2)
            k.add(lambda bm, hi, sx=sx, sy=sy: turned(bm, hi, [(0, 0), (0.018, 0), (0.026, 0.015), (0.024, 0.035), (0.03, 0.045), (0, 0.045)], (sx * PX, sy * PY, 0)), 'wood', WOOD, 2)
    for z in SH:
        k.add(lambda bm, hi, z=z: box(bm, hi, (0, 0, z - 0.012), (W, DP, 0.024), bev=0.005), 'wood', WOOD, 0)
        k.add(lambda bm, hi, z=z: box(bm, hi, (0, -DP / 2 - 0.006, z - 0.03), (W - 0.02, 0.016, 0.04), bev=0.004), 'wood', WOOD, 0)
    # back boards with gaps, side rails
    nb = 6
    for i in range(nb):
        x0 = -W / 2 + 0.03 + i * (W - 0.06) / nb
        k.add(lambda bm, hi, x0=x0: box(bm, hi, (x0 + (W - 0.06) / nb / 2, PY + 0.012, (SH[0] + TOP) / 2), ((W - 0.06) / nb - 0.004, 0.012, TOP - SH[0]), bev=0.003), 'wood', WOOD, 2)
    for sx in (-1, 1):
        for z in (0.32, 0.73, 1.12):
            k.add(lambda bm, hi, sx=sx, z=z: box(bm, hi, (sx * PX, 0, z), (0.02, DP - 0.04, 0.03), bev=0.004), 'wood', WOOD, 1)
    # top board and crest with a round arch cut-out look (prism outline)
    k.add(lambda bm, hi: box(bm, hi, (0, 0, TOP + 0.015), (W + 0.04, DP + 0.03, 0.03), bev=0.006), 'wood', WOOD, 0)
    crest = [(-W / 2, 0), (W / 2, 0), (W / 2, 0.07), (0.2, 0.08)] + [(0.2 * math.cos(a), 0.08 + 0.07 * math.sin(a)) for a in [i * math.pi / 8 for i in range(1, 8)]] + [(-0.2, 0.08), (-W / 2, 0.07)]
    k.add(lambda bm, hi: move(bm, prism(bm, hi, crest, 'y', PY - 0.005, PY + 0.015, bev=0.004), Matrix.Translation((0, 0, TOP + 0.03))) or [], 'wood', WOOD, 0)
    return k.finish('gs-frame')


def step_brass():
    """Brass galleries along each shelf front (rail on little balusters), corner caps and finials,
    a brass plate with a gear on the crest."""
    k = Kit(72)
    for z in SH[1:]:
        k.add(lambda bm, hi, z=z: cyl(bm, hi, (0, -DP / 2 + 0.012, z + 0.06), 0.005, W - 0.08, axis='x', seg=6), 'brass', BRASS, 0)
        for i in range(7):
            x = -W / 2 + 0.05 + i * (W - 0.1) / 6
            k.add(lambda bm, hi, x=x, z=z: cyl(bm, hi, (x, -DP / 2 + 0.012, z + 0.03), 0.004, 0.06, seg=6), 'brass', BRASS, 2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.add(lambda bm, hi, sx=sx, sy=sy: turned(bm, hi, [(0, 0), (0.028, 0), (0.028, 0.012), (0.014, 0.02), (0.02, 0.04), (0.008, 0.06), (0, 0.065)], (sx * PX, sy * PY, TOP + 0.03), 8), 'brass', BRASS)
    # gear on the crest: a ring of teeth around a hub
    def gear(bm, hi):
        n = 12
        pts = []
        for i in range(n * 2):
            a = math.pi * i / n
            r = 0.06 if i % 2 == 0 else 0.048
            pts += [(r * math.cos(a - 0.08), r * math.sin(a - 0.08)), (r * math.cos(a + 0.08), r * math.sin(a + 0.08))]
        f = prism(bm, hi, pts, 'y', PY - 0.012, PY - 0.004, bev=0.0015)
        f += cyl(bm, hi, (0, PY - 0.014, 0), 0.016, 0.012, axis='y', seg=8, bev=0.002)
        move(bm, f, Matrix.Translation((0, 0, TOP + 0.11)))
        return f
    k.add(gear, 'brass', BRASS)
    return k.finish('gs-brass')


def step_glass_top():
    """Top shelf: a decanter, bottles in a row, orbs on brass rings, the hourglass."""
    k = Kit(73)
    z = SH[2]
    k.add(lambda bm, hi: turned(bm, hi, DECANTER, (-0.33, 0.0, z), 12), 'crystal', GLASS['violet'])
    for i, (x, col, s) in enumerate([(-0.2, 'green', 0.95), (-0.13, 'amber', 0.8), (-0.07, 'blue', 1.05)]):
        k.add(lambda bm, hi, x=x, s=s: turned(bm, hi, scaled(BOTTLE, s), (x, 0.03, z), 10), 'crystal', GLASS[col])
    for x, col in ((0.06, 'teal'), (0.15, 'rose')):
        k.add(lambda bm, hi, x=x: cyl(bm, hi, (x, -0.02, z + 0.008), 0.026, 0.016, seg=8, bev=0.003), 'brass', BRASS)
        k.add(lambda bm, hi, x=x: sphere(bm, hi, (x, -0.02, z + 0.052), 0.04, 10, 6), 'crystal', GLASS[col])
    # hourglass: brass discs, three posts, two glass bulbs and a little sand
    hx = 0.32

    def hg_brass(bm, hi):
        f = cyl(bm, hi, (hx, 0, z + 0.008), 0.05, 0.016, seg=10, bev=0.003)
        f += cyl(bm, hi, (hx, 0, z + 0.172), 0.05, 0.016, seg=10, bev=0.003)
        for i in range(3):
            a = 2 * math.pi * i / 3 + 0.5
            f += cyl(bm, hi, (hx + 0.04 * math.cos(a), 0.04 * math.sin(a), z + 0.09), 0.005, 0.15, seg=6)
        return f
    k.add(hg_brass, 'brass', BRASS)
    bulb = [(0, 0), (0.012, 0.0), (0.03, 0.015), (0.034, 0.04), (0.022, 0.065), (0.005, 0.08)]
    k.add(lambda bm, hi: turned(bm, hi, bulb + [(r, 0.16 - zz) for r, zz in reversed(bulb)][1:], (hx, 0, z + 0.016), 10), 'crystal', GLASS['clear'])
    return k.finish('gs-top')


def step_glass_mid():
    """Middle shelf: round flasks, a retort on its side, jars with brass lids, a stack of panes."""
    k = Kit(74)
    z = SH[1]
    for x, col, s in ((-0.36, 'green', 1.0), (-0.24, 'blue', 0.8)):
        k.add(lambda bm, hi, x=x, s=s: turned(bm, hi, scaled(FLASK, s), (x, 0.0, z), 12), 'crystal', GLASS[col])
    # retort: a bulb with a long tapering neck reaching to the side and down
    def retort(bm, hi):
        f = sphere(bm, hi, (-0.06, 0.03, z + 0.055), 0.055, 10, 7)
        path = [Vector((-0.06, 0.03, z + 0.1)), Vector((-0.02, 0.03, z + 0.13)), Vector((0.05, 0.03, z + 0.11)),
                Vector((0.11, 0.03, z + 0.07))]
        n = 10 if hi else 6
        for i, (p, q) in enumerate(zip(path, path[1:])):
            r0, r1 = 0.018 * (1 - i / 3.2), 0.018 * (1 - (i + 1) / 3.2)
            d = (q - p)
            prof = [(r0 * math.cos(2 * math.pi * j / n), r0 * math.sin(2 * math.pi * j / n)) for j in range(n)]
            f += sweep(bm, hi, prof, [p, q], up=Vector((0, 1, 0)))
        return f
    k.add(retort, 'crystal', GLASS['amber'])
    for x, col in ((0.18, 'teal'), (0.28, 'amber')):
        k.add(lambda bm, hi, x=x: turned(bm, hi, JAR, (x, 0.02, z), 10), 'crystal', GLASS[col])
        k.add(lambda bm, hi, x=x: turned(bm, hi, LID, (x, 0.02, z), 10), 'brass', BRASS)
    # panes leaning on the back boards at the right end
    for j in range(3):
        k.add(lambda bm, hi, j=j: box(bm, hi, (0.39, PY - 0.03 - j * 0.012, z + 0.16), (0.08, 0.006, 0.31), bev=0.0015,
                                      rot=Euler((-0.12, 0, 0))), 'crystal', GLASS['clear'] if j != 1 else GLASS['teal'])
    return k.finish('gs-mid')


def step_glass_low():
    """Bottom shelf: a big green carboy, bottles lying in a rack of pegs, glass rods in a bundle."""
    k = Kit(75)
    z = SH[0]
    k.add(lambda bm, hi: turned(bm, hi, CARBOY, (-0.25, 0.0, z), 14), 'crystal', GLASS['green'])
    # bottles lying on their side, necks toward the board
    for i, (x, col) in enumerate([(0.04, 'amber'), (0.13, 'blue'), (0.22, 'green'), (0.085, 'violet'), (0.175, 'amber')]):
        row = i // 3
        def lying(bm, hi, x=x, row=row):
            f = turned(bm, hi, scaled(BOTTLE, 0.85), (0, 0, 0), 10)
            move(bm, f, Matrix.Translation((x, 0.1, z + 0.035 + row * 0.06)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
            return f
        k.add(lying, 'crystal', GLASS[col])
    for i in range(4):
        k.add(lambda bm, hi, i=i: box(bm, hi, (-0.005 + i * 0.09, 0.0, z + 0.012), (0.012, DP - 0.06, 0.024), bev=0.003), 'wood', WOOD, 1)
    # glass rods in a bundle with a brass band
    def rods(bm, hi):
        f = []
        for i in range(7):
            a = 2 * math.pi * i / 6
            r = 0.0 if i == 6 else 0.014
            f += cyl(bm, hi, (0.36 + r * math.cos(a), r * math.sin(a), z + 0.16), 0.007, 0.32, seg=6)
        return f
    k.add(rods, 'crystal', GLASS['clear'])
    k.add(lambda bm, hi: cyl(bm, hi, (0.36, 0, z + 0.12), 0.024, 0.02, seg=10, bev=0.003), 'brass', BRASS)
    return k.finish('gs-low')
