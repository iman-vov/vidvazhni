# Forest flora kit «env-flora» (thorn path, mill, pass): trees, bushes, brambles and tall grass for
# the natural forest edge and the groves beyond it (src/render/environment/thicket.ts places them).
# Run in Blender through the MCP after kitlib.py and thorn_path.py (for the paints and grass()):
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\thorn_path.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\flora.py', encoding='utf8').read())
#   objs = build_flora()
# Crowns are one organic mass: lumps of leaves fused by a voxel remesh, thinned by decimation and
# bumped into leaf clumps, so their outline is leafy rather than a cluster of balls. Pieces stand on
# their origin (bottom centre), sizes in hex units (a figure ≈ 1.3).

from mathutils import noise

FLORA = 'flora'


def flora_paints():
    thorn_paints()
    C = hexc
    paint('birch', [C('#e4ddd0'), C('#d8d0c2'), C('#ece6da')], C('#2a2420'), C('#ffffff'), 'wood', grain=(10, 1.4), edge=0.35, ao=0.8)
    paint('leaf_birch', [C('#a8b448'), C('#c8b440'), C('#8ea43c')], C('#2a3010'), C('#f0f0a0'), 'leaf', grain=(1.5, 1.5), edge=0.45, ao=0.7, feet=0.2)
    paint('snow', [C('#eef2f6'), C('#e2e8ee'), C('#f6f8fa')], C('#8a96a6'), C('#ffffff'), 'soft', grain=(3, 3), edge=0.3, ao=0.5, feet=0.0)
    paint('dead_wood', [C('#6a5a4a'), C('#5a4c40'), C('#76665a')], C('#1a140e'), C('#b8a48c'), 'wood', grain=(8, 1.2), edge=0.5)


def _fresh_piece(name, seed, me):
    """A Piece whose bmesh starts from a mesh (a remeshed crown), with the Piece layers added."""
    p = Piece(name, seed)
    p.bm.free()
    p.bm = bmesh.new()
    p.bm.from_mesh(me)
    p.uv = p.bm.loops.layers.uv.new('paint')
    p.rnd = p.bm.faces.layers.float.new('rnd')
    p.edge = p.bm.faces.layers.float.new('edge')
    p.organic = p.bm.verts.layers.int.new('organic')
    for v in p.bm.verts:
        v[p.organic] = 1
    return p


def crown_mesh(lumps, seed, voxel=0.07, tris=1300, bump=0.07, tufts=0, tuft_r=(0.16, 0.26)):
    """One leafy mass from lumps [(centre, radius, squash)]: spheres with leaf-clump bumps, plus
    `tufts` small clumps sitting on the outside of the lumps (a broken, leafy outline), fused by a
    voxel remesh, decimated to about `tris` triangles."""
    rng = random.Random(seed)
    bm = bmesh.new()
    off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    lumps = list(lumps)
    big = list(lumps)
    for i in range(tufts):
        c, r, sq = big[rng.randrange(len(big))]
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.45, 1))).normalized()
        lumps.append((tuple(Vector(c) + Vector((d.x * r * 0.92, d.y * r * 0.92, d.z * r * sq * 0.92))), rng.uniform(*tuft_r), rng.uniform(0.75, 0.95)))
    for c, r, sq in lumps:
        res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
        for v in res['verts']:
            d = v.co.normalized()
            cell = noise.noise(d * 3.2 + off, noise_basis='VORONOI_F1')
            k = 1 + 0.16 * noise.fractal(d * 1.6 + off, 0.6, 2.0, 2) - 0.14 * cell
            v.co = Vector((d.x * r * k, d.y * r * k, d.z * r * k * sq)) + Vector(c)
            if v.co.z < c[2] - r * sq * 0.55:
                v.co.z = c[2] - r * sq * 0.55 + (v.co.z - (c[2] - r * sq * 0.55)) * 0.3
    me = bpy.data.meshes.new('crown_tmp')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('crown_tmp', me)
    bpy.context.scene.collection.objects.link(ob)
    rm = ob.modifiers.new('rm', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = me2
    bpy.data.meshes.remove(me)
    faces = len(me2.polygons) * 2
    dec = ob.modifiers.new('dec', 'DECIMATE')
    dec.ratio = min(1.0, tris / max(1, faces))
    dg = bpy.context.evaluated_depsgraph_get()
    me3 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me2)
    # Leaf clumps over the fused surface.
    bm = bmesh.new()
    bm.from_mesh(me3)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.normal_update()
    for v in bm.verts:
        cell = noise.noise(v.co * 3.0 + off * 1.3, noise_basis='VORONOI_F1')
        fine = noise.noise(v.co * 9.0 + off, noise_basis='PERLIN_ORIGINAL')
        v.co += v.normal * (bump * (0.55 - cell) + bump * 0.25 * fine)
    bm.to_mesh(me3)
    bm.free()
    return me3


