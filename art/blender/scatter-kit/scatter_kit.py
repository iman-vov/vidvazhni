# Scatter kit: the small things on the board floor (src/render/environment/scatter.ts).
# Run inside Blender through the Blender MCP:  exec(open(r'C:/Braves/art/blender/scatter-kit/scatter_kit.py').read()); build_all(); export()
#
# Ten kinds, VARIANTS (4) variants each as top-level objects named `<kind>_<n>` (three's loader drops dots from node names) (n from 1), modelled at
# life size around the origin on the ground (z = 0, Blender Z up; 1 unit = one hex across). Each
# object's material slots are named by palette key (rock, woodLight, leafWarm…): the game paints
# the palette colour into the vertices and draws every kind in one batch. Flat-shaded low poly to
# match the board; nothing reaches past the kind's REACH (scatter.ts KINDS) across the floor.

import bpy
import bmesh
import json
import math
import os
import random
import zlib
from mathutils import Matrix, Vector

VARIANTS = 4
OUT_GLB = r'C:/Braves/art/meshy-source/scatter-kit/scatter-kit.glb'
OUT_REPORT = r'C:/Braves/art/blender/scatter-kit/scatter-kit.report.json'
COLLECTION = 'scatter-kit'

# Preview colours only (the game uses the location palette): pieces.ts PALETTE_DEFAULTS.
PALETTE = {
    'stone': '#a08f7c', 'woodDark': '#5a3a22', 'wood': '#8a5a34', 'woodLight': '#b08050', 'iron': '#4a4c52',
    'cloth': '#d8c6a2', 'straw': '#c9a560', 'leaf': '#6a8a3a', 'leafDark': '#3e5a2c', 'leafWarm': '#c27a32',
    'berry': '#b8342c', 'bark': '#5e4632', 'moss': '#6e8a44', 'rock': '#8a8478', 'rockDark': '#5a5650',
    'reed': '#9aa05a', 'flame': '#ffc35a', 'glowCold': '#8ad0e0', 'ore': '#b8743a', 'snow': '#dfe6ee',
    'shadow': '#1e1814',
}

# How far each kind may reach across the floor (scatter.ts KINDS.reach).
REACH = {
    'pebbles': 0.06, 'stick': 0.18, 'leaf-pile': 0.075, 'chips': 0.055, 'plank': 0.11, 'straw': 0.105,
    'pine-cone': 0.042, 'snow': 0.085, 'tuft': 0.062, 'shards': 0.063,
}


def srgb(hexcol):
    h = hexcol.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def material(key):
    m = bpy.data.materials.get(key)
    if m is None:
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = srgb(PALETTE[key])
        bsdf.inputs['Roughness'].default_value = 0.9
    return m


