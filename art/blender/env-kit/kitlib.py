# Environment art kit helpers for «Відважні». Run inside Blender through the MCP:
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
# Builds chunky hand-made-looking pieces from bevelled, jittered primitives, paints them with
# procedural "hand-painted" shaders (per-part colour variation, brush streaks, lit edges, dark
# crevices, darker feet) and bakes everything of a location into one shared atlas.
#
# Frame (matches src/render/environment/README.md after the glTF Y-up conversion):
#   Blender X = game X, Blender Z = game up, Blender -Y = game +Z (towards the board).
#   Walls run along X with their inner face on y = 0 and their body at y > 0.

import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler

KIT_DIR = r'C:\Braves\art\blender\env-kit'
SOURCE_DIR = r'C:\Braves\art\meshy-source'
TEX_DIR = r'C:\Braves\assets\textures'

# ─── Paint materials ───────────────────────────────────────────────────────
# name: (base, variation, crevice, edge highlight, kind)   kind: stone | wood | soft | metal | emit | glass
PAINTS = {}


def hexc(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x ** 2.2 for x in c] + [1.0]   # sRGB → linear


def paint(name, colors, dark, light, kind='stone', grain=(1.0, 1.0), edge=0.55, ao=0.75, streak=(0.8, 1.16), feet=0.4):
    """colors: 1-3 base colours picked per part by its random value; dark: crevices and feet; light: edges."""
    PAINTS[name] = dict(colors=colors, dark=dark, light=light, kind=kind, grain=grain, edge=edge, ao=ao, streak=streak, feet=feet)


