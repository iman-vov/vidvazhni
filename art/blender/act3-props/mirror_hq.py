# Act III mirror v2 (high detail): a walnut cheval mirror, built piece by piece in the live Blender
# on hq_lib (exec hq_lib.py first). Steps: step_base, step_posts, step_frame, step_glass; then
# join_parts('mirror', MIRROR_PARTS). Front is -Y; the frame tilts its top back (+Y) by 20 degrees.
import math
from mathutils import Vector, Matrix, Euler

WALNUT = '#5C3C29'
WALNUT_D = '#452C1F'
BRASS = '#B08A3E'
GLASS = '#AEBCC6'
PX = 0.37                  # post centres at x = +-PX
ZP = 0.70                  # pivot height
TILT = math.radians(-20)   # top leans back
A, B = 0.235, 0.36         # glass semi-axes (x, z)
FW = 0.07                  # frame width past the glass edge
MIRROR_PARTS = ['mr-base', 'mr-posts', 'mr-frame', 'mr-glass']


def oval(a, b, n, off=0.0, z0=ZP):
    """Points of an ellipse in the XZ plane around (0, z0), pushed `off` along its outward normal."""
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        p = Vector((a * math.cos(t), 0, b * math.sin(t)))
        nr = Vector((b * math.cos(t), 0, a * math.sin(t))).normalized()
        out.append(p + nr * off + Vector((0, 0, z0)))
    return out


def turned_x(bm, hi, prof, x0, z, side, seg=10, seg_hi=24):
    """A turned part on an axis along X (knobs, pins): prof [(r, d)] with d the distance from x0
    going outward (side +1 / -1)."""
    f = lathe(bm, hi, prof, (0, 0, 0), seg=seg, seg_hi=seg_hi)
    vs = list({v for ff in f for v in ff.verts})
    m = Matrix.Translation(Vector((x0, 0, z))) @ Matrix.Rotation(side * math.pi / 2, 4, 'Y')
    bmesh.ops.transform(bm, matrix=m, verts=vs)
    return f


def step_base():
    """Trestle: two chamfered feet with a cut-out underside, the post blocks, a stretcher with
    through-tenons, wedges and dowel pegs."""
    k = Kit(31)
    foot = [(-0.26, 0), (-0.185, 0), (-0.165, 0.016), (0.165, 0.016), (0.185, 0), (0.26, 0),
            (0.26, 0.034), (0.215, 0.075), (-0.215, 0.075), (-0.26, 0.034)]
    for s in (-1, 1):
        k.add(lambda bm, hi, s=s: prism(bm, hi, foot, 'x', s * PX - 0.035, s * PX + 0.035, bev=0.006), 'wood', WALNUT, 1)
        # post block, mortised into the foot
        k.add(lambda bm, hi, s=s: box(bm, hi, (s * PX, 0, 0.135), (0.06, 0.06, 0.12), bev=0.005), 'wood', WALNUT, 2)
        # through-tenon of the stretcher and its wedge
        k.add(lambda bm, hi, s=s: box(bm, hi, (s * (PX + 0.042), 0, 0.14), (0.026, 0.028, 0.034), bev=0.003), 'wood', WALNUT, 0)
        k.add(lambda bm, hi, s=s: box(bm, hi, (s * (PX + 0.046), 0, 0.14), (0.007, 0.02, 0.05), bev=0.0015), 'wood', WALNUT_D, 2)
        # dowel pegs through the foot joint and the block (hi only: they live in the normal map)
        for y in (-0.031, 0.031):
            for z in (0.105, 0.165):
                k.add(lambda bm, hi, s=s, y=y, z=z: cyl(bm, hi, (s * PX, y, z), 0.0055, 0.006, 'y', 8, 0.001), 'wood', WALNUT_D, 1,
                      levels=('hi',))
        for y in (-0.15, 0.15):
            k.add(lambda bm, hi, s=s, y=y: cyl(bm, hi, (s * PX, y, 0.076), 0.006, 0.006, 'z', 8, 0.001), 'wood', WALNUT_D, 2,
                  levels=('hi',))
        # felt-less wear pads under the ends
        for y in (-0.22, 0.22):
            k.add(lambda bm, hi, s=s, y=y: box(bm, hi, (s * PX, y, 0.004), (0.074, 0.07, 0.008), bev=0.002), 'wood', WALNUT_D, 1)
    k.add(lambda bm, hi: box(bm, hi, (0, 0, 0.14), (2 * PX - 0.06, 0.04, 0.05), bev=0.006), 'wood', WALNUT, 0)
    return k.finish('mr-base')


POST_LOW = [(0.025, 0.195), (0.031, 0.203), (0.031, 0.216), (0.02, 0.232), (0.026, 0.252), (0.034, 0.3),
            (0.032, 0.345), (0.022, 0.39), (0.019, 0.41), (0.024, 0.42), (0.024, 0.432), (0.019, 0.445),
            (0.021, 0.62), (0.027, 0.632), (0.027, 0.645)]
