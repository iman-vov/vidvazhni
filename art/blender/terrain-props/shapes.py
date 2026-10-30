# Terrain clump shapes (2026-10-30). exec after tp_lib.py in each MCP step.
# Hex units: a hex has circumradius 1 (flat-top, corners on +-X), so its inner radius is 0.866.
# A clump keeps to r <= 0.8 (any turn stays on its hex), under 0.25 high, centre left for the figure.

from mathutils import noise as mnoise

TP_MAX_H = 0.25


def _frames(pts):
    """Parallel-transport frames (tangent, normal, binormal) along a polyline."""
    ts = []
    for i in range(len(pts)):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        ts.append((b - a).normalized())
    n = ts[0].cross(Vector((0, 0, 1)))
    if n.length < 1e-4:
        n = ts[0].orthogonal()
    n.normalize()
    out = []
    for t in ts:
        n = (n - t * n.dot(t)).normalized()
        out.append((t, n, t.cross(n)))
    return out


def _resample(pts, k):
    """Catmull-Rom through pts, k steps per span (k=1 returns pts)."""
    if k <= 1:
        return [p.copy() for p in pts]
    P = [pts[0] * 2 - pts[1]] + list(pts) + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(k):
            t = s / k
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2].copy())
    return out


def tube(bm, hi, pts, r0, r1, sides=(5, 12), k_hi=4, bark=0.0, seed=0, cap0=True, cap1=True, flat=1.0):
    """A tapering round branch/stalk along pts (radius r0 -> r1). hi: more sides and rings, and
    `bark` (fraction of the radius) of ridged noise along the length. flat squashes the section
    (1 round, <1 an oval lying flat)."""
    before = set(bm.faces)
    pp = _resample([Vector(p) for p in pts], k_hi if hi else 1)
    fr = _frames(pp)
    ns = sides[1] if hi else sides[0]
    L = sum(((pp[i + 1] - pp[i]).length for i in range(len(pp) - 1)), 0.0) or 1.0
    rings, acc = [], 0.0
    for i, (p, (t, n, b)) in enumerate(zip(pp, fr)):
        if i:
            acc += (pp[i] - pp[i - 1]).length
        u = acc / L
        r = r0 + (r1 - r0) * u
        ring = []
        for j in range(ns):
            a = 2 * math.pi * j / ns
            d = n * math.cos(a) + b * math.sin(a) * flat
            rr = r
            if hi and bark:
                q = Vector((math.cos(a) * 2.2 + seed * 3.1, math.sin(a) * 2.2 + seed * 1.7, acc * 3.5))
                ridge = 1 - abs(mnoise.noise(q))
                rr = r * (1 + bark * (ridge - 0.6) + bark * 0.4 * mnoise.noise(q * 2.5))
            ring.append(bm.verts.new(p + d * rr))
        rings.append(ring)
    for a, b2 in zip(rings, rings[1:]):
        for j in range(ns):
            bm.faces.new((a[j], a[(j + 1) % ns], b2[(j + 1) % ns], b2[j]))
    if cap0:
        bm.faces.new(list(reversed(rings[0])))
    if cap1 and r1 > 1e-4:
        bm.faces.new(rings[-1])
    return _new_faces(bm, before)


