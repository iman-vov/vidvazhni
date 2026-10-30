# Trap sets with moving parts (2026-10-30). exec after tp_lib.py and shapes.py through the MCP.
# The game mesh `trap-<set>` keeps its baked UVs and material: its faces are cut into a static
# part and a few moving ones by the build step they came from (the vertices of `trap-<set>-p<i>`
# follow one another in the joined mesh) and by where each loose piece lies. Each moving part is a
# mesh under an empty at its pivot, the empty's custom props saying how it snaps (glTF extras,
# three's userData): snapAxis + snapAngle (radians, about the pivot), snapMove (metres), in glTF
# axes (Y up, +Z towards the board's camera side = Blender -Y), snapScale (from 1) and snapDelay
# (seconds after the snap starts). src/render/trapSnap.ts plays them.
# A part with `rest` is sunk by that much in the model and comes up by snapMove.

import bpy, bmesh, math, os
from mathutils import Vector

RIG = 'trap-rig'


def gl(v):
    """Blender (x, y, z) to glTF (x, z, -y)."""
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


def _parts(pid):
    """Vertex index -> build step of the joined game mesh."""
    out, k = [], 0
    i = 0
    while bpy.data.objects.get('%s-p%d' % (pid, i)):
        n = len(bpy.data.objects['%s-p%d' % (pid, i)].data.vertices)
        out += [i] * n
        i += 1
    return out


def islands(pid):
    """Loose pieces of the game mesh: [(face indices, step, centroid)]."""
    src = bpy.data.objects[pid]
    step = _parts(pid)
    assert len(step) == len(src.data.vertices), 'steps do not add up to the game mesh'
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        st, fs = [f], []
        seen.add(f.index)
        while st:
            g = st.pop()
            fs.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        st.append(h)
        vs = {v.index for i in fs for v in bm.faces[i].verts}
        c = sum((bm.verts[i].co for i in vs), Vector()) / len(vs)
        out.append((fs, step[next(iter(vs))], c))
    bm.free()
    return out


def _mesh_from(src, faces, name, shift):
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.faces.ensure_lookup_table()
    keep = set(faces)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for v in bm.verts:
        v.co += shift
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in src.data.materials:
        me.materials.append(m)
    return me


def rig(pid, parts):
    """parts: [{name, pick(step, centroid) -> bool, pivot (Blender), axis, angle, move, rest}].
    Builds `<pid>-rig`: an empty with the static mesh and one empty + mesh per moving part."""
    src = bpy.data.objects[pid]
    coll = bpy.data.collections[COLL]
    clear_rig(pid)
    root = bpy.data.objects.new(pid + '-rig', None)
    root.empty_display_size = 0.3
    coll.objects.link(root)
    root.location = src.location
    taken = set()
    isl = islands(pid)
    report = []
    for p in parts:
        faces = []
        for fs, st, c in isl:
            if id(fs) not in taken and p['pick'](st, c):
                taken.add(id(fs))
                faces += fs
        pivot = Vector(p.get('pivot', (0, 0, 0)))
        rest = Vector(p.get('rest', (0, 0, 0)))
        e = bpy.data.objects.new('%s:%s' % (pid, p['name']), None)
        e.empty_display_size = 0.08
        coll.objects.link(e)
        e.parent = root
        e.location = pivot + rest
        if p.get('angle'):
            e['snapAxis'] = gl(Vector(p['axis']).normalized())
            e['snapAngle'] = round(p['angle'], 5)
        if p.get('move'):
            e['snapMove'] = gl(Vector(p['move']))
        if p.get('scale'):
            e['snapScale'] = p['scale']
        if p.get('delay'):
            e['snapDelay'] = p['delay']
        me = _mesh_from(src, faces, '%s:%s-mesh' % (pid, p['name']), -pivot)
        o = bpy.data.objects.new(me.name, me)
        coll.objects.link(o)
        o.parent = e
        report.append((p['name'], len(faces)))
    rest = [i for fs, st, c in isl if id(fs) not in taken for i in fs]
    me = _mesh_from(src, rest, pid + ':static', Vector())
    o = bpy.data.objects.new(me.name, me)
    coll.objects.link(o)
    o.parent = root
    report.append(('static', len(rest)))
    src.hide_set(True)
    return root, report


def clear_rig(pid):
    root = bpy.data.objects.get(pid + '-rig')
    if not root:
        return
    for o in [root] + list(root.children_recursive):
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)


