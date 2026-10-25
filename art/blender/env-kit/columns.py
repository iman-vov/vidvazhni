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
    # The same stone for the overgrown column: weather() paints soft moss into these two.
    paint('col_stone_mossy', [C('#958b79'), C('#887f70'), C('#9d917d')], C('#262019'), C('#c8bca4'), 'stone', grain=(3, 3), edge=0.5, ao=0.85, streak=(0.8, 1.16), feet=0.5)
    paint('col_stone_dark_mossy', [C('#7a7166'), C('#6e675e'), C('#82786a')], C('#1a1612'), C('#bcb2a0'), 'stone', grain=(3, 3), edge=0.6, ao=0.85, feet=0.6)
    # Moss darker and duller than the field rocks' so it sits in the marsh light, not glows.
    paint('col_moss', [C('#3e4a28'), C('#384426'), C('#46522c')], C('#11160a'), C('#7a8458'), 'leaf', grain=(4, 4), edge=0.3, ao=0.75, feet=0.3)
    paint('leaf_green', [C('#6a8a36'), C('#58782e'), C('#7e963c')], C('#1a2610'), C('#d4e68a'), 'leaf', grain=(1.5, 1.5), edge=0.45, ao=0.7, feet=0.2)
    paint('wood', [C('#86684a'), C('#7a6650'), C('#927050')], C('#261a10'), C('#d0b08a'), 'wood', grain=(9, 1.3), edge=0.55)
    paint('wood_dark', [C('#57412e'), C('#4e4034'), C('#5e4430')], C('#1a120a'), C('#a08060'), 'wood', grain=(9, 1.3), edge=0.5)
    paint('iron', [C('#4c4e56'), C('#565258')], C('#16161a'), C('#b0b2bc'), 'metal', grain=(5, 5), edge=0.75)


def shaft(p, paint_name, r0, r1, z0, z1, seg=14, rings=10, seed=1, chip=0.025, joints=(), jag=0.0, crack=1,
          matrix=None, cap_bottom=False, swell=0.04):
    """A round stone shaft from z0 to z1 (radius r0 → r1 with a slight swell), its edges chipped by
    noise, grooves at the drum joints (heights 0..1), `crack` zigzag cracks, and a flat or jagged top."""
    bm = p.bm
    rng = random.Random(seed)
    off = Vector((rng.uniform(0, 40), rng.uniform(0, 40), rng.uniform(0, 40)))
    ts = sorted(set([i / rings for i in range(rings + 1)] + [j + d for j in joints for d in (-0.02, 0.0, 0.02)]))
    cracks = [rng.randrange(seg) for _ in range(int(crack))]
    rows = []
    for k, t in enumerate(ts):
        z = z0 + (z1 - z0) * t
        r = (r0 + (r1 - r0) * t) * (1 + swell * math.sin(math.pi * t))
        if any(abs(t - j) < 1e-6 for j in joints):
            r *= 0.95
        # Each crack wanders one column left or right every few rings.
        if k % 3 == 0 and k:
            cracks = [(c + rng.choice((-1, 0, 1))) % seg for c in cracks]
        row = []
        for j in range(seg):
            a = 2 * math.pi * (j + 0.5 * (k % 2) * 0.0) / seg
            d = Vector((math.cos(a), math.sin(a), 0))
            q = Vector((d.x * 1.3, d.y * 1.3, z * 2.6)) + off
            dent = max(0.0, noise.noise(q * 4.5)) ** 2 * chip * 3.0 + noise.noise(q * 7.0) * chip * 0.25
            rr = r - dent * (1.0 if t > 0.02 else 0.3)
            if j in cracks and 0.12 < t < 0.88:
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


