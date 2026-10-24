# Watchtower kit (scenario 4, «Стара сторожова вежа»). Run in Blender through the MCP after kitlib.py
# and cellar.py (reuses its masonry helpers with the tower's grey paints):
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\cellar.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\watchtower.py', encoding='utf8').read())
#   build_watchtower()
# Wall height 1.8 (data/environments/watchtower.json walls.height), low wall 0.32.

TH = 1.8
TLOW = 0.32


def tower_paints():
    C = hexc
    paint('stone', [C('#86817c'), C('#76736f'), C('#8a8076')], C('#1c1a1a'), C('#cfcac0'), 'stone', grain=(3, 3), edge=0.45)
    paint('stone_dark', [C('#625e5c'), C('#56524f'), C('#625a54')], C('#161414'), C('#aaa49a'), 'stone', grain=(3, 3), edge=0.4)
    paint('mortar', [C('#3a3636'), C('#423c3a')], C('#141212'), C('#5e5856'), 'stone', grain=(4, 4), edge=0.1, ao=0.5)
    paint('wood', [C('#7a5638'), C('#86603c'), C('#6e4e34')], C('#24160c'), C('#c89a68'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('wood_dark', [C('#4e3828'), C('#58402c')], C('#180e08'), C('#98744e'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('iron', [C('#44464e'), C('#4c4850')], C('#121216'), C('#a8aab4'), 'metal', grain=(5, 5), edge=0.75)
    paint('cloth', [C('#cdbb98'), C('#bca886')], C('#5e4c34'), C('#f4e6c4'), 'soft', grain=(3, 3), edge=0.3, feet=0.1)
    paint('blanket', [C('#4c5468'), C('#5a4e6a'), C('#465a5e')], C('#14161e'), C('#9aa4c0'), 'soft', grain=(3, 3), edge=0.35, feet=0.1)
    paint('banner_black', [C('#2a2630'), C('#302a36')], C('#0c0a10'), C('#6a6274'), 'soft', grain=(2, 8), edge=0.35, ao=0.5, feet=0.0)
    paint('banner_violet', [C('#4c2a66'), C('#5a3276'), C('#462860')], C('#160a20'), C('#a080c8'), 'soft', grain=(2, 8), edge=0.35, ao=0.5, feet=0.0)
    paint('rune', [C('#e6d6ff')], C('#8a5ad8'), C('#b48aff'), 'emit')
    paint('glow_cold', [C('#e4eeff')], C('#7a94c8'), C('#9fb4d8'), 'emit')
    paint('flame', [C('#ffe08a')], C('#ff6a10'), C('#ff7418'), 'emit')
    paint('shadow', [C('#161418')], C('#08080a'), C('#24222a'), 'soft', grain=(2, 2), edge=0.0, ao=0.0, feet=0.0)
    paint('straw', [C('#c9a560'), C('#b89450')], C('#4a3818'), C('#f8e4a8'), 'wood', grain=(10, 1.5), edge=0.4)


def tower_wall(name='watchtower.tower-wall', h=TH, seed=201):
    """Big dressed blocks in regular courses (more regular than the cellar's rubble stone)."""
    p = Piece(name, seed)
    wall_core(p, h)
    plinth(p, seed=seed)
    stone_courses(p, -WALL_LEN / 2, WALL_LEN / 2, 0.2, h - 0.12, seed=seed, row_h=(0.26, 0.34), w=(0.32, 0.5), jitter=0.012, bulge=0.015)
    coping(p, h, seed=seed)
    return p


def tower_slit(name='watchtower.tower-slit', h=TH, seed=203):
    """Wall with an arrow slit: deep dark recess and a sliver of cold daylight."""
    p = Piece(name, seed)
    sx0, sz0, sz1 = 0.07, 0.75, 1.42
    cd = DEPTH - 0.05
    p.box('mortar', (WALL_LEN / 2 - 0.2, cd, h - 0.02), (-(WALL_LEN / 2 + 0.2) / 2, 0.05 + cd / 2, h / 2 - 0.01), drop_bottom=True)
    p.box('mortar', (WALL_LEN / 2 - 0.2, cd, h - 0.02), ((WALL_LEN / 2 + 0.2) / 2, 0.05 + cd / 2, h / 2 - 0.01), drop_bottom=True)
    p.box('mortar', (0.4, cd, sz0), (0, 0.05 + cd / 2, sz0 / 2), drop_bottom=True)
    p.box('mortar', (0.4, cd, h - sz1), (0, 0.05 + cd / 2, sz1 + (h - sz1) / 2))
    plinth(p, seed=seed)
    stone_courses(p, -WALL_LEN / 2, WALL_LEN / 2, 0.2, h - 0.12, seed=seed, row_h=(0.26, 0.34), w=(0.32, 0.5), jitter=0.012, bulge=0.015,
                  holes=[(-0.22, 0.22, sz0 - 0.08, sz1 + 0.1)])
    # Splayed jambs, lintel and sill around the slit.
    for sx in (-1, 1):
        for k, (z0, z1) in enumerate(((sz0 - 0.08, sz0 + 0.3), (sz0 + 0.3, sz1 + 0.1))):
            p.box('stone', (0.14, 0.2, z1 - z0 - 0.025), (sx * 0.15, 0.08, (z0 + z1) / 2), rot=(0, 0, sx * 0.35), bevel=0.03, jitter=0.01)
    p.box('stone', (0.5, 0.2, 0.14), (0, 0.08, sz1 + 0.17), bevel=0.035, jitter=0.01)
    p.box('stone_dark', (0.46, 0.24, 0.08), (0, 0.06, sz0 - 0.12), bevel=0.025, jitter=0.01)
    p.box('shadow', (0.2, 0.02, sz1 - sz0 + 0.1), (0, 0.17, (sz0 + sz1) / 2))
    p.box('glow_cold', (2 * sx0 * 0.5, 0.02, sz1 - sz0 - 0.08), (0, 0.15, (sz0 + sz1) / 2))
    coping(p, h, seed=seed)
    return p


def torch_head(p, x, y, z, s=1.0):
    """Wrapped torch head with a big flame."""
    p.cyl('wood_dark', 0.03 * s, 0.045 * s, 0.16 * s, 6, (x, y, z))
    p.cyl('cloth', 0.055 * s, 0.05 * s, 0.09 * s, 6, (x, y, z + 0.1 * s), bevel=0.01)
    p.blob('flame', 0.07 * s, (x, y, z + 0.27 * s), scale=(1, 1, 2.0), noise=0.08, emit_uv=True)
    p.blob('flame', 0.045 * s, (x + 0.03 * s, y - 0.02 * s, z + 0.24 * s), scale=(1, 1, 1.7), noise=0.08, emit_uv=True)


def torch_stand(name='watchtower.torch', seed=211):
    """Free-standing iron torch stand (tripod foot); flame top ≈ 1.42."""
    p = Piece(name, seed)
    p.smooth = 50
    for i in range(3):
        a = 2 * math.pi * i / 3
        p.tube('iron', [(0, 0, 0.32), (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.08), (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.0)], [0.022, 0.02, 0.018], seg=5)
    p.tube('iron', [(0, 0, 0.0), (0, 0, 1.1)], [0.025, 0.022], seg=6)
    p.cyl('iron', 0.09, 0.05, 0.08, 6, (0, 0, 1.06), caps=True)
    for i in range(4):
        a = 2 * math.pi * i / 4
        p.box('iron', (0.015, 0.015, 0.16), (math.cos(a) * 0.08, math.sin(a) * 0.08, 1.18), rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, 0))
    torch_head(p, 0, 0, 1.1, 1.0)
    return p


def torch_sconce(name='watchtower.torch-sconce', seed=213):
    """Wall decoration: iron bracket on the wall face holding a torch; flame at ≈ (0, 1.42, 0.2)."""
    p = Piece(name, seed)
    p.smooth = 50
    p.box('iron', (0.12, 0.03, 0.22), (0, -0.015, 1.05), bevel=0.008)
    for z in (0.98, 1.12):
        p.cyl('iron', 0.012, 0.012, 0.02, 5, (0, -0.03, z), rot=(math.pi / 2, 0, 0))
    p.tube('iron', [(0, -0.03, 1.0), (0, -0.14, 1.06), (0, -0.2, 1.14)], [0.018, 0.016, 0.015], seg=5)
    p.cyl('iron', 0.06, 0.045, 0.06, 6, (0, -0.2, 1.12))
    torch_head(p, 0, -0.2, 1.12, 0.9)
    return p


def cloth_panel(p, paint_name, w, h, pos, nx=4, nz=6, wave=0.03, tail=0.0, seed=0, thick=0.012):
    """Hanging cloth: a gently waving grid with front and back sheets; optional swallow-tail cut."""
    bm = p.bm
    rng = random.Random(seed)
    x0, y0, z0 = pos
    grid = []
    for j in range(nz + 1):
        row = []
        t = j / nz
        for i in range(nx + 1):
            u = i / nx
            z = z0 - t * h
            if j == nz and tail:
                z += tail * (1 - abs(u - 0.5) * 2)   # swallow tail: the middle cut up
            y = y0 + math.sin(u * math.pi * 2 + t * 3 + seed) * wave * (0.3 + t)
            row.append(Vector((x0 + (u - 0.5) * w, y, z)))
        grid.append(row)
    faces = []
    for side, off in ((0, -thick / 2), (1, thick / 2)):
        vs = [[bm.verts.new(v + Vector((0, off, 0))) for v in row] for row in grid]
        for j in range(nz):
            for i in range(nx):
                q = (vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i])
                faces.append(bm.faces.new(q if side else tuple(reversed(q))))
    p._finish(faces, paint_name, Matrix.Identity(4), grain_axis=2)
    bm.normal_update()
    return faces


def banner(name='watchtower.banner', seed=221):
    """Standing banner of the Gloom: black cloth with a violet band and a glowing rune; pole at z = −0.1."""
    p = Piece(name, seed)
    p.smooth = 60
    py = 0.1
    p.cyl('iron', 0.18, 0.2, 0.05, 6, (0, py, 0), bevel=0.01)
    p.tube('iron', [(0, py, 0.0), (0, py, 1.92)], [0.026, 0.022], seg=6)
    p.blob('iron', 0.04, (0, py, 1.95), scale=(1, 1, 1.3), subdiv=1, noise=0.0)
    p.tube('iron', [(-0.32, py - 0.03, 1.8), (0.32, py - 0.03, 1.8)], [0.016, 0.016], seg=5, cap_start=True)
    for x in (-0.32, 0.32):
        p.blob('iron', 0.025, (x, py - 0.03, 1.8), subdiv=1, noise=0.0)
    cloth_panel(p, 'banner_black', 0.52, 1.0, (0, py - 0.05, 1.78), wave=0.025, tail=0.18, seed=seed)
    cloth_panel(p, 'banner_violet', 0.16, 0.98, (0, py - 0.065, 1.78), nx=2, wave=0.025, tail=0.12, seed=seed)
    p.box('rune', (0.1, 0.012, 0.1), (0, py - 0.085, 1.42), rot=(0, math.pi / 4, 0))
    p.box('banner_violet', (0.16, 0.014, 0.16), (0, py - 0.078, 1.42), rot=(0, math.pi / 4, 0))
    return p


def bunk(name='watchtower.bunk', seed=231):
    """Two-tier barracks bunk standing on a hex (obstacle): 0.66 × 1.04, top rail at 1.3."""
    p = Piece(name, seed)
    W, Lb = 0.62, 1.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box('wood_dark', (0.07, 0.07, 1.32), (sx * W / 2, sy * Lb / 2, 0.66), bevel=0.012, grain=2, drop_bottom=True)
    for z in (0.3, 0.92):
        for sx in (-1, 1):
            p.box('wood', (0.05, Lb, 0.09), (sx * (W / 2 - 0.01), 0, z), bevel=0.012, grain=1)
        for sy in (-1, 1):
            p.box('wood', (W, 0.05, 0.12), (0, sy * (Lb / 2 - 0.01), z + 0.02), bevel=0.012, grain=0)
        p.box('cloth', (W - 0.08, Lb - 0.08, 0.08), (0, 0, z + 0.07), bevel=0.03, jitter=0.01)
        p.box('blanket', (W - 0.04, Lb * 0.55, 0.05), (0, -0.16, z + 0.12), rot=(0.02, 0, 0.03), bevel=0.02, jitter=0.012)
        p.blob('cloth', 0.13, (0, Lb / 2 - 0.17, z + 0.15), scale=(1.7, 0.9, 0.5), subdiv=2, noise=0.06)
    p.box('wood_dark', (W + 0.04, 0.05, 0.08), (0, -Lb / 2, 1.26), bevel=0.01, grain=0)
    # Ladder at the foot.
    for k in range(3):
        p.box('wood', (0.05, 0.36, 0.04), (W / 2 + 0.03, -Lb / 2 + 0.25, 0.42 + k * 0.2), rot=(0, 0, 0), bevel=0.008, grain=1)
    return p


def spiral_stairs(name='watchtower.spiral-stairs', seed=241, h=TH):
    """Segment of a spiral stair round a stone newel, climbing a 270° turn to h (exit upstairs)."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    n = 12
    rise = h / n
    p.cyl('stone_dark', 0.16, 0.16, 0.1, 8, (0, 0, 0), bevel=0.02)
    z = 0
    i = 0
    while z < h + 0.2:
        bh = min(0.28, h + 0.25 - z)
        p.cyl('stone', 0.13, 0.13, bh - 0.02, 8, (0, 0, z + 0.01), bevel=0.02, jitter=0.006)
        z += bh
        i += 1
    for i in range(n):
        a = math.radians(-90 + i * 270 / (n - 1))
        c, s = math.cos(a), math.sin(a)
        zt = rise * (i + 1)
        p.box('stone', (0.7, 0.32, 0.12), (c * 0.45, s * 0.45, zt - 0.06), rot=(0, 0, a), bevel=0.03, jitter=0.01)
        if i < 4:
            # The lowest steps sit on solid blocks; higher ones hang from the newel.
            p.box('stone_dark', (0.62, 0.26, zt - 0.12), (c * 0.45, s * 0.45, (zt - 0.12) / 2), rot=(0, 0, a), bevel=0.02, jitter=0.008, drop_bottom=True)
    # A rope rail on iron eyes along the outside.
    pts = []
    for k in range(7):
        a = math.radians(-90 + k * 270 / 6)
        pts.append((math.cos(a) * 0.82, math.sin(a) * 0.82, rise * (1 + k * (n - 1) / 6) + 0.75))
    for q in pts[::2]:
        p.tube('iron', [(q[0], q[1], q[2] - 0.75), q], [0.018, 0.016], seg=5)
    p.tube('straw', pts, [0.02] * len(pts), seg=5)
    return p


def rubble(name='watchtower.rubble', seed=251):
    """Fallen blocks and chips from the tower wall."""
    p = Piece(name, seed)
    rng = random.Random(seed)
    for i, (x, y, s) in enumerate(((-0.15, 0.0, 1.0), (0.18, 0.1, 0.8), (0.05, -0.18, 0.6), (-0.3, -0.15, 0.5))):
        p.box('stone' if i % 2 == 0 else 'stone_dark', (0.3 * s, 0.24 * s, 0.2 * s), (x, y, 0.1 * s), rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 3)),
              bevel=0.03 * s, jitter=0.02 * s)
    p.box('stone', (0.26, 0.2, 0.18), (0.02, 0.02, 0.26), rot=(0.4, -0.2, 0.7), bevel=0.03, jitter=0.02)
    for k in range(5):
        p.rock('stone_dark', rng.uniform(0.04, 0.07), (rng.uniform(-0.4, 0.4), rng.uniform(-0.3, 0.3), 0.02), scale=(1.2, 1, 0.7))
    return p


def weapon_rack(name='watchtower.weapon-rack', seed=261):
    """Wooden rack against the wall (back at z = −0.3) with spears and a round shield."""
    p = Piece(name, seed)
    p.smooth = 50
    for x in (-0.42, 0.42):
        p.box('wood_dark', (0.07, 0.07, 1.15), (x, 0.22, 0.575), bevel=0.012, grain=2, drop_bottom=True)
        p.box('wood_dark', (0.08, 0.34, 0.06), (x, 0.12, 0.03), bevel=0.012, grain=1)
    p.box('wood_dark', (0.92, 0.08, 0.08), (0, 0.2, 1.0), bevel=0.012, grain=0)
    p.box('wood', (0.92, 0.2, 0.05), (0, 0.12, 0.3), bevel=0.012, grain=0)
    for i in range(4):
        x = -0.3 + i * 0.2
        p.tube('wood', [(x, 0.08, 0.32), (x, 0.2, 1.3)], [0.018, 0.016], seg=5)
        p.cone('iron', 0.035, 0.16, 4, (x, 0.2 + 0.016, 1.3), rot=(-0.12, 0, math.pi / 4))
    p.cyl('wood', 0.22, 0.22, 0.04, 10, (0.0, 0.06, 0.62), rot=(math.pi / 2 - 0.15, 0, 0), bevel=0.012)
    p.cyl('iron', 0.06, 0.06, 0.03, 8, (0.0, 0.02, 0.62), rot=(math.pi / 2 - 0.15, 0, 0), bevel=0.01)
    return p


def tower_pieces():
    return [
        lambda: tower_wall(),
        lambda: tower_slit(),
        lambda: stone_wall_low('watchtower.tower-wall-low', h=TLOW, seed=205),
        lambda: pillar('watchtower.tower-pillar', TH, seed=207),
        lambda: pillar('watchtower.tower-pillar-low', TLOW, seed=208, low=True),
        lambda: stone_doorway('watchtower.tower-doorway', h=TH, seed=209),
        lambda: spiral_stairs(),
        lambda: bunk(),
        lambda: banner(),
        lambda: torch_stand(),
        lambda: torch_sconce(),
        lambda: rubble(),
        lambda: weapon_rack(),
    ]


def build_watchtower():
    tower_paints()
    c = collection('watchtower')
    objs = []
    for i, make in enumerate(tower_pieces()):
        objs.append(make().build(((i % 5) * 1.8, (i // 5) * 2.4, 0), c))
    return objs


def tower_diorama():
    c = collection('watchtower-diorama')
    for o in list(c.objects):
        bpy.data.objects.remove(o)
    floor(c, os.path.join(TEX_DIR, 'cobblestone.1024.webp'), tint=hexc('#8a8680'))
    bpy.data.objects['dio.floor'].visible_shadow = False
    hex_tiles(c, [(0, 0), (-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)], paint_hex='#6e6a66')
    back = [(-SQ3, 0), (0, 0), (SQ3, 0)]
    walls = ['tower-wall', 'tower-slit', 'tower-wall', 'tower-doorway', 'tower-slit', 'tower-wall']
    k = 0
    for cx, cy in back:
        cen = Vector((cx, cy, 0))
        for a, b in ((2, 1), (1, 0)):
            wall_on_edge('watchtower.' + walls[k], c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            if k in (0, 5):
                wall_on_edge('watchtower.torch-sconce', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
            k += 1
        for v in (2, 1):
            place('watchtower.tower-pillar', c, hex_vertex(cx, cy, v))
    place('watchtower.tower-pillar', c, hex_vertex(SQ3, 0, 0))
    wall_on_edge('watchtower.tower-wall', c, hex_vertex(-SQ3, 0, 2), hex_vertex(-SQ3, 0, 3), Vector((-SQ3, 0, 0)))
    wall_on_edge('watchtower.tower-wall', c, hex_vertex(SQ3, 0, 5), hex_vertex(SQ3, 0, 0), Vector((SQ3, 0, 0)))
    place('watchtower.tower-pillar', c, hex_vertex(-SQ3, 0, 3))
    place('watchtower.tower-pillar', c, hex_vertex(SQ3, 0, 5))
    for cx, cy in ((-SQ3 / 2, -1.5), (SQ3 / 2, -1.5)):
        cen = Vector((cx, cy, 0))
        for a, b in ((3, 4), (4, 5)):
            wall_on_edge('watchtower.tower-wall-low', c, hex_vertex(cx, cy, a), hex_vertex(cx, cy, b), cen)
        for v in (3, 4, 5):
            place('watchtower.tower-pillar-low', c, hex_vertex(cx, cy, v))
    place('watchtower.bunk', c, (-SQ3, 0, 0), math.radians(30))
    place('watchtower.spiral-stairs', c, (SQ3, 0.05, 0), math.radians(200))
    place('watchtower.banner', c, (-0.55, 0.62, 0), math.radians(-30))
    place('watchtower.banner', c, (0.55, 0.62, 0), math.radians(30))
    place('watchtower.weapon-rack', c, (-2.2, -0.75, 0), math.radians(-90))
    place('watchtower.torch', c, (2.25, -1.0, 0))
    place('watchtower.rubble', c, (-0.2, -2.9, 0))
    return c