def rock(bm, hi, c, size, seed, n=16, sub_hi=3, bev=0.12, crack=0.035, bump=0.03, rot=0.0, tilt=(0.0, 0.0), sit=0.55, pts=None):
    """An angular stone: convex hull of jittered points on an ellipsoid of half-sizes `size`, its
    bottom cut flat at -sit x sz (or the hull of `pts`). hi: edges rounded (bev x the smallest size), subdivided and
    displaced (fine noise plus voronoi cracks), so the normal bake carries chips and grain."""
    given = pts
    rnd = random.Random(seed)
    sx, sy, sz = size
    pts = []
    for i in range(n):
        z = rnd.uniform(-1, 1)
        a = rnd.uniform(0, 2 * math.pi)
        w = math.sqrt(1 - z * z)
        k = rnd.uniform(0.78, 1.0)
        pts.append(Vector((w * math.cos(a) * sx * k, w * math.sin(a) * sy * k, z * sz * k)))
    pts = [Vector((p.x, p.y, max(p.z, -sz * sit))) for p in pts]
    if given is not None:  # a shape of the caller's (a chipped brick), in the stone's own frame
        pts = [Vector(p) for p in given]
    m = Matrix.Translation(Vector(c)) @ Matrix.Rotation(tilt[0], 4, 'X') @ Matrix.Rotation(tilt[1], 4, 'Y') @ Matrix.Rotation(rot, 4, 'Z')
    before = set(bm.faces)
    vs = [bm.verts.new(m @ p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs, use_existing_faces=False)
    junk = list({v for v in res['geom_interior'] + res['geom_unused'] if isinstance(v, bmesh.types.BMVert) and v.is_valid})
    if junk:
        bmesh.ops.delete(bm, geom=junk, context='VERTS')
    faces = _new_faces(bm, before)
    if hi:
        mn = min(sx, sy, sz)
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4), verts=list({v for f in faces for v in f.verts}),
                                 edges=list({e for f in faces for e in f.edges}))
        faces = _new_faces(bm, before)
        bevel_piece(bm, faces, mn * bev, True, angle=25, segs_hi=2)
        faces = _new_faces(bm, before)
        bmesh.ops.triangulate(bm, faces=faces)
        faces = _new_faces(bm, before)
        for _ in range(sub_hi):
            es = list({e for f in faces for e in f.edges})
            bmesh.ops.subdivide_edges(bm, edges=es, cuts=1, use_grid_fill=True)
            faces = _new_faces(bm, before)
        vs = list({v for f in faces for v in f.verts})
        bm.normal_update()
        off = Vector((seed * 7.3, seed * 2.9, seed * 5.1))
        cc = Vector(c)
        for v in vs:
            q = (v.co - cc) / mn
            d = bump * mnoise.fractal(q * 3.0 + off, 0.6, 2.0, 4)
            f1, f2 = mnoise.voronoi(q * 1.6 + off)[0][:2]
            d -= crack * max(0.0, 1 - (f2 - f1) / 0.12)
            v.co += v.normal * d * mn
    return _new_faces(bm, before)


def blade(bm, hi, base, dirv, length, width, bend, seed=0, segs=(3, 8), twist=0.0, fold=0.0, leaf=False):
    """A strap leaf / reed blade: a strip from base along dirv drooping by `bend` (tip lowered by
    bend x length), tapering to a point. hi adds a midrib vertex raised by fold x width."""
    before = set(bm.faces)
    ns = segs[1] if hi else segs[0]
    d = Vector(dirv).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(d).normalized()
    rows = []
    for i in range(ns + 1):
        t = i / ns
        p = Vector(base) + d * (length * t) - Vector((0, 0, 1)) * (bend * length * t * t)
        if leaf:  # pointed at both ends, widest a third of the way
            w = width * (math.sin(math.pi * t) ** 0.7) * (1.15 - 0.3 * t) if 0 < t < 1 else width * 0.06
        else:
            w = width * max(0.0, 1 - t ** 1.8) * (0.75 + 0.25 * math.sin(math.pi * min(1.0, t + 0.2)))
        a = twist * t
        sd = side * math.cos(a) + up * math.sin(a)
        if hi:
            rows.append([bm.verts.new(p - sd * w), bm.verts.new(p + up * (fold * w)), bm.verts.new(p + sd * w)])
        else:
            rows.append([bm.verts.new(p - sd * w), bm.verts.new(p + sd * w)])
    for a, b in zip(rows, rows[1:]):
        for j in range(len(a) - 1):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    return _new_faces(bm, before)