POST_HIGH = [(0.026, 0.755), (0.026, 0.765), (0.02, 0.78), (0.019, 0.94), (0.025, 0.952), (0.028, 0.968),
             (0.025, 0.982), (0.018, 0.995)]
# a touch thicker than life, so the posts hold up at board scale
POST_LOW = [(r * 1.2, z) for r, z in POST_LOW]
POST_HIGH = [(r * 1.2, z) for r, z in POST_HIGH]
FINIAL = [(0.0, 0.993), (0.02, 0.993), (0.022, 1.0), (0.012, 1.009), (0.014, 1.014), (0.0, 1.014)]
KNOB = [(0.0, 0.0), (0.014, 0.0), (0.016, 0.004), (0.011, 0.01), (0.011, 0.016), (0.02, 0.02),
        (0.024, 0.03), (0.02, 0.04), (0.0, 0.044)]


def step_posts():
    """Two turned posts with a square pivot block, brass ball finials, pivot pins and knobs."""
    k = Kit(32)
    for s in (-1, 1):
        c = (s * PX, 0, 0)
        k.add(lambda bm, hi, c=c: lathe(bm, hi, POST_LOW, c, seg=10, seg_hi=32), 'wood', WALNUT, 2)
        k.add(lambda bm, hi, s=s: box(bm, hi, (s * PX, 0, 0.7), (0.06, 0.06, 0.11), bev=0.005), 'wood', WALNUT, 2)
        k.add(lambda bm, hi, c=c: lathe(bm, hi, POST_HIGH, c, seg=10, seg_hi=32), 'wood', WALNUT, 2)
        k.add(lambda bm, hi, c=c: lathe(bm, hi, FINIAL, c, seg=10, seg_hi=28), 'brass', BRASS)
        k.add(lambda bm, hi, s=s: sphere(bm, hi, (s * PX, 0, 1.042), 0.03, 10, 6), 'brass', BRASS)
        # pin from the frame's rosette into the block, and the knob on the outside of the post
        k.add(lambda bm, hi, s=s: cyl(bm, hi, (s * 0.326, 0, ZP), 0.008, 0.044, 'x', 8, 0.001), 'brass', BRASS)
        k.add(lambda bm, hi, s=s: turned_x(bm, hi, KNOB, s * (PX + 0.03), ZP, s), 'brass', BRASS)
        k.add(lambda bm, hi, s=s: cyl(bm, hi, (s * (PX + 0.031), 0, ZP), 0.017, 0.003, 'x', 10, 0.0), 'brass', BRASS)
    return k.finish('mr-posts')


# frame section (u inward from the glass edge, v toward the front); hi has the carved beads
PROF_LO = [(-0.07, -0.016), (-0.07, 0.011), (-0.056, 0.022), (-0.043, 0.019), (-0.027, 0.031), (-0.008, 0.022),
           (0.012, 0.011), (0.012, 0.006), (-0.002, 0.006), (-0.002, -0.016)]
PROF_HI = [(-0.07, -0.016), (-0.07, 0.007), (-0.069, 0.012), (-0.066, 0.017), (-0.061, 0.021), (-0.055, 0.023),
           (-0.05, 0.021), (-0.046, 0.017), (-0.042, 0.018), (-0.037, 0.024), (-0.031, 0.029), (-0.025, 0.031),
           (-0.018, 0.031), (-0.011, 0.026), (-0.005, 0.018), (0.003, 0.0135), (0.011, 0.012), (0.012, 0.009),
           (0.012, 0.006), (-0.002, 0.006), (-0.002, -0.016)]


def crest_outline(n, scallop):
    zc = ZP + B + 0.055
    pts = [(-0.09, zc - 0.03)]
    for i in range(n + 1):
        t = math.pi * (1 - i / n)
        r = 1 + (0.07 * math.cos(9 * t) if scallop else 0)
        pts.append((0.085 * r * math.cos(t), zc + 0.075 * r * math.sin(t)))
    pts.append((0.09, zc - 0.03))
    return pts, zc


def scroll(bm, hi, s):
    """A C-scroll beside the crest: a square section swept along a tightening spiral."""
    n = 40 if hi else 12
    cx, cz = s * 0.115, ZP + B + 0.05
    path = []
    for i in range(n):
        u = i / (n - 1)
        t = math.pi * (0.9 - 2.6 * u)
        r = 0.032 * (1 - 0.62 * u)
        path.append(Vector((cx + s * r * math.cos(t), 0, cz + r * math.sin(t))))
    prof = [(-0.006, -0.012), (0.006, -0.012), (0.006, 0.02), (-0.006, 0.02)]
    return sweep(bm, hi, prof, path, up=Vector((0, -1, 0)))


