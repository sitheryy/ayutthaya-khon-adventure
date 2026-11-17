import fs from 'node:fs';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';
const root = new OBJLoader().parse(fs.readFileSync(process.argv[2], 'utf8'));
root.children.forEach((m) => { const b = new THREE.Box3().setFromObject(m); const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  console.log(m.name.padEnd(28), 'center', c.toArray().map((v) => v.toFixed(1)).join(','), 'size', s.toArray().map((v) => v.toFixed(1)).join(','), 'tris', m.geometry.attributes.position.count / 3, (Array.isArray(m.material) ? m.material.map((x) => x.name) : [m.material.name]).join('|')); });