def hex_ref():
    """A reference hex plate (circumradius 1, flat-top) and a figure-sized cylinder, in `ref`."""
    coll = bpy.data.collections.get('ref') or bpy.data.collections.new('ref')
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    for nm in ('ref-hex', 'ref-fig'):
        o = bpy.data.objects.get(nm)
        if o:
            bpy.data.objects.remove(o)
    bm = bmesh.new()
    vs = [bm.verts.new((math.cos(math.pi / 3 * i), math.sin(math.pi / 3 * i), -0.002)) for i in range(6)]
    bm.faces.new(vs)
    me = bpy.data.meshes.new('ref-hex'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('ref-hex', me); coll.objects.link(o)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.38, radius2=0.3, depth=0.9,
                          matrix=Matrix.Translation((0, 0, 0.45)))
    me = bpy.data.meshes.new('ref-fig'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('ref-fig', me); coll.objects.link(o)
    return coll


def hex_ok(ob, rmax=0.82, hmax=TP_MAX_H):
    """Footprint radius, top and bottom of a clump, and whether it fits its hex."""
    r = max(math.hypot(v.co.x, v.co.y) for v in ob.data.vertices)
    zs = [v.co.z for v in ob.data.vertices]
    return round(r, 3), round(max(zs), 3), round(min(zs), 3), r <= rmax and max(zs) <= hmax


def ring_pos(rnd, a0, a1, r0=0.42, r1=0.78):
    """A random point in the ring sector a0..a1 (radians), r0..r1 from the hex centre."""
    a = rnd.uniform(a0, a1)
    r = rnd.uniform(r0, r1)
    return Vector((math.cos(a) * r, math.sin(a) * r, 0.0)), a


def clear(names):
    for nm in names:
        for suf in ('', '-hi'):
            o = bpy.data.objects.get(nm + suf)
            if o:
                me = o.data
                bpy.data.objects.remove(o)
                bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- bake queue (bpy.app.timers)
# One job at a time; each step logged to bake.log. Run bake_variants([...]) and poll the log.

BAKE_LOG = os.path.join(ROOT, 'bake.log')
_TPQ = []


def _log(msg):
    import time
    with open(BAKE_LOG, 'a', encoding='utf8') as f:
        f.write(time.strftime('%H:%M:%S ') + msg + '\n')


def final_mat_cn(lo, pid, rough=0.88, metal=0.0, with_mr=False):
    """One Principled material `<pid>` from the baked colour and normal (and metal-rough when
    baked); constant roughness otherwise. Face material indices all go to 0."""
    m = bpy.data.materials.get(pid) or bpy.data.materials.new(pid)
    m.use_nodes = True
    m.use_backface_culling = False
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    bs = N.new('ShaderNodeBsdfPrincipled')
    L.new(bs.outputs[0], out.inputs[0])
    c = N.new('ShaderNodeTexImage'); c.image = bpy.data.images.get(pid + '_col')
    L.new(c.outputs[0], bs.inputs['Base Color'])
    if with_mr:
        mr = N.new('ShaderNodeTexImage'); mr.image = bpy.data.images.get(pid + '_mr')
        sep = N.new('ShaderNodeSeparateColor')
        L.new(mr.outputs[0], sep.inputs[0])
        L.new(sep.outputs[1], bs.inputs['Roughness'])
        L.new(sep.outputs[2], bs.inputs['Metallic'])
    else:
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = metal
    nm = N.new('ShaderNodeTexImage'); nm.image = bpy.data.images.get(pid + '_n')
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


def _tick():
    if bpy.app.is_job_running('OBJECT_BAKE'):
        return 1.0
    if not _TPQ:
        _log('queue empty')
        return None
    step = _TPQ.pop(0)
    try:
        kind = step[0]
        if kind == 'bake':
            _, pid, which, ext, ray = step
            lo, hi = bpy.data.objects[pid], bpy.data.objects[pid + '-hi']
            r = bake_start(lo, hi, pid, which, size=1024, samples=8, extrusion=ext, ray=ray)
            _log('bake %s %s started %s' % (pid, which, r))
        elif kind == 'save':
            _, pid, which = step
            _log('saved ' + bake_save(pid, which))
        elif kind == 'final':
            _, pid, kw = step
            final_mat_cn(bpy.data.objects[pid], pid, **kw)
            bpy.ops.wm.save_mainfile()
            _log('final %s, file saved' % pid)
    except Exception as e:  # keep the queue alive, report
        _log('ERROR %r: %r' % (step, e))
    return 1.5


def bake_variants(pids, maps=('col', 'n'), ext=0.015, ray=0.03, final=None):
    """Queues the bakes of each pid (lo `pid`, hi `pid-hi`, both already UV'd and in place)."""
    for pid in pids:
        for w in maps:
            _TPQ.append(('bake', pid, w, ext, ray))
            _TPQ.append(('save', pid, w))
        _TPQ.append(('final', pid, final or {}))
    _log('queued %s' % (pids,))
    if not bpy.app.timers.is_registered(_tick):
        bpy.app.timers.register(_tick, first_interval=0.5)


def export_glb(pid):
    """Writes the game mesh `pid` (at the origin, Y up, tangents, no vertex colours) to
    art/meshy-source/<pid>/<pid>.glb for `npm run models <pid>`."""
    lo = bpy.data.objects[pid]
    keep = lo.location.copy()
    lo.location = (0, 0, 0)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    lo.hide_set(False)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    d = os.path.join(OUT, pid)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, pid + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_tangents=True, export_vertex_color='NONE',
                              export_materials='EXPORT', export_image_format='AUTO')
    lo.location = keep
    return path, os.path.getsize(path)


