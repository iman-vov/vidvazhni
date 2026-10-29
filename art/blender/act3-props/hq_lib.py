# Helpers for the high-detail Act III props (v2, 2026-10-29). Run through the Blender MCP:
# exec(open(this).read()) at the top of each small step.
#
# Every prop is built twice from the same layout: a game mesh `<id>` (1-segment chamfers, 2-6k
# tris) and a bake source `<id>-hi` (3-segment rounded bevels plus detail that only goes into the
# normal map). Faces carry a material slot (MATS), a face colour `base` (the part's paint) and an
# int `gax` (grain axis 0/1/2 = x/y/z, for wood). The bake materials are procedural Cycles node
# trees in Object space, so -hi needs no UVs: colour (paint x grain x cavity AO x edge wear x
# ground dirt), metal-rough and normal are baked from -hi onto the UVs of the game mesh.
#
# Blender is Z-up; the prop faces -Y, which is +Z (towards the board) in glTF. Feet at z = 0.

import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix

ROOT = r'C:\Braves\art\blender\act3-props'
TEX = os.path.join(ROOT, 'hq-tex')
OUT = r'C:\Braves\art\meshy-source'
COLL = 'hq'
MATS = ['wood', 'leather', 'paper', 'iron', 'brass', 'glass', 'cloth', 'stone', 'crystal', 'rope']


def hexc(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB -> linear, so the attribute holds what Cycles works in
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def V(*a):
    return Vector(a)


class Kit:
    """Two bmeshes (lo, hi) filled piece by piece; each piece is built once per level."""

    def __init__(self, seed=1):
        self.lo, self.hi = bmesh.new(), bmesh.new()
        for bm in (self.lo, self.hi):
            bm.faces.layers.float_color.new('base')
            bm.faces.layers.int.new('gax')
        self.rnd = random.Random(seed)

    def add(self, build, mat, color, gax=2, levels=('lo', 'hi')):
        """build(bm, hi) adds one piece to bm; mat a MATS name; color hex or linear rgb."""
        col = hexc(color) if isinstance(color, str) else list(color)
        for lvl in levels:
            bm = self.lo if lvl == 'lo' else self.hi
            before = set(bm.faces)
            extra = build(bm, lvl == 'hi')
            bl = bm.faces.layers.float_color['base']
            gl = bm.faces.layers.int['gax']
            mi = MATS.index(mat)
            for f in _new_faces(bm, before):
                f[bl] = (*col, 1.0)
                f[gl] = gax
                f.material_index = mi
            # build may return [(faces, mat, colour), ...] for sub-parts in another material
            if isinstance(extra, list) and extra and isinstance(extra[0], tuple):
                for fs, m2, c2 in extra:
                    c2 = hexc(c2) if isinstance(c2, str) else list(c2)
                    for f in fs:
                        if f.is_valid:
                            f[bl] = (*c2, 1.0)
                            f.material_index = MATS.index(m2)

    def finish(self, name, loc=(0, 0, 0)):
        out = []
        for lvl, bm in (('lo', self.lo), ('hi', self.hi)):
            nm = name if lvl == 'lo' else name + '-hi'
            old = bpy.data.objects.get(nm)
            if old:
                me_old = old.data
                bpy.data.objects.remove(old)
                bpy.data.meshes.remove(me_old)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            me = bpy.data.meshes.new(nm)
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new(nm, me)
            (bpy.data.collections.get(COLL) or bpy.context.scene.collection).objects.link(ob)
            ob.location = loc
            for m in MATS:
                me.materials.append(bake_mat(m))
            for p in me.polygons:
                p.use_smooth = True
            out.append(ob)
        return out


# ---------------------------------------------------------------- shapes

def _new_faces(bm, before):
    """Faces added since `before`, a set of the faces that existed (a face count is not safe:
    BMesh reuses freed slots, so new faces can land before old ones)."""
    if isinstance(before, int):
        return list(bm.faces)[before:]
    return [f for f in bm.faces if f not in before]


def bevel_piece(bm, faces, w, hi, angle=30, segs_hi=3):
    """Bevels the piece's edges sharper than `angle` degrees: a chamfer on lo, rounded on hi."""
    if w <= 0:
        return
    es = set()
    for f in faces:
        for e in f.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle):
                es.add(e)
    if es:
        bmesh.ops.bevel(bm, geom=list(es), offset=w, segments=segs_hi if hi else 1,
                        profile=0.5, affect='EDGES', clamp_overlap=True)


