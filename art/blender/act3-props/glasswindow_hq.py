# Glass Town wall kit (2026-10-29): `glass-window`, a limestone wall segment with a tall arched
# stained-glass window in a brass frame, for the `glass` map edge (src/render/environment). Built
# piece by piece in the live Blender on hq_lib (exec hq_lib.py first, then this file).
# Steps: step_wall, step_trim, step_glass; then join_parts('glass-window', GW_PARTS).
# Kit frame (README in src/render/environment): the wall runs along X, 1.06 long; its inner face
# is y = 0 (the board side is -Y, i.e. +Z in glTF) and the body lies behind it (+Y). Feet at z = 0.
# Pane faces are 'glass': in the game they go to a second material that glows with the baked
# colour (light through the glass); the lead cames exist only on -hi and come in through the bake.
import math
from mathutils import Vector, Matrix, Euler

STONE = '#D6CDBA'
STONE2 = '#C9BFA9'
PLINTH = '#9A9183'
BRASS = '#C29545'
LEAD = '#3E4246'
GLASS = {'aqua': '#9ED6DE', 'clear': '#CFE6E6', 'amber': '#E6B85E', 'rose': '#D58FA0', 'blue': '#5A8CC8'}
L, T, H = 1.06, 0.26, 1.8        # segment length, wall depth, wall height
XO, ZS, ZA = 0.235, 0.44, 1.2      # opening half width, sill top, arch spring line
R = XO                             # arch radius (round head): top of the opening at ZA + R
YF = 0.11                          # depth of the glazing plane behind the inner face
GW_PARTS = ['gw-wall', 'gw-trim', 'gw-glass']