class Piece:
    """Collects faces per material, then builds one flat-shaded object."""

    def __init__(self, name, seed):
        self.name = name
        self.rnd = random.Random(seed)
        self.bm = bmesh.new()
        self.mats = []

    def _slot(self, key):
        if key not in self.mats:
            self.mats.append(key)
        return self.mats.index(key)

    def _add(self, key, verts, faces, matrix):
        slot = self._slot(key)
        vs = [self.bm.verts.new(matrix @ Vector(v)) for v in verts]
        for f in faces:
            face = self.bm.faces.new([vs[i] for i in f])
            face.material_index = slot

    @staticmethod
    def M(pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        r = Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
        return Matrix.Translation(pos) @ r @ Matrix.Diagonal((*scale, 1))

    def j(self, a):
        return (self.rnd.random() * 2 - 1) * a

    # Shapes ---------------------------------------------------------------------------------
    def rock(self, key, r, pos=(0, 0, 0), scale=(1, 1, 0.6), rot_z=0.0, noise=0.25, sink=0.3, subdiv=0):
        """A stone: a jittered icosphere (subdiv 0 = sharp rubble, 1 = rounded pebble), its lower
        part sunk into the floor."""
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv + 1, radius=1.0)
        verts = []
        for v in tmp.verts:
            k = 1 + self.j(noise)
            verts.append((v.co.x * k, v.co.y * k, v.co.z * k))
        faces = [[v.index for v in f.verts] for f in tmp.faces]
        tmp.free()
        sx, sy, sz = scale
        z0 = r * sz * (1 - 2 * sink)
        self._add(key, verts, faces, self.M((pos[0], pos[1], pos[2] + z0), (self.j(0.3), self.j(0.3), rot_z), (r * sx, r * sy, r * sz)))

    def box(self, key, size, pos=(0, 0, 0), rot=(0, 0, 0), taper=0.0):
        x, y, z = (s / 2 for s in size)
        tx = x * (1 - taper)
        verts = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-tx, -y, z), (tx, -y, z), (tx, y, z), (-tx, y, z)]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        self._add(key, verts, faces, self.M(pos, rot))

    def rod(self, key, a, b, r0, r1=None, seg=5, caps=True):
        """A tapered round rod from point a to point b."""
        r1 = r0 if r1 is None else r1
        a, b = Vector(a), Vector(b)
        d = b - a
        length = d.length
        # rotation_difference never degenerates (to_track_quat does when d runs along its up axis).
        rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
        verts, faces = [], []
        for i in range(seg):
            ang = 2 * math.pi * i / seg
            verts.append((math.cos(ang) * r0, math.sin(ang) * r0, 0))
        for i in range(seg):
            ang = 2 * math.pi * i / seg
            verts.append((math.cos(ang) * r1, math.sin(ang) * r1, length))
        for i in range(seg):
            n = (i + 1) % seg
            faces.append((i, n, seg + n, seg + i))
        if caps:
            faces.append(tuple(range(seg - 1, -1, -1)))
            faces.append(tuple(range(seg, 2 * seg)))
        self._add(key, verts, faces, Matrix.Translation(a) @ rot)

    def blade(self, key, base, height, width, lean, heading, bend=0.4):
        """A grass blade: a bent three-sided spike leaning out along `heading`."""
        bx, by, bz = base
        dx, dy = math.cos(heading), math.sin(heading)
        mid = (bx + dx * lean * 0.35, by + dy * lean * 0.35, bz + height * 0.55)
        tip = (bx + dx * lean, by + dy * lean, bz + height * (1 - bend * 0.15))
        px, py = -dy * width, dx * width
        verts = [(bx + px, by + py, bz), (bx - px, by - py, bz), (bx - dx * width, by - dy * width, bz),
                 (mid[0] + px * 0.6, mid[1] + py * 0.6, mid[2]), (mid[0] - px * 0.6, mid[1] - py * 0.6, mid[2]), (mid[0] - dx * width * 0.6, mid[1] - dy * width * 0.6, mid[2]), tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6)]
        self._add(key, verts, faces, Matrix.Identity(4))

    def leaf(self, key, pos, length, width, heading, tilt=0.0, curl=0.25):
        """A leaf: a pointed oval folded along its midrib, lying on the floor, its tip curled up."""
        L, W = length / 2, width / 2
        verts = [(-L, 0, 0), (-L * 0.3, W, W * curl), (L * 0.3, W * 0.9, W * curl * 1.4), (L, 0, length * curl * 0.35),
                 (L * 0.3, -W * 0.9, W * curl * 1.4), (-L * 0.3, -W, W * curl), (0, 0, -W * curl * 0.2)]
        faces = [(0, 6, 1), (1, 6, 2), (2, 6, 3), (3, 6, 4), (4, 6, 5), (5, 6, 0)]
        self._add(key, verts, [tuple(reversed(f)) for f in faces], self.M(pos, (tilt, self.j(0.15), heading)))

    def blob(self, key, r, pos, height, seg=7):
        """A flat lumpy patch (snow, moss, spilled grain): a low dome with a ragged rim."""
        verts = [(0, 0, height)]
        for i in range(seg):
            ang = 2 * math.pi * i / seg + self.j(0.2)
            k = r * (0.75 + self.rnd.random() * 0.45)
            verts.append((math.cos(ang) * k * 0.62, math.sin(ang) * k * 0.62, height * (0.6 + self.j(0.15))))
        for i in range(seg):
            ang = 2 * math.pi * (i + 0.5) / seg + self.j(0.2)
            k = r * (0.85 + self.rnd.random() * 0.4)
            verts.append((math.cos(ang) * k, math.sin(ang) * k, 0.0))
        faces = []
        for i in range(seg):
            n = (i + 1) % seg
            faces.append((0, 1 + i, 1 + n))
            faces.append((1 + i, 1 + seg + i, 1 + n))
            faces.append((1 + n, 1 + seg + i, 1 + seg + n))
        self._add(key, verts, faces, self.M(pos))

    def cap(self, key, r, pos, height, seg=7):
        """A mushroom cap: a low cone with a rolled rim."""
        verts = [(0, 0, height)]
        verts += [(math.cos(2 * math.pi * i / seg) * r * 0.6, math.sin(2 * math.pi * i / seg) * r * 0.6, height * 0.75) for i in range(seg)]
        verts += [(math.cos(2 * math.pi * i / seg) * r, math.sin(2 * math.pi * i / seg) * r, 0.0) for i in range(seg)]
        faces = []
        for i in range(seg):
            n = (i + 1) % seg
            faces.append((0, 1 + i, 1 + n))
            faces.append((1 + i, 1 + seg + i, 1 + seg + n, 1 + n))
        faces.append(tuple(range(1 + 2 * seg - 1, seg, -1)))
        self._add(key, verts, faces, self.M(pos, (self.j(0.2), self.j(0.2), 0)))

    def ring(self, key, r, thick, pos, seg=8):
        verts, faces = [], []
        for i in range(seg):
            ang = 2 * math.pi * i / seg
            for k in (r - thick, r + thick):
                verts.append((math.cos(ang) * k, math.sin(ang) * k, 0))
                verts.append((math.cos(ang) * k, math.sin(ang) * k, thick * 1.2))
        for i in range(seg):
            a, b = 4 * i, 4 * ((i + 1) % seg)
            faces += [(a + 1, a + 3, b + 3, b + 1), (a + 2, a, b, b + 2), (a + 3, a + 2, b + 2, b + 3), (a, a + 1, b + 1, b)]
        self._add(key, verts, faces, self.M(pos, (0.08, 0, self.j(1))))

    def build(self, collection, location):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for key in self.mats:
            mesh.materials.append(material(key))
        for poly in mesh.polygons:
            poly.use_smooth = False
        ob = bpy.data.objects.new(self.name, mesh)
        ob.location = location
        collection.objects.link(ob)
        return ob