def box(bm, hi, c, s, bev=0.004, rot=None, angle=30):
    """Box of size s centred at c, optional rotation (Euler or Matrix), bevelled edges."""
    before = set(bm.faces)
    m = Matrix.Translation(Vector(c))
    if rot is not None:
        m = m @ (rot.to_matrix().to_4x4() if hasattr(rot, 'to_matrix') else rot)
    bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Diagonal((*s, 1)))
    f = _new_faces(bm, before)
    bevel_piece(bm, f, min(bev, min(s) * 0.45), hi, angle)
    return _new_faces(bm, before)


def prism(bm, hi, pts, axis, a0, a1, bev=0.004, mat=None, angle=30):
    """Extrudes a 2D outline along an axis. axis 'y': pts are (x, z), from y=a0 to a1.
    axis 'x': pts (y, z). axis 'z': pts (x, y)."""
    before = set(bm.faces)

    def P(u, v, a):
        return {'y': V(u, a, v), 'x': V(a, u, v), 'z': V(u, v, a)}[axis]

    r0 = [bm.verts.new(P(u, v, a0)) for u, v in pts]
    r1 = [bm.verts.new(P(u, v, a1)) for u, v in pts]
    n = len(pts)
    bm.faces.new(r0[::-1])
    bm.faces.new(r1)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    f = _new_faces(bm, before)
    bmesh.ops.recalc_face_normals(bm, faces=f)
    bevel_piece(bm, f, bev, hi, angle)
    return _new_faces(bm, before)


def sweep(bm, hi, prof, path, up=V(0, 0, 1), closed=False, caps=True):
    """Sweeps a 2D profile (u sideways to the left of travel, v along `up`) along a polyline with
    mitred corners: mouldings, rails, frames."""
    before = set(bm.faces)
    path = [Vector(p) for p in path]
    n = len(path)
    rings = []
    for i, p in enumerate(path):
        if closed:
            d0 = (p - path[i - 1]).normalized()
            d1 = (path[(i + 1) % n] - p).normalized()
        else:
            d0 = (p - path[max(i - 1, 0)]).normalized() if i > 0 else (path[1] - p).normalized()
            d1 = (path[min(i + 1, n - 1)] - p).normalized() if i < n - 1 else d0
        t = (d0 + d1).normalized()
        side = up.cross(t).normalized()
        k = 1.0 / max(0.2, side.dot(up.cross(d0).normalized()))
        rings.append([bm.verts.new(p + side * u * k + up * v) for u, v in prof])
    m = len(prof)
    segs = range(n) if closed else range(n - 1)
    for i in segs:
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(m):
            jj = (j + 1) % m
            bm.faces.new((a[j], a[jj], b[jj], b[j]))
    if caps and not closed:
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1][::-1])
    f = _new_faces(bm, before)
    bmesh.ops.recalc_face_normals(bm, faces=f)
    return f


def lathe(bm, hi, prof, c=(0, 0, 0), seg=12, seg_hi=None, cap_top=True, cap_bot=True):
    """Turned part: prof is [(r, z)] bottom to top, around a Z axis through c."""
    before = set(bm.faces)
    s = (seg_hi or seg * 2) if hi else seg
    c = Vector(c)
    rings = []
    for r, z in prof:
        if r < 1e-5:
            rings.append([bm.verts.new(c + V(0, 0, z))])
        else:
            rings.append([bm.verts.new(c + V(r * math.cos(2 * math.pi * k / s), r * math.sin(2 * math.pi * k / s), z))
                          for k in range(s)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(s):
            kk = (k + 1) % s
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[kk]))
            elif len(b) == 1:
                bm.faces.new((a[k], b[0], a[kk]))
            else:
                bm.faces.new((a[k], a[kk], b[kk], b[k]))
    if cap_bot and len(rings[0]) > 1:
        bm.faces.new(rings[0][::-1])
    if cap_top and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    f = _new_faces(bm, before)
    bmesh.ops.recalc_face_normals(bm, faces=f)
    return f


