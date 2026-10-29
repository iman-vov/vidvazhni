# Act III glass-cart v2 (high detail): a glassmaker's two-wheeled hand cart with four panes on an
# A-frame rack, built piece by piece in the live Blender on hq_lib (exec hq_lib.py first).
# Steps: step_bed, step_wheels, step_handles, step_rack, step_panes, step_rope; then
# join_parts('glass-cart', CART_PARTS). Front is -Y; the cart runs along X (wheels face the
# camera), handles toward +X. Pane faces are 'glass' (the game's clear second material); pane
# edges are 'crystal', green-blue and opaque.
import math
from mathutils import Vector, Matrix, Euler

WOOD = '#7B5B3D'
GRIP = '#A68B66'
IRON = '#3D3936'
BRASS = '#B08A3E'
FELT = '#6A2C24'
ROPE = '#9C8460'
PANE = '#BFD6D2'
EDGE = '#5E9C92'
XW, ZW, RW = -0.1, 0.33, 0.33     # axle x, axle height, wheel radius
YW = 0.385                         # wheel centre planes at y = +-YW
X0, X1 = -0.6, 0.4                 # bed from front to back
CART_PARTS = ['gc-bed', 'gc-wheels', 'gc-handles', 'gc-rack', 'gc-panes', 'gc-rope']


def ring(c, r, n, axis='y'):
    """Circle path around centre c in the plane normal to `axis` ('y': XZ plane, 'x': YZ plane)."""
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        if axis == 'y':
            out.append(Vector(c) + Vector((r * math.cos(t), 0, r * math.sin(t))))
        else:
            out.append(Vector(c) + Vector((0, r * math.cos(t), r * math.sin(t))))
    return out


def turned(bm, hi, prof, c, axis, seg=10, seg_hi=24):
    """Lathe whose profile z runs along +axis ('x', 'y', '-y') from c."""
    f = lathe(bm, hi, prof, (0, 0, 0), seg=seg, seg_hi=seg_hi)
    rot = {'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(-math.pi / 2, 4, 'X'),
           '-y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    move(bm, f, Matrix.Translation(Vector(c)) @ rot)
    return f


def step_bed():
    """Two beams, three cross members, five deck planks with gaps and nail rows (hi), low side
    rails on stakes, a front board, iron corner straps with rivets (hi)."""
    k = Kit(41)
    for s in (-1, 1):
        k.add(lambda bm, hi, s=s: box(bm, hi, ((X0 + X1) / 2, s * 0.25, 0.38), (X1 - X0, 0.055, 0.07), bev=0.006), 'wood', WOOD, 0)
    for x in (X0 + 0.04, -0.12, X1 - 0.04):
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, 0.435), (0.05, 0.6, 0.04), bev=0.005), 'wood', WOOD, 1)
    pw, gap = 0.108, 0.006
    for i in range(5):
        y = -0.282 + pw / 2 + i * (pw + gap)
        k.add(lambda bm, hi, y=y: box(bm, hi, ((X0 + X1) / 2, y, 0.4675), (X1 - X0 + 0.02, pw, 0.025), bev=0.004), 'wood', WOOD, 0)

        def nails(bm, hi, y=y):
            f = []
            for x in (X0 + 0.04, -0.12, X1 - 0.04):
                for dy in (-0.03, 0.03):
                    f += dome(bm, hi, (x, y + dy, 0.48), 0.0055, 0.003, (0, 0, 1))
            return f
        k.add(nails, 'iron', IRON, levels=('hi',))
    for s in (-1, 1):
        # side rail on three stakes
        k.add(lambda bm, hi, s=s: box(bm, hi, ((X0 + X1) / 2, s * 0.29, 0.535), (X1 - X0, 0.022, 0.1), bev=0.004), 'wood', WOOD, 0)
        for x in (X0 + 0.025, -0.1, X1 - 0.025):
            k.add(lambda bm, hi, s=s, x=x: box(bm, hi, (x, s * 0.312, 0.5), (0.035, 0.024, 0.2), bev=0.004), 'wood', WOOD, 2)
        # iron strap round the front corner, riveted
        k.add(lambda bm, hi, s=s: box(bm, hi, (X0 + 0.03, s * 0.3025, 0.535), (0.07, 0.004, 0.075), bev=0.0012), 'iron', IRON)
        k.add(lambda bm, hi, s=s: box(bm, hi, (X0 - 0.013, s * 0.27, 0.535), (0.004, 0.065, 0.075), bev=0.0012), 'iron', IRON)

        def rivets(bm, hi, s=s):
            f = []
            for z in (0.515, 0.555):
                f += dome(bm, hi, (X0 + 0.045, s * 0.3045, z), 0.005, 0.003, (0, s, 0))
                f += dome(bm, hi, (X0 - 0.015, s * 0.255, z), 0.005, 0.003, (-1, 0, 0))
            return f
        k.add(rivets, 'iron', IRON, levels=('hi',))
    k.add(lambda bm, hi: box(bm, hi, (X0 - 0.002, 0, 0.53), (0.022, 0.56, 0.11), bev=0.004), 'wood', WOOD, 1)
    return k.finish('gc-bed')


