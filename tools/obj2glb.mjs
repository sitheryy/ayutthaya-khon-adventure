// Convert the user's "Thai house" OBJ pack (CGTrader, Royalty Free) into per-building GLBs with a Thai teak palette.
import fs from 'node:fs';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { weld, dedup, prune } from '@gltf-transform/functions';

const PAL = { House: '#a8693a', roof: '#8e3a24', wood_on_the_roof: '#6e3b1f', 'pillar_&_wood': '#6b4226', wood_barrier: '#b07842', balcony_pillars: '#7a4a28', handrail: '#5e3820', wooden_floor: '#c08a52', stairs: '#9a6a3c', 'door_&_window': '#7a2e1e', jar: '#9a5432', 'canoe_&_paddle': '#7a4a28' };
const GROUPS = {
  thai_house1: ['House_1_Cube.078', 'Cylinder.024_Cylinder.070', 'Circle.001_Circle.005'],
  thai_house2: ['House_2_Cube.006', 'Circle'],
  thai_house3: ['House_3_Cube.068', 'Plane.001_Plane.066'],
  thai_house4: ['House_4_Cube.017', 'Plane.002_Plane.067'],
  thai_sala: ['pavilion_Cube.070'],
  thai_canoe: ['Canoe_Plane.126', 'Paddle_Plane.071'],
  thai_jar: ['Circle'],
};
const root = new OBJLoader().parse(fs.readFileSync(process.argv[2], 'utf8'));
const byName = Object.fromEntries(root.children.map((m) => [m.name, m]));
const io = new NodeIO();
for (const [out, names] of Object.entries(GROUPS)) {
  const meshes = names.map((n) => byName[n]);
  const box = new THREE.Box3(); meshes.forEach((m) => box.expandByObject(m));
  const off = new THREE.Vector3((box.min.x + box.max.x) / -2, -box.min.y, (box.min.z + box.max.z) / -2);
  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene(), mesh = doc.createMesh(out), mats = {};
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position.array, N = g.attributes.normal.array;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: P.length / 3, materialIndex: 0 }];
    const ml = Array.isArray(m.material) ? m.material : [m.material];
    for (const gr of groups) {
      const name = ml[gr.materialIndex].name, n = gr.count;
      if (!n) continue;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { pos[i * 3 + k] = P[(gr.start + i) * 3 + k] + off.getComponent(k); nor[i * 3 + k] = N[(gr.start + i) * 3 + k]; }
      mats[name] ||= doc.createMaterial(name).setBaseColorFactor([...new THREE.Color(PAL[name] || '#999999').toArray(), 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
      const prim = doc.createPrimitive().setMaterial(mats[name])
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf));
      mesh.addPrimitive(prim);
    }
  }
  scene.addChild(doc.createNode(out).setMesh(mesh));
  await doc.transform(weld(), dedup(), prune());
  await io.write(`client/public/models/${out}.glb`, doc);
  console.log(out, (fs.statSync(`client/public/models/${out}.glb`).size / 1024).toFixed(0) + 'KB', box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(1)).join('x'));
}