def cyl(bm, hi, c, r, h, axis='z', seg=8, bev=0.0):
    """Cylinder centred at c along an axis (pegs, nails, bolts, axles)."""
    before = set(bm.faces)
    s = seg * 2 if hi else seg
    rot = {'z': Matrix(), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    bmesh.ops.create_cone(bm, cap_ends=True, segments=s, radius1=r, radius2=r, depth=h,
                          matrix=Matrix.Translation(Vector(c)) @ rot)
    f = _new_faces(bm, before)
    bevel_piece(bm, f, bev, hi, 40, 2)
    return _new_faces(bm, before)


def dome(bm, hi, c, r, h, n=(0, -1, 0), seg=6):
    """Nail or rivet head: a low dome whose base sits at c, pointing along n."""
    before = set(bm.faces)
    s = seg * 2 if hi else seg
    rings = 2 if hi else 1
    prof = [(r, 0)] + [(r * math.cos(math.pi / 2 * (i + 1) / (rings + 1)), h * math.sin(math.pi / 2 * (i + 1) / (rings + 1))) for i in range(rings)] + [(0, h)]
    f = lathe(bm, hi, prof, (0, 0, 0), seg=s, seg_hi=s, cap_top=False)
    q = Vector((0, 0, 1)).rotation_difference(Vector(n))
    vs = {v for ff in f for v in ff.verts}
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(c)) @ q.to_matrix().to_4x4(), verts=list(vs))
    return f


def sphere(bm, hi, c, r, seg=12, rings=7):
    before = set(bm.faces)
    bmesh.ops.create_uvsphere(bm, u_segments=seg * (2 if hi else 1), v_segments=rings * (2 if hi else 1),
                              radius=r, matrix=Matrix.Translation(Vector(c)))
    return _new_faces(bm, before)


def move(bm, faces, m):
    vs = list({v for f in faces for v in f.verts})
    bmesh.ops.transform(bm, matrix=m, verts=vs)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------------------------------------------------------------- bake materials

def _attr(nt, name, typ='GEOMETRY'):
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = name
    a.attribute_type = typ
    return a


