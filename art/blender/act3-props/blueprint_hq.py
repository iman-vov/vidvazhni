# Act III blueprint v2 (high detail): a drafting trestle with a slanted board, a rolled
# blueprint partly unrolled over the front edge, red ties, a brass weight and dividers; built
# piece by piece in the live Blender on hq_lib (exec hq_lib.py first). Steps: step_trestle,
# step_board, step_roll, step_sheet, step_tools; then join_parts('blueprint', BP_PARTS).
# Front is -Y; the board's front edge is the low one.
import math
from mathutils import Vector, Matrix, Euler, Quaternion

OAK = '#6E4A2E'
OAK_D = '#4A3020'
BLUE = '#1F3E73'
LINE = '#CFDDEB'
TIE = '#9A4A3E'
BRASS = '#B08A3E'
BZ = 0.71                       # board centre height
TILT = math.radians(14)         # back edge up
AX = 0.33                       # A-frames at x = +-AX
BP_PARTS = ['bp-trestle', 'bp-board', 'bp-roll', 'bp-sheet', 'bp-tools']
BOARD = Matrix.Translation((0, 0, BZ)) @ Matrix.Rotation(TILT, 4, 'X')


def on_board(build):
    """Wraps a build that works in the board's flat frame (top face at z = 0.0125)."""
    def b(bm, hi):
        f = build(bm, hi)
        fs = f if not (f and isinstance(f[0], tuple)) else [g for fs_, _, _ in f for g in fs_]
        move(bm, [g for g in fs if g.is_valid], BOARD)
        return f
    return b


def beam(bm, hi, p0, p1, w, d, bev=0.004):
    """A square-ish member from p0 to p1 (w across X, d the other way)."""
    p0, p1 = Vector(p0), Vector(p1)
    v = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(v.normalized())
    return box(bm, hi, (p0 + p1) / 2, (w, d, v.length), bev=bev, rot=q)


def rail_end(y):
    """World point on the underside of the board's cross rail at local y."""
    return BOARD @ Vector((0, y, -0.0125 - 0.04))


def step_trestle():
    """Two A-frames (foot rail, front and back legs, a brace, a cross rail under the board)
    joined by a stretcher; dowel pegs in the joints (hi)."""
    k = Kit(71)
    for s in (-1, 1):
        x = s * AX
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, 0.022), (0.05, 0.52, 0.044), bev=0.006), 'wood', OAK, 1)
        for y0, y1 in ((-0.24, -0.11), (0.24, 0.11)):
            top = rail_end(y1) + Vector((x, 0, 0.01))
            k.add(lambda bm, hi, x=x, y0=y0, top=top: beam(bm, hi, (x, y0, 0.03), top, 0.042, 0.042), 'wood', OAK, 2)
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, 0.3), (0.036, 0.42, 0.04), bev=0.005), 'wood', OAK, 1)

        def rail(bm, hi, x=x):
            f = box(bm, hi, (x, 0, -0.0125 - 0.02), (0.045, 0.46, 0.04), bev=0.005)
            move(bm, f, BOARD)
            return f
        k.add(rail, 'wood', OAK, 1)

        def pegs(bm, hi, x=x):
            f = []
            for y, z in ((-0.235, 0.03), (0.235, 0.03), (-0.185, 0.3), (0.185, 0.3)):
                f += cyl(bm, hi, (x + s * 0.024, y, z), 0.006, 0.006, 'x', 8, 0.001)
            return f
        k.add(pegs, 'wood', OAK_D, 1, levels=('hi',))
    k.add(lambda bm, hi: box(bm, hi, (0, 0, 0.3), (2 * AX + 0.07, 0.04, 0.05), bev=0.006), 'wood', OAK, 0)
    for s in (-1, 1):
        k.add(lambda bm, hi, s=s: box(bm, hi, (s * (AX + 0.042), 0, 0.3), (0.008, 0.024, 0.06), bev=0.0015), 'wood', OAK_D, 2)
    return k.finish('bp-trestle')