def wheel(k, s):
    c = Vector((XW, s * YW, ZW))
    up = Vector((0, -1, 0))
    felloe_lo = [(0.0, -0.024), (0.0, 0.024), (0.038, 0.024), (0.038, -0.024)]
    felloe_hi = [(0.0, -0.022), (0.0, 0.022), (0.003, 0.025), (0.035, 0.025), (0.038, 0.022), (0.038, -0.022),
                 (0.035, -0.025), (0.003, -0.025)]
    k.add(lambda bm, hi: sweep(bm, hi, felloe_hi if hi else felloe_lo, ring(c, RW - 0.014, 64 if hi else 20), up=up, closed=True),
          'wood', WOOD, 1)
    tyre_lo = [(0.0, -0.027), (0.0, 0.027), (0.015, 0.027), (0.015, -0.027)]
    tyre_hi = [(0.0, -0.025), (0.0, 0.025), (0.002, 0.027), (0.015, 0.027), (0.015, -0.027), (0.002, -0.027)]
    k.add(lambda bm, hi: sweep(bm, hi, tyre_hi if hi else tyre_lo, ring(c, RW, 72 if hi else 20), up=up, closed=True),
          'iron', IRON)

    def tyre_rivets(bm, hi):
        f = []
        for i in range(16):
            t = 2 * math.pi * (i + 0.5) / 16
            d = Vector((math.cos(t), 0, math.sin(t)))
            f += dome(bm, hi, c + d * RW, 0.006, 0.003, d)
        return f
    k.add(tyre_rivets, 'iron', IRON, levels=('hi',))
    for i in range(8):
        t = 2 * math.pi * i / 8 + math.pi / 8
        d = Vector((math.cos(t), 0, math.sin(t)))
        k.add(lambda bm, hi, d=d, t=t: box(bm, hi, c + d * 0.175, (0.028, 0.024, 0.25), bev=0.004,
                                            rot=Euler((0, math.pi / 2 - t, 0))), 'wood', WOOD, 2)
    hub = [(0.0, -0.07), (0.035, -0.07), (0.042, -0.06), (0.052, -0.04), (0.055, 0.0), (0.052, 0.04),
           (0.042, 0.06), (0.035, 0.07), (0.0, 0.07)]
    k.add(lambda bm, hi: turned(bm, hi, hub, c, 'y', 12, 32), 'wood', WOOD, 1)
    # iron bands on the hub and the brass cap on the outer end
    for d in (-0.05, 0.05):
        k.add(lambda bm, hi, d=d: cyl(bm, hi, c + Vector((0, d, 0)), 0.0545, 0.01, 'y', 12, 0.001), 'iron', IRON)
    cap = [(0.0, 0.0), (0.03, 0.0), (0.03, 0.012), (0.026, 0.02), (0.016, 0.027), (0.0, 0.03)]
    k.add(lambda bm, hi: turned(bm, hi, cap, c + Vector((0, s * 0.07, 0)), 'y' if s > 0 else '-y', 10, 28), 'brass', BRASS)


def step_wheels():
    """Iron axle and two wheels: wooden felloe, iron tyre with 16 rivets (hi), 8 spokes, a hub
    with iron bands and a brass cap."""
    k = Kit(42)
    k.add(lambda bm, hi: cyl(bm, hi, (XW, 0, ZW), 0.022, 2 * YW + 0.12, 'y', 10, 0.002), 'iron', IRON)
    for s in (-1, 1):
        wheel(k, s)
    return k.finish('gc-wheels')


