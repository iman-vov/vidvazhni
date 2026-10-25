# Cluster kit: set pieces of the obstacle clusters (src/render/environment/obstacles.ts) that no
# Meshy model covers: a long table that spans two hexes, chairs to stand around it and a farm cart.
# Run inside Blender through the Blender MCP:
#   exec(open(r'C:/Braves/art/blender/cluster-kit/cluster_kit.py').read()); r = build_all(); export(r)
#
# Builds on the scatter kit's helpers (Piece, material, palette): flat-shaded low poly, materials
# named by palette key so the game paints the location's colours. Each variant is a top-level
# object `<kind>_<n>` (n from 1), at life size around the origin on the floor (Blender Z up,
# 1 unit = one hex from centre to corner; a figure is about 1.3 tall), its long side along X.

import json
import math
import os
import zlib

exec(open(r'C:/Braves/art/blender/scatter-kit/scatter_kit.py', encoding='utf-8').read())

PALETTE.setdefault('clothDark', '#9a8460')
VARIANTS = 4
OUT_GLB = r'C:/Braves/art/meshy-source/cluster-kit/cluster-kit.glb'
OUT_REPORT = r'C:/Braves/art/blender/cluster-kit/cluster-kit.report.json'
COLLECTION = 'cluster-kit'


def collection():
    c = bpy.data.collections.get(COLLECTION)
    if c is None:
        c = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(c)
    for ob in list(c.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    return c


# ─── Long table: 1.5 long, 0.6 wide, top at 0.56 ──────────────────────────────────────────────

L, W, H = 1.5, 0.6, 0.56


def _planks(p, n, key_a='wood', key_b='woodLight', gap=0.012, missing=None, warp=0.0):
    w = (W - gap * (n - 1)) / n
    for i in range(n):
        if i == missing:
            continue
        y = -W / 2 + w / 2 + i * (w + gap)
        p.box(key_a if i % 2 else key_b, (L + p.j(0.03), w, 0.045), (p.j(0.015), y, H - 0.022), (p.j(warp), 0, p.j(0.01)))


def _mug(p, x, y):
    p.rod('wood', (x, y, H), (x, y, H + 0.07), 0.032, 0.028, seg=6)


def _jug(p, x, y):
    p.rod('clothDark', (x, y, H), (x, y, H + 0.13), 0.05, 0.035, seg=7)
    p.rod('clothDark', (x, y, H + 0.13), (x, y, H + 0.16), 0.022, 0.03, seg=7)


def _plate(p, x, y):
    p.rod('cloth', (x, y, H), (x, y, H + 0.012), 0.07, 0.075, seg=8)


def table_trestle(p):
    """Planks on two trestles with a long stretcher, a jug and mugs left on it."""
    _planks(p, 4)
    for x in (-0.55, 0.55):
        for s in (-1, 1):
            p.rod('woodDark', (x - 0.05 * s, -0.22, 0), (x + 0.03 * s, 0, H - 0.05), 0.028, seg=5)
            p.rod('woodDark', (x - 0.05 * s, 0.22, 0), (x + 0.03 * s, 0, H - 0.05), 0.028, seg=5)
        p.box('woodDark', (0.07, W * 0.9, 0.06), (x, 0, H - 0.07))
    p.box('woodDark', (1.15, 0.05, 0.05), (0, 0, 0.18))
    _jug(p, -0.42, 0.08)
    _mug(p, 0.3, 0.16)
    _mug(p, 0.48, -0.14)


def table_legs(p):
    """Four square legs, side aprons, a cloth runner and two plates."""
    _planks(p, 3, 'woodLight', 'wood')
    for x in (-0.66, 0.66):
        for y in (-0.24, 0.24):
            p.box('woodDark', (0.07, 0.07, H - 0.045), (x, y, (H - 0.045) / 2), (0, 0, p.j(0.05)))
    for y in (-0.25, 0.25):
        p.box('woodDark', (1.3, 0.035, 0.08), (0, y, H - 0.09))
    p.box('cloth', (0.95, 0.26, 0.008), (0.1, p.j(0.03), H + 0.004), (0, 0, p.j(0.04)))
    _plate(p, -0.18, 0.02)
    _plate(p, 0.32, -0.04)
    _mug(p, 0.05, 0.1)


def table_worn(p):
    """An old table: one plank gone, a leg patched with a block, a mug knocked over."""
    _planks(p, 4, 'wood', 'woodDark', missing=1, warp=0.02)
    for x in (-0.64, 0.64):
        for y in (-0.23, 0.23):
            short = x > 0 and y > 0
            h = H - 0.045 - (0.08 if short else 0)
            p.box('woodDark', (0.065, 0.065, h), (x, y, (0.08 if short else 0) + h / 2))
    p.box('stone', (0.12, 0.12, 0.08), (0.64, 0.23, 0.04), (0, 0, 0.3))
    p.box('woodDark', (1.2, 0.04, 0.06), (0, 0, 0.16))
    p.rod('wood', (-0.25, 0.12, H + 0.032), (-0.18, 0.15, H + 0.032), 0.03, 0.026, seg=6)
    _mug(p, 0.36, -0.12)


def table_feast(p):
    """A heavy board on thick posts with a bench rail, plates, a jug and a loaf."""
    p.box('wood', (L, W, 0.06), (0, 0, H - 0.03))
    p.box('woodDark', (L + 0.02, W + 0.02, 0.015), (0, 0, H - 0.065))
    for x in (-0.6, 0.6):
        p.box('woodDark', (0.12, 0.38, H - 0.06), (x, 0, (H - 0.06) / 2))
        p.box('woodDark', (0.18, 0.5, 0.05), (x, 0, 0.025))
    p.box('woodDark', (1.1, 0.06, 0.06), (0, 0, 0.12))
    for x in (-0.45, 0.0, 0.45):
        _plate(p, x, 0.15 * (1 if x != 0 else -1))
    _jug(p, 0.2, 0.0)
    p.blob('straw', 0.07, (-0.2, -0.12, H), 0.06, seg=6)


# ─── Chairs: seat at 0.33, back up to about 0.66 ──────────────────────────────────────────────

SEAT = 0.33


def chair_ladder(p):
    """A ladder-back chair with two rungs."""
    p.box('wood', (0.32, 0.3, 0.035), (0, 0, SEAT))
    for x in (-0.13, 0.13):
        for y in (-0.12, 0.12):
            top = 0.68 if y > 0 else SEAT
            p.rod('woodDark', (x, y, 0), (x, y, top), 0.018, 0.016, seg=5)
    for z in (0.46, 0.6):
        p.box('woodDark', (0.26, 0.022, 0.035), (0, 0.12, z))
    p.box('woodDark', (0.26, 0.02, 0.02), (0, -0.12, 0.12))


def chair_bench(p):
    """A short two-person bench."""
    p.box('wood', (0.7, 0.24, 0.04), (0, 0, SEAT - 0.02))
    for x in (-0.28, 0.28):
        p.box('woodDark', (0.05, 0.2, SEAT - 0.04), (x, 0, (SEAT - 0.04) / 2))
    p.box('woodDark', (0.5, 0.03, 0.03), (0, 0, 0.1))


def chair_broken(p):
    """A chair with a slat missing from its back and a splayed leg."""
    p.box('woodLight', (0.3, 0.3, 0.035), (0, 0, SEAT), (0, 0, 0.06))
    p.rod('woodDark', (-0.13, -0.12, 0), (-0.12, -0.12, SEAT), 0.018, seg=5)
    p.rod('woodDark', (0.17, -0.15, 0), (0.12, -0.12, SEAT), 0.018, seg=5)
    p.rod('woodDark', (-0.13, 0.12, 0), (-0.13, 0.12, 0.66), 0.018, seg=5)
    p.rod('woodDark', (0.13, 0.12, 0), (0.13, 0.12, 0.66), 0.018, seg=5)
    p.box('woodDark', (0.26, 0.022, 0.04), (0, 0.12, 0.62))
    p.box('woodDark', (0.11, 0.022, 0.035), (-0.07, 0.12, 0.47), (0, 0.25, 0))


def chair_stool(p):
    """A three-legged round milking stool with a worn top."""
    p.rod('wood', (0, 0, SEAT - 0.04), (0, 0, SEAT), 0.15, 0.15, seg=8)
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        p.rod('woodDark', (math.cos(a) * 0.15, math.sin(a) * 0.15, 0), (math.cos(a) * 0.08, math.sin(a) * 0.08, SEAT - 0.04), 0.017, seg=5)


# ─── Cart: bed 1.0 x 0.6 at 0.34, wheels r 0.27 on one axle, shafts toward -X ──────────────────

def _wheel(p, x, y, z, rot=(math.pi / 2, 0, 0), r=0.27):
    m = p.M((x, y, z), rot)
    seg = 10
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for k in (r - 0.035, r):
            for dz in (-0.025, 0.025):
                verts.append((math.cos(a) * k, math.sin(a) * k, dz))
    for i in range(seg):
        a, b = 4 * i, 4 * ((i + 1) % seg)
        faces += [(a + 2, a + 3, b + 3, b + 2), (a + 1, a, b, b + 1), (a + 3, a + 1, b + 1, b + 3), (a, a + 2, b + 2, b)]
    p._add('woodDark', verts, faces, m)
    for i in range(3):
        a = math.pi * i / 3
        p._add('wood', [(-math.cos(a) * r, -math.sin(a) * r, -0.012), (math.cos(a) * r, math.sin(a) * r, -0.012), (math.cos(a) * r, math.sin(a) * r, 0.012), (-math.cos(a) * r, -math.sin(a) * r, 0.012)], [(0, 1, 2, 3), (3, 2, 1, 0)], m)
    p._add('iron', [(math.cos(2 * math.pi * i / 6) * 0.05, math.sin(2 * math.pi * i / 6) * 0.05, 0.03) for i in range(6)], [tuple(range(6)), tuple(range(5, -1, -1))], m)


def _bed(p, sides=True):
    p.box('wood', (1.0, 0.6, 0.05), (0.1, 0, 0.34))
    if sides:
        for y in (-0.3, 0.3):
            p.box('woodDark', (1.0, 0.035, 0.18), (0.1, y, 0.45))
        p.box('woodDark', (0.035, 0.6, 0.18), (0.6, 0, 0.45))
    p.box('woodDark', (0.07, 0.66, 0.06), (0.15, 0, 0.27))


def _shafts(p, down=True):
    for y in (-0.2, 0.2):
        if down:
            p.rod('woodDark', (-0.38, y, 0.3), (-0.95, y * 0.85, 0.02), 0.025, seg=5)
        else:
            p.rod('woodDark', (-0.38, y, 0.3), (-0.95, y * 0.85, 0.42), 0.025, seg=5)
    if not down:
        p.box('woodDark', (0.08, 0.1, 0.4), (-0.92, 0, 0.2))


def cart_empty(p):
    """An empty cart resting on its shafts, one wheel off and lying against the bed."""
    _bed(p)
    _wheel(p, 0.15, 0.37, 0.27)
    _wheel(p, 0.3, -0.42, 0.03, rot=(0, 0, 0))
    p.box('woodDark', (0.14, 0.14, 0.24), (0.15, -0.26, 0.12))
    _shafts(p)


def cart_hay(p):
    """A hay cart, the load heaped over the sides."""
    _bed(p)
    _wheel(p, 0.15, 0.37, 0.27)
    _wheel(p, 0.15, -0.37, 0.27)
    for i in range(5):
        p.blob('straw', 0.24, (-0.25 + i * 0.17, p.j(0.06), 0.38 + (0.12 if i in (1, 2, 3) else 0.03)), 0.16 + p.j(0.03), seg=7)
    _shafts(p)


def cart_goods(p):
    """A cart loaded with sacks and a barrel, propped level on a block."""
    _bed(p)
    _wheel(p, 0.15, 0.37, 0.27)
    _wheel(p, 0.15, -0.37, 0.27)
    for (x, y) in ((-0.2, -0.13), (0.0, 0.12), (0.18, -0.1)):
        p.blob('cloth', 0.13, (x, y, 0.37), 0.2, seg=7)
    p.rod('wood', (0.42, 0.05, 0.37), (0.42, 0.05, 0.72), 0.13, 0.13, seg=10)
    for z in (0.42, 0.66):
        p.rod('iron', (0.42, 0.05, z), (0.42, 0.05, z + 0.025), 0.135, 0.135, seg=10)
    _shafts(p, down=False)


def cart_planks(p):
    """A flat cart (no sides) with a stack of boards and a crate, shafts on the floor."""
    _bed(p, sides=False)
    _wheel(p, 0.15, 0.37, 0.27)
    _wheel(p, 0.15, -0.37, 0.27)
    for i in range(4):
        p.box('woodLight' if i % 2 else 'wood', (0.95, 0.14, 0.035), (0.08 + p.j(0.03), -0.1 + p.j(0.02), 0.385 + i * 0.036), (0, 0, p.j(0.04)))
    p.box('wood', (0.28, 0.28, 0.26), (0.42, 0.14, 0.495), (0, 0, 0.2))
    _shafts(p)


KIND_BUILDERS = {
    'long-table': [table_trestle, table_legs, table_worn, table_feast],
    'chair': [chair_ladder, chair_bench, chair_broken, chair_stool],
    'cart': [cart_empty, cart_hay, cart_goods, cart_planks],
}


def bounds(ob):
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    return [round(min(xs), 4), round(max(xs), 4), round(min(ys), 4), round(max(ys), 4), round(min(zs), 4), round(max(zs), 4)]


def build_all():
    """Builds every kind's variants in a grid (row per kind, 2 apart) and reports their sizes."""
    c = collection()
    report = {}
    for row, (kind, builders) in enumerate(KIND_BUILDERS.items()):
        out = []
        for n, fn in enumerate(builders):
            p = Piece(f'{kind}_{n + 1}', zlib.crc32(f'{kind}.{n}'.encode()))
            fn(p)
            ob = p.build(c, (n * 2.0, -row * 2.0, 0))
            out.append({'name': ob.name, 'tris': sum(len(f.vertices) - 2 for f in ob.data.polygons), 'bounds': bounds(ob)})
        report[kind] = out
    return report


def export(report=None):
    report = report or build_all()
    c = bpy.data.collections[COLLECTION]
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    places = {ob.name: ob.location.copy() for ob in c.objects}
    for ob in c.objects:
        ob.location = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in c.objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = c.objects[0]
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True,
                              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    for ob in c.objects:
        ob.location = places[ob.name]
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    return OUT_GLB