def arc(r, n, a0=math.pi, a1=0.0, zc=ZA):
    return [(r * math.cos(a0 + (a1 - a0) * i / n), zc + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def opening_path(off=0.0, n=10, closed=False):
    """Jamb - arch - jamb at offset `off` outward from the opening edge, in the XZ plane (y = 0)."""
    pts = [(-XO - off, ZS - (off if closed else 0))] + arc(R + off, n) + [(XO + off, ZS - (off if closed else 0))]
    return [Vector((x, 0, z)) for x, z in pts]


def step_wall():
    """Wall body: two piers, the panel under the sill and the spandrel over the arch. -hi is laid
    in ashlar courses (lo: chamfered blocks; hi: rounded, so the joints read as sunk), and the
    arch gets wedge voussoirs."""
    k = Kit(61)
    pw = L / 2 - XO

    def body(bm, hi):
        f = []
        rnd = random.Random(611)  # the same layout on lo and hi
        g = 0.007
        rv = R + 0.15
        # piers: courses of 0.2-0.25 with a break at the spring line; above it the piers step back
        # to make room for the voussoirs. Every other course has a vertical joint.
        z = 0.0
        row = 0
        while z < H - 1e-3:
            h = min(H - z, rnd.uniform(0.2, 0.25))
            if z < ZA - 1e-3 and z + h > ZA - 0.06:
                h = ZA - z
            if H - (z + h) < 0.08:
                h = H - z
            inner = XO if z < ZA - 1e-3 else rv
            for s in (-1, 1):
                a, b = inner, L / 2
                spans = [(a, b)]
                if row % 2 and b - a > 0.2:
                    m = a + rnd.uniform(0.08, b - a - 0.08)
                    spans = [(a, m), (m, b)]
                for a_, b_ in spans:
                    f += box(bm, hi, (s * (a_ + b_) / 2, T / 2 + rnd.uniform(-0.002, 0.002), z + h / 2),
                             (b_ - a_ - g, T, h - g), bev=0.012)
            z += h
            row += 1
        # panel under the sill: two courses
        for z0, z1 in ((0.0, 0.22), (0.22, ZS)):
            f += box(bm, hi, (0, T / 2, (z0 + z1) / 2), (2 * XO - g, T, z1 - z0 - g), bev=0.012)
        # voussoirs round the arch, the keystone wider and standing proud
        n = 7
        for i in range(n):
            a0 = math.pi * (1 - i / n) - 0.004
            a1 = math.pi * (1 - (i + 1) / n) + 0.004
            key = i == n // 2
            ro = rv + (0.05 if key else 0.0)
            pts = [(R * math.cos(a0), ZA + R * math.sin(a0)), (ro * math.cos(a0), ZA + ro * math.sin(a0)),
                   (ro * math.cos(a1), ZA + ro * math.sin(a1)), (R * math.cos(a1), ZA + R * math.sin(a1))]
            f += prism(bm, hi, pts, 'y', -0.02 if key else 0.0, T, bev=0.01)
        # fill over the voussoirs up to the top
        outer = arc(rv, 12)
        pts = [(-rv, ZA)] + outer[1:-1] + [(rv, ZA), (rv, H), (-rv, H)]
        f += prism(bm, hi, pts, 'y', 0.003, T, bev=0.01)
        return f
    k.add(body, 'stone', STONE)
    return k.finish('gw-wall')


def step_trim():
    """Plinth, sill, a moulded cornice with a brass band, the stone moulding round the opening."""
    k = Kit(62)
    k.add(lambda bm, hi: box(bm, hi, (0, T / 2 - 0.02, 0.08), (L, T + 0.04, 0.16), bev=0.012), 'stone', PLINTH)
    # sill with a drip groove under its nose
    k.add(lambda bm, hi: box(bm, hi, (0, YF / 2 - 0.035, ZS - 0.03), (2 * XO + 0.14, YF + 0.07, 0.06), bev=0.008), 'stone', STONE2)
    # cornice: fillet, cove and a square top, swept along X
    prof = [(0.0, H - 0.2), (-0.018, H - 0.2), (-0.018, H - 0.175), (-0.03, H - 0.16), (-0.05, H - 0.13),
            (-0.062, H - 0.09), (-0.075, H - 0.07), (-0.075, H), (0.0, H)]
    path = [Vector((-L / 2, 0, 0)), Vector((L / 2, 0, 0))]
    k.add(lambda bm, hi: sweep(bm, hi, prof, path, up=Vector((0, 0, 1))), 'stone', STONE2)
    k.add(lambda bm, hi: box(bm, hi, (0, -0.021, H - 0.215), (L, 0.012, 0.03), bev=0.003), 'brass', BRASS, 0)
    # brass rivets along the band on -hi only (they come in through the bake)
    k.add(lambda bm, hi: sum((dome(bm, hi, (x, -0.027, H - 0.215), 0.006, 0.004) for x in [(-0.45 + 0.1 * i) for i in range(10)]), []),
          'brass', BRASS, levels=('hi',))
    # moulding round the opening: u outward from the opening, v toward the board
    mp = [(0.0, 0.0), (0.0, 0.016), (0.012, 0.026), (0.04, 0.026), (0.055, 0.012), (0.06, 0.0)]
    k.add(lambda bm, hi: sweep(bm, hi, mp, opening_path(0.0, 14 if hi else 10), up=Vector((0, -1, 0))), 'stone', STONE2)
    return k.finish('gw-trim')


def step_glass():
    """Brass frame in the reveal, mullion and transom, the panes. -hi: stained cells and lead cames."""
    k = Kit(63)
    fp = [(-0.006, -0.016), (0.03, -0.016), (0.03, 0.016), (-0.006, 0.016)]

    def frame(bm, hi):
        path = [p + Vector((0, YF, 0)) for p in opening_path(0.0, 14 if hi else 10, closed=True)]
        # u outward is into the stone; flip so the frame face lies inside the opening
        return sweep(bm, hi, [(-u, v) for u, v in fp], path, up=Vector((0, -1, 0)), closed=True)
    k.add(frame, 'brass', BRASS, 0)
    k.add(lambda bm, hi: box(bm, hi, (0, YF, (ZS + ZA + R) / 2), (0.024, 0.03, ZA + R - ZS), bev=0.004), 'brass', BRASS, 2)
    k.add(lambda bm, hi: box(bm, hi, (0, YF, ZA), (2 * XO, 0.03, 0.022), bev=0.004), 'brass', BRASS, 0)
    yp = YF + 0.004

    def quad(bm, a, b, c, d):
        vs = [bm.verts.new(Vector((x, yp, z))) for x, z in (a, b, c, d)]
        return [bm.faces.new(vs)]

    def fan(bm, pts, c):
        cv = bm.verts.new(Vector((c[0], yp, c[1])))
        out = []
        for p, q in zip(pts, pts[1:]):
            out.append(bm.faces.new((cv, bm.verts.new(Vector((p[0], yp, p[1]))), bm.verts.new(Vector((q[0], yp, q[1]))))))
        return out
    if True:
        # lo: one quad under the spring line and a fan over it
        k.add(lambda bm, hi: quad(bm, (-XO, ZS), (-XO, ZA), (XO, ZA), (XO, ZS)) + fan(bm, arc(R, 10), (0, ZA)),
              'glass', GLASS['aqua'], levels=('lo',))
    # hi: cells, amber border, a rose here and there, blue rays over the spring line, amber roundel
    rnd = k.rnd
    cols = 4
    rows = 6
    cw = 2 * XO / cols
    rh = (ZA - ZS) / rows
    for i in range(cols):
        for j in range(rows):
            x0, z0 = -XO + i * cw, ZS + j * rh
            border = i in (0, cols - 1) or j == 0
            c = GLASS['amber'] if border and (i + j) % 2 == 0 else (GLASS['rose'] if rnd.random() < 0.12 else GLASS[rnd.choice(['aqua', 'clear', 'aqua'])])
            k.add(lambda bm, hi, x0=x0, z0=z0: quad(bm, (x0, z0), (x0, z0 + rh), (x0 + cw, z0 + rh), (x0 + cw, z0)),
                  'glass', c, levels=('hi',))
    n = 8
    for i in range(n):
        a0, a1 = math.pi * (1 - i / n), math.pi * (1 - (i + 1) / n)
        pts = [(R * math.cos(a0 + (a1 - a0) * t / 3), ZA + R * math.sin(a0 + (a1 - a0) * t / 3)) for t in range(4)]
        k.add(lambda bm, hi, pts=pts: fan(bm, pts, (0, ZA)), 'glass', GLASS['blue'] if i % 2 else GLASS['aqua'], levels=('hi',))
    k.add(lambda bm, hi: fan(bm, arc(0.075, 12, math.pi, 0), (0, ZA)), 'glass', GLASS['amber'], levels=('hi',))
    # lead cames on -hi
    lc = 0.007

    def cames(bm, hi):
        f = []
        for i in range(1, cols):
            x = -XO + i * cw
            f += box(bm, hi, (x, yp - 0.003, (ZS + ZA) / 2), (lc, 0.006, ZA - ZS), bev=0.002)
        for j in range(1, rows):
            z = ZS + j * rh
            f += box(bm, hi, (0, yp - 0.003, z), (2 * XO, 0.006, lc), bev=0.002)
        for i in range(1, n):
            a = math.pi * (1 - i / n)
            mid = (0.075 + R) / 2
            f += box(bm, hi, (mid * math.cos(a), yp - 0.003, ZA + mid * math.sin(a)), (R - 0.075, 0.006, lc), bev=0.002,
                     rot=Euler((0, -a, 0)))
        ring_ = [Vector((x, yp - 0.003, z)) for x, z in arc(0.075, 12)]
        prof = [(-lc / 2, -0.003), (lc / 2, -0.003), (lc / 2, 0.003), (-lc / 2, 0.003)]
        f += sweep(bm, hi, prof, ring_, up=Vector((0, -1, 0)))
        return f
    k.add(cames, 'iron', LEAD, levels=('hi',))
    return k.finish('gw-glass')


def occluded(ob, gap=0.03):
    """Indices of lo faces that face another part of the mesh closer than `gap` (block sides
    against their neighbours, faces against the wall): they get almost no texels."""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    tree = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])
    out = set()
    for p in me.polygons:
        hit = tree.ray_cast(p.center + p.normal * 1e-4, p.normal, gap)
        if hit[0] is not None and hit[2] != p.index:
            out.add(p.index)
    return out