def bake_mat(kind):
    """Procedural bake material `bk-<kind>`: emission nodes EM_COL / EM_MR and a BSDF with the
    bump for the normal bake; set_bake_output() picks which one feeds the output."""
    name = 'bk-' + kind
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_fake_user = True
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    base = _attr(nt, 'base')
    gax = _attr(nt, 'gax')

    def math_(op, a, b=None, v=None):
        n = N.new('ShaderNodeMath')
        n.operation = op
        if isinstance(a, (int, float)):
            n.inputs[0].default_value = a
        else:
            L.new(a, n.inputs[0])
        if b is not None:
            if isinstance(b, (int, float)):
                n.inputs[1].default_value = b
            else:
                L.new(b, n.inputs[1])
        return n.outputs[0]

    def mixc(fac, a, b, blend='MIX'):
        n = N.new('ShaderNodeMix')
        n.data_type = 'RGBA'
        n.blend_type = blend
        for sock, val in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(val, (int, float)):
                sock.default_value = val
            elif isinstance(val, tuple):
                sock.default_value = val
            else:
                L.new(val, sock)
        return n.outputs[2]

    def noise(scale, detail=4, rough=0.55, vec=None, dist=0.0):
        n = N.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        L.new(vec or tc.outputs['Object'], n.inputs['Vector'])
        return n.outputs['Fac']

    def ramp(fac, a, b):
        n = N.new('ShaderNodeMapRange')
        L.new(fac, n.inputs[0])
        n.inputs[1].default_value = a
        n.inputs[2].default_value = b
        return n.outputs[0]

    obj = tc.outputs['Object']
    # --- grain: stretch object coords so bands run along the grain axis
    height = None
    pattern = None
    if kind in ('wood', 'rope'):
        sep = N.new('ShaderNodeSeparateXYZ')
        L.new(obj, sep.inputs[0])
        comb = []
        # for grain along axis g, the bands vary across the other two axes; stretch g by 0.06
        for g in range(3):
            cm = N.new('ShaderNodeCombineXYZ')
            for k in range(3):
                L.new(math_('MULTIPLY', sep.outputs[k], 0.06 if k == g else 1.0), cm.inputs[k])
            comb.append(cm.outputs[0])
        is0 = math_('COMPARE', gax.outputs['Fac'], 0.0)
        is1 = math_('COMPARE', gax.outputs['Fac'], 1.0)
        vm = N.new('ShaderNodeMix')
        vm.data_type = 'VECTOR'
        L.new(is1, vm.inputs[0])
        L.new(comb[2], vm.inputs[4])
        L.new(comb[1], vm.inputs[5])
        vm2 = N.new('ShaderNodeMix')
        vm2.data_type = 'VECTOR'
        L.new(is0, vm2.inputs[0])
        L.new(vm.outputs[1], vm2.inputs[4])
        L.new(comb[0], vm2.inputs[5])
        gv = vm2.outputs[1]
        wave = N.new('ShaderNodeTexWave')
        wave.wave_type = 'RINGS'
        wave.rings_direction = 'SPHERICAL'
        wave.inputs['Scale'].default_value = 9.0 if kind == 'wood' else 40.0
        wave.inputs['Distortion'].default_value = 6.0
        wave.inputs['Detail'].default_value = 3.0
        wave.inputs['Detail Scale'].default_value = 1.5
        L.new(gv, wave.inputs['Vector'])
        fine = noise(160.0, 2, 0.5, gv)
        streak = ramp(wave.outputs['Fac'], 0.25, 0.85)
        pattern = math_('ADD', math_('MULTIPLY', streak, 0.75), math_('MULTIPLY', fine, 0.35))
        height = pattern
    elif kind == 'leather':
        pattern = math_('ADD', math_('MULTIPLY', noise(70.0, 6, 0.7), 0.6), math_('MULTIPLY', noise(9.0, 3, 0.5), 0.4))
        height = noise(220.0, 3, 0.6)
    elif kind == 'paper':
        sep = N.new('ShaderNodeSeparateXYZ')
        L.new(obj, sep.inputs[0])
        # page lines: fine bands across z, seen on the page block's top and fore-edge
        w = N.new('ShaderNodeTexWave')
        w.wave_type = 'BANDS'
        w.bands_direction = 'X'
        w.inputs['Scale'].default_value = 400.0
        w.inputs['Distortion'].default_value = 1.0
        L.new(obj, w.inputs['Vector'])
        pattern = math_('MULTIPLY', w.outputs['Fac'], 0.5)
        height = pattern
    elif kind == 'cloth':
        w1 = N.new('ShaderNodeTexWave'); w1.bands_direction = 'X'; w1.inputs['Scale'].default_value = 300.0
        w2 = N.new('ShaderNodeTexWave'); w2.bands_direction = 'Z'; w2.inputs['Scale'].default_value = 300.0
        L.new(obj, w1.inputs['Vector']); L.new(obj, w2.inputs['Vector'])
        pattern = math_('MULTIPLY', math_('ADD', w1.outputs['Fac'], w2.outputs['Fac']), 0.5)
        height = pattern
    else:
        pattern = noise({'iron': 60.0, 'brass': 45.0, 'stone': 25.0, 'glass': 8.0, 'crystal': 6.0}.get(kind, 40.0), 5, 0.6)
        height = noise(300.0 if kind != 'stone' else 90.0, 3, 0.6)

    # --- albedo
    dark = mixc(1.0, base.outputs['Color'], (0.55, 0.5, 0.46, 1), 'MULTIPLY')
    amt = {'wood': 0.85, 'rope': 0.7, 'leather': 0.55, 'paper': 0.25, 'cloth': 0.4, 'iron': 0.5, 'brass': 0.35,
           'stone': 0.55, 'glass': 0.25, 'crystal': 0.3}[kind]
    col = mixc(math_('MULTIPLY', math_('SUBTRACT', 1.0, pattern), amt), base.outputs['Color'], dark)
    # big soft hue/value drift so no part reads as one flat colour
    drift = noise(3.0, 2, 0.5)
    col = mixc(math_('MULTIPLY', drift, 0.25), col, (0.62, 0.55, 0.45, 1), 'MULTIPLY' if kind != 'glass' else 'MIX')
    # cavity AO
    ao = N.new('ShaderNodeAmbientOcclusion')
    ao.samples = 12
    ao.only_local = True
    ao.inputs['Distance'].default_value = 0.05
    aof = ao.outputs['AO']
    # edge mask: bevel normal vs true normal
    bev = N.new('ShaderNodeBevel')
    bev.samples = 6
    bev.inputs['Radius'].default_value = 0.006
    geo = N.new('ShaderNodeNewGeometry')
    dot = N.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    L.new(bev.outputs[0], dot.inputs[0])
    L.new(geo.outputs['Normal'], dot.inputs[1])
    edge = ramp(dot.outputs['Value'], 0.985, 0.90)  # 0 flat, 1 on edges
    wear_n = noise(28.0, 4, 0.7)
    wear = math_('MULTIPLY', edge, ramp(wear_n, 0.35, 0.6))
    if kind == 'brass':
        patina = mixc(1.0, base.outputs['Color'], (0.16, 0.26, 0.2, 1), 'MULTIPLY')
        pat_amt = math_('ADD', math_('MULTIPLY', math_('SUBTRACT', 1.0, aof), 1.4), math_('MULTIPLY', ramp(noise(9.0, 4, 0.6), 0.55, 0.75), 0.45))
        col = mixc(math_('MINIMUM', pat_amt, 0.85), col, patina)
    if kind == 'iron':
        rust = (0.18, 0.07, 0.03, 1)
        r_amt = math_('MULTIPLY', math_('SUBTRACT', 1.0, aof), 1.2)
        col = mixc(math_('MINIMUM', math_('MULTIPLY', r_amt, ramp(noise(14.0, 4, 0.6), 0.4, 0.7)), 0.8), col, rust)
    lift = {'wood': 1.55, 'rope': 1.3, 'leather': 1.6, 'paper': 1.1, 'cloth': 1.25, 'iron': 2.2, 'brass': 1.7,
            'stone': 1.35, 'glass': 1.15, 'crystal': 1.3}[kind]
    worn = mixc(1.0, col, (lift, lift, lift, 1), 'MULTIPLY')
    col = mixc(math_('MINIMUM', math_('MULTIPLY', wear, 1.4), 1.0), col, worn)
    # dirt in crevices
    cav = math_('POWER', aof, 1.0)
    shade = math_('ADD', 0.42, math_('MULTIPLY', cav, 0.58))
    dirt_col = (0.16, 0.12, 0.09, 1)
    col = mixc(math_('MULTIPLY', math_('SUBTRACT', 1.0, aof), 0.45), col, dirt_col)
    shaded = N.new('ShaderNodeMix'); shaded.data_type = 'RGBA'; shaded.blend_type = 'MULTIPLY'
    shaded.inputs[0].default_value = 1.0
    L.new(col, shaded.inputs[6])
    cmb = N.new('ShaderNodeCombineColor')
    for k in range(3):
        L.new(shade, cmb.inputs[k])
    L.new(cmb.outputs[0], shaded.inputs[7])
    col = shaded.outputs[2]
    # ground dirt: the lowest 12 cm darker and browner
    sepw = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sepw.inputs[0])
    low = ramp(sepw.outputs[2], 0.14, 0.0)
    col = mixc(math_('MULTIPLY', low, 0.35), col, (0.2, 0.15, 0.1, 1))
    em = N.new('ShaderNodeEmission')
    em.name = 'EM_COL'
    L.new(col, em.inputs['Color'])

    # --- metal-rough (G rough, B metal)
    rough0, metal0 = {'wood': (0.78, 0), 'rope': (0.9, 0), 'leather': (0.62, 0), 'paper': (0.9, 0), 'cloth': (0.95, 0),
                      'iron': (0.55, 0.85), 'brass': (0.42, 0.9), 'stone': (0.85, 0), 'glass': (0.08, 0),
                      'crystal': (0.18, 0)}[kind]
    r = math_('ADD', rough0, math_('MULTIPLY', math_('SUBTRACT', pattern, 0.5), 0.12))
    r = math_('SUBTRACT', r, math_('MULTIPLY', wear, 0.18 if metal0 else 0.05))
    if kind == 'brass':
        r = math_('ADD', r, math_('MULTIPLY', math_('MINIMUM', pat_amt, 0.85), 0.4))
    mrc = N.new('ShaderNodeCombineColor')
    L.new(r, mrc.inputs[1])
    if kind == 'brass':
        L.new(math_('SUBTRACT', metal0, math_('MULTIPLY', math_('MINIMUM', pat_amt, 0.85), 0.6)), mrc.inputs[2])
    elif kind == 'iron':
        L.new(math_('SUBTRACT', metal0, math_('MULTIPLY', math_('SUBTRACT', 1.0, aof), 0.5)), mrc.inputs[2])
    else:
        mrc.inputs[2].default_value = metal0
    em2 = N.new('ShaderNodeEmission')
    em2.name = 'EM_MR'
    L.new(mrc.outputs[0], em2.inputs['Color'])

    # --- normal-bake BSDF with bump
    bump = N.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = {'wood': 0.35, 'rope': 0.6, 'leather': 0.25, 'paper': 0.3, 'cloth': 0.5,
                                             'iron': 0.25, 'brass': 0.12, 'stone': 0.4, 'glass': 0.0,
                                             'crystal': 0.0}[kind]
    bump.inputs['Distance'].default_value = 0.002
    L.new(height, bump.inputs['Height'])
    df = N.new('ShaderNodeBsdfDiffuse')
    df.name = 'BSDF_N'
    L.new(bump.outputs['Normal'], df.inputs['Normal'])
    L.new(em.outputs[0], out.inputs['Surface'])
    return m


