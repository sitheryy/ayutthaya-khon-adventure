// Chibi character built from primitives (big head, short body). Faces +Z.
import * as THREE from 'three';

const matCache = new Map();
const M = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
const put = (parent, m) => (parent.add(m), m);
const mesh = (g, c, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(g, M(c)); m.position.set(x, y, z); m.castShadow = cast; return m; };

export const PLAYER_LOOKS = [
  { skin: '#f6d2b0', hair: '#4a2c1a', shirt: '#ffffff', pants: '#9e2a2b', style: 'bob' },
  { skin: '#eec39a', hair: '#2a1a10', shirt: '#ffffff', pants: '#2f5d9e', style: 'short' },
  { skin: '#f6d2b0', hair: '#3a2416', shirt: '#fff3c4', pants: '#3d8b4f', style: 'bun' },
  { skin: '#e8b98c', hair: '#1f140c', shirt: '#ffffff', pants: '#7b3f8f', style: 'short' },
  { skin: '#f3cfa8', hair: '#5a341c', shirt: '#ffe6e6', pants: '#c0622f', style: 'bob' },
  { skin: '#eec39a', hair: '#2a1a10', shirt: '#e8f4ff', pants: '#9e2a2b', style: 'bun' },
];
const ROLES = {
  hanuman: { skin: '#ffffff', face: '#ffffff', shirt: '#f2f2f2', pants: '#e9b73c', crown: 'short', crownC: '#e9b73c', mask: true },
  thotsakan: { skin: '#3f9e5a', face: '#3f9e5a', shirt: '#c0392b', pants: '#e9b73c', crown: 'tall', crownC: '#e9b73c', mask: true, fangs: true },
  rama: { skin: '#2f6e5a', face: '#2f6e5a', shirt: '#e9b73c', pants: '#2f5d9e', crown: 'tall', crownC: '#e9b73c' },
  sida: { skin: '#f6d2b0', face: '#f6d2b0', shirt: '#e9b73c', pants: '#c0392b', crown: 'tall', crownC: '#e9b73c', hair: '#1f140c', style: 'long' },
  guard: { skin: '#eec39a', shirt: '#3d6b3a', pants: '#2a2a2a', hair: '#2a1a10', helmet: true, spear: true },
  merchant: { skin: '#eec39a', shirt: '#f0a35e', pants: '#5e3820', hair: '#2a1a10', hat: true, style: 'short' },
  villager: { skin: '#f3cfa8', shirt: '#ffffff', pants: '#3b6ea8', hair: '#3a2416', style: 'bun' },
  monk: { skin: '#e8b98c', shirt: '#e8902c', pants: '#e8902c', hair: null, robe: true },
};

