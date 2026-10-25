# Shared column kit «env-columns» for the `pillar` obstacle. Run in Blender through the MCP after kitlib.py:
#   exec(open(r'C:\Braves\art\blender\env-kit\kitlib.py', encoding='utf8').read())
#   exec(open(r'C:\Braves\art\blender\env-kit\columns.py', encoding='utf8').read())
#   objs = build_columns()
# Four variants at game size (origin at the bottom centre, foot 2 cm under z = 0, about 1.6 tall,
# plinth 0.62 wide), picked per location by src/render/environment/column.ts:
#   column-intact  plinth, moulded base, a shaft of three drums (entasis, chipped edges, a crack), capital
#   column-broken  the same base, a stump with a jagged break, two fallen drums and a chunk beside it
#   column-moss    a taller broken stump overgrown with moss (tops, the foot, a creeping streak), moss clumps
#   column-wood    a chamfered timber post on a stone footing, iron bands, a cap beam on two braces

from mathutils import noise

COL_LOC = 'columns'


def column_paints():
    C = hexc
    # Warm worked stone of the Act I ruins, a touch lighter than the field rocks; darker plinths.
    paint('col_stone', [C('#958b79'), C('#887f70'), C('#9d917d')], C('#262019'), C('#c8bca4'), 'stone', grain=(3, 3), edge=0.5, ao=0.85, streak=(0.8, 1.16), feet=0.5)
    paint('col_stone_dark', [C('#7a7166'), C('#6e675e'), C('#82786a')], C('#1a1612'), C('#bcb2a0'), 'stone', grain=(3, 3), edge=0.6, ao=0.85, feet=0.6)
    # Moss darker and duller than the field rocks' so it sits in the marsh light, not glows.
    paint('col_moss', [C('#56693a'), C('#4c6034'), C('#62723e')], C('#141c0c'), C('#98a868'), 'leaf', grain=(4, 4), edge=0.3, ao=0.75, feet=0.3)
    paint('leaf_green', [C('#6a8a36'), C('#58782e'), C('#7e963c')], C('#1a2610'), C('#d4e68a'), 'leaf', grain=(1.5, 1.5), edge=0.45, ao=0.7, feet=0.2)
    paint('wood', [C('#86684a'), C('#7a6650'), C('#927050')], C('#261a10'), C('#d0b08a'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('wood_dark', [C('#57412e'), C('#4e4034'), C('#5e4430')], C('#1a120a'), C('#a08060'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('iron', [C('#4c4e56'), C('#565258')], C('#16161a'), C('#b0b2bc'), 'metal', grain=(5, 5), edge=0.75)


def shaft(p, paint_name, r0, r1, z0, z1, seg=14, rings=10, seed=1, chip=0.025, joints=(), jag=0.0, crack=True,
          matrix=None, cap_bottom=False, swell=0.04):
    """A round stone shaft from z0 to z1 (radius r0 → r1 with a slight swell), its edges chipped by
    noise, grooves at the drum joints (heights 0..1), a zigzag crack, and a flat or jagged top."""
    bm = p.bm
    rng = random.Random(seed)
    off = Vector((rng.uniform(0, 40), rng.uniform(0, 40), rng.uniform(0, 40)))
    ts = sorted(set([i / rings for i in range(rings + 1)] + [j + d for j in joints for d in (-0.02, 0.0, 0.02)]))
    crack_col = rng.randrange(seg)
    rows = []
    for k, t in enumerate(ts):
        z = z0 + (z1 - z0) * t
        r = (r0 + (r1 - r0) * t) * (1 + swell * math.sin(math.pi * t))
        if any(abs(t - j) < 1e-6 for j in joints):
            r *= 0.95
        # The crack wanders one column left or right every few rings.
        if k % 3 == 0 and k:
            crack_col = (crack_col + rng.choice((-1, 0, 1))) % seg
        row = []
        for j in range(seg):
            a = 2 * math.pi * (j + 0.5 * (k % 2) * 0.0) / seg
            d = Vector((math.cos(a), math.sin(a), 0))
            q = Vector((d.x * 1.3, d.y * 1.3, z * 2.6)) + off
            dent = max(0.0, noise.noise(q * 4.5)) ** 2 * chip * 3.0 + noise.noise(q * 7.0) * chip * 0.25
            rr = r - dent * (1.0 if t > 0.02 else 0.3)
            if crack and j == crack_col and 0.12 < t < 0.88:
                rr -= 0.03
            zz = z
            if jag and k == len(ts) - 1:
                zz -= jag * (0.5 + 0.5 * noise.noise(q * 1.7)) + rng.uniform(0, jag * 0.45)
            elif jag and k == len(ts) - 2:
                zz -= jag * 0.25 * rng.random()
            v = bm.verts.new((d.x * rr, d.y * rr, zz))
            v[p.organic] = 1
            row.append(v)
        rows.append(row)
    faces = []
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            faces.append(bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j])))
    # Top: a flat cap, or a broken face dipping toward a low point off the middle.
    top = rows[-1]
    zt = sum(v.co.z for v in top) / seg
    if jag:
        c = bm.verts.new((rng.uniform(-0.3, 0.3) * r1, rng.uniform(-0.3, 0.3) * r1, zt - jag * 0.15))
        for j in range(seg):
            faces.append(bm.faces.new((top[j], top[(j + 1) % seg], c)))
    else:
        f = bm.faces.new(top)
        faces.append(f)
        f[p.edge] = 1.0
    if cap_bottom:
        faces.append(bm.faces.new(list(reversed(rows[0]))))
    bm.normal_update()
    return p._finish(faces, paint_name, matrix or Matrix.Identity(4), grain_axis=2)


def chunk(p, paint_name, r, pos, scale=(1, 1, 1), rot=(0, 0, 0), seed=3):
    """A broken lump of worked stone: an icosphere cut flat on a few sides."""
    return p.rock(paint_name, r, pos=pos, scale=scale, rot=rot, noise=0.14, rnd=random.Random(seed).random(), subdiv=2)


def moss_cover(p, faces, seed=5, up=0.5, foot=0.1, streak=None):
    """Moss on the upward faces, around the foot and (optionally) a streak climbing one side."""
    mi = p._mat_index('col_moss')
    off = Vector((seed * 3.1, seed * 1.7, seed * 0.9))
    for f in faces:
        if not f.is_valid:
            continue
        c = f.calc_center_median()
        n = f.normal
        patch = noise.fractal(c * 3.0 + off, 0.6, 2.0, 3)
        hit = (n.z > up - patch * 0.5 and patch > 0.0) or (c.z < foot + patch * 0.25)
        if streak is not None and not hit:
            a = math.atan2(c.y, c.x)
            da = abs((a - streak + math.pi) % (2 * math.pi) - math.pi)
            hit = (da < 0.6 + patch * 0.7 and c.z < 1.0 + patch * 0.3) or patch > 0.32
        if hit:
            f.material_index = mi


def stone_base(p, seed, dark=True, tilt=0.0):
    """Square plinth and a two-step moulded base: everything below z = 0.25."""
    rng = random.Random(seed)
    pl = 'col_stone_dark' if dark else 'col_stone'
    fs = p.box(pl, (0.62, 0.62, 0.17), pos=(0, 0, 0.065), rot=(tilt, tilt * 0.6, rng.uniform(-0.04, 0.04)), bevel=0.03, jitter=0.014)
    fs += p.cyl('col_stone', 0.285, 0.27, 0.06, seg=14, pos=(0, 0, 0.15), bevel=0.018, jitter=0.004)
    fs += p.cyl('col_stone', 0.25, 0.235, 0.05, seg=14, pos=(0, 0, 0.21), bevel=0.014, jitter=0.004)
    return fs


def column_intact(p):
    fs = stone_base(p, 11)
    fs += shaft(p, 'col_stone', 0.215, 0.19, 0.25, 1.36, seed=12, joints=(0.36, 0.7), chip=0.02)
    # Capital: a flared echinus and a square abacus with a chipped corner.
    fs += p.cyl('col_stone', 0.19, 0.265, 0.1, seg=14, pos=(0, 0, 1.355), bevel=0.012, jitter=0.004)
    fs += p.box('col_stone_dark', (0.56, 0.56, 0.12), pos=(0, 0, 1.515), bevel=0.028, jitter=0.016)
    return fs


def column_broken(p):
    fs = stone_base(p, 21, tilt=0.03)
    fs += shaft(p, 'col_stone', 0.215, 0.205, 0.25, 0.86, seed=22, joints=(0.58,), jag=0.2, chip=0.028)
    # Fallen drums: one lying on the ground in front-right, a shorter broken one leaning on the plinth.
    fs += shaft(p, 'col_stone', 0.19, 0.19, -0.17, 0.17, seg=14, rings=4, seed=23, crack=False, cap_bottom=True, swell=0.0,
                matrix=Matrix.LocRotScale(Vector((0.5, -0.12, 0.17)), Euler((math.pi / 2, 0, 0.5)), Vector((1, 1, 1))))
    fs += chunk(p, 'col_stone', 0.13, (-0.36, -0.36, 0.08), scale=(1.3, 1.0, 1.0), rot=(0, 0, 0.6), seed=24)
    fs += chunk(p, 'col_stone', 0.11, (-0.42, 0.18, 0.06), scale=(1.2, 0.95, 1.0), seed=25)
    fs += chunk(p, 'col_stone_dark', 0.08, (0.18, -0.42, 0.04), scale=(1.1, 1, 1.0), seed=26)
    return fs


def column_moss(p):
    fs = stone_base(p, 31, tilt=-0.04)
    fs += shaft(p, 'col_stone', 0.215, 0.2, 0.25, 1.2, seed=32, joints=(0.4, 0.78), jag=0.24, chip=0.03)
    fs += shaft(p, 'col_stone', 0.19, 0.19, -0.16, 0.16, seg=14, rings=4, seed=33, crack=False, cap_bottom=True, swell=0.0,
                matrix=Matrix.LocRotScale(Vector((-0.46, -0.16, 0.15)), Euler((math.pi / 2, 0, -0.35)), Vector((1, 1, 1))))
    moss_cover(p, fs, seed=34, streak=2.2)
    # Clumps of moss at the foot.
    p.blob('col_moss', 0.08, pos=(0.33, -0.31, -0.01), scale=(1.4, 1.1, 0.6), subdiv=2, noise=0.16, flat_bottom=True)
    p.blob('col_moss', 0.06, pos=(-0.32, 0.33, -0.01), scale=(1.3, 1.2, 0.6), subdiv=2, noise=0.16, flat_bottom=True)
    return fs


def column_wood(p):
    fs = p.box('col_stone_dark', (0.5, 0.5, 0.2), pos=(0, 0, 0.08), bevel=0.03, jitter=0.014)
    fs += p.box('wood', (0.3, 0.3, 1.24), pos=(0, 0, 0.8), bevel=0.035, jitter=0.008, grain=2, taper=0.04)
    for z in (0.42, 1.1):
        fs += p.box('iron', (0.33, 0.33, 0.05), pos=(0, 0, z), bevel=0.008)
    # Cap beam on top and two braces under it.
    fs += p.box('wood_dark', (0.7, 0.26, 0.15), pos=(0, 0, 1.495), bevel=0.025, jitter=0.01, grain=0)
    for s in (-1, 1):
        fs += p.box('wood_dark', (0.32, 0.12, 0.1), pos=(s * 0.235, 0, 1.3), rot=(0, -s * 0.93, 0), bevel=0.02, jitter=0.006, grain=0)
    return fs


VARIANTS = (('column-intact', column_intact), ('column-broken', column_broken), ('column-moss', column_moss), ('column-wood', column_wood))


def build_columns():
    column_paints()
    coll = collection(COL_LOC)
    objs = []
    for i, (name, fn) in enumerate(VARIANTS):
        p = Piece(f'{COL_LOC}.{name}', seed=40 + i)
        p.smooth = 40
        fn(p)
        ob = p.build(collection=coll, ao_dist=0.3, cvx=(0.08, 0.4))
        ob.location = (i * 1.2 - 1.8, 0, 0)
        objs.append(ob)
    return objs
