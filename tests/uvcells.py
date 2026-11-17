import json,struct,sys,collections
import numpy as np
def load(p):
    b=open(p,'rb').read(); l=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+l]); bin_=b[20+l+8:]
    return j,bin_
def acc(j,bin_,i):
    a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]; n={'VEC2':2,'VEC3':3,'SCALAR':1}[a['type']]
    off=v.get('byteOffset',0)+a.get('byteOffset',0); dt={5126:np.float32,5123:np.uint16,5125:np.uint32}[a['componentType']]
    return np.frombuffer(bin_,dtype=dt,count=a['count']*n,offset=off).reshape(-1,n)
j,b=load(sys.argv[1])
for nd in j['nodes']:
    if 'mesh' not in nd: continue
    c=collections.Counter()
    for pr in j['meshes'][nd['mesh']]['primitives']:
        uv=acc(j,b,pr['attributes']['TEXCOORD_0'])
        for u,v in uv: c[(int(np.clip(u,0,.999)*8), int(np.clip(v,0,.999)*4))]+=1
    print(nd['name'], sorted(c.items(), key=lambda x:-x[1])[:6])
