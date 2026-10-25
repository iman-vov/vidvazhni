# Shared rock kit «env-rocks» for every location. Run in Blender through the MCP after kitlib.py:
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\rocks.py', encoding='utf8').read())
#   objs = build_rocks()
# Six stone shapes (a chunky boulder, a standing slab, a flat slab, an angular wedge, a rounded
# eroded stone, a small chunk), each in three looks: bare (mine, cave, town), mossy (forest, marsh)
# and snowy (mountain pass). Node names: stone-<a..f>, stone-moss-<a..f>, stone-snow-<a..f>; every
# stone is 1.0 tall with its bottom 15 % below y = 0, origin at the bottom centre (the game scales
# and turns them per placement, src/render/environment/stone.ts).
#
# Shape: a subdivided icosphere pushed by layered noise (big lumps, then chips), cut by fracture
# planes (flat split faces with crisp edges), a crack or two pressed in along a plane, a flat bottom.

from mathutils import noise

ROCK_LOC = 'rocks'
SHAPES = {
    #       seed  proportions (x, y, z)   fracture cuts  crack count  lumpiness
    'a': dict(seed=11, size=(1.25, 1.0, 0.95), cuts=4, cracks=1, lump=0.26),
    'b': dict(seed=23, size=(0.8, 0.7, 1.35), cuts=5, cracks=2, lump=0.2),
    'c': dict(seed=37, size=(1.3, 1.05, 0.62), cuts=4, cracks=1, lump=0.18),
    'd': dict(seed=41, size=(1.1, 0.85, 0.9), cuts=7, cracks=1, lump=0.14),
    'e': dict(seed=53, size=(1.15, 1.05, 0.85), cuts=3, cracks=1, lump=0.3),
    'f': dict(seed=67, size=(1.0, 0.9, 0.8), cuts=5, cracks=1, lump=0.22),
}


def rock_paints():
    C = hexc
    # Cool-warm grey stone in the Act I painted-miniature look: light worn edges, dark crevices.
    paint('stone', [C('#8c8478'), C('#7c7670'), C('#958a7a')], C('#221e1a'), C('#e2d8c6'), 'stone', grain=(3, 3), edge=0.6, ao=0.85, streak=(0.78, 1.18), feet=0.5)
    paint('stone_moss', [C('#6f8a42'), C('#5e7a3a'), C('#82984a')], C('#1a240e'), C('#d0e08c'), 'leaf', grain=(4, 4), edge=0.4, ao=0.7, feet=0.2)
    paint('stone_snow', [C('#e6ecf2'), C('#dae2ea'), C('#f0f2f6')], C('#7a8696'), C('#ffffff'), 'soft', grain=(3, 3), edge=0.3, ao=0.55, feet=0.0)


def _fill_cut(bm, edges):
    """Closes the hole a bisect left with a flat face (the split surface)."""
    loose = [e for e in edges if e.is_valid and e.is_boundary]
    if loose:
        bmesh.ops.holes_fill(bm, edges=loose, sides=0)