export function makeChibi(opts = {}) {
  const o = { ...(PLAYER_LOOKS[0]), ...(ROLES[opts.role] || {}), ...opts };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // legs
  const legs = [-1, 1].map((sd) => {
    const g = new THREE.Group(); g.position.set(sd * 0.15, 0.42, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.3, 6), o.robe ? o.shirt : '#f4efe6', 0, -0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.17, 0.1, 0.26), '#6b3e22', 0, -0.37, 0.04));
    body.add(g); return g;
  });
  // pants (โจงกระเบน) + torso
  body.add(mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.26, 10), o.pants, 0, 0.5, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.34, 10), o.shirt, 0, 0.78, 0));
  if (o.robe) put(body, mesh(new THREE.BoxGeometry(0.2, 0.5, 0.56), o.shirt, 0.12, 0.72, 0)).rotation.z = 0.4;
  if (opts.role === 'guard' || o.mask) body.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10), '#e9b73c', 0, 0.64, 0));
  if (o.mask || opts.role === 'rama' || opts.role === 'sida') [-1, 1].forEach((sd) => { const e = mesh(new THREE.ConeGeometry(0.1, 0.22, 5), '#e9b73c', sd * 0.3, 0.95, 0); e.rotation.z = -sd * 1.2; body.add(e); });
  // arms
  const arms = [-1, 1].map((sd) => {
    const g = new THREE.Group(); g.position.set(sd * 0.3, 0.92, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.34, 6), o.shirt, 0, -0.15, 0));
    g.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), o.skin, 0, -0.34, 0));
    g.rotation.z = sd * 0.15; body.add(g); return g;
  });
  // head
  const head = new THREE.Group(); head.position.y = 1.36; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.5, 18, 14), o.face || o.skin));
  if (o.hair && !o.helmet && !o.crown) {
    const h = mesh(new THREE.SphereGeometry(0.535, 16, 12, 0, Math.PI * 2, 0, o.style === 'bob' || o.style === 'long' ? 2.0 : 1.6), o.hair, 0, 0.03, -0.03);
    head.add(h);
    const bang = mesh(new THREE.SphereGeometry(0.5, 14, 8, -1.2, 2.4, 0.3, 0.75), o.hair, 0, 0.06, 0.04); head.add(bang);
    if (o.style === 'bun') head.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), o.hair, 0, 0.5, -0.25));
    if (o.style === 'bob') head.add(mesh(new THREE.CylinderGeometry(0.52, 0.58, 0.45, 16, 1, true, Math.PI * 0.75, Math.PI * 1.5), o.hair, 0, -0.18, 0));
  }
  if (o.style === 'long') head.add(mesh(new THREE.BoxGeometry(0.7, 0.8, 0.2), o.hair, 0, -0.35, -0.3));
  // face
  const eyeY = o.mask ? 0.04 : -0.02;
  [-1, 1].forEach((sd) => {
    const eye = mesh(new THREE.SphereGeometry(o.mask ? 0.1 : 0.075, 10, 8), o.mask ? '#ffffff' : '#241612', sd * 0.17, eyeY, 0.45, false); eye.scale.set(1, o.mask ? 0.7 : 1.25, 0.5); head.add(eye);
    if (o.mask) { const p = mesh(new THREE.SphereGeometry(0.05, 8, 6), '#c0392b', sd * 0.17, eyeY, 0.5, false); head.add(p); }
    else { head.add(mesh(new THREE.SphereGeometry(0.024, 6, 5), '#ffffff', sd * 0.17 + 0.02, eyeY + 0.04, 0.485, false)); put(head, mesh(new THREE.SphereGeometry(0.06, 8, 6), '#ff9e9e', sd * 0.29, -0.13, 0.4, false)).scale.set(1, 0.6, 0.3); }
  });
  put(head, mesh(new THREE.SphereGeometry(0.04, 8, 6), o.mask ? '#c0392b' : '#9a4a3a', 0, o.mask ? -0.2 : -0.17, 0.47, false)).scale.set(o.mask ? 3 : 1.5, 0.6, 0.5);
  if (o.fangs) [-1, 1].forEach((sd) => put(head, mesh(new THREE.ConeGeometry(0.03, 0.1, 4), '#ffffff', sd * 0.08, -0.26, 0.46, false)).rotation.x = Math.PI);
  if (o.mask) [-1, 1].forEach((sd) => { const b = mesh(new THREE.BoxGeometry(0.18, 0.03, 0.03), '#e9b73c', sd * 0.17, 0.17, 0.46, false); b.rotation.z = sd * 0.3; head.add(b); });
  // headwear
  if (o.crown) { // ชฎา / มงกุฎ
    head.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 12), o.crownC, 0, 0.32, 0));
    const tiers = o.crown === 'tall' ? 5 : 2;
    for (let i = 0; i < tiers; i++) head.add(mesh(new THREE.CylinderGeometry(0.34 - i * 0.06, 0.4 - i * 0.06, 0.16, 10), i % 2 ? '#c08b24' : o.crownC, 0, 0.47 + i * 0.15, 0));
    head.add(mesh(new THREE.ConeGeometry(0.1, o.crown === 'tall' ? 0.5 : 0.25, 8), o.crownC, 0, 0.5 + tiers * 0.15 + 0.15, 0));
    [-1, 1].forEach((sd) => { const ear = mesh(new THREE.ConeGeometry(0.08, 0.35, 5), o.crownC, sd * 0.5, 0.05, 0); ear.rotation.z = sd * 0.4; head.add(ear); });
  }
  if (o.helmet) { head.add(mesh(new THREE.SphereGeometry(0.54, 14, 8, 0, Math.PI * 2, 0, 1.4), '#3d6b3a', 0, 0.03, 0)); head.add(mesh(new THREE.ConeGeometry(0.12, 0.45, 6), '#e9b73c', 0, 0.62, 0)); }
  if (o.hat) { const h = mesh(new THREE.ConeGeometry(0.85, 0.35, 12), '#d9b46a', 0, 0.5, 0); head.add(h); } // งอบ
  if (o.spear) { const sp = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), '#5e3820', 0, -0.2, 0.1); arms[1].add(sp); sp.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 5), '#cccccc', 0, 1.2, 0)); arms[1].rotation.x = -0.3; }

  let phase = 0;
  const api = {
    root, body, head, arms, legs,
    // speed in m/s; air = in the air
    animate(dt, speed, air = false) {
      if (air) {
        legs[0].rotation.x = -0.5; legs[1].rotation.x = 0.3; arms[0].rotation.x = -2.4; arms[1].rotation.x = -2.4; body.position.y = 0; return;
      }
      if (speed > 0.2) {
        phase += dt * (6 + speed * 1.3);
        const a = Math.min(1, speed / 5) * 0.8;
        legs[0].rotation.x = Math.sin(phase) * a; legs[1].rotation.x = -Math.sin(phase) * a;
        arms[0].rotation.x = -Math.sin(phase) * a; arms[1].rotation.x = Math.sin(phase) * a;
        body.position.y = Math.abs(Math.cos(phase)) * 0.06;
        head.rotation.z = Math.sin(phase) * 0.04;
      } else api.idle(performance.now() / 1000);
    },
    idle(t) {
      legs[0].rotation.x = legs[1].rotation.x = 0;
      arms[0].rotation.x = arms[1].rotation.x = o.spear ? -0.3 : 0;
      if (o.spear) arms[0].rotation.x = 0;
      body.position.y = Math.sin(t * 2) * 0.015; head.rotation.z = Math.sin(t * 1.3) * 0.04;
    },
    dance(t) { // khon pose loop
      const s = Math.sin(t * 1.6);
      arms[0].rotation.set(-1.2 + s * 0.4, 0, 1.0); arms[1].rotation.set(-0.6 - s * 0.4, 0, -1.3);
      legs[0].rotation.x = -0.6 + s * 0.2; legs[1].rotation.x = 0.2;
      body.position.y = -0.08 + Math.abs(s) * 0.05; body.rotation.y = s * 0.25; head.rotation.z = -s * 0.12;
    },
  };
  return api;
}

export function makeNameTag(text, sub = '', color = '#cfc6b4') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = '600 44px Mitr, sans-serif'; const w = Math.min(500, x.measureText(text).width + 40);
  x.fillStyle = 'rgba(40,24,12,0.72)'; x.beginPath(); x.roundRect((512 - w) / 2, 8, w, 60, 30); x.fill();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 40, 480);
  if (sub) { x.font = '500 30px Mitr, sans-serif'; x.fillStyle = '#ffe08a'; x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 6; x.strokeText(sub, 256, 98); x.fillText(sub, 256, 98); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  s.scale.set(2.6, 0.65, 1); s.position.y = 2.35; s.renderOrder = 10;
  return s;
}
