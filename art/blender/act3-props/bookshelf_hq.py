# bookshelf v2 (high detail): oak bookcase 0.92 x 0.36 x 1.40 m. exec hq_lib.py first, then one step_*().
import math, random
from mathutils import Vector, Matrix, Euler

W, D = 0.92, 0.36
T = 0.035            # side panel thickness
XI = W / 2 - T       # inner half width 0.425
YF, YB = -D / 2, D / 2
SHELVES = [0.115, 0.50, 0.885, 1.27]   # board bottoms: deck, two shelves, ceiling
ST = 0.025           # shelf thickness
TOP = 1.36           # top board bottom
OAK, OAK2, OAK_D, OAK_P = '#6E4A2E', '#76502F', '#4A3020', '#5F4128'
IRON = '#3A3B40'


def arch(x0, x1, z0, zt, n):
    """Points of an elliptic arch from (x0, z0) up to the apex zt and down to (x1, z0)."""
    cx, rx = (x0 + x1) / 2, (x1 - x0) / 2
    return [(cx - rx * math.cos(math.pi * i / n), z0 + (zt - z0) * math.sin(math.pi * i / n)) for i in range(n + 1)]


def step_carcass():
    k = Kit(11)
    # side panels: two vertical planks each, 3 mm gap, arched foot cut-out
    for sx in (-1, 1):
        xa, xb = sx * XI, sx * (W / 2)
        x0, x1 = min(xa, xb), max(xa, xb)

        def plank(front):
            def b(bm, hi):
                n = 6 if hi else 3
                if front:
                    a = [(y, z) for y, z in arch(-0.11, 0.11, 0.0, 0.075, 2 * n)][: n + 1]   # left half
                    pts = [(YF, 0.0)] + [(-0.11, 0.0)] + a[1:] + [(-0.0015, 0.075), (-0.0015, TOP), (YF, TOP)]
                    pts = [(YF, 0.0), (-0.11, 0.0)] + a[1:-1] + [(-0.0015, 0.075), (-0.0015, TOP), (YF, TOP)]
                else:
                    a = [(y, z) for y, z in arch(-0.11, 0.11, 0.0, 0.075, 2 * n)][n:]
                    pts = [(0.0015, TOP), (0.0015, 0.075)] + a[1:-1] + [(0.11, 0.0), (YB, 0.0), (YB, TOP)]
                    pts = pts[::-1]
                prism(bm, hi, pts, 'x', x0, x1, bev=0.004)
            return b
        k.add(plank(True), 'wood', OAK, 2)
        k.add(plank(False), 'wood', OAK, 2)
    # plinth kick board with an arch, flush with the side fronts
    def plinth(bm, hi):
        n = 10 if hi else 6
        pts = [(-XI, 0.0), (-0.27, 0.0)] + arch(-0.27, 0.27, 0.0, 0.055, n)[1:-1] + [(0.27, 0.0), (XI, 0.0), (XI, SHELVES[0]), (-XI, SHELVES[0])]
        prism(bm, hi, pts, 'y', YF, YF + 0.022, bev=0.004)
    k.add(plinth, 'wood', OAK_P, 0)
    # deck, shelves and ceiling boards
    for i, z in enumerate(SHELVES):
        yb = YF + (0.0 if i in (0, 3) else 0.012)
        k.add(lambda bm, hi, z=z, yb=yb: box(bm, hi, (0, (yb + YB - 0.016) / 2, z + ST / 2), (2 * XI - 0.001, YB - 0.016 - yb, ST), 0.003),
              'wood', OAK2, 0)
        if i in (1, 2):
            # front lip that stops the books, 8 mm proud of the shelf top
            k.add(lambda bm, hi, z=z: box(bm, hi, (0, YF + 0.011, z + ST / 2 - 0.004), (2 * XI - 0.001, 0.022, ST + 0.022), 0.004),
                  'wood', OAK, 0)
    # back: five vertical boards with 3 mm gaps
    nb = 5
    bw = (2 * XI - 0.003 * (nb - 1)) / nb
    for i in range(nb):
        x = -XI + bw / 2 + i * (bw + 0.003)
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, YB - 0.008, (SHELVES[0] + TOP) / 2), (bw, 0.016, TOP - SHELVES[0]), 0.003),
              'wood', OAK_D, 2)
    # top board, overhanging front and sides
    k.add(lambda bm, hi: box(bm, hi, (0, -0.005, TOP + 0.0175), (W + 0.06, D + 0.05, 0.035), 0.006), 'wood', OAK2, 0)
    return k.finish('bs-carcass')