def stone(p, shape, cover=None):
    """Adds one stone to piece p: 1.0 tall, centred, bottom 15 % under z = 0."""
    s = SHAPES[shape]
    rng = random.Random(s['seed'])
    bm = p.bm
    before_f = set(bm.faces)
    res = bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    verts = list(res['verts'])
    off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    size = Vector(s['size'])
    # Fracture planes: points beyond one are pressed (mostly) onto it, so the split faces stay as
    # dense as the rest and take the same chipping below; their edges stay crisp.
    cuts = []
    for k in range(s['cuts']):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 1))).normalized()
        cuts.append((n, rng.uniform(0.6, 0.82)))
    for v in verts:
        d = v.co.normalized()
        r = 1 + noise.fractal(d * 1.1 + off, 0.55, 2.1, 3, noise_basis='PERLIN_ORIGINAL') * s['lump']
        c = d * r
        for n, dist in cuts:
            e = c.dot(n) - dist
            if e > 0:
                c -= n * e * 0.94
        # Chips and grain: small, sharp-ish relief everywhere (cut faces included).
        ridge = 1 - abs(noise.noise(c * 3.4 + off * 1.3))
        c += d * (noise.fractal(c * 3.0 + off * 0.7, 0.6, 2.2, 3) * 0.06 - ridge ** 3 * 0.035)
        v.co = Vector((c.x * size.x, c.y * size.y, c.z * size.z))
        v[p.organic] = 1

    def own_geom():
        fs = [f for f in bm.faces if f not in before_f]
        es = {e for f in fs for e in f.edges}
        vs = {v for f in fs for v in f.verts}
        return list(vs) + list(es) + fs

    # Cracks: a line pressed into the surface along a plane through the stone.
    for k in range(s['cracks']):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.3))).normalized()
        out = bmesh.ops.bisect_plane(bm, geom=own_geom(), plane_co=n * rng.uniform(-0.25, 0.25), plane_no=n)
        cut = [v for v in out['geom_cut'] if isinstance(v, bmesh.types.BMVert)]
        bm.normal_update()
        for v in cut:
            if v.co.z > -0.2 * size.z:
                v.co -= v.normal * 0.05 * (0.6 + 0.4 * noise.noise(v.co * 3 + off))
    # Flat bottom.
    zs = [v.co.z for f in bm.faces if f not in before_f for v in f.verts]
    z0, z1 = min(zs), max(zs)
    out = bmesh.ops.bisect_plane(bm, geom=own_geom(), plane_co=(0, 0, z0 + (z1 - z0) * 0.12), plane_no=(0, 0, -1), clear_outer=True)
    _fill_cut(bm, [e for e in out['geom_cut'] if isinstance(e, bmesh.types.BMEdge)])
    faces = [f for f in bm.faces if f not in before_f]
    bmesh.ops.triangulate(bm, faces=faces)
    faces = [f for f in bm.faces if f not in before_f]
    # To 1.0 tall, bottom 15 % under the ground, centred.
    vs = {v for f in faces for v in f.verts}
    zs = [v.co.z for v in vs]
    lo, hi = min(zs), max(zs)
    cx = sum(v.co.x for v in vs) / len(vs)
    cy = sum(v.co.y for v in vs) / len(vs)
    k = 1.0 / (hi - lo)
    for v in vs:
        v.co = Vector(((v.co.x - cx) * k, (v.co.y - cy) * k, (v.co.z - lo) * k - 0.15))
    bm.normal_update()
    p._finish(faces, 'stone', Matrix.Identity(4), grain_axis=2)
    # Cover on the upward faces, in soft patches: moss or snow.
    if cover:
        ci = p._mat_index(cover)
        for f in faces:
            c = f.calc_center_median()
            up = f.normal.z
            patch = noise.fractal(c * 3.2 + off, 0.6, 2.0, 3)
            if cover == 'stone_snow':
                hit = up > 0.38 - patch * 0.5
            else:
                hit = up > 0.5 and patch > -0.02 and c.z > 0.15
            if hit:
                f.material_index = ci
    return faces


def build_rocks():
    rock_paints()
    coll = collection(ROCK_LOC)
    objs = []
    for look, cover in (('stone', None), ('stone-moss', 'stone_moss'), ('stone-snow', 'stone_snow')):
        for shape in SHAPES:
            p = Piece(f'{ROCK_LOC}.{look}-{shape}', seed=SHAPES[shape]['seed'])
            p.smooth = 38
            stone(p, shape, cover)
            ob = p.build(collection=coll, ao_dist=0.3, cvx=(0.08, 0.4))
            objs.append(ob)
    # Lay them out in rows for looking.
    for i, ob in enumerate(objs):
        ob.location = ((i % 6) * 1.8 - 4.5, (i // 6) * 2.0, 0)
    return objs