def _paint_patches(p, faces, paints, seed, scale=2.4):
    """Mixes paints over faces in soft noise patches (autumn orange through green)."""
    off = Vector((seed * 1.3, seed * 0.7, seed * 0.11))
    idx = [p._mat_index(pn) for pn in paints]
    for f in faces:
        n = noise.fractal(f.calc_center_median() * scale + off, 0.6, 2.0, 2)
        k = min(len(idx) - 1, max(0, int((n + 0.5) * len(idx))))
        f.material_index = idx[k]


def broadleaf(name, seed, h=3.1, leaves=('leaf_autumn', 'leaf_green'), base='leaf_dark'):
    """Oak-like tree: a leaning trunk with root flares and boughs into one leafy crown."""
    rng = random.Random(seed)
    lean = Vector((rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), 0))
    top = Vector((lean.x, lean.y, h * 0.55))
    lumps = []
    n = rng.randint(6, 8)
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.4, 0.4)
        d = rng.uniform(0.5, 0.95)
        z = h * rng.uniform(0.6, 0.8)
        lumps.append(((top.x + math.cos(a) * d, top.y + math.sin(a) * d, z), rng.uniform(0.38, 0.56), rng.uniform(0.7, 0.88)))
    lumps.append(((top.x, top.y, h * 0.86), rng.uniform(0.5, 0.62), 0.8))
    me = crown_mesh(lumps, seed, voxel=0.075, tris=1700, bump=0.13, tufts=16)
    p = _fresh_piece(name, seed, me)
    bpy.data.meshes.remove(me)
    faces = list(p.bm.faces)
    p._finish(faces, base, Matrix.Identity(4), grain_axis=2)
    _paint_patches(p, faces, [base] + list(leaves), seed)
    p.smooth = 80
    p.tube('bark', [(0, 0, -0.05), (lean.x * 0.25, lean.y * 0.25, h * 0.22), (lean.x * 0.7, lean.y * 0.7, h * 0.42), tuple(top)], [0.24, 0.18, 0.14, 0.1], seg=7)
    root_flares(p, 0.22, 4, seed)
    for k in range(3):
        a = 2 * math.pi * k / 3 + rng.uniform(-0.5, 0.5)
        c, s = math.cos(a), math.sin(a)
        z0 = h * rng.uniform(0.42, 0.52)
        p.tube('bark', [(lean.x * 0.8, lean.y * 0.8, z0), (lean.x + c * 0.35, lean.y + s * 0.35, z0 + 0.3), (lean.x + c * 0.7, lean.y + s * 0.7, z0 + 0.5)], [0.09, 0.06, 0.035], seg=5)
    return p


def birch(name, seed, h=3.3):
    """Slender pale tree, one or two stems, an airy yellow-green crown."""
    rng = random.Random(seed)
    stems = 2 if rng.random() < 0.5 else 1
    lumps = []
    tops = []
    p0 = []
    for s in range(stems):
        a = rng.uniform(0, 2 * math.pi)
        lx, ly = math.cos(a) * rng.uniform(0.15, 0.4), math.sin(a) * rng.uniform(0.15, 0.4)
        hh = h * (1 if s == 0 else 0.82)
        base = (s * 0.14, 0, -0.05)
        p0.append((base, (lx * 0.3 + s * 0.14, ly * 0.3, hh * 0.35), (lx * 0.8, ly * 0.8, hh * 0.7), (lx, ly, hh * 0.95)))
        for k in range(5):
            t = 0.5 + k * 0.1
            aa = rng.uniform(0, 2 * math.pi)
            d = rng.uniform(0.15, 0.38) * (1.2 - t * 0.6)
            lumps.append(((lx * t + math.cos(aa) * d, ly * t + math.sin(aa) * d, hh * t + 0.15), rng.uniform(0.24, 0.34), rng.uniform(1.1, 1.4)))
    me = crown_mesh(lumps, seed, voxel=0.05, tris=1100, bump=0.08, tufts=8, tuft_r=(0.12, 0.18))
    p = _fresh_piece(name, seed, me)
    bpy.data.meshes.remove(me)
    faces = list(p.bm.faces)
    p._finish(faces, 'leaf_birch', Matrix.Identity(4), grain_axis=2)
    _paint_patches(p, faces, ['leaf_green', 'leaf_birch', 'leaf_birch'], seed, scale=3)
    p.smooth = 80
    for pts in p0:
        p.tube('birch', list(pts), [0.085, 0.07, 0.05, 0.03], seg=6)
    return p