def step_board():
    """The drafting board: three glued boards, breadboard ends, a pencil ledge at the front."""
    k = Kit(72)
    for i, y in enumerate((-0.17, 0.0, 0.17)):
        k.add(on_board(lambda bm, hi, y=y: box(bm, hi, (0, y, 0), (0.76, 0.17, 0.025), bev=0.0025)), 'wood', OAK, 0)
    for s in (-1, 1):
        k.add(on_board(lambda bm, hi, s=s: box(bm, hi, (s * 0.4, 0, 0.0), (0.04, 0.52, 0.03), bev=0.005)), 'wood', OAK, 1)
    k.add(on_board(lambda bm, hi: box(bm, hi, (0, -0.25, 0.012), (0.84, 0.03, 0.044), bev=0.005)), 'wood', OAK, 0)
    return k.finish('bp-board')


ROLL_Y, ROLL_R = 0.11, 0.045


def step_roll():
    """The rolled blueprint (its ends show the turns of the roll on hi) and two red cloth ties
    with knots and loose ends."""
    k = Kit(73)

    def roll(bm, hi):
        prof = [(0.0, -0.3), (ROLL_R * 0.9, -0.3), (ROLL_R, -0.296), (ROLL_R, 0.296), (ROLL_R * 0.9, 0.3), (0.0, 0.3)]
        f = lathe(bm, hi, prof, (0, 0, 0), seg=14, seg_hi=40)
        move(bm, f, Matrix.Translation((0, ROLL_Y, 0.0125 + ROLL_R)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        if hi:
            # the spiral of the turns on both ends, a hair proud of the end discs
            for sx in (-1, 1):
                pts = []
                for i in range(60):
                    t = i / 59
                    a = t * 2 * math.pi * 4.5
                    r = ROLL_R * (0.12 + 0.82 * t)
                    pts.append(Vector((sx * 0.3005, ROLL_Y + r * math.cos(a), 0.0125 + ROLL_R + r * math.sin(a))))
                prof2 = [(-0.0012, 0.0), (0.0012, 0.0), (0.0012, 0.0008 * sx), (-0.0012, 0.0008 * sx)]
                f += sweep(bm, hi, prof2, pts, up=Vector((sx, 0, 0)))
        return f
    k.add(on_board(roll), 'paper', BLUE)
    for x in (-0.17, 0.17):
        def tie(bm, hi, x=x):
            n = 24 if hi else 12
            c = Vector((x, ROLL_Y, 0.0125 + ROLL_R))
            path = [c + Vector((0, (ROLL_R + 0.003) * math.cos(2 * math.pi * i / n), (ROLL_R + 0.003) * math.sin(2 * math.pi * i / n)))
                    for i in range(n)]
            prof = [(-0.003, -0.011), (0.003, -0.011), (0.003, 0.011), (-0.003, 0.011)]
            f = sweep(bm, hi, prof, path, up=Vector((1, 0, 0)), closed=True)
            top = c + Vector((0, 0, ROLL_R + 0.006))
            f += sphere(bm, hi, top, 0.011, 6, 4)
            for d in (-1, 1):
                f += sweep(bm, hi, [(-0.0025, -0.007), (0.0025, -0.007), (0.0025, 0.007), (-0.0025, 0.007)],
                           [top, top + Vector((0.01 * d, -0.03, -0.01)), top + Vector((0.016 * d, -0.055, -0.04))],
                           up=Vector((1, 0, 0)))
            return f
        k.add(on_board(tie), 'cloth', TIE)
    return k.finish('bp-roll')


SHEET = [(0.083, 0.0141), (-0.05, 0.0138), (-0.17, 0.0138), (-0.215, 0.03), (-0.238, 0.0365), (-0.26, 0.03),
         (-0.271, 0.005), (-0.274, -0.05), (-0.268, -0.1), (-0.274, -0.13), (-0.292, -0.142)]


def smooth(pts, k):
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        for s in range(k):
            t = s / k
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def gear_lines(c, r0, r1, teeth=10):
    pts = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4)
        r = r1 if i % 4 in (1, 2) else r0
        pts.append(c + Vector((r * math.cos(a), r * math.sin(a), 0)))
    return pts


def strips(bm, pts, w, closed, z):
    """Flat pale line strips on the sheet (hi only): the drawing bakes into the colour map."""
    f = []
    n = len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        d = (b - a)
        if d.length < 1e-6:
            continue
        s = Vector((-d.y, d.x, 0)).normalized() * w / 2
        vs = [bm.verts.new(Vector((p.x, p.y, z))) for p in (a - s, b - s, b + s, a + s)]
        f.append(bm.faces.new(vs))
    return f


def step_sheet():
    """The unrolled sheet over the board and the front ledge, curling at its hanging end; on
    hi the drawing (a gear with its hub and spokes, a tower with a roof and windows, a frame
    line) lies on it as pale strips."""
    k = Kit(74)

    def sheet(bm, hi):
        path = [Vector((0, y, z)) for y, z in SHEET]
        if hi:
            path = smooth(path, 5)
        prof = [(-0.0011, -0.27), (0.0011, -0.27), (0.0011, 0.27), (-0.0011, 0.27)]
        f = sweep(bm, hi, prof, path, up=Vector((1, 0, 0)))
        if hi:
            # its far corners curl up a little
            for v in {v for g in f for v in g.verts}:
                if abs(v.co.x) > 0.2 and v.co.z < -0.1:
                    w = (abs(v.co.x) - 0.2) / 0.07
                    v.co.y -= 0.012 * w * w
            z = 0.0138 + 0.0013
            g = Vector((-0.08, -0.08, 0))
            f2 = strips(bm, gear_lines(g, 0.055, 0.068), 0.0035, True, z)
            f2 += strips(bm, [g + Vector((0.018 * math.cos(a), 0.018 * math.sin(a), 0)) for a in
                              [2 * math.pi * i / 16 for i in range(16)]], 0.003, True, z)
            for i in range(5):
                a = 2 * math.pi * i / 5
                f2 += strips(bm, [g + Vector((0.018 * math.cos(a), 0.018 * math.sin(a), 0)),
                                  g + Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0))], 0.003, False, z)
            t = Vector((0.12, -0.16, 0))
            tower = [t + Vector(p) for p in ((-0.04, 0, 0), (0.04, 0, 0), (0.03, 0.15, 0), (-0.03, 0.15, 0))]
            f2 += strips(bm, tower, 0.0035, True, z)
            f2 += strips(bm, [t + Vector(p) for p in ((-0.045, 0.15, 0), (0.0, 0.21, 0), (0.045, 0.15, 0))], 0.0035, False, z)
            for wy in (0.04, 0.09):
                f2 += strips(bm, [t + Vector(p) for p in ((-0.01, wy, 0), (0.01, wy, 0), (0.01, wy + 0.025, 0),
                                                          (-0.01, wy + 0.025, 0))], 0.0025, True, z)
            f2 += strips(bm, [Vector(p) for p in ((-0.25, -0.165, 0), (0.25, -0.165, 0), (0.25, 0.058, 0), (-0.25, 0.058, 0))],
                         0.0025, True, z)
            return [(f, 'paper', BLUE), (f2, 'paper', LINE)]
        return f
    k.add(on_board(sheet), 'paper', BLUE)
    return k.finish('bp-sheet')


def step_tools():
    """A turned brass weight holding the sheet's right edge and a pair of brass dividers."""
    k = Kit(75)
    wt = [(0.0, 0.0), (0.036, 0.0), (0.04, 0.006), (0.04, 0.03), (0.034, 0.038), (0.012, 0.044), (0.01, 0.056),
          (0.016, 0.064), (0.012, 0.074), (0.0, 0.076)]
    k.add(on_board(lambda bm, hi: lathe(bm, hi, [(r, z + 0.0153) for r, z in wt], (0.215, 0.005, 0), seg=14, seg_hi=40)),
          'brass', BRASS)

    def dividers(bm, hi):
        h = Vector((-0.2, 0.02, 0.0153 + 0.006))
        f = cyl(bm, hi, h, 0.013, 0.012, 'z', 10, 0.002)
        for a in (-0.22, 0.22):
            d = Vector((math.sin(a), -math.cos(a), 0))
            f += beam(bm, hi, h + d * 0.01, h + d * 0.15 + Vector((0, 0, -0.004)), 0.008, 0.006, bev=0.0015)
        return f
    k.add(on_board(dividers), 'brass', BRASS)
    return k.finish('bp-tools')