def around(p, r, rmin=0.0):
    a = p.rnd.random() * 2 * math.pi
    d = rmin + p.rnd.random() * (r - rmin)
    return math.cos(a) * d, math.sin(a) * d


# Kinds ------------------------------------------------------------------------------------------

def k_pebbles(p):
    """River pebbles: one bigger rounded stone and a few small ones, in three stone tones."""
    keys = ['rock', 'rockDark', 'stone']
    n = p.rnd.randint(2, 4)
    for i in range(n):
        x, y = (p.j(0.008), p.j(0.008)) if i == 0 else around(p, 0.05, 0.022)
        r = 0.02 + p.rnd.random() * 0.012 if i == 0 else 0.008 + p.rnd.random() * 0.01
        p.rock(keys[(i + p.rnd.randint(0, 2)) % 3], r, (x, y, 0), (1.15 + p.j(0.2), 0.85 + p.j(0.12), 0.5 + p.j(0.1)), p.rnd.random() * 6, 0.12, 0.25, 1 if i == 0 else 0)


def _tuft(p, keys, n, h, spread, lean):
    for i in range(n):
        a = 2 * math.pi * i / n + p.j(0.4)
        r = spread * (0.2 + 0.8 * p.rnd.random())
        p.blade(keys[i % len(keys)], (math.cos(a) * r, math.sin(a) * r, 0), h * (0.65 + 0.5 * p.rnd.random()), 0.006, lean * (0.5 + p.rnd.random() * 0.6), a + p.j(0.3))


def k_tuft(p):
    """A tuft of grass: a dense fan of bent blades in two greens with a few sun-dried ones."""
    _tuft(p, ['leaf', 'leafDark', 'leaf', 'leaf', 'straw'], p.rnd.randint(11, 14), 0.095, 0.024, 0.035)


def k_dry_tuft(p):
    _tuft(p, ['straw', 'straw', 'reed'], p.rnd.randint(6, 9), 0.085, 0.024, 0.04)


