# Helpers for the Act III Glass Town props (mirror, bookshelf, glass-cart, crystal-heart,
# wind-up-key, blueprint). Run through the Blender MCP: exec(open(this).read()) at the top of
# each small step. Blender is Z-up; the prop faces -Y here, which is +Z (towards the board) in glTF.
# Colours are vertex colours on the face corners ("Col"), painted from a per-face "part" colour
# with a soft top light, darker feet and crevices and a little brush noise, like the env kit's bake.

import bpy, bmesh, math, random
from mathutils import Vector

ROOT = r'C:\Braves\art\blender\act3-props'
OUT = r'C:\Braves\art\meshy-source'

PAL = {
    'wood': '#8a5a3a', 'wood-dark': '#5e3b26', 'wood-light': '#b07a4e',
    'brass': '#c79a3c', 'brass-dark': '#8e6a26',
    'glass': '#9fd6dc', 'glass-deep': '#5fa3b8', 'glass-pale': '#d8f1ee',
    'mirror': '#c9dde2', 'mirror-dark': '#7f9fae',
    'crystal': '#b9a6e8', 'crystal-deep': '#7d63c4', 'crystal-pale': '#e6dcff',
    'paper': '#e8dcbc', 'ink': '#3c5a8a', 'paper-dark': '#c2b28a',
    'leather-r': '#9c3b30', 'leather-g': '#3f6e4a', 'leather-b': '#33507e', 'leather-y': '#b8873a',
    'iron': '#4a4f57', 'stone': '#8d8676', 'red': '#a8423a',
}


def hexc(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll = bpy.data.collections.get('props') or bpy.context.scene.collection
    coll.objects.link(ob)
    return ob


def get_bm(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    return bm


def put_bm(ob, bm):
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def part_layer(bm):
    return bm.faces.layers.int.get('part') or bm.faces.layers.int.new('part')


PARTS = list(PAL)  # face 'part' index -> palette key, the same in every call


def pid(key):
    return PARTS.index(key)


def set_part(bm, faces, key):
    lay = part_layer(bm)
    i = pid(key)
    for f in faces:
        f[lay] = i


def bevel(bm, edges, width, segs=1, profile=0.5):
    return bmesh.ops.bevel(bm, geom=list(edges), offset=width, segments=segs, profile=profile,
                           affect='EDGES', clamp_overlap=True)


def box(bm, c, s, key):
    """A box of size s centred at c in its own bmesh piece; returns its verts."""
    from mathutils import Matrix
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)))
    set_part(bm, list(bm.faces), key)
    return r['verts']


def merge(dst, src):
    """Appends the bmesh src into dst (each piece is built and bevelled alone) and frees src."""
    me = bpy.data.meshes.new('_tmp')
    src.to_mesh(me)
    src.free()
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


def add(name, src):
    """Merges the piece src into object `name` (made if missing)."""
    ob = bpy.data.objects.get(name)
    if not ob:
        ob = new_obj(name, bmesh.new())
    bm = get_bm(ob)
    merge(bm, src)
    put_bm(ob, bm)
    return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def paint(ob, parts=PARTS, seed=1, top=0.18, feet=0.35, noise=0.07, edge=0.1):
    """Vertex colours from the per-face 'part' index -> palette keys (list in pid order)."""
    me = ob.data
    rnd = random.Random(seed)
    if 'Col' in me.color_attributes:
        me.color_attributes.remove(me.color_attributes['Col'])
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    attr = me.attributes.get('part')
    zs = [v.co.z for v in me.vertices]
    zmin, zmax = min(zs), max(zs)
    h = max(zmax - zmin, 1e-4)
    vjit = [rnd.uniform(-1, 1) for _ in me.vertices]
    # Convexity: a vertex whose normal points away from its neighbours' average is an edge -> lighter.
    for poly in me.polygons:
        key = parts[attr.data[poly.index].value] if attr else 'wood'
        base = hexc(PAL[key])
        fj = rnd.uniform(-1, 1) * noise * 0.6
        n = poly.normal
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            z = (me.vertices[vi].co.z - zmin) / h
            light = 1 + top * max(n.z, 0) - 0.22 * max(-n.z, 0) + 0.06 * (-n.y)
            low = 1 - feet * max(0, 0.25 - z) / 0.25
            k = light * low * (1 + fj + vjit[vi] * noise)
            c = [min(1, max(0, ch * k)) for ch in base]
            col.data[li].color = (*c, 1)
    me.color_attributes.active_color = col
    ob.data.update()


def vc_material():
    m = bpy.data.materials.get('glass-props')
    if m:
        return m
    m = bpy.data.materials.new('glass-props')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


def finish(ob, parts=PARTS, seed=1, **kw):
    for p in ob.data.polygons:
        p.use_smooth = False
    paint(ob, parts, seed, **kw)
    ob.data.materials.clear()
    ob.data.materials.append(vc_material())
    return tris(ob)


def export(ob, pid_):
    import os
    d = os.path.join(OUT, pid_)
    os.makedirs(d, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    path = os.path.join(d, pid_ + '.glb')
    keep = ob.location.copy()
    ob.location = (0, 0, 0)  # props are laid out in a row in the scene; the GLB is at the origin
    try:
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB',
                                  export_apply=True, export_yup=True, export_materials='EXPORT')
    finally:
        ob.location = keep
    return path