def step_handles():
    """Two long handles running back from the beams, worn turned grips, a fold-down prop leg on
    iron hinges with its own cross bar."""
    k = Kit(43)
    b = -0.07     # handles rise toward their ends
    for s in (-1, 1):
        k.add(lambda bm, hi, s=s: box(bm, hi, (0.68, s * 0.25, 0.4 + 0.29 * 0.07), (0.6, 0.048, 0.05), bev=0.006,
                                      rot=Euler((0, b, 0))), 'wood', WOOD, 0)
        grip = [(0.0, 0.0), (0.024, 0.0), (0.03, 0.01), (0.028, 0.04), (0.029, 0.1), (0.031, 0.13), (0.024, 0.15),
                (0.0, 0.152)]
        end = Vector((0.68, s * 0.25, 0.42)) + Vector((math.cos(b), 0, -math.sin(b))) * 0.16

        def grip_b(bm, hi, s=s, end=end, grip=grip):
            f = lathe(bm, hi, grip, (0, 0, 0), seg=10, seg_hi=24)
            move(bm, f, Matrix.Translation(end) @ Matrix.Rotation(math.pi / 2 + b, 4, 'Y'))
            return f
        k.add(grip_b, 'wood', GRIP, 0)
        # prop leg, hinged under the handle, standing a little splayed
        k.add(lambda bm, hi, s=s: box(bm, hi, (0.6, s * 0.25, 0.19), (0.036, 0.036, 0.4), bev=0.005,
                                      rot=Euler((0, -0.12, 0))), 'wood', WOOD, 2)
        k.add(lambda bm, hi, s=s: box(bm, hi, (0.586, s * 0.25, 0.385), (0.05, 0.058, 0.035), bev=0.002), 'iron', IRON)
        k.add(lambda bm, hi, s=s: cyl(bm, hi, (0.586, s * 0.25, 0.385), 0.008, 0.07, 'y', 8, 0.0), 'iron', IRON)
        k.add(lambda bm, hi, s=s: box(bm, hi, (0.627, s * 0.25, 0.012), (0.05, 0.044, 0.024), bev=0.002), 'iron', IRON)
    k.add(lambda bm, hi: box(bm, hi, (0.612, 0, 0.1), (0.03, 0.5, 0.03), bev=0.004), 'wood', WOOD, 1)
    return k.finish('gc-handles')


# A-frame geometry (in YZ): legs from (+-0.17, 0.48) up to (+-0.02, 0.9)
LEG_C = (0.095, 0.69)
LEG_A = math.atan2(0.15, 0.42)
LEG_D = Vector((0, -math.sin(LEG_A), math.cos(LEG_A)))       # up the +y leg
LEG_N = Vector((0, math.cos(LEG_A), math.sin(LEG_A)))        # out of the +y leg
RX0, RX1 = -0.5, 0.3


def side(v, s):
    return Vector((v.x, s * v.y, v.z))


def step_rack():
    """Two A-frames with cross bars, a ridge board, felt-topped ledges on the bed and felt strips
    between the panes."""
    k = Kit(44)
    for x in (RX0 + 0.05, RX1 - 0.05):
        for s in (-1, 1):
            c = Vector((x, s * LEG_C[0], LEG_C[1]))
            k.add(lambda bm, hi, c=c, s=s: box(bm, hi, c, (0.032, 0.03, 0.45), bev=0.004,
                                               rot=Euler((s * LEG_A, 0, 0))), 'wood', WOOD, 2)
        k.add(lambda bm, hi, x=x: box(bm, hi, (x, 0, 0.6), (0.026, 0.25, 0.03), bev=0.004), 'wood', WOOD, 1)
    k.add(lambda bm, hi: box(bm, hi, ((RX0 + RX1) / 2, 0, 0.905), (RX1 - RX0 + 0.04, 0.06, 0.03), bev=0.005), 'wood', WOOD, 0)
    for s in (-1, 1):
        k.add(lambda bm, hi, s=s: box(bm, hi, ((RX0 + RX1) / 2, s * 0.215, 0.495), (RX1 - RX0, 0.04, 0.03), bev=0.004), 'wood', WOOD, 0)
        k.add(lambda bm, hi, s=s: box(bm, hi, ((RX0 + RX1) / 2, s * 0.215, 0.512), (RX1 - RX0, 0.04, 0.005), bev=0.001), 'cloth', FELT)
        # felt strips against the legs and between the panes, at the top and the bottom of the panes
        for j in range(2):
            off = 0.015 + 0.002 + j * 0.012
            for t in (-0.16, 0.16):
                c = Vector((0, LEG_C[0], LEG_C[1])) + LEG_N * off + LEG_D * t
                k.add(lambda bm, hi, c=c, s=s: box(bm, hi, side(c, s) + Vector(((RX0 + RX1) / 2, 0, 0)),
                                                   (RX1 - RX0 - 0.02, 0.004, 0.03), bev=0.001,
                                                   rot=Euler((s * LEG_A, 0, 0))), 'cloth', FELT)
    return k.finish('gc-rack')