def set_bake_output(which):
    """which: 'EM_COL', 'EM_MR' or 'BSDF_N' in every bake material."""
    for k in MATS:
        m = bpy.data.materials.get('bk-' + k)
        if not m:
            continue
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        src = nt.nodes[which]
        nt.links.new(src.outputs[0], out.inputs['Surface'])


# ---------------------------------------------------------------- game mesh prep

def prep_lo(ob, uv_margin=0.004):
    """Weighted normals (face-area, keep sharp) and a fresh UV unwrap packed into 0-1."""
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    wn = ob.modifiers.get('wn') or ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
    wn.mode = 'FACE_AREA'
    wn.weight = 50
    wn.keep_sharp = True
    # unwrap
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=uv_margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=uv_margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------- baking (hi -> lo, runs as a job)

BAKES = {'col': ('EM_COL', 'EMIT', 'sRGB'), 'mr': ('EM_MR', 'EMIT', 'Non-Color'), 'n': ('BSDF_N', 'NORMAL', 'Non-Color')}


def bake_start(lo, hi, pid, which, size=1024, samples=8, extrusion=0.008, ray=0.016):
    """Starts one bake of `<pid>_<which>` (col / mr / n) from hi onto lo's UVs as a background job
    (INVOKE_DEFAULT), so Blender stays responsive. Poll bpy.app.is_job_running('OBJECT_BAKE'),
    then call bake_save(pid, which)."""
    node_out, btype, cs = BAKES[which]
    name = '%s_%s' % (pid, which)
    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = cs
    set_bake_output(node_out)
    for m in lo.data.materials:
        nt = m.node_tree
        n = nt.nodes.get('BAKE_IMG') or nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE_IMG'
        n.image = img
        nt.nodes.active = n
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    b = sc.render.bake
    b.use_selected_to_active = True
    b.use_cage = False
    b.cage_extrusion = extrusion
    b.max_ray_distance = ray
    b.margin = 8
    b.margin_type = 'EXTEND'
    b.normal_space = 'TANGENT'
    b.use_clear = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    hi.hide_viewport = lo.hide_viewport = False
    hi.hide_render = lo.hide_render = False
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    region = next(r for r in area.regions if r.type == 'WINDOW')
    with bpy.context.temp_override(window=win, area=area, region=region, active_object=lo,
                                   selected_objects=[hi, lo]):
        return bpy.ops.object.bake('INVOKE_DEFAULT', type=btype, pass_filter=set(), use_selected_to_active=True,
                                   cage_extrusion=extrusion, max_ray_distance=ray, margin=8, use_clear=True,
                                   normal_space='TANGENT', target='IMAGE_TEXTURES', save_mode='INTERNAL')


