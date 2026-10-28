
def crystal(q,base,length,r,tilt,azi,keys=('glass','glass-pale','glass-deep')):
    lay=part_layer(q)
    p=bmesh.new(); part_layer(p)
    bmesh.ops.create_cone(p,cap_ends=True,segments=6,radius1=r,radius2=r*0.9,depth=length,matrix=Matrix.Translation((0,0,length/2)))
    top=[f for f in p.faces if f.normal.z>0.9][0]
    ex=bmesh.ops.extrude_face_region(p,geom=[top])
    nv=[g for g in ex['geom'] if isinstance(g,bmesh.types.BMVert)]
    bmesh.ops.translate(p,verts=nv,vec=(0,0,r*1.4))
    bmesh.ops.scale(p,verts=nv,vec=(0.12,0.12,1),space=Matrix.Translation((0,0,-(length+r*1.4))))
    bmesh.ops.pointmerge(p,verts=nv,merge_co=Vector((0,0,length+r*1.4)))
    bmesh.ops.recalc_face_normals(p,faces=p.faces)
    lp=part_layer(p)
    for f in p.faces:
        n=f.normal
        f[lp]=pid(keys[1] if (n.x<-0.3 and n.y<0.3) or n.z>0.6 else (keys[2] if n.x>0.5 or n.y>0.6 else keys[0]))
    M=Matrix.Translation(base)@Matrix.Rotation(azi,4,'Z')@Matrix.Rotation(tilt,4,'Y')
    bmesh.ops.transform(p,matrix=M,verts=p.verts)
    merge(q,p)

def rockbase(q,r,h,seed,key='stone'):
    rnd=random.Random(seed)
    p=bmesh.new(); part_layer(p)
    bmesh.ops.create_cone(p,cap_ends=True,segments=7,radius1=r,radius2=r*0.6,depth=h,matrix=Matrix.Translation((0,0,h/2)))
    for v in p.verts:
        if v.co.z>0.01: v.co.x*=1+rnd.uniform(-0.15,0.15); v.co.y*=1+rnd.uniform(-0.15,0.15); v.co.z+=rnd.uniform(-0.02,0.03)
    bevel(p,[e for e in p.edges if all(v.co.z>0.01 for v in e.verts)],0.02,1)
    set_part(p,p.faces,key)
    bot=[f for f in p.faces if f.normal.z<-0.9]
    bmesh.ops.delete(p,geom=bot,context='FACES_ONLY')
    merge(q,p)