def k_flowers(p):
    _tuft(p, ['leaf', 'leafDark'], p.rnd.randint(4, 6), 0.075, 0.018, 0.025)
    head = p.rnd.choice(['berry', 'straw', 'cloth'])
    for i in range(p.rnd.randint(2, 3)):
        x, y = around(p, 0.025)
        h = 0.07 + p.rnd.random() * 0.025
        p.rod('leaf', (x, y, 0), (x * 1.3, y * 1.3, h), 0.0018, 0.0015, 4)
        p.rock(head, 0.009 + p.rnd.random() * 0.004, (x * 1.3, y * 1.3, h), (1, 1, 0.7), p.rnd.random() * 6, 0.1, 0.0)


def k_mushrooms(p):
    for i in range(p.rnd.randint(1, 3)):
        x, y = around(p, 0.035) if i else (0, 0)
        h = (0.04 if i == 0 else 0.025) * (0.8 + p.rnd.random() * 0.4)
        lean = (p.j(0.008), p.j(0.008))
        p.rod('cloth', (x, y, 0), (x + lean[0], y + lean[1], h), 0.006 if i == 0 else 0.0045, 0.005, 5)
        p.cap('berry', (0.022 if i == 0 else 0.015) * (0.85 + p.rnd.random() * 0.3), (x + lean[0], y + lean[1], h * 0.92), 0.012 if i == 0 else 0.009)


def k_glow_caps(p):
    for i in range(p.rnd.randint(2, 4)):
        x, y = around(p, 0.035) if i else (0, 0)
        h = 0.03 * (0.6 + p.rnd.random() * 0.6)
        p.rod('rockDark', (x, y, 0), (x + p.j(0.008), y + p.j(0.008), h), 0.004, 0.0035, 4)
        p.cap('glowCold', 0.011 + p.rnd.random() * 0.008, (x, y, h * 0.95), 0.008, 6)


def k_leaves(p):
    for i in range(p.rnd.randint(3, 5)):
        x, y = around(p, 0.06)
        p.leaf(['leaf', 'leaf', 'leafWarm', 'leafDark'][i % 4], (x, y, 0.004 + i * 0.0015), 0.045 + p.rnd.random() * 0.015, 0.025, p.rnd.random() * 6, p.j(0.15))


def k_leaf_pile(p):
    keys = ['leafWarm', 'leafWarm', 'berry', 'straw', 'bark']
    for i in range(p.rnd.randint(6, 8)):
        x, y = around(p, 0.045)
        p.leaf(keys[i % len(keys)], (x, y, 0.005 + i * 0.0025), 0.05 + p.rnd.random() * 0.015, 0.028, p.rnd.random() * 6, p.j(0.35), 0.3 + p.rnd.random() * 0.25)


def k_moss(p):
    for i in range(p.rnd.randint(2, 3)):
        x, y = around(p, 0.05) if i else (0, 0)
        p.blob('moss', 0.06 if i == 0 else 0.035, (x, y, 0), 0.012)


def k_snow(p):
    for i in range(p.rnd.randint(2, 3)):
        x, y = around(p, 0.06) if i else (0, 0)
        p.blob('snow', 0.065 if i == 0 else 0.035, (x, y, 0), 0.02 if i == 0 else 0.012, 8)


def k_straw(p):
    """A wisp of straw: many thin pale stalks lying mostly one way, slightly bent, a few across."""
    a = p.rnd.random() * math.pi
    for i in range(p.rnd.randint(13, 16)):
        x, y = around(p, 0.035)
        h = a + (p.j(0.3) if i % 5 else p.j(1.4))
        L = 0.07 + p.rnd.random() * 0.07
        z = 0.002 + p.rnd.random() * 0.005
        mid = Vector((x, y, z + 0.002)) + Vector((-math.sin(h), math.cos(h), 0)) * p.j(0.006)
        s0 = Vector((x - math.cos(h) * L / 2, y - math.sin(h) * L / 2, z))
        s1 = Vector((x + math.cos(h) * L / 2, y + math.sin(h) * L / 2, z))
        key = 'straw' if i % 4 else 'cloth'
        if i % 3 == 0:
            p.rod(key, tuple(s0), tuple(mid), 0.0019, 0.0017, 3, False)
            p.rod(key, tuple(mid), tuple(s1), 0.0017, 0.0012, 3, False)
        else:
            p.rod(key, tuple(s0), tuple(s1), 0.0019, 0.0012, 3, False)