def bake_save(pid, which):
    img = bpy.data.images['%s_%s' % (pid, which)]
    os.makedirs(TEX, exist_ok=True)
    img.filepath_raw = os.path.join(TEX, '%s_%s.png' % (pid, which))
    img.file_format = 'PNG'
    img.save()
    return img.filepath_raw


def final_mat(lo, pid):
    """Replaces lo's bake slots with one Principled material `<pid>` fed by the three baked maps
    (MR: G roughness, B metallic). Face material indices all go to 0."""
    m = bpy.data.materials.get(pid) or bpy.data.materials.new(pid)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    bs = N.new('ShaderNodeBsdfPrincipled')
    L.new(bs.outputs[0], out.inputs[0])

    def tex(which):
        n = N.new('ShaderNodeTexImage')
        n.image = bpy.data.images.get('%s_%s' % (pid, which))
        return n
    c, mr, nm = tex('col'), tex('mr'), tex('n')
    L.new(c.outputs[0], bs.inputs['Base Color'])
    sep = N.new('ShaderNodeSeparateColor')
    L.new(mr.outputs[0], sep.inputs[0])
    L.new(sep.outputs[1], bs.inputs['Roughness'])
    L.new(sep.outputs[2], bs.inputs['Metallic'])
    nmap = N.new('ShaderNodeNormalMap')
    L.new(nm.outputs[0], nmap.inputs['Color'])
    L.new(nmap.outputs[0], bs.inputs['Normal'])
    nt.nodes.active = c
    me = lo.data
    for p in me.polygons:
        p.material_index = 0
    me.materials.clear()
    me.materials.append(m)
    return m