def pose(pid, k):
    """Shows the rig at k of its snap (0 = set, 1 = sprung), for looking at it."""
    from mathutils import Quaternion
    root = bpy.data.objects[pid + '-rig']
    for e in root.children:
        if e.type != 'EMPTY':
            continue
        if 'base' not in e:
            e['base'] = list(e.location)
        e.location = Vector(e['base'])
        e.rotation_mode = 'QUATERNION'
        e.rotation_quaternion = Quaternion()
        e.scale = [1 + (e.get('snapScale', 1) - 1) * k] * 3
        if 'snapMove' in e:
            m = e['snapMove']
            e.location += Vector((m[0], -m[2], m[1])) * k
        if 'snapAxis' in e:
            a = e['snapAxis']
            e.rotation_quaternion = Quaternion(Vector((a[0], -a[2], a[1])), e['snapAngle'] * k)


def export_rig(pid):
    """Writes the rig at its set pose to art/meshy-source/<pid>/<pid>.glb, the root named <pid>."""
    pose(pid, 0)
    root = bpy.data.objects[pid + '-rig']
    for e in root.children:
        if 'base' in e:
            del e['base']
    keep = root.location.copy()
    root.location = (0, 0, 0)
    root.name = pid + '-x'
    bpy.data.objects[pid].name = pid + '-flat'
    root.name = pid
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in [root] + list(root.children_recursive):
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    d = os.path.join(OUT, pid)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, pid + '.glb')
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                                  export_apply=True, export_tangents=True, export_vertex_color='NONE',
                                  export_materials='EXPORT', export_image_format='AUTO', export_extras=True)
    finally:
        root.name = pid + '-rig'
        bpy.data.objects[pid + '-flat'].name = pid
        root.location = keep
    return path, os.path.getsize(path)


def rig_sets():
    """The four sets' moving parts (Blender axes; the hex centre at the origin, ground at z = 0)."""
    R = math.radians

    def ang(a, k=1.0, z=0.0):
        return tuple(Vector((math.cos(R(a)) * k, math.sin(R(a)) * k, z)))
    out = {}
    # forest and marsh: the two jaws, each with its teeth, swing shut on the hinge bar (they lie
    # 36 degrees up, close to 4 degrees off upright, so the teeth interlock)
    out['trap-forest'] = rig('trap-forest', [
        dict(name='jaw-a', pick=lambda s, c: s in (0, 1) and c.y > 0.02, pivot=(0, 0, 0.02), axis=(1, 0, 0), angle=R(50)),
        dict(name='jaw-b', pick=lambda s, c: s in (0, 1) and c.y < -0.02, pivot=(0, 0, 0.02), axis=(1, 0, 0), angle=-R(50)),
    ])[1]
    # cave and mine: the rotten boards give way, tipping into the pit onto its spikes, and four
    # stones of the lip roll in after them
    cave = [
        dict(name='board-a', pick=lambda s, c: s == 3 and c.x < -0.15, pivot=(-0.204, -0.08, 0.03), axis=ang(100), angle=R(38), move=ang(200, -0.08, -0.045)),
        dict(name='board-b', pick=lambda s, c: s == 3 and c.x > -0.15, pivot=(-0.107, -0.281, 0.03), axis=ang(160), angle=R(32), move=ang(-111, -0.07, -0.045), delay=0.03),
    ]
    for i, (x, y, a) in enumerate(((0.357, 0.216, 31), (0.046, 0.345, 82), (-0.385, 0.139, 160), (0.206, -0.357, -60))):
        cave.append(dict(name='stone-%d' % i, pick=(lambda x, y: lambda s, c: s == 1 and math.hypot(c.x - x, c.y - y) < 0.03)(x, y),
                         pivot=(x, y, 0.0), move=ang(a, -0.11, -0.03), delay=0.04 + 0.025 * i))
    out['trap-cave'] = rig('trap-cave', cave)[1]
    # town and forge: the toothed bars spring off the plate's edges and clap together over it
    out['trap-town'] = rig('trap-town', [
        dict(name='bar-a', pick=lambda s, c: s in (0, 1) and c.y > 0.1, pivot=(0, 0.23, 0.02), axis=(1, 0, 0), angle=R(40), move=(0, -0.13, 0)),
        dict(name='bar-b', pick=lambda s, c: s in (0, 1) and c.y < -0.1, pivot=(0, -0.23, 0.02), axis=(1, 0, 0), angle=-R(40), move=(0, 0.13, 0)),
    ])[1]
    # Glass Town: the inner teeth, sunk to their tips, shoot up out of the slab, one after another
    teeth = [c for fs, s, c in islands('trap-glass') if s == 2]
    teeth.sort(key=lambda c: math.atan2(c.y, c.x))
    out['trap-glass'] = rig('trap-glass', [
        dict(name='tooth-%d' % i, pick=(lambda c0: lambda s, c: s == 2 and (c - c0).length < 0.01)(c0), pivot=(c0.x, c0.y, 0.0),
             rest=(0, 0, -0.05), move=(0, 0, 0.05), scale=1.6, delay=0.02 * i) for i, c0 in enumerate(teeth)
    ])[1]
    return out