def k_grain(p):
    p.blob('cloth', 0.065, (0, 0, 0), 0.006, 8)
    for i in range(p.rnd.randint(8, 12)):
        x, y = around(p, 0.11, 0.04)
        p.rock('straw', 0.0055, (x, y, 0.002), (1.4, 0.8, 0.7), p.rnd.random() * 6, 0.15, 0.1)


def k_shards(p):
    for i in range(p.rnd.randint(2, 4)):
        x, y = around(p, 0.04)
        if i == 0:
            # A curved piece of a pot wall lying on its side.
            seg, r, h = 4, 0.03, 0.03
            verts, faces = [], []
            for s in range(seg + 1):
                ang = -0.7 + 1.4 * s / seg
                for k in (r, r * 0.8):
                    verts += [(math.cos(ang) * k, math.sin(ang) * k, 0), (math.cos(ang) * k, math.sin(ang) * k, h)]
            for s in range(seg):
                a, b = 4 * s, 4 * (s + 1)
                faces += [(a, b, b + 1, a + 1), (a + 3, b + 3, b + 2, a + 2), (a + 1, b + 1, b + 3, a + 3), (a + 2, b + 2, b, a)]
            faces += [(0, 1, 3, 2), (4 * seg + 2, 4 * seg + 3, 4 * seg + 1, 4 * seg)]
            # Rotated onto its side the arc lies below z = 0: lift it by the radius so it rests on the floor.
            p._add('ore', verts, faces, p.M((x - 0.02, y, r * 0.98), (0, math.pi / 2, p.rnd.random() * 6)))
        else:
            p.box('ore', (0.025 + p.rnd.random() * 0.012, 0.018 + p.rnd.random() * 0.008, 0.005), (x, y, 0.0025), (p.j(0.1), p.j(0.1), p.rnd.random() * 6), 0.3)


def k_bones(p):
    a = p.rnd.random() * math.pi
    L = 0.085 + p.rnd.random() * 0.03
    dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
    p.rod('cloth', (-dx, -dy, 0.007), (dx, dy, 0.007), 0.006, 0.005, 5)
    for s in (-1, 1):
        p.rock('cloth', 0.01, (s * dx, s * dy, 0.002), (1, 1.2, 0.9), a, 0.1, 0.1)
    for i in range(p.rnd.randint(1, 2)):
        x, y = around(p, 0.05, 0.03)
        b = p.rnd.random() * math.pi
        l2 = 0.03 + p.rnd.random() * 0.02
        p.rod('cloth', (x - math.cos(b) * l2 / 2, y - math.sin(b) * l2 / 2, 0.004), (x + math.cos(b) * l2 / 2, y + math.sin(b) * l2 / 2, 0.004), 0.0035, 0.003, 4)


def k_candle(p):
    p.blob('cloth', 0.03, (0, 0, 0), 0.003, 7)
    for i in range(p.rnd.randint(1, 2)):
        x, y = around(p, 0.015) if i else (p.j(0.005), p.j(0.005))
        h = (0.04 if i == 0 else 0.025) * (0.8 + p.rnd.random() * 0.4)
        r = 0.011 if i == 0 else 0.009
        p.rod('cloth', (x, y, 0), (x, y, h), r, r * 0.95, 6)
        p.blade('flame', (x, y, h), 0.016, 0.005, 0.0, 0.0, 0.0)


def k_droppings(p):
    for i in range(p.rnd.randint(3, 5)):
        x, y = around(p, 0.022)
        p.rock('woodDark', 0.006, (x, y, 0.001), (1.3, 0.8, 0.7), p.rnd.random() * 6, 0.15, 0.1)


def k_ore(p):
    for i in range(p.rnd.randint(2, 3)):
        x, y = around(p, 0.035) if i else (0, 0)
        p.rock('ore' if i != 1 else 'rockDark', (0.024 if i == 0 else 0.015) * (0.85 + p.rnd.random() * 0.3), (x, y, 0), (1, 0.9, 0.8), p.rnd.random() * 6, 0.35, 0.25)