def remake_mat(kind):
    """Rebuilds bk-<kind> after an edit to bake_mat, keeping every slot that uses it."""
    old = bpy.data.materials.get('bk-' + kind)
    if old:
        old.name = 'bk-' + kind + '-old'
    new = bake_mat(kind)
    if old:
        old.user_remap(new)
        bpy.data.materials.remove(old)
    return new


def join_parts(name, parts):
    """Merges the part objects (lo, and their -hi) into `name` and `name-hi`; the parts stay."""
    out = []
    for suf in ('', '-hi'):
        nm = name + suf
        o = bpy.data.objects.get(nm)
        if o:
            me = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(me)
        bm = bmesh.new()
        for p in parts:
            bm.from_mesh(bpy.data.objects[p + suf].data)
        if not suf:
            bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY',
                                  ngon_method='EAR_CLIP')
        me = bpy.data.meshes.new(nm)
        bm.to_mesh(me)
        bm.free()
        for m in MATS:
            me.materials.append(bake_mat(m))
        ob = bpy.data.objects.new(nm, me)
        bpy.data.collections[COLL].objects.link(ob)
        out.append(ob)
    return out


def shrink_hidden(ob, hidden, k=0.2, margin=0.003):
    """Scales the UV islands that `hidden(normal, material_index)` calls hidden (bottoms, faces
    inside the prop) to k of their size and repacks, so the seen faces get the texels."""
    from mathutils import Vector as V2
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv[0]
    seen, n = set(), 0

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
        nrm = sum((g.normal * g.calc_area() for g in isl), V2())
        if nrm.length and hidden(nrm.normalized(), isl[0].material_index):
            n += 1
            cs = [l[uvl].uv.copy() for g in isl for l in g.loops]
            c = sum(cs, V2((0, 0))) / len(cs)
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
    bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method='CONCAVE', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return n
