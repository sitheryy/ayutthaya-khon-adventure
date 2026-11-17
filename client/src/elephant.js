// Royal elephants (ช้างทรงเครื่อง) players can ride: press E / ✋ near one to climb on, again to get off.
// Placeholder model built from primitives; swapped for the Sketchfab GLB when it is added (see buildModel).
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { prop } from './models.js';
const HEAD_FIX = -Math.PI / 2;   // Sketchfab model is long along x; turn its head to +z

export const ELE_SCALE = 2.6;              // ~3.3 m at the shoulder, like a real Asian elephant
export const SEAT = 1.42 * ELE_SCALE;      // rider sits on the bare back   // rider height above the ground
export const elephants = [];   // { root, legs[], x, z, ry, rider: null|'me'|sid, phase }

const M = (c) => new THREE.MeshLambertMaterial({ color: c });
function part(g, geo, mat, x, y, z, o = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; if (o.ry) m.rotation.y = o.ry;
  if (o.s) m.scale.set(...o.s); m.castShadow = true; g.add(m); return m;
}
function buildModel() {
  const o = prop('elephant');
  if (o) {   // "Low poly elephant" by MrEliptik (Sketchfab, CC-BY) + Thai royal trappings
    const g = new THREE.Group(), body = new THREE.Group();
    o.position.x = -0.39; const pivot = new THREE.Group(); pivot.add(o); pivot.rotation.y = HEAD_FIX; pivot.scale.setScalar(ELE_SCALE); body.add(pivot); g.add(body);
    return { root: g, legs: [], head: body, trunk: body, model: true };
  }
  const g = new THREE.Group(), skin = M('#8d8792'), skinD = M('#6f6976'), red = M('#a8232a'), gold = M('#e0b040'), ivory = M('#f3ead2');
  part(g, new THREE.SphereGeometry(1, 16, 12), skin, 0, 2.0, 0, { s: [1.15, 1.0, 1.75] });                    // body (front is +z)
  const head = part(g, new THREE.SphereGeometry(0.8, 14, 10), skin, 0, 2.55, 1.75, { s: [1, 1.05, 0.95] });
  const trunk = new THREE.Group(); trunk.position.set(0, 2.25, 2.45); g.add(trunk);
  for (let i = 0; i < 5; i++) part(trunk, new THREE.CylinderGeometry(0.28 - i * 0.04, 0.32 - i * 0.04, 0.45, 10), skin, 0, -0.2 - i * 0.38, 0.06 * i * i, { rx: 0.15 * i });
  [-1, 1].forEach((s) => {
    part(g, new THREE.SphereGeometry(0.75, 12, 8), skinD, s * 0.85, 2.6, 1.5, { s: [0.25, 1.1, 0.9], ry: s * 0.3 });     // ears
    part(g, new THREE.ConeGeometry(0.09, 0.9, 8), ivory, s * 0.35, 2.0, 2.3, { rx: 1.9 });                               // tusks
    part(g, new THREE.SphereGeometry(0.09, 8, 6), M('#2a1a12'), s * 0.42, 2.75, 2.3);                                    // eyes
  });
  const legs = [];
  [[-0.6, 1.0], [0.6, 1.0], [-0.6, -1.0], [0.6, -1.0]].forEach(([x, z]) => { const l = new THREE.Group(); l.position.set(x, 1.6, z); part(l, new THREE.CylinderGeometry(0.34, 0.38, 1.6, 10), skin, 0, -0.8, 0); g.add(l); legs.push(l); });
  part(g, new THREE.CylinderGeometry(0.05, 0.03, 1, 6), skin, 0, 1.7, -1.75, { rx: 0.3 });                                   // tail
  // Thai royal trappings: red cloth with gold border, head cloth, howdah seat
  part(g, new THREE.BoxGeometry(2.45, 0.08, 2.2), red, 0, 2.95, -0.1); part(g, new THREE.BoxGeometry(2.55, 0.06, 2.3), gold, 0, 2.9, -0.1);
  [-1, 1].forEach((s) => part(g, new THREE.BoxGeometry(0.06, 1.1, 2.1), red, s * 1.2, 2.4, -0.1));
  part(g, new THREE.BoxGeometry(1.0, 0.06, 0.8), red, 0, 3.25, 1.75, { rx: -0.4 });
  part(g, new THREE.BoxGeometry(1.2, 0.35, 1.1), gold, 0, 3.1, -0.15);
  part(g, new THREE.ConeGeometry(0.75, 1.0, 4), gold, 0, 4.85, -0.15, { ry: Math.PI / 4 });                                // howdah roof
  [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.3], [0.5, 0.3]].forEach(([x, z]) => part(g, new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), gold, x, 3.95, z));
  return { root: g, legs, head, trunk };
}

export function spawnElephants(scene, spots) {
  for (const [x, z, ry] of spots) {
    const m = buildModel(); m.root.position.set(x, groundHeight(x, z), z); m.root.rotation.y = ry; scene.add(m.root);
    elephants.push({ ...m, x, z, ry, rider: null, phase: Math.random() * 6, speed: 0 });
  }
}
export function nearestElephant(x, z, maxD = 4) {
  let best = -1, bd = maxD;
  elephants.forEach((e, i) => { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
}
// place + animate one elephant; speed in m/s drives the leg swing
export function setElephant(i, x, z, ry, speed, dt) {
  const e = elephants[i]; if (!e) return;
  e.x = x; e.z = z; e.ry = ry; e.speed = speed;
  e.root.position.set(x, groundHeight(x, z), z); e.root.rotation.y = ry;
}
export function animateElephants(t, dt) {
  for (const e of elephants) {
    e.phase += dt * (e.speed > 0.3 ? 2 + e.speed * 0.6 : 0);
    const k = Math.min(1, e.speed / 4) * 0.45;
    e.legs.forEach((l, j) => (l.rotation.x = Math.sin(e.phase + (j === 0 || j === 3 ? 0 : Math.PI)) * k));
    if (e.model) { e.head.position.y = Math.abs(Math.sin(e.phase)) * 0.08 * Math.min(1, e.speed / 3); e.head.rotation.z = Math.sin(e.phase) * 0.04 * Math.min(1, e.speed / 3) + Math.sin(t * 0.7) * 0.01; continue; }
    e.trunk.rotation.x = Math.sin(t * 1.3 + e.phase) * 0.12; e.head.rotation.z = Math.sin(t * 0.7) * 0.03;
  }
}