def bake_material(name):
    """Emission shader that computes the painted colour; baked into the atlas (Cycles, EMIT).
    Reads the per-part 'rnd' and per-chamfer 'edge' face attributes and the per-vertex 'ao' and
    'cvx' attributes that Piece.build computes, so the bake needs no AO or Bevel ray tracing."""
    p = PAINTS[name]
    mname = 'paint.' + name
    m = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    L = nt.links

    def N(t, x, y):
        n = nt.nodes.new(t)
        n.location = (x, y)
        return n

    out = N('ShaderNodeOutputMaterial', 1600, 0)
    em = N('ShaderNodeEmission', 1400, 0)
    L.new(em.outputs[0], out.inputs['Surface'])
    uv = N('ShaderNodeUVMap', -1600, -100); uv.uv_map = 'paint'
    if p['kind'] == 'emit':
        # Flames and glows: warm rim at the base, pale core at the tip (paint UV V runs 0 → 1 upwards).
        sep = N('ShaderNodeSeparateXYZ', -400, 0)
        L.new(uv.outputs[0], sep.inputs[0])
        ramp = N('ShaderNodeValToRGB', -150, 0)
        ramp.color_ramp.elements[0].color = p['colors'][0]
        ramp.color_ramp.elements[1].color = p['light']
        L.new(sep.outputs[1], ramp.inputs[0])
        L.new(ramp.outputs[0], em.inputs['Color'])
        return m

    def attr(nm, x, y):
        a = N('ShaderNodeAttribute', x, y); a.attribute_name = nm; a.attribute_type = 'GEOMETRY'
        return a.outputs['Fac']

    def mix(a, b, fac, x, y, blend='MIX'):
        n = N('ShaderNodeMix', x, y); n.data_type = 'RGBA'; n.blend_type = blend
        for sock, v in (('A', a), ('B', b), ('Factor', fac)):
            if isinstance(v, (int, float, list, tuple)):
                n.inputs[sock].default_value = v
            else:
                L.new(v, n.inputs[sock])
        return n.outputs['Result']

    def rng(v, a, b, c, d, x, y):
        n = N('ShaderNodeMapRange', x, y)
        n.inputs['From Min'].default_value = a; n.inputs['From Max'].default_value = b
        n.inputs['To Min'].default_value = c; n.inputs['To Max'].default_value = d
        L.new(v, n.inputs['Value'])
        return n.outputs[0]

    def gray(v, x, y):
        n = N('ShaderNodeCombineColor', x, y)
        for i in range(3):
            L.new(v, n.inputs[i])
        return n.outputs[0]

    # Per-part colour from the part's random value.
    rnd = attr('rnd', -1600, 300)
    ramp = N('ShaderNodeValToRGB', -1350, 300)
    cols = p['colors']
    els = ramp.color_ramp.elements
    els[0].color = cols[0]; els[0].position = 0.0
    els[1].color = cols[-1]; els[1].position = 1.0
    if len(cols) == 3:
        e = els.new(0.5); e.color = cols[1]
    L.new(rnd, ramp.inputs[0])
    base = ramp.outputs[0]

    # Brush streaks: noise stretched along the paint UV's V, offset per part.
    mp = N('ShaderNodeMapping', -1400, -100)
    mp.inputs['Scale'].default_value = (p['grain'][0], p['grain'][1], 1.0)
    L.new(uv.outputs[0], mp.inputs[0])
    mul = N('ShaderNodeMath', -1400, -350); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 37.0
    L.new(rnd, mul.inputs[0])
    comb = N('ShaderNodeCombineXYZ', -1200, -350)
    L.new(mul.outputs[0], comb.inputs[0]); L.new(mul.outputs[0], comb.inputs[1])
    off = N('ShaderNodeVectorMath', -1100, -100); off.operation = 'ADD'
    L.new(mp.outputs[0], off.inputs[0]); L.new(comb.outputs[0], off.inputs[1])
    nz = N('ShaderNodeTexNoise', -900, -100)
    nz.inputs['Scale'].default_value = 5.0; nz.inputs['Detail'].default_value = 4.0
    nz.inputs['Roughness'].default_value = 0.6; nz.inputs['Distortion'].default_value = 0.8
    L.new(off.outputs[0], nz.inputs['Vector'])
    s = rng(nz.outputs['Fac'], 0.3, 0.7, p['streak'][0], p['streak'][1], -700, -100)
    if p['kind'] == 'wood':
        wv = N('ShaderNodeTexWave', -900, -400)
        wv.wave_type = 'BANDS'; wv.bands_direction = 'X'
        wv.inputs['Scale'].default_value = 2.4; wv.inputs['Distortion'].default_value = 5.0
        wv.inputs['Detail'].default_value = 2.0
        L.new(off.outputs[0], wv.inputs['Vector'])
        w = rng(wv.outputs['Fac'], 0.0, 0.3, 0.66, 1.0, -700, -400)
        sm = N('ShaderNodeMath', -500, -250); sm.operation = 'MULTIPLY'
        L.new(s, sm.inputs[0]); L.new(w, sm.inputs[1])
        s = sm.outputs[0]
    if p['kind'] == 'leaf':
        # Leaf clumps: scalloped Voronoi cells, each a little lighter in its middle.
        vo = N('ShaderNodeTexVoronoi', -900, -650); vo.feature = 'DISTANCE_TO_EDGE'
        vo.inputs['Scale'].default_value = 13.0
        L.new(off.outputs[0], vo.inputs['Vector'])
        cl = rng(vo.outputs['Distance'], 0.0, 0.1, 0.78, 1.05, -700, -650)
        sm = N('ShaderNodeMath', -350, -400); sm.operation = 'MULTIPLY'
        L.new(s, sm.inputs[0]); L.new(cl, sm.inputs[1])
        s = sm.outputs[0]
    if p['kind'] == 'stone':
        # Sparse chips and cracks: thin dark Voronoi borders here and there.
        vo = N('ShaderNodeTexVoronoi', -900, -650); vo.feature = 'DISTANCE_TO_EDGE'
        vo.inputs['Scale'].default_value = 3.0
        L.new(off.outputs[0], vo.inputs['Vector'])
        crk = rng(vo.outputs['Distance'], 0.0, 0.035, 0.6, 1.0, -700, -650)
        nz2 = N('ShaderNodeTexNoise', -900, -900); nz2.inputs['Scale'].default_value = 1.5
        L.new(off.outputs[0], nz2.inputs['Vector'])
        msk = rng(nz2.outputs['Fac'], 0.55, 0.62, 1.0, 0.0, -700, -900)
        mx = N('ShaderNodeMath', -500, -700); mx.operation = 'MAXIMUM'
        L.new(crk, mx.inputs[0]); L.new(msk, mx.inputs[1])
        sm = N('ShaderNodeMath', -350, -400); sm.operation = 'MULTIPLY'
        L.new(s, sm.inputs[0]); L.new(mx.outputs[0], sm.inputs[1])
        s = sm.outputs[0]
    c = mix(base, gray(s, -300, -100), 1.0, -100, 200, 'MULTIPLY')

    # Painted light from above: up-facing faces lighter, down-facing darker.
    geo = N('ShaderNodeNewGeometry', -300, -1100)
    sn = N('ShaderNodeSeparateXYZ', -100, -1100)
    L.new(geo.outputs['Normal'], sn.inputs[0])
    t = rng(sn.outputs[2], -1.0, 1.0, 0.7, 1.12, 100, -1100)
    c = mix(c, gray(t, 300, -1100), 1.0, 300, 200, 'MULTIPLY')

    # Crevices (vertex AO) and feet (world Z while baking; pieces stand on z = 0) go to the dark colour.
    ao = rng(attr('ao', 100, -300), 0.0, 1.0, 0.0, p['ao'], 300, -300)
    c = mix(c, p['dark'], ao, 500, 200)
    sp = N('ShaderNodeSeparateXYZ', -100, -600)
    L.new(geo.outputs['Position'], sp.inputs[0])
    ft = rng(sp.outputs[2], 0.0, 0.3, p['feet'], 0.0, 300, -600)
    c = mix(c, p['dark'], ft, 700, 200)

    # Edge highlight: chamfer faces and convex vertices get the light colour.
    mx = N('ShaderNodeMath', 700, -400); mx.operation = 'MAXIMUM'
    L.new(attr('edge', 500, -350), mx.inputs[0]); L.new(attr('cvx', 500, -500), mx.inputs[1])
    ef = N('ShaderNodeMath', 900, -400); ef.operation = 'MULTIPLY'; ef.inputs[1].default_value = p['edge']
    L.new(mx.outputs[0], ef.inputs[0])
    # Top edges catch the light; side edges a little; bottom edges hardly at all.
    up = rng(sn.outputs[2], -0.8, 0.8, 0.15, 1.0, 700, -700)
    ef2 = N('ShaderNodeMath', 900, -600); ef2.operation = 'MULTIPLY'
    L.new(ef.outputs[0], ef2.inputs[0]); L.new(up, ef2.inputs[1])
    ef = ef2
    c = mix(c, p['light'], ef.outputs[0], 1100, 200)
    L.new(c, em.inputs['Color'])
    return m