def fir(name, seed, h=3.4, snow=False):
    """Spruce: a trunk and 7-9 drooping tiers with ragged rims; snow crusts the tiers on the pass."""
    rng = random.Random(seed)
    p = Piece(name, seed)
    p.smooth = 50
    p.tube('bark', [(0, 0, -0.05), (0.02, 0, h * 0.5), (0, 0.02, h * 0.97)], [0.14, 0.09, 0.03], seg=6)
    root_flares(p, 0.15, 4, seed, reach=0.3)
    tiers = rng.randint(7, 9)
    w = rng.uniform(0.8, 1.0)
    z = h * rng.uniform(0.12, 0.18)
    bm = p.bm
    for i in range(tiers):
        t = i / (tiers - 1)
        r = w * (1 - t * 0.85) * rng.uniform(0.9, 1.1)
        th = max(0.32, (h - z) * (0.42 if i < tiers - 1 else 1.0))
        before = set(bm.faces)
        seg = 12
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=r, radius2=0.0, depth=th)
        for v in res['verts']:
            v.co.z += th / 2
            if v.co.z < 1e-4:
                a = math.atan2(v.co.y, v.co.x)
                k = int(round((a + math.pi) / (2 * math.pi) * seg))
                tip = k % 2 == 0
                s = (1.15 if tip else 0.78) * rng.uniform(0.92, 1.08)
                v.co.x *= s
                v.co.y *= s
                v.co.z -= (0.12 if tip else 0.0) * th + rng.uniform(0, 0.05) * th
        faces = [f for f in bm.faces if f not in before]
        # Subdivide once so the cover and the light can break up the tier.
        sub = bmesh.ops.subdivide_edges(bm, edges=list({e for f in faces for e in f.edges}), cuts=1, use_grid_fill=True)
        faces = [f for f in bm.faces if f not in before]
        for v in {v for f in faces for v in f.verts}:
            v.co += Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02)))
            v[p.organic] = 1
        off = (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), z)
        p._finish(faces, 'pine', Matrix.Translation(off), grain_axis=2)
        if snow:
            si = p._mat_index('snow')
            bm.normal_update()
            for f in faces:
                if f.normal.z > 0.45 and noise.noise(f.calc_center_median() * 3 + Vector((seed, 0, 0))) > -0.3:
                    f.material_index = si
        z += th * rng.uniform(0.42, 0.55)
        if z > h * 0.9:
            break
    return p


def dead_tree(name, seed, h=2.7):
    rng = random.Random(seed)
    p = Piece(name, seed)
    p.smooth = 70
    lean = (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3))
    p.tube('dead_wood', [(0, 0, -0.05), (lean[0] * 0.3, lean[1] * 0.3, h * 0.4), (lean[0], lean[1], h)], [0.17, 0.11, 0.035], seg=6)
    root_flares(p, 0.17, 4, seed, paint_name='dead_wood')
    for k in range(rng.randint(3, 5)):
        t = rng.uniform(0.4, 0.85)
        a = rng.uniform(0, 2 * math.pi)
        s = Vector((lean[0] * t, lean[1] * t, h * t))
        d = rng.uniform(0.4, 0.8) * (1.1 - t * 0.5)
        p.tube('dead_wood', [tuple(s), tuple(s + Vector((math.cos(a) * d * 0.6, math.sin(a) * d * 0.6, d * 0.35))), tuple(s + Vector((math.cos(a + 0.4) * d, math.sin(a + 0.4) * d, d * 0.75)))], [0.05, 0.03, 0.012], seg=4)
    p.blob('moss', 0.14, (0.05, 0.08, 0.2), scale=(1.4, 1.2, 0.5), subdiv=2, noise=0.15)
    return p


def brush(name, seed, h=0.75, leaves=('leaf_green', 'leaf_dark')):
    """Understory bush: a few fused leafy masses, one leaning out, twigs at the foot."""
    rng = random.Random(seed)
    lumps = []
    n = rng.randint(3, 5)
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        d = 0 if i == 0 else rng.uniform(0.15, 0.35)
        r = rng.uniform(0.28, 0.36) if i == 0 else rng.uniform(0.18, 0.28)
        lumps.append(((math.cos(a) * d, math.sin(a) * d, r * rng.uniform(0.8, 1.3) * h / 0.75), r, rng.uniform(0.85, 1.05)))
    me = crown_mesh(lumps, seed, voxel=0.035, tris=700, bump=0.06, tufts=7, tuft_r=(0.09, 0.14))
    p = _fresh_piece(name, seed, me)
    bpy.data.meshes.remove(me)
    faces = list(p.bm.faces)
    p._finish(faces, leaves[0], Matrix.Identity(4), grain_axis=2)
    _paint_patches(p, faces, list(leaves), seed, scale=3.2)
    p.smooth = 80
    for k in range(4):
        a = rng.uniform(0, 2 * math.pi)
        c, s = math.cos(a), math.sin(a)
        p.tube('bark', [(0, 0, 0), (c * 0.2, s * 0.2, 0.15), (c * 0.38, s * 0.38, rng.uniform(0.2, 0.35))], [0.02, 0.012, 0.006], seg=3)
    return p


