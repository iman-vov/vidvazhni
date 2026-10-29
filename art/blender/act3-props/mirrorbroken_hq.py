# Act III `mirror-broken` (2026-10-29): the v2 cheval mirror still standing, its glass cracked from
# an impact: radial and ring cracks, each shard its own slightly tilted face (they catch the light
# differently), three shards gone so the dark back board shows, and splinters on the floor in
# front. Uses the game mesh `mirror` (exec hq_lib.py and mirror_hq.py first): the frame keeps the
# baked `mirror` material, the shards get a plain silvered material `mirror-shard`.
# Steps: make_broken() then export like the other props.
import math, random
from mathutils import Vector, Matrix

SHARD_RGBA = (0.70, 0.76, 0.80, 1.0)


def _local(p):
    """World -> the untilted glass frame (x, y, z) of mirror_hq (pivot at ZP)."""
    r = Matrix.Rotation(-TILT, 3, 'X')
    return r @ (p - Vector((0, 0, ZP))) + Vector((0, 0, ZP))


def _world(p):
    r = Matrix.Rotation(TILT, 3, 'X')
    return r @ (p - Vector((0, 0, ZP))) + Vector((0, 0, ZP))


def shard_mat():
    m = bpy.data.materials.get('mirror-shard') or bpy.data.materials.new('mirror-shard')
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = SHARD_RGBA
    bs.inputs['Metallic'].default_value = 0.85
    bs.inputs['Roughness'].default_value = 0.14
    return m


def cells(seed=5, rays=9, impact=(0.07, ZP + 0.1)):
    """Shard outlines in the glass plane (x, z): rays from the impact out to the oval edge, cut by
    two crooked rings; returns lists of (x, z) points."""
    rnd = random.Random(seed)
    ix, iz = impact
    angs = sorted(rnd.uniform(0, 2 * math.pi) for _ in range(rays))

    def edge(a):
        # distance from the impact to the oval along a (bisection)
        lo_, hi_ = 0.0, 1.0
        for _ in range(30):
            m = (lo_ + hi_) / 2
            x, z = ix + m * math.cos(a), iz + m * math.sin(a)
            if (x / (A - 0.004)) ** 2 + ((z - ZP) / (B - 0.004)) ** 2 < 1:
                lo_ = m
            else:
                hi_ = m
        return lo_
    rings = [0.045, 0.13]
    jit = {}
    out = []
    for i in range(rays):
        a0, a1 = angs[i], angs[(i + 1) % rays] + (2 * math.pi if i == rays - 1 else 0)
        sub = [a0 + (a1 - a0) * t / 3 for t in range(4)]
        radii = [[r * rnd.uniform(0.85, 1.2) for _ in sub] for r in rings]
        bounds = [[0.0] * 4] + radii + [[edge(a) for a in sub]]
        for k in range(len(bounds) - 1):
            inner = [(ix + min(bounds[k][j], edge(sub[j])) * math.cos(sub[j]), iz + min(bounds[k][j], edge(sub[j])) * math.sin(sub[j])) for j in range(4)]
            outer = [(ix + min(bounds[k + 1][j], edge(sub[j])) * math.cos(sub[j]), iz + min(bounds[k + 1][j], edge(sub[j])) * math.sin(sub[j])) for j in range(4)]
            poly = outer + inner[::-1]
            # drop repeated points (the impact centre)
            clean = []
            for p in poly:
                if not clean or (Vector(p) - Vector(clean[-1])).length > 1e-4:
                    clean.append(p)
            if len(clean) >= 3:
                out.append((i, k, clean))
    return out


def make_broken(missing=((0, 1), (3, 0), (5, 1)), gap=0.0035, seed=5):
    src = bpy.data.objects['mirror']
    old = bpy.data.objects.get('mirror-broken')
    if old:
        bpy.data.objects.remove(old)
    me = src.data.copy()
    me.name = 'mirror-broken'
    ob = bpy.data.objects.new('mirror-broken', me)
    bpy.data.collections[COLL].objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    # the old glass: faces inside the oval, in the glass slab
    dead = []
    for f in bm.faces:
        c = _local(f.calc_center_median())
        if (c.x / A) ** 2 + ((c.z - ZP) / B) ** 2 < 1.0 and -0.0065 < c.y < 0.0065:
            dead.append(f)
    nglass = len(dead)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    rnd = random.Random(seed + 1)
    shard_faces = []
    for i, k, poly in cells(seed):
        if (i, k) in missing:
            continue
        cx = sum(p[0] for p in poly) / len(poly)
        cz = sum(p[1] for p in poly) / len(poly)
        pts = []
        for x, z in poly:
            d = Vector((x - cx, z - cz))
            s = max(0.0, 1 - gap / max(d.length, 1e-4))
            pts.append((cx + (x - cx) * s, cz + (z - cz) * s))
        # each shard tilts a little about its own centre
        tilt = Matrix.Rotation(rnd.uniform(-0.06, 0.06), 3, 'X') @ Matrix.Rotation(rnd.uniform(-0.06, 0.06), 3, 'Z')
        y0 = -0.0018 + rnd.uniform(-0.0015, 0.001)
        vs = []
        for x, z in pts:
            p = Vector((cx, y0, cz)) + tilt @ Vector((x - cx, 0, z - cz))
            vs.append(bm.verts.new(_world(p)))
        f = bm.faces.new(vs[::-1])
        shard_faces.append(f)
    # splinters on the floor in front of the base
    for j in range(6):
        x, y = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.32, -0.2)
        r = rnd.uniform(0.02, 0.045)
        a = rnd.uniform(0, 6.28)
        tri = [Vector((x + r * math.cos(a + t), y + r * 0.8 * math.sin(a + t), 0.004 + rnd.uniform(0, 0.004))) for t in (0, 2.3, 4.0)]
        shard_faces.append(bm.faces.new([bm.verts.new(p) for p in tri]))
    bmesh.ops.recalc_face_normals(bm, faces=shard_faces)
    for f in shard_faces:
        f.material_index = 1
        f.smooth = False
        # face the board (-Y) or up for the floor ones
        c = f.calc_center_median()
        want = Vector((0, -1, 0.35)) if c.z > 0.05 else Vector((0, 0, 1))
        if f.normal.dot(want) < 0:
            f.normal_flip()
    bmesh.ops.triangulate(bm, faces=[f for f in shard_faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='EAR_CLIP')
    bm.to_mesh(me)
    bm.free()
    if len(me.materials) < 2:
        me.materials.append(shard_mat())
    return ob, nglass, len(shard_faces)