def weather(paint_name, moss=False, streak=2.2):
    """Ages a stone paint at bake time: warm grey and ochre stains, dark rain streaks running down,
    fine cracks; with `moss`, soft olive moss on the tops, in the crevices, around the foot and up one
    side, its edge broken up by noise so it fades into the stone (no hard face borders)."""
    m = bpy.data.materials['paint.' + paint_name]
    nt = m.node_tree
    L = nt.links
    em = next(n for n in nt.nodes if n.type == 'EMISSION')
    c = em.inputs['Color'].links[0].from_socket

    def N(t):
        return nt.nodes.new(t)

    def rng(v, a, b, lo, hi):
        n = N('ShaderNodeMapRange')
        n.inputs['From Min'].default_value = a; n.inputs['From Max'].default_value = b
        n.inputs['To Min'].default_value = lo; n.inputs['To Max'].default_value = hi
        L.new(v, n.inputs['Value'])
        return n.outputs[0]

    def mixc(a, b, f):
        n = N('ShaderNodeMix'); n.data_type = 'RGBA'
        L.new(a, n.inputs['A'])
        if isinstance(b, (list, tuple)):
            n.inputs['B'].default_value = b
        else:
            L.new(b, n.inputs['B'])
        L.new(f, n.inputs['Factor'])
        return n.outputs['Result']

    def op(kind, a, b):
        n = N('ShaderNodeMath'); n.operation = kind
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]

    def tex(scale, vec, detail=3.0, stretch=None):
        if stretch:
            mp = N('ShaderNodeMapping'); mp.inputs['Scale'].default_value = stretch
            L.new(vec, mp.inputs[0]); vec = mp.outputs[0]
        n = N('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
        L.new(vec, n.inputs['Vector'])
        return n.outputs['Fac']

    geo = N('ShaderNodeNewGeometry')
    pos, nrm = geo.outputs['Position'], geo.outputs['Normal']
    sp = N('ShaderNodeSeparateXYZ'); L.new(pos, sp.inputs[0])
    sn = N('ShaderNodeSeparateXYZ'); L.new(nrm, sn.inputs[0])
    C = hexc
    # Stains: broad warm-grey and ochre patches, then rain streaks stretched down the stone.
    c = mixc(c, C('#a08a62'), rng(tex(2.0, pos), 0.45, 0.66, 0.0, 0.58))
    c = mixc(c, C('#7e7466'), rng(tex(3.1, pos, 4.0), 0.45, 0.3, 0.0, 0.45))
    c = mixc(c, C('#4a4238'), rng(tex(2.6, pos, 4.0, (5.0, 5.0, 0.9)), 0.56, 0.7, 0.0, 0.4))
    # Fine cracks: thin Voronoi borders, only in some places.
    vo = N('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 5.5
    L.new(pos, vo.inputs['Vector'])
    crack = op('MULTIPLY', rng(vo.outputs['Distance'], 0.0, 0.018, 0.8, 0.0), rng(tex(1.4, pos), 0.57, 0.64, 0.0, 1.0))
    c = mixc(c, C('#2a231c'), crack)
    if moss:
        ao = N('ShaderNodeAttribute'); ao.attribute_name = 'ao'; ao.attribute_type = 'GEOMETRY'
        # Tops only in patches: large blotches decide where the moss took hold.
        up = op('MULTIPLY', rng(sn.outputs[2], 0.35, 0.9, 0.0, 1.0), rng(tex(2.4, pos, 3.0), 0.44, 0.6, 0.0, 1.0))
        nook = rng(ao.outputs['Fac'], 0.12, 0.5, 0.0, 0.9)
        foot = op('MULTIPLY', rng(sp.outputs[2], 0.24, 0.02, 0.0, 0.85), rng(tex(3.0, pos, 3.0), 0.38, 0.56, 0.2, 1.0))
        # One side, facing `streak`, greener (the damp side), fading out with height.
        d = N('ShaderNodeVectorMath'); d.operation = 'DOT_PRODUCT'
        L.new(nrm, d.inputs[0]); d.inputs[1].default_value = (math_cos(streak), math_sin(streak), 0.0)
        side = op('MULTIPLY', rng(d.outputs['Value'], 0.1, 0.8, 0.0, 0.75), rng(sp.outputs[2], 1.1, 0.4, 0.0, 1.0))
        base = op('MAXIMUM', op('MAXIMUM', up, nook), op('MAXIMUM', foot, side))
        # Break the edge up with noise and keep the fade soft.
        f = op('ADD', base, rng(tex(5.0, pos, 6.0), 0.3, 0.7, -0.8, 0.45))
        f = rng(f, 0.3, 0.75, 0.0, 0.95)
        # Moss colour: the rocks' olive, darker in its own clumps.
        mn = N('ShaderNodeMix'); mn.data_type = 'RGBA'
        mn.inputs['A'].default_value = C('#343f22'); mn.inputs['B'].default_value = C('#566636')
        L.new(rng(tex(9.0, pos, 2.0), 0.3, 0.7, 0.0, 1.0), mn.inputs['Factor'])
        mc = mn.outputs['Result']
        # A 'leaf' tuft texture: brighter tips scattered over the moss.
        mc = mixc(mc, C('#66703e'), rng(tex(22.0, pos, 2.0), 0.62, 0.72, 0.0, 0.5))
        c = mixc(c, mc, f)
    L.new(c, em.inputs['Color'])


math_cos, math_sin = math.cos, math.sin


def stone_base(p, seed, tilt=0.0, st='col_stone', dk='col_stone_dark', jitter=0.014):
    """Square plinth and a two-step moulded base: everything below z = 0.25."""
    rng = random.Random(seed)
    fs = p.box(dk, (0.62, 0.62, 0.17), pos=(0, 0, 0.065), rot=(tilt, tilt * 0.6, rng.uniform(-0.04, 0.04)), bevel=0.03, jitter=jitter)
    fs += p.cyl(st, 0.285, 0.27, 0.06, seg=14, pos=(0, 0, 0.15), bevel=0.018, jitter=jitter * 0.4)
    fs += p.cyl(st, 0.25, 0.235, 0.05, seg=14, pos=(0, 0, 0.21), bevel=0.014, jitter=jitter * 0.4)
    return fs


def column_intact(p):
    fs = stone_base(p, 11)
    fs += shaft(p, 'col_stone', 0.215, 0.19, 0.25, 1.36, seed=12, joints=(0.36, 0.7), chip=0.02)
    # Capital: a flared echinus and a square abacus with a chipped corner.
    fs += p.cyl('col_stone', 0.19, 0.265, 0.1, seg=14, pos=(0, 0, 1.355), bevel=0.012, jitter=0.004)
    fs += p.box('col_stone_dark', (0.56, 0.56, 0.12), pos=(0, 0, 1.515), bevel=0.028, jitter=0.016)
    return fs


def column_broken(p):
    fs = stone_base(p, 21, tilt=0.03, jitter=0.022)
    fs += shaft(p, 'col_stone', 0.215, 0.205, 0.25, 0.86, seg=16, rings=12, seed=22, joints=(0.58,), jag=0.2, chip=0.045, crack=2)
    # Fallen drums: one lying on the ground in front-right, a shorter broken one leaning on the plinth.
    fs += shaft(p, 'col_stone', 0.19, 0.19, -0.17, 0.17, seg=14, rings=4, seed=23, crack=0, cap_bottom=True, swell=0.0,
                matrix=Matrix.LocRotScale(Vector((0.5, -0.12, 0.17)), Euler((math.pi / 2, 0, 0.5)), Vector((1, 1, 1))))
    fs += chunk(p, 'col_stone', 0.13, (-0.36, -0.36, 0.08), scale=(1.3, 1.0, 1.0), rot=(0, 0, 0.6), seed=24)
    fs += chunk(p, 'col_stone', 0.11, (-0.42, 0.18, 0.06), scale=(1.2, 0.95, 1.0), seed=25)
    fs += chunk(p, 'col_stone', 0.06, (0.08, 0.36, 0.03), scale=(1.1, 0.9, 0.9), seed=27)
    fs += chunk(p, 'col_stone_dark', 0.08, (0.18, -0.42, 0.04), scale=(1.1, 1, 1.0), seed=26)
    return fs


def column_moss(p):
    fs = stone_base(p, 31, tilt=-0.04, st='col_stone_mossy', dk='col_stone_dark_mossy', jitter=0.02)
    fs += shaft(p, 'col_stone_mossy', 0.215, 0.2, 0.25, 1.2, seg=16, rings=14, seed=32, joints=(0.4, 0.78), jag=0.24, chip=0.04, crack=2)
    fs += shaft(p, 'col_stone_mossy', 0.19, 0.19, -0.16, 0.16, seg=14, rings=4, seed=33, crack=0, cap_bottom=True, swell=0.0,
                matrix=Matrix.LocRotScale(Vector((-0.46, -0.16, 0.15)), Euler((math.pi / 2, 0, -0.35)), Vector((1, 1, 1))))
    # The moss itself is painted softly into the stone at bake time (weather()).
    # Clumps of moss at the foot.
    p.blob('col_moss', 0.075, pos=(0.33, -0.31, -0.01), scale=(1.4, 1.1, 0.6), subdiv=2, noise=0.16, flat_bottom=True)
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
    for pn in ('col_stone', 'col_stone_dark'):
        weather(pn)
    for pn in ('col_stone_mossy', 'col_stone_dark_mossy'):
        weather(pn, moss=True)
    return objs