def bramble(name, seed):
    """Arching thorny canes with sparse leaves and red berries over a low dark mass."""
    rng = random.Random(seed)
    p = Piece(name, seed)
    p.smooth = 70
    p.blob('leaf_dark', 0.26, (0, 0, 0.12), scale=(1.5, 1.3, 0.6), subdiv=2, noise=0.15)
    n = rng.randint(7, 10)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
        c, s = math.cos(a), math.sin(a)
        reach = rng.uniform(0.38, 0.66)
        up = rng.uniform(0.4, 0.75)
        pts = [(c * 0.05, s * 0.05, 0.04), (c * reach * 0.4, s * reach * 0.4, up), (c * reach * 0.85, s * reach * 0.85, up * 0.75), (c * reach, s * reach, up * 0.28)]
        p.tube('thorn', pts, [0.024, 0.02, 0.014, 0.008], seg=4)
        for t in (0.3, 0.5, 0.7, 0.85):
            q = Vector(pts[1]).lerp(Vector(pts[2]), t) if t < 0.75 else Vector(pts[2]).lerp(Vector(pts[3]), (t - 0.75) * 4)
            p.cone('thorn', 0.012, 0.06, 3, tuple(q), rot=(rng.uniform(-1.4, 1.4), rng.uniform(-1.4, 1.4), 0))
            if rng.random() < 0.5:
                p.blob('leaf_dark' if rng.random() < 0.6 else 'leaf_green', 0.075, tuple(q + Vector((0, 0, 0.03))), scale=(1.5, 1.2, 0.5), subdiv=1, noise=0.15)
        if rng.random() < 0.6:
            q = Vector(pts[2])
            for b in range(3):
                p.blob('berry', 0.032, tuple(q + Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), -0.03))), subdiv=1, noise=0.05)
    return p


def flora_makers():
    return [
        lambda: broadleaf(f'{FLORA}.oak-a', 301, h=3.2),
        lambda: broadleaf(f'{FLORA}.oak-b', 307, h=2.9),
        lambda: broadleaf(f'{FLORA}.oak-green-a', 311, h=3.1, leaves=('leaf_green', 'leaf_green'), base='leaf_dark'),
        lambda: broadleaf(f'{FLORA}.oak-green-b', 313, h=2.8, leaves=('leaf_green', 'leaf_birch'), base='leaf_dark'),
        lambda: birch(f'{FLORA}.birch-a', 317),
        lambda: birch(f'{FLORA}.birch-b', 331),
        lambda: fir(f'{FLORA}.fir-a', 337, h=3.5),
        lambda: fir(f'{FLORA}.fir-b', 347, h=3.0),
        lambda: fir(f'{FLORA}.fir-snow-a', 349, h=3.4, snow=True),
        lambda: fir(f'{FLORA}.fir-snow-b', 353, h=2.9, snow=True),
        lambda: dead_tree(f'{FLORA}.dead-a', 359),
        lambda: brush(f'{FLORA}.brush-a', 367),
        lambda: brush(f'{FLORA}.brush-b', 373, h=0.6, leaves=('leaf_dark', 'leaf_green', 'leaf_autumn')),
        lambda: brush(f'{FLORA}.brush-c', 379, h=0.85, leaves=('leaf_green', 'leaf_birch')),
        lambda: brush(f'{FLORA}.brush-d', 409, h=0.5, leaves=('leaf_dark', 'leaf_dark', 'leaf_green')),
        lambda: bramble(f'{FLORA}.bramble-a', 383),
        lambda: bramble(f'{FLORA}.bramble-b', 389),
        lambda: bramble(f'{FLORA}.bramble-c', 419),
        lambda: grass(f'{FLORA}.tall-grass-a', 397, n=26, size=1.45),
        lambda: grass(f'{FLORA}.tall-grass-b', 401, n=22, size=1.25, paint_name='fern'),
        lambda: grass(f'{FLORA}.tall-grass-c', 421, n=30, size=1.7),
        lambda: grass(f'{FLORA}.tall-grass-d', 431, n=18, size=1.1, paint_name='leaf_birch'),
    ]