def step_trim():
    k = Kit(12)
    # cornice under the top board: fillet, cove and bead, mitred round the front corners
    def cornice(bm, hi):
        n = 6 if hi else 3
        prof = [(0.0, TOP - 0.075), (0.006, TOP - 0.075), (0.008, TOP - 0.068)]
        # bead
        for i in range(n + 1):
            a = -math.pi / 2 + math.pi * i / n
            prof.append((0.008 + 0.007 * math.cos(a), TOP - 0.06 + 0.007 * math.sin(a)))
        prof.append((0.006, TOP - 0.05))
        # cove up to the top board
        for i in range(n + 1):
            a = math.pi * 0.5 * i / n
            prof.append((0.006 + 0.024 * (1 - math.cos(a)), TOP - 0.05 + 0.05 * math.sin(a)))
        prof.append((0.0, TOP))
        prof = prof[::-1]
        path = [(W / 2, YB - 0.03), (W / 2, YF), (-W / 2, YF), (-W / 2, YB - 0.03)]
        sweep(bm, hi, prof, [Vector((x, y, 0)) for x, y in path])
    k.add(cornice, 'wood', OAK, 0)
    # shelf pegs under the front of each shelf
    for z in SHELVES[1:3]:
        for sx in (-1, 1):
            k.add(lambda bm, hi, z=z, sx=sx: cyl(bm, hi, (sx * (XI - 0.008), YF + 0.04, z - 0.007), 0.006, 0.018, 'x', 6),
                  'wood', OAK_D, 1)
    # iron L-brackets on the lower front corners and corner straps on the top board, with nail heads
    for sx in (-1, 1):
        def bracket(bm, hi, sx=sx):
            y0 = YF - 0.003
            box(bm, hi, (sx * (W / 2 - 0.0175), y0 + 0.0015, 0.085), (0.03, 0.003, 0.15), 0.0012)
            box(bm, hi, (sx * (XI - 0.05), y0 + 0.0015, 0.03), (0.1, 0.003, 0.028), 0.0012)
        k.add(bracket, 'iron', IRON, 0)
        def strap(bm, hi, sx=sx):
            yf = -0.005 - (D + 0.05) / 2
            box(bm, hi, (sx * (W / 2 + 0.03 - 0.045), yf - 0.0015, TOP + 0.0175), (0.07, 0.003, 0.03), 0.0012)
            box(bm, hi, (sx * (W / 2 + 0.03 - 0.045), yf + 0.035, TOP + 0.0365), (0.07, 0.075, 0.003), 0.0012)
        k.add(strap, 'iron', IRON, 0)
        nails = [((sx * (W / 2 - 0.0175), YF - 0.003, z), (0, -1, 0)) for z in (0.05, 0.1, 0.145)]
        nails += [((sx * (XI - 0.05 - dx), YF - 0.003, 0.03), (0, -1, 0)) for dx in (-0.03, 0.03)]
        yf = -0.005 - (D + 0.05) / 2
        nails += [((sx * (W / 2 + 0.03 - 0.045 + dx), yf - 0.003, TOP + 0.0175), (0, -1, 0)) for dx in (-0.02, 0.02)]
        nails += [((sx * (W / 2 + 0.03 - 0.045 + dx), yf + 0.05, TOP + 0.038), (0, 0, 1)) for dx in (-0.02, 0.02)]
        for c, n in nails:
            k.add(lambda bm, hi, c=c, n=n: dome(bm, hi, c, 0.0055, 0.003, n, 6), 'iron', '#4A4B50', 0)
    return k.finish('bs-trim')