# ─── Piece builder ─────────────────────────────────────────────────────────

class Piece:
    """Collects bmesh parts of one kit piece; every part gets a paint, a random value and a paint UV."""

    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('paint')
        self.rnd = self.bm.faces.layers.float.new('rnd')
        self.edge = self.bm.faces.layers.float.new('edge')
        self.organic = self.bm.verts.layers.int.new('organic')   # 1: gets convexity highlights
        self.mats = []
        self.rng = random.Random(seed)
        self.smooth = 35   # degrees: edges sharper than this stay hard; organic pieces raise it

    def _mat_index(self, paint_name):
        if paint_name not in self.mats:
            self.mats.append(paint_name)
        return self.mats.index(paint_name)

    def _finish(self, geom_faces, paint_name, matrix, grain_axis=0, rnd=None, emit_uv=False):
        """Assigns material, random value and box-projected paint UV (metres; V runs along grain_axis)."""
        mi = self._mat_index(paint_name)
        r = self.rng.random() if rnd is None else rnd
        verts = {v for f in geom_faces for v in f.verts}
        # Local coordinates before the transform, for the UV projection.
        local = {v: v.co.copy() for v in verts}
        if emit_uv:
            zs = [c.z for c in local.values()]
            z0, z1 = min(zs), max(zs)
        for f in geom_faces:
            f.material_index = mi
            f[self.rnd] = r
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            others = [i for i in range(3) if i != ax]
            if grain_axis in others:
                vi = grain_axis
                ui = [i for i in others if i != grain_axis][0]
            else:
                ui, vi = others
            for loop in f.loops:
                c = local[loop.vert]
                if emit_uv:
                    loop[self.uv].uv = (0.5, (c.z - z0) / max(1e-6, z1 - z0))
                else:
                    loop[self.uv].uv = (c[ui] + r * 3.1, c[vi] + r * 1.7)
        bmesh.ops.transform(self.bm, matrix=matrix, verts=list(verts))
        return geom_faces

    @staticmethod
    def M(pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        return Matrix.LocRotScale(Vector(pos), Euler(rot), Vector(scale))

    def _jitter(self, verts, amount):
        if amount <= 0:
            return
        for v in verts:
            v.co += Vector((self.rng.uniform(-1, 1), self.rng.uniform(-1, 1), self.rng.uniform(-1, 1))) * amount

    def box(self, paint_name, size, pos=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, jitter=0.0, grain=0, taper=0.0, rnd=None, drop_bottom=False):
        """Box by size, centred on pos. bevel = chamfer width; jitter = random corner offset; taper shrinks the top."""
        bm = self.bm
        before = set(bm.faces)
        res = bmesh.ops.create_cube(bm, size=1.0)
        verts = res['verts']
        for v in verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
            if taper and v.co.z > 0:
                v.co.x *= (1 - taper); v.co.y *= (1 - taper)
        self._jitter(verts, jitter)
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            res_b = bmesh.ops.bevel(bm, geom=edges + verts, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
            for f in res_b['faces']:
                f[self.edge] = 1.0
        faces = [f for f in bm.faces if f not in before]
        if drop_bottom:
            low = min(v.co.z for f in faces for v in f.verts)
            gone = [f for f in faces if f.normal.z < -0.9 and all(abs(v.co.z - low) < 1e-4 for v in f.verts)]
            bmesh.ops.delete(bm, geom=gone, context='FACES_ONLY')
            faces = [f for f in faces if f.is_valid]
        return self._finish(faces, paint_name, self.M(pos, rot), grain_axis=grain, rnd=rnd)

    def cyl(self, paint_name, r1, r2, h, seg=8, pos=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, jitter=0.0, caps=True, rnd=None, grain=2):
        """Cylinder standing on pos (bottom centre) along local Z; r1 bottom, r2 top."""
        bm = self.bm
        before = set(bm.faces)
        res = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
        verts = res['verts']
        for v in verts:
            v.co.z += h / 2
        self._jitter(verts, jitter)
        if bevel > 0 and caps:
            bm.normal_update()
            rim = [e for e in {e for v in verts for e in v.link_edges}
                   if len(e.link_faces) == 2 and sum(abs(f.normal.z) > 0.9 for f in e.link_faces) == 1]
            res_b = bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
            for f in res_b['faces']:
                f[self.edge] = 1.0
        faces = [f for f in bm.faces if f not in before]
        return self._finish(faces, paint_name, self.M(pos, rot), grain_axis=grain, rnd=rnd)

    def cone(self, paint_name, r, h, seg=6, pos=(0, 0, 0), rot=(0, 0, 0), jitter=0.0, rnd=None, emit_uv=False):
        bm = self.bm
        before = set(bm.faces)
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=r, radius2=0, depth=h)
        for v in res['verts']:
            v.co.z += h / 2
        self._jitter(res['verts'], jitter)
        faces = [f for f in bm.faces if f not in before]
        return self._finish(faces, paint_name, self.M(pos, rot), grain_axis=2, rnd=rnd, emit_uv=emit_uv)

    def blob(self, paint_name, r, pos=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), subdiv=1, noise=0.12, rnd=None, flat_bottom=False, emit_uv=False):
        """Lumpy icosphere: rocks, foliage, onions."""
        bm = self.bm
        before = set(bm.faces)
        res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
        verts = res['verts']
        for v in verts:
            v.co *= 1 + self.rng.uniform(-noise, noise)
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
            if flat_bottom and v.co.z < 0:
                v.co.z *= 0.25
        for v in verts:
            v[self.organic] = 1
        faces = [f for f in bm.faces if f not in before]
        return self._finish(faces, paint_name, self.M(pos, rot), grain_axis=2, rnd=rnd, emit_uv=emit_uv)

    def rock(self, paint_name, r, pos=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), noise=0.18, rnd=None, cut_bottom=True, subdiv=1):
        """Faceted rock: subdivided icosphere, pushed around, planed off at its base."""
        bm = self.bm
        before = set(bm.faces)
        res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
        verts = res['verts']
        # Planar-ish facets: push each vertex along a few random directions.
        dirs = [Vector((self.rng.uniform(-1, 1), self.rng.uniform(-1, 1), self.rng.uniform(-1, 1))).normalized() for _ in range(4)]
        for v in verts:
            d = v.co.normalized()
            k = 1 + sum(max(0, d.dot(q)) * self.rng.uniform(-noise, noise * 0.4) for q in dirs) + self.rng.uniform(-noise, noise) * 0.4
            v.co = d * r * k
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
            if cut_bottom and v.co.z < -0.15 * r * scale[2]:
                v.co.z = -0.15 * r * scale[2]
            v[self.organic] = 1
        faces = [f for f in bm.faces if f not in before]
        return self._finish(faces, paint_name, self.M(pos, rot), grain_axis=2, rnd=rnd)

    def tube(self, paint_name, points, radii, seg=6, cap_start=False, cap_end=True, rnd=None, twist=0.0):
        """A tube through points (trunks, branches, roots, logs, stems); radii per point.
        Paint UV runs around (U) and along (V) the tube, so bark streaks follow it."""
        bm = self.bm
        r = self.rng.random() if rnd is None else rnd
        mi = self._mat_index(paint_name)
        pts = [Vector(p) for p in points]
        rings = []
        up = Vector((0, 0, 1))
        prev_side = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = up if abs(t.dot(up)) < 0.9 else Vector((1, 0, 0))
            side = t.cross(ref).normalized()
            if prev_side is not None and side.dot(prev_side) < 0:
                side = -side
            prev_side = side
            other = t.cross(side).normalized()
            ring = []
            for k in range(seg):
                a = 2 * math.pi * k / seg + twist * i
                d = side * math.cos(a) + other * math.sin(a)
                ring.append(bm.verts.new(p + d * radii[i] * (1 + self.rng.uniform(-0.06, 0.06))))
            rings.append(ring)
        faces = []
        dist = [0.0]
        for i in range(1, len(pts)):
            dist.append(dist[-1] + (pts[i] - pts[i - 1]).length)
        for i in range(len(rings) - 1):
            for k in range(seg):
                a, b = rings[i][k], rings[i][(k + 1) % seg]
                c, d = rings[i + 1][(k + 1) % seg], rings[i + 1][k]
                f = bm.faces.new((a, b, c, d))
                faces.append(f)
                circ = 2 * math.pi * max(radii[i], 0.01)
                for loop, (u, v) in zip(f.loops, ((k, dist[i]), (k + 1, dist[i]), (k + 1, dist[i + 1]), (k, dist[i + 1]))):
                    loop[self.uv].uv = (u / seg * circ + r * 3.1, v + r * 1.7)
        caps = []
        if cap_start:
            caps.append(bm.faces.new(list(reversed(rings[0]))))
        if cap_end and radii[-1] > 0.002:
            caps.append(bm.faces.new(rings[-1]))
        for f in caps:
            for loop in f.loops:
                c = loop.vert.co
                loop[self.uv].uv = (c.x + r * 3.1, c.y + r * 1.7)
        for f in faces + caps:
            f.material_index = mi
            f[self.rnd] = r
        bm.normal_update()
        return faces + caps

    def frond(self, paint_name, points, widths, up=(0, 0, 1), crease=0.35, rnd=None):
        """A leaf, frond or grass blade: a strip through points with a raised midrib (V section),
        so it reads from above and from the side without double-sided materials."""
        bm = self.bm
        r = self.rng.random() if rnd is None else rnd
        mi = self._mat_index(paint_name)
        pts = [Vector(p) for p in points]
        upv = Vector(up)
        rows = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            side = t.cross(upv)
            if side.length < 1e-4:
                side = t.cross(Vector((1, 0, 0)))
            side.normalize()
            n = side.cross(t).normalized()
            w = widths[i]
            if w < 1e-4:
                rows.append([bm.verts.new(p)])
            else:
                rows.append([bm.verts.new(p - side * w), bm.verts.new(p + n * w * crease), bm.verts.new(p + side * w)])
        faces = []
        L = 0.0
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            if len(b) == 1:
                fs = [bm.faces.new((a[0], a[1], b[0])), bm.faces.new((a[1], a[2], b[0]))]
            elif len(a) == 1:
                fs = [bm.faces.new((a[0], b[1], b[0])), bm.faces.new((a[0], b[2], b[1]))]
            else:
                fs = [bm.faces.new((a[0], a[1], b[1], b[0])), bm.faces.new((a[1], a[2], b[2], b[1]))]
            seglen = (pts[i + 1] - pts[i]).length
            for f in fs:
                for loop in f.loops:
                    v = loop.vert
                    row = i if v in a else i + 1
                    col = (a if v in a else b).index(v)
                    loop[self.uv].uv = (col * 0.05 + r * 3.1, (L + (seglen if row == i + 1 else 0)) + r * 1.7)
                f.material_index = mi
                f[self.rnd] = r
            faces += fs
            L += seglen
        bm.normal_update()
        for f in faces:
            if f.normal.dot(upv) < 0:
                f.normal_flip()
        return faces

    def quad_strip(self, paint_name, points, width, normal=(0, -1, 0), rnd=None):
        """A flat ribbon through points (for cobweb threads, ropes seen from the front)."""
        bm = self.bm
        before = set(bm.faces)
        nrm = Vector(normal)
        prev = None
        for i, p in enumerate(points):
            p = Vector(p)
            nxt = Vector(points[min(i + 1, len(points) - 1)]); prv = Vector(points[max(i - 1, 0)])
            t = (nxt - prv).normalized()
            side = t.cross(nrm).normalized() * width / 2
            a = bm.verts.new(p - side); b = bm.verts.new(p + side)
            if prev:
                bm.faces.new((prev[0], prev[1], b, a))
            prev = (a, b)
        faces = [f for f in bm.faces if f not in before]
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        return self._finish(faces, paint_name, Matrix.Identity(4), grain_axis=0, rnd=rnd)

    def build(self, location=(0, 0, 0), collection=None, smooth_angle=None, ao_dist=0.22, cvx=(0.12, 0.45)):
        """Makes the object (origin at its bottom centre = world origin of the piece) with per-vertex
        'ao' (share of short hemisphere rays that hit the piece) and 'cvx' (how convex the vertex is)."""
        from mathutils.bvhtree import BVHTree
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.normal_update()
        bm.verts.index_update()
        tree = BVHTree.FromBMesh(bm)
        rays = _hemisphere(24)
        ao, cv = [], []
        for v in bm.verts:
            n = v.normal if v.normal.length > 0.5 else Vector((0, 0, 1))
            rot = n.to_track_quat('Z', 'Y')
            o = v.co + n * 0.004
            hits = sum(1 for d in rays if tree.ray_cast(o, rot @ d, ao_dist)[0] is not None)
            ao.append(hits / len(rays))
            if v[self.organic] and v.link_edges:
                m = sum((e.other_vert(v).co - v.co).normalized().dot(n) for e in v.link_edges) / len(v.link_edges)
            else:
                m = 0
            cv.append(min(1.0, max(0.0, (-m - cvx[0]) / (cvx[1] - cvx[0]))))
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for nm, vals in (('ao', ao), ('cvx', cv)):
            a = me.attributes.new(nm, 'FLOAT', 'POINT')
            a.data.foreach_set('value', vals)
        for pn in self.mats:
            me.materials.append(bake_material(pn))
        me.shade_smooth()
        try:
            me.set_sharp_from_angle(angle=math.radians(smooth_angle or self.smooth))
        except Exception:
            pass
        ob = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        ob.location = location
        return ob