def k_coal(p):
    for i in range(p.rnd.randint(4, 6)):
        x, y = around(p, 0.04)
        p.rock('shadow', 0.009 + p.rnd.random() * 0.007, (x, y, 0), (1, 0.9, 0.75), p.rnd.random() * 6, 0.35, 0.2)


def k_scraps(p):
    a = p.rnd.random() * 6
    p.box('iron', (0.07 + p.rnd.random() * 0.02, 0.016, 0.005), (0, 0, 0.003), (0, p.j(0.05), a))
    x, y = around(p, 0.05, 0.03)
    p.ring('iron', 0.016, 0.004, (x, y, 0.0))
    x, y = around(p, 0.05, 0.02)
    b = p.rnd.random() * 6
    p.rod('iron', (x - math.cos(b) * 0.025, y - math.sin(b) * 0.025, 0.003), (x + math.cos(b) * 0.025, y + math.sin(b) * 0.025, 0.003), 0.0025, 0.0018, 4)


def k_reeds(p):
    _tuft(p, ['reed', 'reed', 'leafDark'], p.rnd.randint(7, 10), 0.26, 0.04, 0.05)


def k_chips(p):
    """Wood chips from an axe: thin wedges, pale fresh-cut wood, one darker with bark."""
    for i in range(p.rnd.randint(3, 5)):
        x, y = around(p, 0.035)
        key = 'woodLight' if i % 3 else 'wood'
        L = 0.026 + p.rnd.random() * 0.016
        p.box(key, (L, 0.011 + p.rnd.random() * 0.006, 0.005), (x, y, 0.0025 + i * 0.0009), (p.j(0.18), p.j(0.18), p.rnd.random() * 6), 0.55)


def k_splinters(p):
    for i in range(p.rnd.randint(3, 5)):
        x, y = around(p, 0.02)
        a = p.rnd.random() * math.pi
        L = 0.04 + p.rnd.random() * 0.035
        z = 0.002 + i * 0.001
        p.rod('woodLight' if i % 2 == 0 else 'wood', (x - math.cos(a) * L / 2, y - math.sin(a) * L / 2, z), (x + math.cos(a) * L / 2, y + math.sin(a) * L / 2, z + 0.001), 0.0035, 0.0006, 4)


def k_plank(p):
    """A broken piece of floorboard: pale worn top, darker sides, one end snapped into two
    uneven tongues, a rusty nail head, and a loose splinter beside it."""
    a = p.rnd.random() * math.pi
    L = 0.1 + p.rnd.random() * 0.035
    W, T = 0.036, 0.009
    d = Vector((math.cos(a), math.sin(a), 0))
    n = Vector((-d.y, d.x, 0))
    tilt = p.j(0.05)
    # The board: dark body with a slightly narrower pale top.
    p.box('wood', (L, W, T), (0, 0, T / 2), (tilt, 0, a))
    p.box('woodLight', (L * 0.96, W * 0.82, 0.0015), (0, 0, T + 0.0006), (tilt, 0, a))
    # The snapped end: two tongues of different length.
    for side, ln in ((1, 0.018 + p.rnd.random() * 0.012), (-1, 0.008 + p.rnd.random() * 0.008)):
        c = d * (L / 2 + ln / 2) + n * (side * W / 4)
        p.box('wood', (ln, W / 2 - 0.002, T * 0.85), (c.x, c.y, T * 0.42), (tilt, 0, a + side * 0.05), 0.65)
    # A nail head near the whole end.
    c = -d * (L / 2 - 0.012) + n * p.j(0.008)
    p.rod('iron', (c.x, c.y, T), (c.x, c.y, T + 0.002), 0.0028, 0.0028, 5)
    # A splinter that came off.
    c = d * (L / 2 + 0.01) + n * (W * 0.9 * (1 if p.rnd.random() < 0.5 else -1))
    b = a + p.j(0.6)
    e = Vector((math.cos(b), math.sin(b), 0)) * 0.03
    p.rod('woodLight', (c.x - e.x, c.y - e.y, 0.002), (c.x + e.x, c.y + e.y, 0.0025), 0.0028, 0.0006, 4)