LEATHER = ['#7A2E28', '#2F4A3A', '#2E3E62', '#6A4E2A', '#4A2E46', '#3C2A20', '#8A6A3A', '#5A2420', '#33483F']
PAGE = '#E3D7B8'
LABELS = ['#1E1712', '#2A1E18', '#CDBB8E', '#5E1C18']


def book_piece(w, d, h, M, rnd, label):
    """One hardback in local coords x 0..w (thickness), y 0..d (spine at y=0), z 0..h, moved by M.
    lo: box with a recessed page block on top and chamfered spine; hi: rounded spine, raised bands,
    gilt lines and sometimes a title label."""
    bands = rnd.choice([(0.12, 0.88), (0.1, 0.22, 0.78, 0.9), (0.15, 0.3, 0.7, 0.85)])

    def b(bm, hi):
        before = set(bm.faces)
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((w / 2, d / 2, h / 2)) @ Matrix.Diagonal((w, d, h, 1)))
        f = _new_faces(bm, before)
        top = next(x for x in f if x.normal.z > 0.9)
        c = min(0.003, w * 0.12)
        bmesh.ops.inset_individual(bm, faces=[top], thickness=c, depth=0)
        bmesh.ops.translate(bm, vec=(0, 0, -0.004), verts=list(top.verts))
        es = [e for e in {e for x in _new_faces(bm, before) for e in x.edges}
              if abs(e.verts[0].co.y) < 1e-6 and abs(e.verts[1].co.y) < 1e-6 and abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-6
              and abs(e.verts[0].co.z - e.verts[1].co.z) > h * 0.5]
        r = min(w * 0.35, 0.012) if hi else min(0.004, w * 0.2)
        bmesh.ops.bevel(bm, geom=es, offset=r, segments=4 if hi else 1, profile=0.5, affect='EDGES', clamp_overlap=True)
        pages = [top]
        extra = []
        if hi:
            for bz in bands:
                bf = box(bm, hi, (w / 2, 0.001, h * bz), (w - 0.002, 0.006, 0.006), 0.0015)
            for bz in bands[::2]:
                g = box(bm, hi, (w / 2, -0.0005, h * bz + 0.008), (w - 0.003, 0.003, 0.0016), 0.0005)
                extra.append((g, 'brass', '#B8913E'))
            if label:
                # title label: a thin leather or paper patch with two gilt title strokes on it
                lc = LABELS[int(sum(hexc(label)) * 1000) % len(LABELS)]
                lf = box(bm, hi, (w / 2, -0.0004, h * 0.55), (w * 0.7, 0.003, h * 0.14), 0.0006)
                extra.append((lf, 'leather' if lc != '#CDBB8E' else 'paper', lc))
                for dz in (0.03, -0.02):
                    t = box(bm, hi, (w / 2, -0.0018, h * (0.55 + dz)), (w * 0.45, 0.0012, 0.0035), 0.0003)
                    extra.append((t, 'brass', '#C9A24A' if lc != '#CDBB8E' else '#3A2A1E'))
        piece = _new_faces(bm, before)
        bmesh.ops.transform(bm, matrix=M, verts=list({v for x in piece for v in x.verts}))
        return [(pages, 'paper', PAGE)] + extra
    return b