def step_frame():
    """Oval moulded frame (rebated for the glass), carved crest with fluting, two C-scrolls, a
    keystone at the bottom, a bead run on the outer moulding (hi), brass pivot rosettes and the
    back board; then the whole frame tilts back about the pivot axis."""
    k = Kit(33)
    up = Vector((0, -1, 0))
    k.add(lambda bm, hi: sweep(bm, hi, PROF_HI if hi else PROF_LO, oval(A, B, 120 if hi else 36), up=up, closed=True),
          'wood', WALNUT, 2)
    # bead run, carved into the outer moulding (normal map only)

    def beads(bm, hi):
        f = []
        for p in oval(A, B, 150, off=0.0615):
            f += sphere(bm, hi, p + Vector((0, -0.0205, 0)), 0.0042, 6, 4)
        return f
    k.add(beads, 'wood', WALNUT, 2, levels=('hi',))
    k.add(lambda bm, hi: prism(bm, hi, crest_outline(40 if hi else 12, hi)[0], 'y', -0.028, 0.01, bev=0.004), 'wood', WALNUT, 2)

    def flutes(bm, hi):
        f = []
        zc = crest_outline(4, False)[1]
        for i in range(7):
            th = math.radians(20 + 140 * i / 6)
            d = Vector((math.cos(th), 0, math.sin(th)))
            c = Vector((0, -0.0295, zc)) + d * 0.043
            f += box(bm, hi, c, (0.007, 0.004, 0.05), bev=0.0015, rot=Euler((0, math.pi / 2 - th, 0)))
        f += sphere(bm, hi, (0, -0.03, zc - 0.004), 0.012, 8, 5)
        return f
    k.add(flutes, 'wood', WALNUT, 2, levels=('hi',))
    k.add(lambda bm, hi: sphere(bm, hi, (0, -0.026, crest_outline(4, False)[1] - 0.004), 0.0125, 8, 5), 'wood', WALNUT, 2,
          levels=('lo',))
    for s in (-1, 1):
        k.add(lambda bm, hi, s=s: scroll(bm, hi, s), 'wood', WALNUT, 0)
    # keystone drop under the oval
    kz = ZP - B - FW
    key = [(-0.04, kz + 0.035), (0.04, kz + 0.035), (0.026, kz - 0.03), (0.0, kz - 0.045), (-0.026, kz - 0.03)]
    k.add(lambda bm, hi: prism(bm, hi, key, 'y', -0.026, 0.012, bev=0.004), 'wood', WALNUT, 2)
    # brass rosettes where the frame meets the pivots
    for s in (-1, 1):
        ros = [(0.0, 0.0), (0.024, 0.0), (0.024, 0.003), (0.018, 0.006), (0.009, 0.008), (0.0, 0.009)]
        k.add(lambda bm, hi, s=s, ros=ros: turned_x(bm, hi, ros, s * (A + FW - 0.002), ZP, s, 12, 28), 'brass', BRASS)
    # back board in the rebate
    back = oval(A, B, 36, off=0.0005)

    def board(bm, hi):
        before = set(bm.faces)
        r0 = [bm.verts.new(p + Vector((0, 0.007, 0))) for p in back]
        r1 = [bm.verts.new(p + Vector((0, 0.015, 0))) for p in back]
        bm.faces.new(r1)   # no face toward the glass: nothing ever sees it
        for i in range(len(back)):
            j = (i + 1) % len(back)
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
        f = _new_faces(bm, before)
        bmesh.ops.recalc_face_normals(bm, faces=f)
        return f
    k.add(board, 'wood', WALNUT_D, 2)
    rot = Matrix.Rotation(TILT, 3, 'X')
    for bm in (k.lo, k.hi):
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, ZP), matrix=rot)
    return k.finish('mr-frame')


def step_glass():
    """The glass: flat face, a wide bevel down to a thin edge, tilted with the frame."""
    k = Kit(34)

    def glass(bm, hi):
        n = 120 if hi else 36
        before = set(bm.faces)
        rings = [(oval(A, B, n, off=-0.032), -0.0055), (oval(A, B, n, off=-0.001), -0.0018),
                 (oval(A, B, n, off=-0.001), 0.006)]
        vr = [[bm.verts.new(p + Vector((0, y, 0))) for p in ring] for ring, y in rings]
        bm.faces.new(vr[0])   # the back is left open: the back board covers it
        for a, b in zip(vr, vr[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        f = _new_faces(bm, before)
        bmesh.ops.recalc_face_normals(bm, faces=f)
        return f
    k.add(glass, 'glass', GLASS)
    rot = Matrix.Rotation(TILT, 3, 'X')
    for bm in (k.lo, k.hi):
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, ZP), matrix=rot)
    return k.finish('mr-glass')