def _hemisphere(n, seed=5):
    """Cosine-weighted directions around +Z."""
    r = random.Random(seed)
    out = []
    for i in range(n):
        u, v = (i + r.random()) / n, r.random()
        rad = math.sqrt(u); a = 2 * math.pi * v
        out.append(Vector((rad * math.cos(a), rad * math.sin(a), math.sqrt(max(0.0, 1 - u)))))
    return out


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ─── Scene helpers ─────────────────────────────────────────────────────────

def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions, bpy.data.lights, bpy.data.cameras):
        for x in list(block):
            if x.users == 0:
                block.remove(x)


def collection(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def view_setup():
    """Warm key light + fill so `look` shows the pieces roughly as the board lights them."""
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = hexc('#6a5a4c')
    bg.inputs[1].default_value = 0.9
    if not bpy.data.objects.get('key.sun'):
        ld = bpy.data.lights.new('key.sun', 'SUN'); ld.energy = 3.0; ld.color = (1.0, 0.88, 0.72)
        lo = bpy.data.objects.new('key.sun', ld); sc.collection.objects.link(lo)
        lo.rotation_euler = (math.radians(50), 0, math.radians(-30))


# ─── Atlas: unwrap, pack, bake ─────────────────────────────────────────────

def _view3d_override():
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == 'VIEW_3D':
                region = next(r for r in area.regions if r.type == 'WINDOW')
                return dict(window=win, area=area, region=region, screen=win.screen)
    raise RuntimeError('no 3D view')


def _shrink_hidden(ob, low_paints=(), k=0.35):
    """Scales down UV islands the game camera rarely sees: wall backs (facing +Y), undersides and
    low-priority paints (mortar cores), so the atlas spends its pixels on the faces in view."""
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv['atlas']
    bm.faces.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        f1, f2 = e.link_faces
        l1 = [l for l in f1.loops if l.edge == e][0]
        l2 = [l for l in f2.loops if l.edge == e][0]
        # Shared edge is seamless when its two ends have the same UVs on both sides.
        if (l1[uvl].uv - l2.link_loop_next[uvl].uv).length < 1e-5 and (l1.link_loop_next[uvl].uv - l2[uvl].uv).length < 1e-5:
            parent[find(f1.index)] = find(f2.index)
    islands = {}
    for f in bm.faces:
        islands.setdefault(find(f.index), []).append(f)
    names = [m.name[6:] if m and m.name.startswith('paint.') else '' for m in me.materials]
    for faces in islands.values():
        hidden = all(f.normal.y > 0.7 or f.normal.z < -0.7 or names[f.material_index] in low_paints for f in faces)
        if not hidden:
            continue
        loops = [l for f in faces for l in f.loops]
        c = sum((l[uvl].uv for l in loops), Vector((0, 0))) / len(loops)
        for l in loops:
            l[uvl].uv = c + (l[uvl].uv - c) * k
    bm.to_mesh(me); bm.free()


def unwrap_and_pack(objs, margin=0.003, island_margin=0.02, low_paints=('mortar',), hidden_scale=0.35):
    """Smart-projects each piece into an 'atlas' UV, shrinks the islands nobody sees, then packs all
    islands of all pieces of a location into one atlas."""
    for ob in objs:
        me = ob.data
        if 'atlas' not in me.uv_layers:
            me.uv_layers.new(name='atlas')
        me.uv_layers.active = me.uv_layers['atlas']
    ov = _view3d_override()
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(**ov):
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=island_margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.average_islands_scale()
        bpy.ops.object.mode_set(mode='OBJECT')
    for ob in objs:
        _shrink_hidden(ob, low_paints, hidden_scale)
    with bpy.context.temp_override(**ov):
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, scale=True, margin_method='FRACTION', margin=margin, shape_method='AABB')
        bpy.ops.object.mode_set(mode='OBJECT')