def row(k, rnd, z0, x0, x1, hmin, hmax, plan):
    """Fills a shelf from x0 to x1. plan: list of 'b' (standing book), 'L' (book leaning left on the
    previous one), 'S' (horizontal stack of 3), '_' (small gap)."""
    x = x0
    for p in plan:
        if p == '_':
            x += rnd.uniform(0.01, 0.03)
            continue
        if p == 'S':
            zz = z0
            sw = rnd.uniform(0.17, 0.2)
            for i in range(3):
                t = rnd.uniform(0.03, 0.045)
                d = rnd.uniform(0.16, 0.21)
                hh = sw - i * rnd.uniform(0.0, 0.015)
                # lying flat: book x->-z (thickness up), z->x (height along the shelf)
                M = (Matrix.Translation((x + (sw - hh) / 2, YF + 0.035 + rnd.uniform(0, 0.01), zz + t)) @
                     Matrix.Rotation(rnd.uniform(-0.05, 0.05), 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
                k.add(book_piece(t, d, hh, M, rnd, None), 'leather', rnd.choice(LEATHER), 0)
                zz += t
            x += sw + 0.004
            continue
        w = rnd.uniform(0.022, 0.055)
        h = rnd.uniform(hmin, hmax)
        d = rnd.uniform(0.17, 0.25) * (0.6 + 0.4 * h / hmax)
        y = YF + 0.03 + rnd.uniform(0, 0.02)
        lab = rnd.choice(LEATHER) if rnd.random() < 0.45 else None
        if p == 'L':
            a = rnd.uniform(0.25, 0.4)
            # pivot is the bottom-left corner; the top-left leans on the previous book
            M = Matrix.Translation((x + h * math.sin(a) - 0.002, y, z0)) @ Matrix.Rotation(-a, 4, 'Y')
            k.add(book_piece(w, d, h, M, rnd, lab), 'leather', rnd.choice(LEATHER), 2)
            x += h * math.sin(a) + w * math.cos(a) + 0.004
        else:
            M = Matrix.Translation((x, y, z0))
            k.add(book_piece(w, d, h, M, rnd, lab), 'leather', rnd.choice(LEATHER), 2)
            x += w + rnd.uniform(0.0005, 0.002)
        if x > x1:
            print('row overflow', round(x - x1, 3))
    return x


def run(k, rnd, z0, x, x_end, hmin, hmax):
    """Standing books from x until x_end, in short series: 2-5 books sharing a colour and height,
    now and then a small gap. Returns the x where the last book ends."""
    while True:
        n = rnd.randint(2, 5)
        col = rnd.choice(LEATHER)
        h0 = rnd.uniform(hmin, hmax)
        w0 = rnd.uniform(0.024, 0.05)
        for i in range(n):
            w = w0 * rnd.uniform(0.9, 1.1)
            if x + w > x_end:
                return x
            h = min(hmax, h0 * rnd.uniform(0.97, 1.02))
            d = rnd.uniform(0.18, 0.25) * (0.65 + 0.35 * h / hmax)
            y = YF + 0.03 + rnd.uniform(0, 0.012)
            lab = (rnd.choice(LEATHER) if i == 0 or rnd.random() < 0.5 else None) if rnd.random() < 0.6 else None
            M = Matrix.Translation((x, y, z0)) @ Matrix.Rotation(rnd.uniform(-0.03, 0.03), 4, 'Z')
            k.add(book_piece(w, d, h, M, rnd, lab), 'leather', col, 2)
            x += w + rnd.uniform(0.0004, 0.0015)
        if rnd.random() < 0.2:
            x += rnd.uniform(0.004, 0.012)


def lean(k, rnd, z0, x, hmin, hmax):
    """One book leaning left on the book that ends at x; returns where it ends on the shelf."""
    w = rnd.uniform(0.026, 0.045)
    h = rnd.uniform(hmin, hmax)
    d = rnd.uniform(0.18, 0.24)
    a = rnd.uniform(0.22, 0.34)
    M = Matrix.Translation((x + h * math.sin(a) - 0.002, YF + 0.035, z0)) @ Matrix.Rotation(-a, 4, 'Y')
    k.add(book_piece(w, d, h, M, rnd, rnd.choice(LEATHER)), 'leather', rnd.choice(LEATHER), 2)
    return x + h * math.sin(a) + w * math.cos(a)


def stack(k, rnd, z0, x, n, lmin, lmax, dmin=0.16, dmax=0.21, ycen=None):
    """n books lying flat, largest at the bottom, slightly twisted; x is the left end."""
    zz = z0
    l0 = rnd.uniform(lmin, lmax)
    for i in range(n):
        t = rnd.uniform(0.028, 0.045)
        d = rnd.uniform(dmin, dmax) * (1 - 0.06 * i)
        hh = l0 * (1 - 0.07 * i)
        yc = (YF + 0.03 + d / 2) if ycen is None else ycen
        # lying flat: book x->-z (thickness up), z->x (height along the shelf), spine facing front
        M = (Matrix.Translation((x + (l0 - hh) / 2 + hh / 2, yc, zz + t)) @ Matrix.Rotation(rnd.uniform(-0.06, 0.06), 4, 'Z') @
             Matrix.Translation((-hh / 2, -d / 2, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        k.add(book_piece(t, d, hh, M, rnd, rnd.choice(LEATHER) if rnd.random() < 0.5 else None), 'leather', rnd.choice(LEATHER), 0)
        zz += t
    return x + l0, zz


def step_books(shelf):
    """One call per shelf: bs-books-<shelf> (0 bottom, 1 middle, 2 top)."""
    k = Kit(20 + shelf)
    rnd = random.Random(70 + shelf)
    x0, x1 = -XI + 0.003, XI - 0.003
    z0 = SHELVES[shelf] + ST
    if shelf == 0:
        # tall folios, then two big atlases lying flat at the right
        x = run(k, rnd, z0, x0, x1 - 0.27, 0.27, 0.33)
        stack(k, rnd, z0, x1 - 0.255, 2, 0.24, 0.25, 0.22, 0.26)
    elif shelf == 1:
        x = run(k, rnd, z0, x0, -0.05, 0.22, 0.3)
        x = lean(k, rnd, z0, x, 0.22, 0.27) + 0.03
        x, _ = stack(k, rnd, z0, x, 3, 0.17, 0.2)
        run(k, rnd, z0, x + 0.02, x1, 0.2, 0.29)
    else:
        x = run(k, rnd, z0, x0, 0.12, 0.2, 0.3)
        x = lean(k, rnd, z0, x, 0.2, 0.26) + 0.05
        stack(k, rnd, z0, x, 4, 0.13, 0.16)
    return k.finish('bs-books-%d' % shelf)


BRASS = '#B08A3E'


def step_top():
    """Dressing on the top board: two books lying flat and a glass globe on a turned brass stand
    with a meridian ring."""
    k = Kit(30)
    rnd = random.Random(31)
    zt = TOP + 0.035
    stack(k, rnd, zt, -0.36, 2, 0.21, 0.23, 0.17, 0.19, ycen=-0.01)
    gx, gy, gr = 0.22, -0.03, 0.068

    def stand(bm, hi):
        prof = [(0.0, 0), (0.05, 0), (0.052, 0.004), (0.05, 0.008), (0.032, 0.012), (0.026, 0.02), (0.012, 0.026),
                (0.009, 0.04), (0.014, 0.046), (0.009, 0.052), (0.02, 0.058), (0.034, 0.066), (0.03, 0.07), (0.0, 0.07)]
        lathe(bm, hi, [(r, zt + z) for r, z in prof], (gx, gy, 0), seg=12, seg_hi=32)
        # meridian ring: a thin flat band round the globe, tilted, held by the cup
        before = set(bm.faces)
        rr, s = gr + 0.008, 24 if not hi else 64
        prof2 = [(rr - 0.003, -0.002), (rr + 0.003, -0.002), (rr + 0.003, 0.002), (rr - 0.003, 0.002)]
        rings = [[bm.verts.new(V(r * math.cos(2 * math.pi * i / s), z, r * math.sin(2 * math.pi * i / s))) for r, z in prof2] for i in range(s)]
        for i in range(s):
            a, b = rings[i], rings[(i + 1) % s]
            for j in range(4):
                bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
        f = _new_faces(bm, before)
        bmesh.ops.recalc_face_normals(bm, faces=f)
        move(bm, f, Matrix.Translation((gx, gy, zt + 0.07 + gr - 0.006)) @ Matrix.Rotation(-0.4, 4, 'Z') @ Matrix.Rotation(0.41, 4, 'Y'))
    k.add(stand, 'brass', BRASS, 2)
    k.add(lambda bm, hi: sphere(bm, hi, (gx, gy, zt + 0.07 + gr - 0.006), gr, 12, 8), 'glass', '#9FC4C8', 2)
    return k.finish('bs-top')