def squeeze(ob, r0=0.8, k=0.4):
    """Pulls whatever reaches past r0 from the hex centre back in (r0 + k x the overshoot), so
    blade tips stay on the hex. Apply to lo and hi alike before baking."""
    for v in ob.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > r0:
            f = (r0 + (r - r0) * k) / r
            v.co.x *= f
            v.co.y *= f
    ob.data.update()


def tri_lo(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='EAR_CLIP')
    bm.to_mesh(ob.data)
    bm.free()


def sheet_rows(out_dir, rows=('forest', 'marsh', 'cave', 'town', 'glass'), ys=(0.0, 2.4, 4.8, 7.2, 9.6), w=1800, h=640):
    """Renders one Workbench (texture colour) frame per region row: its 3 game meshes on dark
    reference hexes, seen from the board camera's angle. Writes <out_dir>/row-<region>.png."""
    sc = bpy.context.scene
    ground = bpy.data.materials.get('sheet-ground') or bpy.data.materials.new('sheet-ground')
    ground.use_nodes = True
    img = bpy.data.images.get('sheet-ground') or bpy.data.images.new('sheet-ground', 4, 4)
    img.pixels = [0.2, 0.18, 0.13, 1.0] * 16
    nt = ground.node_tree
    tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    for o in bpy.data.objects:
        if o.name.startswith('ref-hex'):
            o.data.materials.clear()
            o.data.materials.append(ground)
        part = o.name.startswith(('rough-', 'trap-')) and o.name.split('-')[-1][:1] == 'p'
        hide = o.name.endswith('-hi') or '-hi-' in o.name or o.name.endswith('-v1') or part or o.name == 'ref-fig'
        o.hide_render = hide
    cam = bpy.data.objects.get('sheet-cam')
    if not cam:
        cam = bpy.data.objects.new('sheet-cam', bpy.data.cameras.new('sheet-cam'))
        sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 6.9
    sc.camera = cam
    try:
        sc.render.engine = 'BLENDER_WORKBENCH'
    except TypeError as e:
        print(e)
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'TEXTURE'
    sh.show_shadows = True
    sh.show_cavity = False
    sc.display.shadow_focus = 0.3
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = False
    if not sc.world:
        sc.world = bpy.data.worlds.new('sheet')
    sc.world.color = (0.05, 0.05, 0.05)
    elev = math.radians(52)
    out = []
    for name, y in zip(rows, ys):
        d = Vector((0, -math.cos(elev), math.sin(elev)))
        # the trap row has four hexes (x -2.2 .. 4.4), the others three
        cam.data.ortho_scale = 9.1 if name == 'trap' else 6.9
        cam.location = Vector((1.1 if name == 'trap' else 0, y, 0.05)) + d * 10
        cam.rotation_euler = (math.pi / 2 - elev, 0, 0)
        sc.render.filepath = os.path.join(out_dir, 'row-%s.png' % name)
        bpy.ops.render.render(write_still=True)
        out.append(sc.render.filepath)
    return out


# ---------------------------------------------------------------- step-by-step builds
# A layout is a list of piece tuples with step names (str) between them. Each step becomes its own
# part object `<pid>-p<i>` (and -hi), looked at before the next; join_steps merges them.

def layout_steps(layout):
    out = []
    for it in layout:
        if isinstance(it, str):
            out.append((it, []))
        else:
            out[-1][1].append(it)
    return out


def build_step(pid, layout, i, loc, seed=0):
    name, pieces = layout_steps(layout)[i]
    k = Kit(seed=seed * 10 + i)
    for build, mat, col, gax in pieces:
        k.add(build, mat, col, gax)
    lo, hi = k.finish('%s-p%d' % (pid, i), loc=loc)
    return name, lo, hi


def join_steps(pid, n, loc):
    parts = ['%s-p%d' % (pid, i) for i in range(n)]
    for suf in ('', '-hi'):
        old = bpy.data.objects.get(pid + suf)
        if old:
            old.name = pid + suf + '-v1'
    lo, hi = join_parts(pid, parts)
    for o in (lo, hi):
        o.location = loc
    for p in parts:
        for suf in ('', '-hi'):
            bpy.data.objects[p + suf].hide_set(True)
    return lo, hi