def k_stick(p):
    """A fallen stick: three bent tapering lengths of bark, a knot, one or two side twigs, and a
    pale broken end."""
    a = p.rnd.random() * math.pi
    L = 0.26 + p.rnd.random() * 0.08
    r = 0.008 + p.rnd.random() * 0.003
    pts = [Vector((-math.cos(a), -math.sin(a), 0)) * (L / 2)]
    head = a
    for i in range(3):
        head += p.j(0.28)
        pts.append(pts[-1] + Vector((math.cos(head), math.sin(head), 0)) * (L / 3))
    radii = [r, r * 0.9, r * 0.72, r * 0.55]
    for i in range(3):
        p.rod('wood', (pts[i].x, pts[i].y, radii[i] * 0.95), (pts[i + 1].x, pts[i + 1].y, radii[i + 1] * 0.95), radii[i], radii[i + 1], 6)
    # The thick end is broken: a short pale stub of bare wood.
    d = (pts[0] - pts[1]).normalized()
    tip = pts[0] + d * 0.008
    p.rod('woodLight', (pts[0].x, pts[0].y, r * 0.95), (tip.x, tip.y, r * 0.9), r * 0.92, r * 0.55, 6)
    # A knot at one joint.
    k = pts[1 + p.rnd.randint(0, 1)]
    p.rock('bark', r * 1.15, (k.x, k.y, r * 0.55), (1.2, 1.0, 0.9), head, 0.15, 0.2)
    for i in range(p.rnd.randint(1, 2)):
        j = 1 + (i + p.rnd.randint(0, 1)) % 2
        o = pts[j]
        seg = (pts[j + 1] - pts[j]).normalized()
        side = 1 if (i + p.rnd.randint(0, 1)) % 2 == 0 else -1
        ang = math.atan2(seg.y, seg.x) + side * (0.55 + p.rnd.random() * 0.35)
        l2 = 0.045 + p.rnd.random() * 0.035
        e = o + Vector((math.cos(ang), math.sin(ang), 0)) * l2
        p.rod('bark', (o.x, o.y, radii[j] * 0.8), (e.x, e.y, radii[j] * 0.45), radii[j] * 0.55, radii[j] * 0.28, 5)



def k_pine_cone(p):
    """A pine cone lying on its side: an egg-shaped core in rings of pointed scales that open
    toward the stem, the thick end a little raised."""
    L = 0.058 + p.rnd.random() * 0.012
    R = 0.018 + p.rnd.random() * 0.003
    heading = p.rnd.random() * 6
    turn = Matrix.Rotation(heading, 4, 'Z') @ Matrix.Rotation(-0.12, 4, 'Y')
    lift = R * 0.95
    core = Piece('tmp', 0)
    core.rock('bark', 1.0, (0, 0, 0), (1, 1, 1), 0, 0.08, 0.5)
    for v in core.bm.verts:
        p_ = Vector((v.co.x * L * 0.5, v.co.y * R * 0.75, v.co.z * R * 0.75 + lift))
        v.co = p_
    rings = 5
    for i in range(rings):
        t = (i + 0.5) / rings
        x = (t - 0.5) * L
        rr = R * math.sin(math.pi * (0.12 + 0.82 * t)) * (1.05 - 0.3 * t)
        n = 5
        for k in range(n):
            ang = 2 * math.pi * (k + 0.5 * (i % 2)) / n + p.j(0.15)
            nrm = Vector((0, math.cos(ang), math.sin(ang)))
            base = Vector((x, 0, lift)) + nrm * rr * 0.55
            side = Vector((0, -math.sin(ang), math.cos(ang))) * rr * 0.55
            tip = Vector((x - L * 0.11, 0, lift)) + nrm * rr * 1.08
            back = Vector((x + L * 0.06, 0, lift)) + nrm * rr * 0.45
            key = 'bark' if (i + k) % 3 == 0 else 'wood'
            core._add(key, [tuple(base - side), tuple(base + side), tuple(tip), tuple(back)], [(0, 1, 2), (1, 3, 2), (3, 0, 2), (0, 3, 1)], Matrix.Identity(4))
    # Hand the shapes over to the piece, turned to the heading.
    slot_keys = core.mats
    for f in core.bm.faces:
        vs = [p.bm.verts.new(turn @ v.co) for v in f.verts]
        nf = p.bm.faces.new(vs)
        nf.material_index = p._slot(slot_keys[f.material_index])
    core.bm.free()


