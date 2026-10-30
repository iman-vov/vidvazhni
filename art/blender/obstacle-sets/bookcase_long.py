# bookcase-long (2026-10-30): a free-standing double-sided library bookcase, one hex long
# (1.66 x 0.58 x 1.46 m), so cases on touching hexes meet end to end as one long stack.
# exec os_lib.py, os_shapes.py, ../act3-props/bookshelf_hq.py (for its book helpers), then this,
# then one step_*() per MCP call.
import math, random
from mathutils import Vector, Matrix

L, DD, H = 1.66, 0.58, 1.46       # length (x), full depth (y), height
TE = 0.04                         # end panel thickness
XE = L / 2 - TE                   # inner half length
SP = 0.008                        # half the spine's thickness (y = +-SP)
SHELVES = [0.11, 0.50, 0.89, 1.28]
ST = 0.025
TOP = 1.40
OAK, OAK2, OAK_D, OAK_P = '#6E4A2E', '#76502F', '#4A3020', '#5F4128'
IRON = '#3A3B40'

# bookshelf_hq's row helpers read these: one side's front edge and spine
W, D = 2 * XE, DD / 2
XI = XE
YF, YB = -DD / 2, -SP

_book_hq = book_piece
POST = Matrix.Identity(4)


def book_piece(w, d, h, M, rnd, label):
    """bookshelf_hq's book on hi; on lo only what shows (spine, top, two sides) as 4 quads, the
    page block coloured. POST turns the book onto the back side of the case."""
    MM = POST @ M
    hi_b = _book_hq(w, d, h, MM, rnd, label)

    def b(bm, hi):
        if hi:
            return hi_b(bm, hi)
        vs = {}
        for x in (0, w):
            for y in (0, d):
                for z in (0, h):
                    vs[(x, y, z)] = bm.verts.new(MM @ Vector((x, y, z)))
        q = lambda *k: bm.faces.new([vs[c] for c in k])
        spine = q((0, 0, 0), (w, 0, 0), (w, 0, h), (0, 0, h))
        top = q((0, 0, h), (w, 0, h), (w, d, h), (0, d, h))
        q((0, d, 0), (0, 0, 0), (0, 0, h), (0, d, h))
        q((w, 0, 0), (w, d, 0), (w, d, h), (w, 0, h))
        return [([top], 'paper', PAGE)]
    return b


def arch(x0, x1, z0, zt, n):
    cx, rx = (x0 + x1) / 2, (x1 - x0) / 2
    return [(cx - rx * math.cos(math.pi * i / n), z0 + (zt - z0) * math.sin(math.pi * i / n)) for i in range(n + 1)]


def step_carcass():
    k = Kit(41)
    # end panels: two planks each (front and back half), arched foot cut-out on both faces
    for sx in (-1, 1):
        x0, x1 = sorted((sx * XE, sx * (L / 2)))
        for side in (-1, 1):
            def plank(bm, hi, side=side, x0=x0, x1=x1):
                n = 6 if hi else 3
                y_out, y_in = side * DD / 2, side * 0.0015
                a = arch(-0.13, 0.13, 0.0, 0.08, 2 * n)
                half = [(side * abs(y), z) for y, z in a[: n + 1]]
                pts = [(y_out, 0.0), (side * 0.13, 0.0)] + half[1:-1] + [(y_in, 0.08), (y_in, TOP), (y_out, TOP)]
                if side > 0:
                    pts = pts[::-1]
                prism(bm, hi, pts, 'x', x0, x1, bev=0.004)
            k.add(plank, 'wood', OAK, 2)
    # plinth kick boards both faces, with a low arch
    for side in (-1, 1):
        def plinth(bm, hi, side=side):
            n = 10 if hi else 6
            pts = [(-XE, 0.0), (-0.4, 0.0)] + arch(-0.4, 0.4, 0.0, 0.055, n)[1:-1] + [(0.4, 0.0), (XE, 0.0), (XE, SHELVES[0]), (-XE, SHELVES[0])]
            y0 = side * DD / 2
            prism(bm, hi, pts, 'y', min(y0, y0 - side * 0.022), max(y0, y0 - side * 0.022), bev=0.004)
        k.add(plinth, 'wood', OAK_P, 0)
    # deck, shelves and ceiling across the full depth; front lips on both faces of the two shelves
    for i, z in enumerate(SHELVES):
        k.add(lambda bm, hi, z=z: box(bm, hi, (0, 0, z + ST / 2), (2 * XE - 0.001, DD - 0.03, ST), 0.003), 'wood', OAK2, 0)
        if i in (1, 2):
            for side in (-1, 1):
                k.add(lambda bm, hi, z=z, side=side: box(bm, hi, (0, side * (DD / 2 - 0.011), z + ST / 2 - 0.004), (2 * XE - 0.001, 0.022, ST + 0.022), 0.004),
                      'wood', OAK, 0)
    # spine: six vertical boards with 3 mm gaps down the middle
    nb = 6
    bw = (2 * XE - 0.003 * (nb - 1)) / nb
    for i in range(nb):
        x = -XE + bw / 2 + i * (bw + 0.003)
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, (SHELVES[0] + TOP) / 2), (bw, 2 * SP, TOP - SHELVES[0]), 0.003), 'wood', OAK_D, 2)
    # middle upright: two bays a side
    k.add(lambda bm, hi: box(bm, hi, (0, 0, (SHELVES[0] + ST + TOP) / 2), (0.032, DD - 0.03, TOP - SHELVES[0] - ST), 0.004), 'wood', OAK, 2)
    # top board, overhanging all round
    k.add(lambda bm, hi: box(bm, hi, (0, 0, TOP + 0.0175), (L + 0.05, DD + 0.05, 0.035), 0.006), 'wood', OAK2, 0)
    return k.finish('bcl-carcass')


