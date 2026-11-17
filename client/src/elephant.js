// Royal elephants (ช้างทรงเครื่อง) players can ride: press E / ✋ near one to climb on, again to get off.
// Placeholder model built from primitives; swapped for the Sketchfab GLB when it is added (see buildModel).
import * as THREE from 'three';
import { groundHeight, colliders, PLATFORMS, isBlockedWater, HALF } from './world.js';
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
// The scanned model is one rigid mesh: cut its triangles into body + 4 legs (by position) so the legs can swing.
// Model space: head toward +x, ground ~ y=-0.93, trunk hangs at x>0.9. Returns [FL, FR, BL, BR] hip pivots.
const HIP_Y = -0.15;
function splitLegs(root) {
  let mesh = null; root.traverse((n) => { if (n.isMesh && !mesh && n.geometry.attributes.position.count > 1000) mesh = n; });
  if (!mesh) return [];
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, pos = geo.attributes.position;
  const names = Object.keys(geo.attributes), buckets = Array.from({ length: 5 }, () => []);   // 0 body, 1 FL, 2 FR, 3 BL, 4 BR
  for (let t = 0; t < pos.count; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cx += pos.getX(t + k) / 3; cy += pos.getY(t + k) / 3; cz += pos.getZ(t + k) / 3; }
    let b = 0;
    if (cy < -0.2 && ((cx > 0.3 && cx < 0.9) || cx < -0.05)) b = (cx > 0 ? 1 : 3) + (cz > 0 ? 1 : 0);
    buckets[b].push(t);
  }
  const parent = mesh.parent, legs = [];
  buckets.forEach((tris, i) => {
    const g = new THREE.BufferGeometry();
    for (const n of names) {
      const a = geo.attributes[n], s = a.itemSize, arr = new a.array.constructor(tris.length * 3 * s);
      tris.forEach((t, j) => { for (let k = 0; k < 3; k++) for (let c = 0; c < s; c++) arr[(j * 3 + k) * s + c] = a.array[(t + k) * s + c]; });
      g.setAttribute(n, new THREE.BufferAttribute(arr, s, a.normalized));
    }
    const m = new THREE.Mesh(g, mesh.material); m.castShadow = true;
    if (i === 0) { m.position.copy(mesh.position); parent.add(m); return; }
    const px = i <= 2 ? 0.6 : -0.5, pz = i % 2 ? -0.15 : 0.15, hip = new THREE.Group();   // odd i = left (z<0)
    hip.position.set(px, HIP_Y, pz).add(mesh.position); g.translate(-px, -HIP_Y, -pz);
    hip.add(m); parent.add(hip); legs.push(hip);
  });
  mesh.visible = false;
  return legs;
}
function buildModel() {
  const o = prop('elephant');
  if (o) {   // "Low poly elephant" by MrEliptik (Sketchfab, CC-BY) + Thai royal trappings
    const g = new THREE.Group(), body = new THREE.Group();
    o.position.x = -0.39; const pivot = new THREE.Group(); pivot.add(o); pivot.rotation.y = HEAD_FIX; pivot.scale.setScalar(ELE_SCALE); body.add(pivot); g.add(body);
    return { root: g, legs: splitLegs(o), head: body, trunk: body, model: true };
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

// ---------- wandering NPC elephants ----------
// Every client computes the same walk from (anchor x, z, t0) on the server's clock, so all students see the
// elephant in the same place. Route = up to 10 clear legs out, then back the same way (ping-pong), forever.
export const eleClock = { skew: 0 };   // server time - local time (ms)
const WALK = 1.3, PAUSE = 5, PAD = 2.4;
function freeAt(x, z) {
  if (Math.abs(x) > HALF - 12 || z < -HALF + 12 || z > HALF - 12 || isBlockedWater(x, z)) return false;
  for (const c of colliders) if (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + PAD : Math.abs(x - c.x) < c.hw + PAD && Math.abs(z - c.z) < c.hd + PAD) return false;
  for (const q of PLATFORMS) if (Math.abs(x - q.x) < q.hw + 2 && Math.abs(z - q.z) < q.hd + 2) return false;
  return true;
}
function segClear(ax, az, bx, bz) { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5); for (let k = 1; k <= n; k++) if (!freeAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false; return true; }
function rand(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeRoute(i, x, z, t0) {
  const r = rand((i + 1) * 7919 ^ Math.floor(t0 / 1000)), pts = [[x, z]]; let a = r() * 6.283;
  for (let k = 0; k < 10; k++) {
    const [px, pz] = pts[pts.length - 1]; let ok = null;
    for (let tr = 0; tr < 14 && !ok; tr++) { const ang = a + (r() - 0.5) * 2.4, d = 10 + r() * 14, nx = px + Math.sin(ang) * d, nz = pz + Math.cos(ang) * d; if (segClear(px, pz, nx, nz)) { ok = [nx, nz]; a = ang; } }
    if (!ok) break; pts.push(ok);
  }
  const seq = pts.concat(pts.slice(0, -1).reverse()), legs = []; let T = 0;
  for (let k = 0; k + 1 < seq.length; k++) { const [ax, az] = seq[k], [bx, bz] = seq[k + 1], dur = Math.hypot(bx - ax, bz - az) / WALK; legs.push({ ax, az, bx, bz, t: T, dur }); T += dur + PAUSE; }
  return { x, z, t0, legs, period: Math.max(T, 1) };
}
function routeAt(R, tau) {   // -> [x, z, heading|null, speed]
  if (!R.legs.length) return [R.x, R.z, null, 0];
  tau = ((tau % R.period) + R.period) % R.period;
  for (const L of R.legs) if (tau < L.t + L.dur + PAUSE) {
    const f = Math.max(0, Math.min(1, (tau - L.t) / L.dur));
    return [L.ax + (L.bx - L.ax) * f, L.az + (L.bz - L.az) * f, Math.atan2(L.bx - L.ax, L.bz - L.az), tau < L.t + L.dur ? WALK : 0];
  }
  return [R.x, R.z, null, 0];
}
// new anchor (spawn, server update, or where a rider got off)
export function setAnchor(i, x, z, t0) { const e = elephants[i]; if (e && (!e.route || e.route.t0 !== t0 || e.route.x !== x || e.route.z !== z)) e.route = makeRoute(i, x, z, t0); }
export function wanderElephants(dt) {
  const tau0 = (Date.now() + eleClock.skew) / 1000;
  elephants.forEach((e, i) => {
    if (e.rider || !e.route) return;
    const [x, z, h, sp] = routeAt(e.route, tau0 - e.route.t0 / 1000);
    let ry = e.ry; if (h !== null) { const d = Math.atan2(Math.sin(h - ry), Math.cos(h - ry)); ry += d * Math.min(1, dt * 2.5); }
    setElephant(i, x, z, ry, sp, dt);
  });
}
export function spawnElephants(scene, spots) {
  for (const [x, z, ry] of spots) {
    const m = buildModel(); m.root.position.set(x, groundHeight(x, z), z); m.root.rotation.y = ry; scene.add(m.root);
    elephants.push({ ...m, x, z, ry, rider: null, phase: Math.random() * 6, speed: 0 });
    setAnchor(elephants.length - 1, x, z, Date.UTC(2026, 0, 1));   // offline default; the server replaces it when online
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
    e.legs.forEach((l, j) => { l.rotation[e.model ? 'z' : 'x'] = Math.sin(e.phase + (j === 0 || j === 3 ? 0 : Math.PI)) * k; });
    if (e.model) { e.head.position.y = Math.abs(Math.sin(e.phase)) * 0.08 * Math.min(1, e.speed / 3); e.head.rotation.z = Math.sin(e.phase) * 0.04 * Math.min(1, e.speed / 3) + Math.sin(t * 0.7) * 0.01; continue; }
    e.trunk.rotation.x = Math.sin(t * 1.3 + e.phase) * 0.12; e.head.rotation.z = Math.sin(t * 0.7) * 0.03;
  }
}