def bake_atlas(objs, image_name, size=2048, samples=2):
    """Bakes the painted emission of every piece into one image (Cycles EMIT)."""
    restore_paint(objs)
    img = bpy.data.images.get(image_name)
    if img and (img.size[0] != size):
        bpy.data.images.remove(img); img = None
    if not img:
        img = bpy.data.images.new(image_name, size, size, alpha=False)
    else:
        # Bake into a fresh buffer even if the file the image points to has moved.
        img.source = 'GENERATED'
        img.generated_width = img.generated_height = size
    img.generated_color = (0.2, 0.17, 0.15, 1)
    sc = bpy.context.scene
    prev_engine = sc.render.engine
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print('engine', e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    try:
        sc.cycles.device = 'GPU'
    except Exception:
        pass
    sc.render.bake.margin = 6
    mats = {m for ob in objs for m in ob.data.materials}
    for m in mats:
        nt = m.node_tree
        n = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.name == 'bake_target'), None)
        if not n:
            n = nt.nodes.new('ShaderNodeTexImage'); n.name = 'bake_target'; n.location = (1400, 300)
        n.image = img
        nt.nodes.active = n
        n.select = True
    for ob in objs:
        ob.data.uv_layers.active = ob.data.uv_layers['atlas']
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
    sc.render.engine = prev_engine
    # The atlas lives next to the exported GLB (gitignored); the pipeline makes the WebP tiers from it.
    loc = image_name[4:-6] if image_name.startswith('env-') and image_name.endswith('-atlas') else 'tmp'
    folder = os.path.join(SOURCE_DIR, f'env-{loc}')
    os.makedirs(folder, exist_ok=True)
    img.filepath_raw = os.path.join(folder, image_name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def export_material(loc, img, glow=False):
    """The game material: Principled with the atlas (and the atlas as emission for glowing bits)."""
    name = f'env-{loc}' + ('-glow' if glow else '')
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (400, 0)
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); bs.location = (100, 0)
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.location = (-300, 0)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'atlas'; uv.location = (-500, 0)
    nt.links.new(uv.outputs[0], tx.inputs[0])
    nt.links.new(tx.outputs[0], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.88
    bs.inputs['Metallic'].default_value = 0.0
    for key in ('Specular IOR Level', 'Specular'):
        if key in bs.inputs:
            bs.inputs[key].default_value = 0.2
            break
    if glow:
        nt.links.new(tx.outputs[0], bs.inputs['Emission Color'])
        bs.inputs['Emission Strength'].default_value = 1.0
    nt.links.new(bs.outputs[0], out.inputs['Surface'])
    return m


def preview(objs, loc, img):
    """Shows the baked look in the viewport: swaps every paint slot for the game material."""
    base = export_material(loc, img)
    glow = export_material(loc, img, glow=True)
    for ob in objs:
        for i, slot in enumerate(ob.material_slots):
            src = ob.data.materials[i]
            if src and src.name.startswith('paint.'):
                ob['paint_' + str(i)] = src.name
                pn = src.name[6:]
                ob.data.materials[i] = glow if PAINTS[pn]['kind'] == 'emit' else base


def restore_paint(objs):
    for ob in objs:
        for i in range(len(ob.data.materials)):
            key = 'paint_' + str(i)
            if key in ob:
                ob.data.materials[i] = bpy.data.materials[ob[key]]


def export_location(loc, objs, path):
    """Exports one GLB: one node per piece (named by kit id, at the origin), two materials, atlas UV only."""
    img = bpy.data.images[f'env-{loc}-atlas']
    base = export_material(loc, img)
    glow = export_material(loc, img, glow=True)
    dups = []
    for ob in objs:
        me = ob.data.copy()
        # Every paint slot collapses into the atlas material or the glow one: one or two primitives.
        emits = []
        for i, m in enumerate(me.materials):
            pn = m.name[6:] if m.name.startswith('paint.') else None
            if pn is None and ('paint_' + str(i)) in ob:
                pn = ob['paint_' + str(i)][6:]
            emits.append(bool(pn and PAINTS[pn]['kind'] == 'emit'))
        idx = [m.material_index for m in me.polygons]
        has_glow = any(emits[i] for i in idx)
        me.materials.clear()
        me.materials.append(base)
        if has_glow:
            me.materials.append(glow)
        me.polygons.foreach_set('material_index', [1 if emits[i] else 0 for i in idx])
        me.name = ob.name.split('.', 1)[1]
        if 'paint' in me.uv_layers:
            me.uv_layers.remove(me.uv_layers['paint'])
        if 'rnd' in me.attributes:
            me.attributes.remove(me.attributes['rnd'])
        kit_id = ob.name.split('.', 1)[1]
        d = bpy.data.objects.new(kit_id, me)
        bpy.context.scene.collection.objects.link(d)
        dups.append(d)
    bpy.ops.object.select_all(action='DESELECT')
    for d in dups:
        d.select_set(True)
    bpy.context.view_layer.objects.active = dups[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_yup=True, export_extras=False)
    for d in dups:
        me = d.data
        bpy.data.objects.remove(d, do_unlink=True)
        bpy.data.meshes.remove(me)


# ─── Diorama: pieces placed around a few hexes, rendered from the game camera ────

SQ3 = math.sqrt(3)


def hex_vertex(cx, cy, k):
    """Vertex k of a pointy-top hex (circumradius 1) centred at (cx, cy); k = 0 at 30°."""
    a = math.radians(30 + 60 * k)
    return Vector((cx + math.cos(a), cy + math.sin(a), 0))


def place(src_name, coll, pos, rot_z=0.0, mirror=False):
    """Linked copy of a kit piece (shares its mesh) for the diorama."""
    src = bpy.data.objects[src_name]
    o = bpy.data.objects.new('dio.' + src_name.split('.', 1)[1], src.data)
    coll.objects.link(o)
    o.location = pos
    o.rotation_euler = (0, 0, rot_z)
    if mirror:
        o.scale.x = -1
    return o


def wall_on_edge(src_name, coll, a, b, centre):
    """Puts a wall piece on the hex edge a→b with its inner face (-Y) towards the hex centre."""
    m = (a + b) / 2
    d = b - a
    th = math.atan2(d.y, d.x)
    inward = Vector((math.sin(th), -math.cos(th), 0))
    if inward.dot(centre - m) < 0:
        th += math.pi
    return place(src_name, coll, m, th)


def floor(coll, texture, size=(14, 10), tint=None, uv_scale=2.4):
    me = bpy.data.meshes.new('dio.floor')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            l[uvl].uv = (l.vert.co.x * size[0] / 2 / uv_scale, l.vert.co.y * size[1] / 2 / uv_scale)
    for v in bm.verts:
        v.co.x *= size[0] / 2; v.co.y *= size[1] / 2
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('dio.floor', me)
    coll.objects.link(o)
    m = bpy.data.materials.new('dio.floor')
    m.use_nodes = True
    nt = m.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = bpy.data.images.load(texture, check_existing=True)
    if tint:
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = 1.0
        mx.inputs['B'].default_value = tint
        nt.links.new(tx.outputs[0], mx.inputs['A'])
        nt.links.new(mx.outputs['Result'], bs.inputs['Base Color'])
    else:
        nt.links.new(tx.outputs[0], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.9
    me.materials.append(m)
    return o


def hex_tiles(coll, centres, paint_hex='#8a7a66'):
    """Thin hex plates where the board's playable tiles would be (for scale)."""
    m = bpy.data.materials.get('dio.hex') or bpy.data.materials.new('dio.hex')
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = hexc(paint_hex)
    bs.inputs['Roughness'].default_value = 0.85
    for i, (cx, cy) in enumerate(centres):
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=6, radius=0.94)
        for v in bm.verts:
            v.co = Matrix.Rotation(math.radians(30), 3, 'Z') @ v.co
        me = bpy.data.meshes.new(f'dio.hex{i}')
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(f'dio.hex{i}', me)
        coll.objects.link(o)
        o.location = (cx, cy, 0.0)
        me.materials.append(m)
        sol = o.modifiers.new('t', 'SOLIDIFY'); sol.thickness = 0.06; sol.offset = 1


def game_camera(target, distance=7.5, elevation=52, azimuth=-90, lens=40):
    """Camera looking at target from the board's side (-Y) at the game's tilt."""
    cam = bpy.data.objects.get('dio.camera')
    if not cam:
        cd = bpy.data.cameras.new('dio.camera')
        cam = bpy.data.objects.new('dio.camera', cd)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.lens = lens
    e, a = math.radians(elevation), math.radians(azimuth)
    t = Vector(target)
    cam.location = t + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * distance
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


def render_to(path, res=(1600, 900)):
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError as e:
        print(e)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def kit_sheet(coll_name, order, cols=6, dx=1.6, dy=2.2, raise_wall_decor=()):
    """Lays the pieces of a location out in rows (front row nearest the camera) and frames them."""
    objs = {o.name.split('.', 1)[1]: o for o in bpy.data.collections[coll_name].objects}
    for o in objs.values():
        o.hide_viewport = o.hide_render = False
    rows = (len(order) + cols - 1) // cols
    for i, name in enumerate(order):
        o = objs[name]
        o.location = ((i % cols) * dx, (i // cols) * dy, 0)
    w = (cols - 1) * dx
    d = (rows - 1) * dy
    game_camera((w / 2, d / 2, 0.6), distance=max(w, d * 1.6) * 1.15 + 4, elevation=38, lens=40)