def step_trim():
    k = Kit(42)
    # cornice under the top board round all four sides: fillet, bead and cove
    def cornice(bm, hi):
        n = 6 if hi else 3
        prof = [(0.0, TOP - 0.075), (0.006, TOP - 0.075), (0.008, TOP - 0.068)]
        for i in range(n + 1):
            a = -math.pi / 2 + math.pi * i / n
            prof.append((0.008 + 0.007 * math.cos(a), TOP - 0.06 + 0.007 * math.sin(a)))
        prof.append((0.006, TOP - 0.05))
        for i in range(n + 1):
            a = math.pi * 0.5 * i / n
            prof.append((0.006 + 0.024 * (1 - math.cos(a)), TOP - 0.05 + 0.05 * math.sin(a)))
        prof.append((0.0, TOP))
        prof = prof[::-1]
        path = [(L / 2, -DD / 2), (-L / 2, -DD / 2), (-L / 2, DD / 2), (L / 2, DD / 2)]
        sweep(bm, hi, prof, [Vector((x, y, 0)) for x, y in path], closed=True)
    k.add(cornice, 'wood', OAK, 0)
    # iron corner brackets low on the ends, both faces, and their nails
    for sx in (-1, 1):
        for side in (-1, 1):
            def bracket(bm, hi, sx=sx, side=side):
                y0 = side * (DD / 2 + 0.0015)
                box(bm, hi, (sx * (L / 2 - 0.02), y0, 0.09), (0.032, 0.003, 0.15), 0.0012)
                box(bm, hi, (sx * (XE - 0.06), y0, 0.035), (0.12, 0.003, 0.028), 0.0012)
            k.add(bracket, 'iron', IRON, 0)
            for c in [(sx * (L / 2 - 0.02), z) for z in (0.05, 0.1, 0.145)] + [(sx * (XE - 0.06 + dx), 0.035) for dx in (-0.035, 0.035)]:
                k.add(lambda bm, hi, c=c, side=side: dome(bm, hi, (c[0], side * (DD / 2 + 0.003), c[1]), 0.0055, 0.003, (0, side, 0), 6), 'iron', '#4A4B50', 0)
    # a brass shelf-mark plate on each face of the top rail (library class marks)
    for side in (-1, 1):
        k.add(lambda bm, hi, side=side: box(bm, hi, (0, side * (DD / 2 + 0.028), TOP - 0.035), (0.09, 0.003, 0.035), 0.001), 'brass', '#B08A3E', 0)
    return k.finish('bcl-trim')


def step_books(side, shelf):
    """Books of one face (side -1 front, +1 back) and one shelf (0 bottom .. 2 top), both bays."""
    global POST
    POST = Matrix.Identity(4) if side < 0 else Matrix.Rotation(math.pi, 4, 'Z')
    k = Kit(50 + shelf * 2 + (side > 0))
    rnd = random.Random(90 + shelf * 7 + (side > 0) * 31)
    z0 = SHELVES[shelf] + ST
    hmin, hmax = [(0.27, 0.33), (0.22, 0.3), (0.2, 0.3)][shelf]
    for bx0, bx1 in ((-XE + 0.003, -0.019), (0.019, XE - 0.003)):
        r = rnd.random()
        if r < 0.3:
            x = run(k, rnd, z0, bx0, bx1 - 0.26, hmin, hmax)
            stack(k, rnd, z0, bx1 - 0.25, rnd.randint(2, 3), 0.21, 0.24, 0.2, 0.25)
        elif r < 0.65:
            x = run(k, rnd, z0, bx0, (bx0 + bx1) / 2 + 0.05, hmin, hmax)
            x = lean(k, rnd, z0, x, hmin, hmax * 0.9) + 0.03
            run(k, rnd, z0, x + 0.02, bx1, hmin, hmax)
        else:
            x = run(k, rnd, z0, bx0, bx1 - 0.2, hmin, hmax)
            x = lean(k, rnd, z0, x, hmin, hmax * 0.9)
    POST = Matrix.Identity(4)
    return k.finish('bcl-books-%s%d' % ('f' if side < 0 else 'b', shelf))
