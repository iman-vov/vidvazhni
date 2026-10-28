
def pad(q,cx,cy,r,rot,z=0.0,seed=0):
    rnd=random.Random(seed); lay=part_layer(q)
    notch=0.3; n=14
    angs=[notch/2+(2*math.pi-notch)*i/(n-1) for i in range(n)]
    c=q.verts.new((0,0,0.012))
    mid=[q.verts.new((0.55*r*math.cos(a),0.55*r*math.sin(a),0.016)) for a in angs]
    out=[q.verts.new((r*(1+rnd.uniform(-0.05,0.03))*math.cos(a),r*math.sin(a)*(1+rnd.uniform(-0.05,0.03)),0.026+rnd.uniform(0,0.01))) for a in angs]
    fs=[]
    for i in range(n-1):
        f=q.faces.new((c,mid[i],mid[i+1])); f[lay]=pid('lily-light' if i%2 else 'lily'); fs.append(f)
        g=q.faces.new((mid[i],out[i],out[i+1],mid[i+1])); g[lay]=pid('lily' if i%2 else 'lily-dark'); fs.append(g)
    for t in ((c,out[-1],mid[-1]),(c,mid[0],out[0])):
        f=q.faces.new(t); f[lay]=pid('lily-dark'); fs.append(f)
    bmesh.ops.recalc_face_normals(q,faces=fs)
    dn=[f for f in fs if f.normal.z<0]
    if dn: bmesh.ops.reverse_faces(q,faces=dn)
    ex=bmesh.ops.extrude_face_region(q,geom=fs)
    new=[g for g in ex['geom'] if isinstance(g,bmesh.types.BMVert)]
    for v in new: v.co.z=-0.012
    for f in ex['geom']:
        if isinstance(f,bmesh.types.BMFace) and abs(f.normal.z)<0.5: f[lay]=pid('lily-dark')
    bmesh.ops.transform(q,matrix=Matrix.Translation((cx,cy,z))@Matrix.Rotation(rot,4,'Z'),verts=[c]+mid+out+new)

def flower(q,cx,cy,r=0.12,z=0.02,openness=1.0,seed=0):
    lay=part_layer(q); rnd=random.Random(seed)
    for layer,(n,rr,tilt,key) in enumerate(((8,r,0.55,'petal'),(6,r*0.75,0.95,'petal-deep'))):
        for i in range(n):
            a=i*2*math.pi/n+layer*0.4+rnd.uniform(-0.1,0.1)
            t=tilt+(1-openness)*0.8
            d=Vector((math.cos(a),math.sin(a),0)); s=Vector((-d.y,d.x,0))
            tip=d*rr*math.cos(t)+Vector((0,0,rr*math.sin(t)))
            base=Vector((0,0,0.012))
            m=d*rr*0.45*math.cos(t)+Vector((0,0,rr*0.45*math.sin(t)+0.01))
            vs=[q.verts.new(base+Vector((cx,cy,z))), q.verts.new(m+s*rr*0.22+Vector((cx,cy,z))), q.verts.new(tip+Vector((cx,cy,z))), q.verts.new(m-s*rr*0.22+Vector((cx,cy,z)))]
            f=q.faces.new(vs); f[lay]=pid(key)
            f.normal_update()
            if f.normal.z<0: f.normal_flip()
    if openness>0.5:
        bmesh.ops.create_cone(q,cap_ends=True,segments=6,radius1=0.035,radius2=0.03,depth=0.04,matrix=Matrix.Translation((cx,cy,z+0.03)))
        for f in q.faces:
            if f[lay]==0: f[lay]=pid('pollen')