def step_panes():
    """Four panes leaning on the A-frame, two a side; faces glass, edges green-blue."""
    k = Kit(45)
    for s in (-1, 1):
        for j in range(2):
            off = 0.015 + 0.004 + 0.004 + j * 0.012
            c = Vector((0, LEG_C[0], LEG_C[1])) + LEG_N * off + LEG_D * -0.005
            c = side(c, s) + Vector(((RX0 + RX1) / 2 + (0.012 if j else -0.01), 0, 0))
            n = side(LEG_N, s)

            def pane(bm, hi, c=c, s=s, n=n):
                f = box(bm, hi, c, (RX1 - RX0 + 0.02, 0.008, 0.44), bev=0.0015, rot=Euler((s * LEG_A, 0, 0)), angle=20)
                return [([g for g in f if abs(g.normal.dot(n)) > 0.95], 'glass', PANE)]
            k.add(pane, 'crystal', EDGE)
    return k.finish('gc-panes')


def rope_loop(bm, hi, x):
    """A rope round the panes and the ridge, its knot on top and a short loose end."""
    o = 0.015 + 0.004 + 0.016 + 0.006
    pts = []
    for s in (1, -1):
        top = Vector((0, LEG_C[0], LEG_C[1])) + LEG_N * o + LEG_D * 0.215
        bot = Vector((0, LEG_C[0], LEG_C[1])) + LEG_N * o + LEG_D * -0.205
        seq = [top, (top + bot) / 2, bot] if s > 0 else [bot, (top + bot) / 2, top]
        pts += [side(p, s) for p in seq]
    pts.insert(0, Vector((0, 0, 0.928)))
    pts.insert(4, Vector((0, 0.05, 0.512)))
    pts.insert(5, Vector((0, -0.05, 0.512)))
    path = [p + Vector((x, 0, 0)) for p in pts]
    r = 0.0065
    n = 12 if hi else 6
    prof = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    f = sweep(bm, hi, prof, path, up=Vector((1, 0, 0)), closed=True)
    f += sphere(bm, hi, (x, 0, 0.935), 0.012, 6, 4)
    tail = [Vector((x + 0.005, 0.0, 0.935)), Vector((x + 0.02, -0.02, 0.92)), Vector((x + 0.03, -0.035, 0.88))]
    f += sweep(bm, hi, prof, tail, up=Vector((0, -1, 0)))
    return f


def step_rope():
    k = Kit(46)
    for x in (-0.33, 0.12):
        k.add(lambda bm, hi, x=x: rope_loop(bm, hi, x), 'rope', ROPE, 0)
    return k.finish('gc-rope')


def glass_slot(lo, pid, rgba=(0.78, 0.88, 0.87, 0.3)):
    """After final_mat: the faces that were 'glass' go to a second, clear material `<pid>-glass`.
    Call with the indices saved before final_mat (lo['glass_faces'])."""
    m = bpy.data.materials.get(pid + '-glass') or bpy.data.materials.new(pid + '-glass')
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*rgba[:3], 1)
    bs.inputs['Alpha'].default_value = rgba[3]
    bs.inputs['Roughness'].default_value = 0.08
    bs.inputs['Metallic'].default_value = 0.0
    m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        m.blend_method = 'BLEND'
    me = lo.data
    if len(me.materials) < 2:
        me.materials.append(m)
    for i in lo['glass_faces']:
        me.polygons[i].material_index = 1
    return m