def rescale_islands(ob, factor):
    """Scales every UV island by factor(face_indices) (1 = as is) and repacks into 0-1."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv[0]
    seen = set()

    def key(l):
        return (round(l[uvl].uv.x, 5), round(l[uvl].uv.y, 5))
    for f in bm.faces:
        if f in seen:
            continue
        st, isl = [f], []
        seen.add(f)
        while st:
            g = st.pop()
            isl.append(g)
            for l in g.loops:
                for l2 in l.edge.link_loops:
                    h = l2.face
                    if h not in seen and {key(l), key(l.link_loop_next)} == {key(l2), key(l2.link_loop_next)}:
                        seen.add(h)
                        st.append(h)
        k = factor([g.index for g in isl])
        if k != 1:
            cs = [l[uvl].uv.copy() for g in isl for l in g.loops]
            c = sum(cs, Vector((0, 0))) / len(cs)
            for g in isl:
                for l in g.loops:
                    l[uvl].uv = c + (l[uvl].uv - c) * k
    bm.to_mesh(me)
    bm.free()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True, shape_method='CONCAVE', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def window_uvs(lo):
    """Fresh unwrap at 40 degrees (so a chamfer splits a block's front from its hidden sides); hidden
    faces shrink to 6 %, the panes grow 1.6x (they glow, so they show)."""
    prep_lo(lo)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(40), island_margin=0.003, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    hid = occluded(lo)
    glass = {p.index for p in lo.data.polygons if p.material_index == MATS.index('glass')}
    back = {p.index for p in lo.data.polygons if p.normal.y > 0.7 or p.normal.z < -0.7}

    def factor(fs):
        if any(i in glass for i in fs):
            return 1.6
        n = sum(1 for i in fs if i in hid or i in back)
        return 0.06 if n * 2 > len(fs) else 1
    rescale_islands(lo, factor)
    lo['glass_faces'] = sorted(glass)
    return len(hid), len(glass)