def build_one(i):
    """Builds piece i of the kit (one per MCP call keeps each call short), laid out in rows."""
    flora_paints()
    coll = collection(FLORA)
    ob = flora_makers()[i]().build(collection=coll)
    ob.location = ((i % 6) * 2.6 - 6.5, (i // 6) * 3.0, 0)
    return ob


def build_flora():
    return [build_one(i) for i in range(len(flora_makers()))]


# ─── Unattended run: a Blender timer does one step per tick and logs it, so no MCP call runs long.

FLORA_LOG = os.path.join(SOURCE_DIR, 'env-flora', 'run.log')


def _log(msg):
    os.makedirs(os.path.dirname(FLORA_LOG), exist_ok=True)
    with open(FLORA_LOG, 'a', encoding='utf8') as f:
        f.write(msg + '\n')


def flora_steps(build=True, bake=True):
    """The kit as a list of steps: build each piece, unwrap, bake three at a time, export."""
    steps = []
    n = len(flora_makers())
    if build:
        steps += [('build', i) for i in range(n)]
        steps.append(('save', None))
    if bake:
        steps.append(('unwrap', None))
        steps += [('bake', i) for i in range(0, n, 3)]
        steps.append(('export', None))
    return steps


def run_flora(build=True, bake=True):
    import time
    steps = flora_steps(build, bake)
    state = {'k': 0}

    def objs():
        return sorted([o for o in bpy.data.objects if o.name.startswith(FLORA + '.')], key=lambda o: o.name)

    def tick():
        if state['k'] >= len(steps):
            _log('DONE')
            return None
        kind, arg = steps[state['k']]
        t = time.time()
        try:
            flora_paints()
            if kind == 'build':
                ob = build_one(arg)
                _log(f'build {ob.name} {tris(ob)} tris {time.time() - t:.1f}s')
            elif kind == 'save':
                bpy.ops.wm.save_mainfile()
                _log('saved')
            elif kind == 'unwrap':
                unwrap_and_pack(objs(), low_paints=())
                bpy.ops.wm.save_mainfile()
                _log(f'unwrap {time.time() - t:.1f}s')
            elif kind == 'bake':
                os_ = objs()
                name = 'env-flora-atlas'
                img = bpy.data.images.get(name)
                if arg == 0:
                    if img:
                        bpy.data.images.remove(img)
                    img = bpy.data.images.new(name, 2048, 2048, alpha=False)
                    img.generated_color = (0.2, 0.17, 0.15, 1)
                sc = bpy.context.scene
                sc.render.engine = 'CYCLES'
                sc.cycles.samples = 2
                sc.cycles.use_denoising = False
                try:
                    sc.cycles.device = 'GPU'
                except Exception:
                    pass
                restore_paint(os_)
                for m in {m for ob in os_ for m in ob.data.materials}:
                    nt = m.node_tree
                    nd = next((x for x in nt.nodes if x.type == 'TEX_IMAGE' and x.name == 'bake_target'), None) or nt.nodes.new('ShaderNodeTexImage')
                    nd.name = 'bake_target'
                    nd.image = img
                    nt.nodes.active = nd
                    nd.select = True
                for ob in os_:
                    ob.data.uv_layers.active = ob.data.uv_layers['atlas']
                bpy.ops.object.select_all(action='DESELECT')
                group = os_[arg:arg + 3]
                for ob in group:
                    ob.select_set(True)
                bpy.context.view_layer.objects.active = group[0]
                bpy.ops.object.bake(type='EMIT', margin=6, use_clear=(arg == 0))
                _log(f'bake {[o.name for o in group]} {time.time() - t:.1f}s')
            elif kind == 'export':
                img = bpy.data.images['env-flora-atlas']
                folder = os.path.join(SOURCE_DIR, 'env-flora')
                img.filepath_raw = os.path.join(folder, 'env-flora-atlas.png')
                img.file_format = 'PNG'
                img.save()
                os_ = objs()
                export_location('flora', os_, os.path.join(folder, 'env-flora.glb'))
                preview(os_, 'flora', img)
                bpy.context.scene.render.engine = 'BLENDER_EEVEE'
                bpy.ops.wm.save_mainfile()
                _log('exported')
        except Exception as e:
            import traceback
            _log(f'ERROR {kind} {arg}: {e}\n{traceback.format_exc()}')
            return None
        state['k'] += 1
        return 0.5

    bpy.app.timers.register(tick, first_interval=0.5)
    _log(f'start {len(steps)} steps')