KIND_BUILDERS = {
    'pebbles': k_pebbles, 'stick': k_stick, 'leaf-pile': k_leaf_pile, 'chips': k_chips, 'plank': k_plank,
    'straw': k_straw, 'pine-cone': k_pine_cone, 'snow': k_snow, 'tuft': k_tuft, 'shards': k_shards,
}


def collection():
    c = bpy.data.collections.get(COLLECTION)
    if c is None:
        c = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(c)
    for ob in list(c.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    return c


def reach_of(ob):
    return max(math.hypot(v.co.x, v.co.y) for v in ob.data.vertices)


def build_all(kinds=None):
    """Builds every kind's variants in a grid (row per kind, 0.6 apart) and checks their reach."""
    c = collection()
    report = {}
    for row, kind in enumerate(kinds or KIND_BUILDERS):
        out = []
        for n in range(VARIANTS):
            p = Piece(f'{kind}_{n + 1}', zlib.crc32(f'{kind}.{n}'.encode()))
            KIND_BUILDERS[kind](p)
            ob = p.build(c, (n * 0.6, -row * 0.6, 0))
            reach = reach_of(ob)
            # Too wide: shrink it into its reach (keeps the look, never crosses into the outline).
            if reach > REACH[kind]:
                k = REACH[kind] / reach * 0.98
                for v in ob.data.vertices:
                    v.co *= k
                reach = reach_of(ob)
            out.append({'name': ob.name, 'tris': sum(len(f.vertices) - 2 for f in ob.data.polygons), 'reach': round(reach, 4),
                        'height': round(max(v.co.z for v in ob.data.vertices), 4), 'low': round(min(v.co.z for v in ob.data.vertices), 4)})
        report[kind] = out
    return report


def export(report=None):
    report = report or build_all()
    c = bpy.data.collections[COLLECTION]
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    # Exported in place: each object's offset in the grid is cleared for the file and restored.
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


# Preview renders (for checking the kit; not exported) ----------------------------------------------

SNAP_DIR = r'C:/Users/Vova/AppData/Local/Temp/scatter-kit-snaps'


def _materials_to_viewport():
    for m in bpy.data.materials:
        if m.use_nodes:
            b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if b:
                m.diffuse_color = b.inputs['Base Color'].default_value


def snap(name, target=(0, 0, 0), dist=1.0, elev=55, azim=-90, res=(800, 500), lens=50, ortho=None, hide=()):
    """A quick Workbench render (material colours, shadows, cavity) to SNAP_DIR/<name>.png."""
    sc = bpy.context.scene
    _materials_to_viewport()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.render_aa = 'FXAA'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_shadows = True
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    cam = bpy.data.objects.get('snapcam')
    if not cam:
        cam = bpy.data.objects.new('snapcam', bpy.data.cameras.new('snapcam'))
        sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = lens
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho:
        cam.data.ortho_scale = ortho
    t = Vector(target)
    e, a = math.radians(elev), math.radians(azim)
    cam.location = t + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.002
    hidden = [o for o in bpy.data.objects if o.name in hide or any(o.name.startswith(h) for h in hide)]
    for o in hidden:
        o.hide_render = True
    os.makedirs(SNAP_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(SNAP_DIR, name + '.png')
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    return sc.render.filepath


def ground(color=(0.16, 0.1, 0.06, 1), size=16):
    g = bpy.data.objects.get('ground')
    if not g:
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0.9, -3, -0.0005))
        g = bpy.context.object
        g.name = 'ground'
        m = bpy.data.materials.new('ground')
        g.data.materials.append(m)
    g.data.materials[0].diffuse_color = color
    g.data.materials[0].use_nodes = False
    return g


def row_target(kind, kinds=None):
    row = list(kinds or KIND_BUILDERS).index(kind)
    return (0.9, -row * 0.6, 0)
