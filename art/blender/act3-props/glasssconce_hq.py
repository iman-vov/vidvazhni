# Glass Town wall kit (2026-10-29): `glass-sconce`, a brass wall lantern for the `glass` map edge in
# place of the forge's torches: a shaped back plate, a scrolled arm, a hexagonal lantern with
# glowing panes, a ring on top and a drop finial. Built in the live Blender on hq_lib (exec
# hq_lib.py first). Steps: step_sconce_metal, step_sconce_glass; then join_parts('glass-sconce',
# SC_PARTS). Origin at the wall foot (y = 0 is the wall face, the board is -Y); it hangs at ~1.1.
import math
from mathutils import Vector, Matrix, Euler

BRASS = '#C29545'
BRASS_D = '#8E6A2E'
PANE = '#F2D48A'
CANDLE = '#EFE4C8'
LX, LY, LZ = 0.0, -0.2, 1.02      # lantern base centre
LH, LR = 0.2, 0.065               # lantern body height, radius to the posts
SC_PARTS = ['sc-metal', 'sc-glass']


def hexpts(r, z, n=6, rot=math.pi / 6):
    return [Vector((LX + r * math.cos(rot + 2 * math.pi * i / n), LY + r * math.sin(rot + 2 * math.pi * i / n), z)) for i in range(n)]


def step_sconce_metal():
    k = Kit(81)
    # back plate: a tall shield with a pointed top, bevelled
    plate = [(-0.06, 0.0), (0.06, 0.0), (0.075, 0.12), (0.05, 0.22), (0.0, 0.26), (-0.05, 0.22), (-0.075, 0.12)]
    k.add(lambda bm, hi: move(bm, prism(bm, hi, plate, 'y', -0.016, 0.0, bev=0.004), Matrix.Translation((0, 0, 1.0))) or [], 'brass', BRASS_D)
    for z in (1.04, 1.2):
        k.add(lambda bm, hi, z=z: dome(bm, hi, (0, -0.016, z), 0.012, 0.008), 'brass', BRASS)
    # arm: square bar out from the plate, curling up into a scroll at the end, a hook down to the ring
    path = [Vector((0, -0.016, 1.13)), Vector((0, -0.08, 1.15)), Vector((0, -0.15, 1.22)), Vector((0, -0.2, 1.3)),
            Vector((0, -0.25, 1.33)), Vector((0, -0.28, 1.31)), Vector((0, -0.28, 1.28)), Vector((0, -0.26, 1.27))]
    sq = [(-0.009, -0.009), (0.009, -0.009), (0.009, 0.009), (-0.009, 0.009)]
    k.add(lambda bm, hi: sweep(bm, hi, sq, path, up=Vector((1, 0, 0))), 'brass', BRASS, 1)
    # a brace under the arm
    brace = [Vector((0, -0.016, 1.05)), Vector((0, -0.07, 1.08)), Vector((0, -0.12, 1.16))]
    sq2 = [(-0.006, -0.006), (0.006, -0.006), (0.006, 0.006), (-0.006, 0.006)]
    k.add(lambda bm, hi: sweep(bm, hi, sq2, brace, up=Vector((1, 0, 0))), 'brass', BRASS, 1)
    # hook from the arm to the lantern ring
    k.add(lambda bm, hi: cyl(bm, hi, (LX, LY, LZ + LH + 0.075), 0.004, 0.05, seg=6), 'brass', BRASS)
    # lantern: base (turned), six posts, roof (turned cone), ring on top, drop finial below
    base = [(0, -0.05), (0.008, -0.05), (0.014, -0.03), (0.03, -0.012), (0.075, 0.0), (0.078, 0.012), (0.06, 0.02), (0, 0.02)]
    k.add(lambda bm, hi: lathe(bm, hi, [(r, z + LZ) for r, z in base], (LX, LY, 0), seg=6, seg_hi=24), 'brass', BRASS)
    for p in hexpts(LR, LZ + 0.02 + LH / 2):
        k.add(lambda bm, hi, p=p: box(bm, hi, p, (0.012, 0.012, LH), bev=0.002), 'brass', BRASS, 2)
    roof = [(0, LH + 0.02), (0.082, LH + 0.02), (0.082, LH + 0.032), (0.05, LH + 0.06), (0.02, LH + 0.08), (0.014, LH + 0.1), (0, LH + 0.1)]
    k.add(lambda bm, hi: lathe(bm, hi, [(r, z + LZ) for r, z in roof], (LX, LY, 0), seg=6, seg_hi=24), 'brass', BRASS)
    ring = [Vector((LX, LY + 0.02 * math.cos(a), LZ + LH + 0.115 + 0.02 * math.sin(a))) for a in [2 * math.pi * i / 10 for i in range(10)]]
    rp = [(0.004 * math.cos(2 * math.pi * j / 6), 0.004 * math.sin(2 * math.pi * j / 6)) for j in range(6)]
    k.add(lambda bm, hi: sweep(bm, hi, rp, ring, up=Vector((1, 0, 0)), closed=True), 'brass', BRASS)
    # top and bottom rails of the frame (hexagon rings)
    for z in (LZ + 0.026, LZ + LH + 0.014):
        k.add(lambda bm, hi, z=z: sweep(bm, hi, [(-0.004, -0.005), (0.006, -0.005), (0.006, 0.005), (-0.004, 0.005)],
                                        hexpts(LR + 0.004, z), up=Vector((0, 0, 1)), closed=True), 'brass', BRASS)
    return k.finish('sc-metal')


def step_sconce_glass():
    """Six panes between the posts (glow in the game), a candle stub inside on -hi."""
    k = Kit(82)

    def panes(bm, hi):
        f = []
        lo_ = hexpts(LR - 0.002, LZ + 0.03)
        up_ = hexpts(LR - 0.002, LZ + LH + 0.01)
        for i in range(6):
            j = (i + 1) % 6
            vs = [bm.verts.new(v) for v in (lo_[i], lo_[j], up_[j], up_[i])]
            f.append(bm.faces.new(vs))
        bmesh.ops.recalc_face_normals(bm, faces=f)
        # outward
        for g in f:
            c = g.calc_center_median()
            if g.normal.dot(c - Vector((LX, LY, c.z))) < 0:
                g.normal_flip()
        return f
    k.add(panes, 'glass', PANE)
    return k.finish('sc-glass')
