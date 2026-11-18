// Procedural low-poly Ayutthaya. Static meshes are merged per color per chunk (few draw calls, frustum-culled).
import * as THREE from 'three';
import { stylize } from './style.js';
import { noiseTexture } from './noise.js';
import { SKY, NIGHT, EVENING_DIR } from './cycle.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeTerrain, stampMask, stampBox, finalizeMask, terrainH, grassAt, buildGroundMesh, buildGrass, buildWaterSurface } from './terrain.js';
import { buildFoliage } from './foliage.js';
import { NAT, buildNatureTrees, buildNatureGrass } from './nature.js';
import { torches } from './effects.js';
const FOL = { trees: [], bushes: [] };
// user-supplied Thai house pack (CGTrader, royalty free) placed as models; footprint sizes from tools/obj2glb.mjs
const BUDDHA_FACE = 0;   // turn so the scan faces the model's +z front
const MODELS = [], MSIZE = { thai_house1: [5.3, 9.5], thai_house2: [6.2, 7.4], thai_house3: [3.8, 7.8], thai_house4: [6.2, 5.8], thai_sala: [3.7, 5.7], thai_jar: [0.9, 0.9], thai_canoe: [1.5, 3.9] };
// ---------- layout rules: keep every path walkable, buildings face the road ----------
export function nearestPath(x, z) {
  let best = null;
  for (const p of PATHS) {
    const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], t = Math.max(0, Math.min(1, ((x - p.a[0]) * dx + (z - p.a[1]) * dz) / (dx * dx + dz * dz)));
    const px = p.a[0] + dx * t, pz = p.a[1] + dz * t, d = Math.hypot(x - px, z - pz) - p.w / 2;
    if (!best || d < best.d) best = { d, px, pz };
  }
  return best;
}
export const pathClear = (x, z, rad) => !PATHS.some((p) => distSeg(x, z, p.a, p.b) < p.w / 2 + rad + 0.6);
export function offPath(x, z, rad) {
  for (let k = 0; k < 40 && !pathClear(x, z, rad); k++) { const n = nearestPath(x, z), dx = x - n.px, dz = z - n.pz, d = Math.hypot(dx, dz) || 1; x += (dx / d) * 0.7; z += (dz / d) * 0.7; }
  return [x, z];
}
// face: 'path' turns the front (+z of the model, where the stairs are) toward the nearest road
function model(name, x, z, ry = 0, sc = 1, collide = true, face = null) {
  const [w0, d0] = MSIZE[name], rad = Math.max(w0, d0) * sc * 0.5;
  [x, z] = offPath(x, z, rad);
  if (face === 'path') { const n = nearestPath(x, z); ry = Math.atan2(n.px - x, n.pz - z); }
  MODELS.push({ name, x, z, ry, sc });
  if (!collide) return { x, z, ry };
  const [w, d] = MSIZE[name], rot = Math.abs(Math.sin(ry)) > 0.5;
  if (face === 'path') { circ(x, z, (w + d) * sc * 0.22); return { x, z, ry }; }
  if (name === 'thai_sala') { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => circ(...wpos(x, z, ry, a * w * sc * 0.42, b * d * sc * 0.42), 0.35)); return { x, z, ry }; }
  boxC(x, z, ((rot ? d : w) * sc) / 2 * 0.9, ((rot ? w : d) * sc) / 2 * 0.9);
  return { x, z, ry };
}
// jar beside a house (left side, toward the back), never on a road
function jarBeside(h, name, sc) { const [w, d] = MSIZE[name]; const [jx, jz] = wpos(h.x, h.z, h.ry, (w / 2 + 1.2) * sc, -d * 0.2 * sc); if (pathClear(jx, jz, 0.6)) model('thai_jar', jx, jz, 0, 1.2); }
import { makeCharacter, studentLook, ROLE_LOOKS, makeKhon, prop, propParts, makeAnimal } from './models.js';

export const HALF = 140;           // walkable half-extent (compact map: zones close together)
export const SPAWN = { x: 0, z: 20 };
export const ZONES = [
  { id: 1, name: 'วัดมหาธาตุ', sub: 'ตามหาความลับของโขนที่ซ่อนอยู่ในวัดนี้!', x: -62, z: -70, r: 52, color: '#c86f4a' },
  { id: 2, name: 'พระราชวังโบราณ', sub: 'ค้นหาหลักฐานความเป็นมาของโขนในวัง', x: 60, z: -74, r: 52, color: '#e0b040' },
  { id: 3, name: 'ตลาดน้ำริมแม่น้ำ', sub: 'ช่วยชาวบ้านหาของสำคัญในตลาด', x: 88, z: 16, r: 40, color: '#3aa0d8' },
  { id: 4, name: 'ป่าหิมพานต์', sub: 'ดินแดนครุฑ พญานาค และสัตว์วิเศษ', x: -74, z: 70, r: 46, color: '#3d9b40' },
  { id: 5, name: 'โรงละครโขน', sub: 'ตอบคำถามเกี่ยวกับประวัติและท่ารำโขน', x: -84, z: -4, r: 30, color: '#9b59b6' },
  { id: 6, name: 'ประตูเมืองและป้อมปราการ', sub: 'ภารกิจสุดท้าย... ตามหาสมบัติแห่งกรุงศรี', x: 28, z: 93, r: 36, color: '#b5563a' },
];
export const WALL_Z = 125;
export const riverX = (z) => 124 + 5 * Math.sin(z / 24);
const PIER = { x0: 104, x1: 124, z0: 12, z1: 20 };

export const colliders = [];
export const PLATFORMS = [];
export const WELL = { x: 0, z: 0 }; // low solid floors you stand on: {x,z,hw,hd,h}   // {x,z,r} circle or {x,z,hw,hd} box
export const waters = [];      // {x,z,r} blocked ponds
export const animated = [];    // fns(t, dt)
export const uTime = { value: 0 };
const circ = (x, z, r) => colliders.push({ x, z, r });
const boxC = (x, z, hw, hd) => colliders.push({ x, z, hw, hd });

export function zoneAt(x, z) {
  for (const zn of ZONES) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn;
  return null;
}
export function groundHeight(x, z) {
  if (x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) return 0.6;
  let h = Math.max(terrainH(x, z), -0.3);
  for (const p of PLATFORMS) if (Math.abs(x - p.x) < p.hw && Math.abs(z - p.z) < p.hd) h = Math.max(h, p.h);
  return h;
}
export function isBlockedWater(x, z) {
  if (x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) return false;
  if (Math.abs(x - riverX(z)) < 14) return true;
  for (const w of waters) if (Math.hypot(x - w.x, z - w.z) < w.r) return true;
  return false;
}

export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- material cache ----------
const mats = new Map();
// surface patterns in world space (static meshes are merged with world-space vertices)
const SURF_GLSL = {
  brick: `vec3 an = abs(vNw);
    vec2 buv = an.y > max(an.x, an.z) ? vWp.xz : (an.x > an.z ? vWp.zy : vWp.xy);
    buv *= vec2(1.0 / 0.9, 1.0 / 0.42);
    float row = floor(buv.y); buv.x += mod(row, 2.0) * 0.5;
    vec2 bf = fract(buv), bid = vec2(floor(buv.x), row);
    float mortar = clamp(step(bf.x, 0.05) + step(bf.y, 0.09), 0.0, 1.0);
    float bh = fract(sin(dot(bid, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 bc = diffuseColor.rgb * (0.8 + bh * 0.32);
    diffuseColor.rgb = mix(bc, diffuseColor.rgb * 0.62 + vec3(0.06), mortar * 0.8);
    float wn = texture2D(uNoise, vWp.xz * 0.06 + vWp.y * 0.04).r; diffuseColor.rgb *= 0.82 + wn * 0.34;`,
  plaster: `float pn = texture2D(uNoise, vWp.xz * 0.11 + vWp.y * 0.09).g, pn2 = texture2D(uNoise, (vWp.xy + vWp.zy) * 0.35).b;
    diffuseColor.rgb *= 0.9 + pn * 0.14 + (pn2 - 0.5) * 0.08;
    diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.0, 1.6, vWp.y));`,
  tile: `float tr = fract(vWp.y * 2.6 + (vWp.x + vWp.z) * 0.0);
    float tc = fract((vWp.x + vWp.z) * 1.4 + floor(vWp.y * 2.6) * 0.5);
    diffuseColor.rgb *= 0.78 + smoothstep(0.0, 0.85, tr) * 0.3 - step(tc, 0.06) * 0.12;`,
  wood: `float wg = texture2D(uNoise, vec2((vWp.x + vWp.z) * 0.6, vWp.y * 0.05)).b;
    diffuseColor.rgb *= 0.84 + wg * 0.3;`,
};
function surfKind(color) {
  if (['#b8613f', '#a3533a', '#cf8458', '#c97b52'].includes(color)) return 'brick';
  if (['#f3ece0', '#efe0c0', '#c9bfa6', '#9c937e'].includes(color)) return 'plaster';
  if (['#c2412d', '#d8642f', '#2f8a57', '#3b5ea8', '#7b3f8f', '#b55a2c'].includes(color)) return 'tile';
  if (['#8a5430', '#5e3820', '#b07a48', '#7a3b22', '#9a6038'].includes(color)) return 'wood';
  return null;
}
function getMat(color, sway) {
  const kind = sway ? null : surfKind(color);
  const key = color + (sway ? 's' : '') + (kind || '');
  if (mats.has(key)) return mats.get(key);
  const m = new THREE.MeshLambertMaterial({ color });
  if (sway) {
    m.onBeforeCompile = (sh) => {
      stylize(sh);
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = max(position.y - 1.5, 0.0) * 0.06;
        transformed.x += sin(uTime * 1.7 + position.x * 0.21 + position.z * 0.13) * k;
        transformed.z += cos(uTime * 1.3 + position.x * 0.17) * k * 0.7;`);
    };
    m.customProgramCacheKey = () => 'sway';
  } else if (kind) {
    m.onBeforeCompile = (sh) => {
      stylize(sh);
      sh.uniforms.uNoise = { value: noiseTexture() };
      sh.vertexShader = 'varying vec3 vWp; varying vec3 vNw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(position, 1.0)).xyz; vNw = normal;');
      sh.fragmentShader = 'uniform sampler2D uNoise; varying vec3 vWp; varying vec3 vNw;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_GLSL[kind]);
    };
    m.customProgramCacheKey = () => 'surf-' + kind;
  }
  mats.set(key, m);
  return m;
}

// ---------- merge builder ----------
const CHUNK = 110;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
class Builder {
  bins = new Map();
  put(geo, color, x = 0, y = 0, z = 0, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e);
    const s = o.s ?? 1; _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s));
    const key = `${color}|${o.sway ? 1 : 0}|${o.shadow === false ? 0 : 1}|${Math.floor((x + 260) / CHUNK)},${Math.floor((z + 260) / CHUNK)}`;
    if (!this.bins.has(key)) this.bins.set(key, []);
    this.bins.get(key).push(g);
  }
  build(parent) {
    for (const [key, list] of this.bins) {
      const [color, sway, sh] = key.split('|');
      const geo = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, getMat(color, sway === '1'));
      mesh.castShadow = sh === '1'; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.bins.clear();
  }
}

// ---------- primitive shorthands ----------
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const CONE = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const SPH = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const ICO = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const LATHE = (pts, seg = 8) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function gable(len, dep, h) {
  const s = new THREE.Shape(); s.moveTo(-dep / 2, 0); s.lineTo(dep / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2); g.rotateY(Math.PI / 2); return g;
}
function tri(w, h, t = 0.2) { // flat triangle pediment facing +x
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.translate(0, 0, -t / 2); g.rotateY(Math.PI / 2); return g;
}
// local frame helper: put relative to (x,z) rotated by ry
function frame(B, x, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (geo, color, lx, y, lz, o = {}) => B.put(geo, color, x + lx * c + lz * s, y, z - lx * s + lz * c, { ...o, ry: (o.ry || 0) + ry });
}
const wpos = (x, z, ry, lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];

// ---------- palette ----------
const C = {
  brick: '#b8613f', brick2: '#a3533a', brickL: '#cf8458', laterite: '#c97b52',
  white: '#f3ece0', cream: '#efe0c0', gold: '#e9b73c', goldD: '#c08b24',
  roofR: '#c2412d', roofO: '#d8642f', roofG: '#2f8a57', roofB: '#3b5ea8',
  wood: '#8a5430', woodD: '#5e3820', woodL: '#b07a48',
  trunk: '#7a4d2b', leaf: ['#4caf50', '#5cbf4a', '#3d9b40', '#7ccf55', '#46a84a'],
  stone: '#c9bfa6', stoneD: '#9c937e', rock: '#8f8577', path: '#e8c896', plaza: '#f1d6aa',
};

// real walkable steps: n solid boxes rising toward the building (local -z), each also a PLATFORM so players climb them
function stairs(f, x, z, ry, w, rise, n, z0, run, color) {
  const rot = Math.abs(Math.sin(ry)) > 0.5;
  for (let i = 0; i < n; i++) {
    const top = (i + 1) * rise / n, depth = run - i * run / n + 0.3, lz = z0 - i * run / n - depth / 2;
    f(BOX(w, top, depth), i % 2 ? color : C.brickL, 0, top / 2, lz);
    const [px, pz] = wpos(x, z, ry, 0, lz);
    PLATFORMS.push({ x: px, z: pz, hw: (rot ? depth : w) / 2, hd: (rot ? w : depth) / 2, h: top });
  }
  [-1, 1].forEach((sd) => f(BOX(0.35, rise + 0.3, run), C.white, sd * (w / 2 + 0.17), (rise + 0.3) / 2, z0 - run / 2));   // side balustrades
}
// ================= structures =================
function prang(B, x, z, s = 1, color = C.brick) {
  const f = frame(B, x, z);
  [[16, 2], [13, 2], [10.5, 2]].forEach(([w, h], i) => f(BOX(w * s, h * s, w * s), i % 2 ? C.brick2 : color, 0, (i * 2 + 1) * s, 0));
  const prof = [[4.2, 0], [4.5, 2.5], [4.4, 5], [4.0, 8], [3.4, 11], [2.6, 14], [1.7, 16.5], [0.8, 18.5], [0.01, 19.4]];
  f(LATHE(prof.map(([r, y]) => [r * s, y * s])), color, 0, 6 * s, 0);
  [2.5, 5, 8, 11, 14].forEach((y, i) => { const r = prof[i + 1][0] * s + 0.15 * s; f(CYL(r, r, 0.45 * s, 8), C.brickL, 0, (6 + y) * s, 0); });
  f(CYL(0.12 * s, 0.25 * s, 4 * s, 6), C.stoneD, 0, 27 * s, 0);
  f(BOX(2.2 * s, 3.2 * s, 1 * s), '#4a2a1a', 0, 7.6 * s, 4.2 * s);           // niche
  stairs(f, x, z, 0, 4 * s, 2 * s, 7, 11.5 * s, 3.5 * s, C.brick2);              // front stair onto the first terrace
  PLATFORMS.push({ x, z, hw: 8 * s, hd: 8 * s, h: 2 * s }); boxC(x, z, 6.5 * s, 6.5 * s);   // walkable terrace, upper tiers solid
}
function chedi(B, x, z, s = 1, color = C.white, ruined = false) {
  const f = frame(B, x, z);
  f(BOX(7 * s, 1 * s, 7 * s), color, 0, 0.5 * s, 0);
  f(BOX(5.6 * s, 1 * s, 5.6 * s), color, 0, 1.5 * s, 0);
  f(CYL(2.9 * s, 3.1 * s, 0.6 * s, 12), color, 0, 2.3 * s, 0);
  f(LATHE([[2.9, 0], [3.1, 0.4], [2.9, 1.6], [2.4, 3], [1.5, 4.1], [0.9, 4.5], [0.01, 4.6]].map(([r, y]) => [r * s, y * s]), 12), color, 0, 2.6 * s, 0);
  if (!ruined) {
    f(BOX(1.4 * s, 1 * s, 1.4 * s), color, 0, 7.5 * s, 0);
    f(CONE(0.75 * s, 7 * s, 10), color, 0, 11.4 * s, 0);
    [0, 1, 2, 3].forEach((i) => f(CYL(0.62 * s - i * 0.12 * s, 0.7 * s - i * 0.12 * s, 0.25 * s, 10), C.gold, 0, (8.4 + i * 1.1) * s, 0));
  } else f(CONE(0.9 * s, 2.5 * s, 8), color, 0, 8 * s, 0);
  boxC(x, z, 3.5 * s, 3.5 * s);
}
function buddha(B, x, z, ry = 0, s = 1) {   // brick base + scanned Thai Buddha (Sketchfab, laurashea, CC-BY)
  const f = frame(B, x, z, ry), g = groundHeight(x, z), top = 1.6 * s;   // everything follows the terrain; base sunk 1.5 m so it never floats
  f(BOX(6 * s, top + 1.5, 5 * s), C.brick, 0, g + (top - 1.5) / 2, 0);
  f(CYL(2.6 * s, 2.8 * s, 0.5 * s, 12), C.cream, 0, g + top + 0.25 * s, 0);
  // scan sits ~6° tilted back: rx/rz straighten it (found by minimising its bounding box), y puts its foot on the cream disc
  MODELS.push({ name: 'thai_buddha', x, z, ry: ry + BUDDHA_FACE, sc: 1.05 * s, y: g + 2.1 * s - 0.12 * 1.05 * s, rx: 6 * Math.PI / 180, rz: -2 * Math.PI / 180 });
  const rt = Math.abs(Math.sin(ry)) > 0.5; boxC(x, z, (rt ? 2.5 : 3) * s, (rt ? 3 : 2.5) * s);
}
function brickWall(B, x0, z0, x1, z1, h, r, gaps = []) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2), ry = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (gaps.some(([gx, gz, gr]) => Math.hypot(x - gx, z - gz) < gr)) continue;
    const hh = h * (0.4 + r() * 0.6);
    B.put(BOX(2.05, hh, 1.2), r() < 0.3 ? C.brick2 : C.brick, x, hh / 2, z, { ry });
    circ(x, z, 1.1);
  }
}
function thaiHall(B, x, z, w, d, o = {}) {
  const ry = o.ry || 0, f = frame(B, x, z, ry), wall = o.wall || C.white, roof = o.roof || C.roofR, trim = o.trim || C.roofG;
  const base = o.base ?? 1.4, wh = o.wh ?? 5;
  f(BOX(w + 4, base, d + 4), C.white, 0, base / 2, 0);
  stairs(f, x, z, ry, 6, base, 5, d / 2 + 2 + 2.8, 2.8, C.cream);
  f(BOX(w, wh, d), wall, 0, base + wh / 2, 0);
  for (let i = 0; i <= 5; i++) { const lx = -w / 2 - 0.9 + (w + 1.8) * i / 5; [-1, 1].forEach((sd) => f(CYL(0.32, 0.36, wh, 8), C.white, lx, base + wh / 2, sd * (d / 2 + 0.9))); }
  f(BOX(2.6, 3.6, 0.3), C.gold, 0, base + 1.8, d / 2 + 0.05);
  [-1, 1].forEach((sd) => [-0.3, 0.3].forEach((p) => f(BOX(1.4, 2, 0.3), '#7a2a20', sd * w * p * 1.3, base + 2.6, d / 2 + 0.05)));
  const y0 = base + wh, D = d + 5, h1 = D * 0.55;
  f(gable(w + 4.5, D + 0.8, h1 * 0.88), trim, 0, y0 - 0.3, 0);
  f(gable(w + 4, D, h1), roof, 0, y0, 0);
  const L2 = w * 0.62, D2 = D * 0.78, y2 = y0 + h1 * 0.38, h2 = D2 * 0.62;
  f(gable(L2 + 0.5, D2 + 0.8, h2 * 0.88), trim, 0, y2 - 0.3, 0);
  f(gable(L2, D2, h2), roof, 0, y2, 0);
  [-1, 1].forEach((sd) => {
    f(tri(D2 * 0.82, h2 * 0.84, 0.25), C.gold, sd * (L2 / 2 + 0.05), y2 + 0.1, 0);
    f(CONE(0.25, 2.2, 5), C.gold, sd * (L2 / 2 + 0.3), y2 + h2 + 0.6, 0, { rz: -sd * 0.5 }); // chofa
    f(tri(D * 0.5, h1 * 0.4, 0.25), C.gold, sd * (w / 2 + 2.05), y0 + 0.1, 0);
  });
  if (o.spire) { // prasat spire
    const ys = y2 + h2 - 0.5;
    [3.6, 2.8, 2.1, 1.5].forEach((bw, i) => f(BOX(bw, 1, bw), i % 2 ? C.gold : C.white, 0, ys + i, 0));
    f(CONE(0.9, 7, 8), C.gold, 0, ys + 7.5, 0);
  }
  const rot = Math.abs(Math.sin(ry)) > 0.5;
  PLATFORMS.push({ x, z, hw: (rot ? d + 4 : w + 4) / 2, hd: (rot ? w + 4 : d + 4) / 2, h: base });   // porch around the hall
  boxC(x, z, (rot ? d : w) / 2, (rot ? w : d) / 2);                                                  // hall walls
  for (let i = 0; i <= 5; i++) { const lx = -w / 2 - 0.9 + (w + 1.8) * i / 5; [-1, 1].forEach((sd) => circ(...wpos(x, z, ry, lx, sd * (d / 2 + 0.9)), 0.4)); }
}
function salaPavilion(B, x, z, ry = 0, roof = C.roofO) {
  const f = frame(B, x, z, ry);
  f(BOX(7, 0.6, 5), C.woodL, 0, 0.3, 0);
  [[-3, -2], [3, -2], [-3, 2], [3, 2]].forEach(([lx, lz]) => f(CYL(0.18, 0.2, 3.2, 6), C.wood, lx, 2.2, lz));
  f(gable(8.4, 6.6, 3), roof, 0, 3.8, 0);
  [-1, 1].forEach((sd) => f(CONE(0.15, 1.3, 5), C.gold, sd * 4.3, 7.1, 0, { rz: -sd * 0.5 }));
  circ(...wpos(x, z, ry, -3, 0), 1.5); circ(...wpos(x, z, ry, 3, 0), 1.5);
}
function banner(B, x, z, color = '#9e2a2b', h = 6) {
  B.put(CYL(0.1, 0.12, h, 6), C.woodD, x, h / 2, z);
  B.put(BOX(1.6, 2.6, 0.08), color, x + 0.9, h - 1.6, z, { shadow: false });
  B.put(SPH(0.4, 8, 6), C.gold, x + 0.9, h - 1.4, z + 0.06, { sz: 0.3, shadow: false });
  B.put(CONE(0.18, 0.5, 6), C.gold, x, h + 0.25, z);
  circ(x, z, 0.4);
}
function stiltHouse(B, x, z, ry, r) {
  const f = frame(B, x, z, ry), w = 6 + r() * 2, d = 5;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => f(CYL(0.18, 0.2, 2.2, 6), C.woodD, a * w / 2, 1.1, b * d / 2));
  f(BOX(w + 1, 0.3, d + 2.4), C.woodL, 0, 2.2, 0.9);
  f(BOX(w, 3, d), r() < 0.5 ? C.wood : '#9a6038', 0, 3.85, 0);
  f(BOX(1.2, 2, 0.15), C.woodD, 0, 3.4, d / 2 + 0.05);
  f(BOX(1.4, 1, 0.12), '#f0d27a', w / 3, 4.2, d / 2 + 0.05);
  f(gable(w + 2, d + 3, 3.4), r() < 0.5 ? C.roofO : '#b55a2c', 0, 5.3, 0);
  f(BOX(1.2, 0.2, 2.4), C.woodL, 0, 1.1, d / 2 + 2.3, { rx: 0.7 });
  boxC(x, z, (Math.abs(Math.sin(ry)) > 0.5 ? d + 1 : w + 1) / 2, (Math.abs(Math.sin(ry)) > 0.5 ? w + 1 : d + 1) / 2);
}
const UMB = ['#e74c3c', '#f1c40f', '#9b59b6', '#3498db', '#2ecc71', '#e67e22'];
function stall(B, x, z, r) {
  B.put(BOX(3, 1, 2), C.woodL, x, 0.5, z);
  [[-1.3, -0.8], [1.3, 0.8]].forEach(([a, b]) => B.put(CYL(0.08, 0.08, 3, 5), C.woodD, x + a, 1.5, z + b));
  B.put(CONE(2.4, 1.1, 8), UMB[(r() * UMB.length) | 0], x, 3.4, z, { shadow: true });
  for (let i = 0; i < 6; i++) B.put(SPH(0.25, 6, 5), ['#ff6b3d', '#ffd23f', '#8bd450', '#c0392b'][(r() * 4) | 0], x - 1 + r() * 2, 1.15, z - 0.6 + r() * 1.2);
  circ(x, z, 1.7);
}
const hashRy = (x, z) => ((Math.sin(x * 12.9 + z * 78.2) * 43758.5) % 1 + 1) % 1 * 6.28;
function tree(B, x, z, r, s = 1) {
  const h = (2.4 + r() * 1.4) * s, gy = terrainH(x, z) - 0.2;
  if (NAT.on) NAT.trees.push({ x, y: gy + 0.15, z, h: h + 3.1 * s });   // MegaKit tree replaces trunk + leaf balls (the r() calls below still run so the rest of the layout is unchanged)
  else B.put(CYL(0.26 * s, 0.4 * s, h + 1, 6), C.trunk, x, gy + (h + 1) / 2, z);
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 1.3 * s, rr = (1.9 + r() * 0.8) * s;
    FOL.trees.push({ x: x + Math.cos(a) * d, y: gy + h + rr * 0.55 + (i === 0 ? 0.9 * s : r() * 0.6 * s), z: z + Math.sin(a) * d, s: rr * 1.1, ry: r() * 6, tint: 0.88 + r() * 0.24 });
  }
  circ(x, z, 0.6 * s);
}
function palm(B, x, z, r) {
  [x, z] = offPath(x, z, 0.6);
  const h = 6 + r() * 3, lean = (r() - 0.5) * 0.3;
  B.put(CYL(0.22, 0.32, h, 6), '#8a6a45', x, h / 2, z, { rz: lean });
  const tx = x - Math.sin(lean) * h;
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; B.put(BOX(0.5, 0.12, 3.4), '#3f9e46', tx + Math.cos(a) * 1.5, h - 0.1, z + Math.sin(a) * 1.5, { ry: -a + Math.PI / 2, rx: 0.35, sway: true }); }
  circ(x, z, 0.5);
}
function rock(B, x, z, s, r) {
  if (PATHS.length && !pathClear(x, z, s)) return; B.put(new THREE.DodecahedronGeometry(s, 0), r() < 0.5 ? C.rock : '#a39a8a', x, terrainH(x, z) + s * 0.4, z, { ry: r() * 6, sy: 0.7 + r() * 0.4 }); circ(x, z, s * 0.9); }

function lion(B, x, z, ry) { // สิงห์ guardian
  const f = frame(B, x, z, ry);
  f(BOX(2, 1.2, 2.6), C.stone, 0, 0.6, 0);
  f(BOX(1.3, 1.4, 1.8), C.white, 0, 1.9, 0);
  f(SPH(0.8, 10, 8), C.white, 0, 3.1, 0.5);
  f(SPH(0.95, 10, 8), C.gold, 0, 3.0, 0.3, { sz: 0.6 });
  f(BOX(0.4, 1.2, 0.4), C.white, -0.45, 1.6, 0.9); f(BOX(0.4, 1.2, 0.4), C.white, 0.45, 1.6, 0.9);
  circ(x, z, 1.4);
}

// ================= zones =================
function zoneWat(B, r) {
  const { x, z } = ZONES[0];
  prang(B, x, z - 6, 1.05);
  [[-20, -24], [20, -24], [-20, 12], [20, 12]].forEach(([a, b]) => prang(B, x + a, z + b, 0.5, C.laterite));
  [[-34, -30], [-34, -6], [34, -30], [34, -6], [-12, -40], [12, -40]].forEach(([a, b], i) => chedi(B, x + a, z + b, 0.75 + (i % 2) * 0.2, i % 3 ? C.brick : C.laterite, true));
  for (let i = 0; i < 6; i++) [-6, 6].forEach((sd) => { const h = 3 + r() * 3.5; B.put(CYL(0.7, 0.8, h, 8), C.brick, x + sd, h / 2, z + 18 + i * 4.2); circ(x + sd, z + 18 + i * 4.2, 0.9); });
  B.put(BOX(16, 0.8, 26), C.brickL, x, 0.4, z + 28); PLATFORMS.push({ x, z: z + 28, hw: 8, hd: 13, h: 0.8 }); // vihara floor: walk/jump onto it
  buddha(B, x - 26, z + 30, Math.PI / 2, 1.1);
  buddha(B, x + 26, z + 30, -Math.PI / 2, 0.8);
  const h = 44;
  brickWall(B, x - h, z - h, x + h, z - h, 2.4, r);
  brickWall(B, x - h, z - h, x - h, z + h, 2.4, r, [[x - h, z + 6, 5]]);
  brickWall(B, x + h, z - h, x + h, z + h, 2.4, r, [[x + h, z + 6, 5]]);
  brickWall(B, x - h, z + h, x + h, z + h, 2.4, r, [[x, z + h, 7]]);
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 10 + r() * 30; rock(B, x + Math.cos(a) * d, z + 30 + Math.sin(a) * 8, 0.5 + r() * 0.6, r); }
}
function zonePalace(B, r) {
  const { x, z } = ZONES[1];
  const wW = 46, wD = 40;
  const wallSeg = (x0, z0, x1, z1, gap) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.ceil(len / 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      if (gap && Math.hypot(px - gap[0], pz - gap[1]) < 6) continue;
      B.put(BOX(4.05, 3, 1.2), C.white, px, 1.5, pz, { ry }); B.put(BOX(4.1, 0.4, 1.5), C.roofR, px, 3.1, pz, { ry }); circ(px, pz, 1.4); circ(px + (x1 - x0) / n / 2.2, pz + (z1 - z0) / n / 2.2, 1.4);
    }
  };
  wallSeg(x - wW, z - wD, x + wW, z - wD); wallSeg(x - wW, z - wD, x - wW, z + wD); wallSeg(x + wW, z - wD, x + wW, z + wD);
  wallSeg(x - wW, z + wD, x + wW, z + wD, [x, z + wD]);
  // gate
  [-5, 5].forEach((sd) => { B.put(BOX(2.4, 7, 2.4), C.white, x + sd, 3.5, z + wD); B.put(CONE(1.5, 3, 4), C.gold, x + sd, 8.5, z + wD, { ry: Math.PI / 4 }); circ(x + sd, z + wD, 1.6); });
  B.put(BOX(12.4, 1.2, 2.6), C.white, x, 7.4, z + wD); B.put(gable(12, 3.6, 2.4), C.roofR, x, 8, z + wD, { ry: 0 });
  thaiHall(B, x, z - 8, 24, 14, { spire: true });
  thaiHall(B, x - 30, z + 4, 12, 9, { ry: Math.PI / 2, roof: C.roofO });
  thaiHall(B, x + 30, z + 4, 12, 9, { ry: -Math.PI / 2, roof: C.roofO });
  [-12, 0, 12].forEach((a) => chedi(B, x + a, z - 30, 1.15));
  [[-10, 22], [10, 22], [-20, 22], [20, 22]].forEach(([a, b]) => banner(B, x + a, z + b, '#9e2a2b', 7));
  [[-26, -24], [26, -24], [-38, 30], [38, 30]].forEach(([a, b]) => tree(B, x + a, z + b, r, 1.1));
}
function zoneMarket(B, r) {
  const { x, z } = ZONES[2];
  for (let i = 0; i < 8; i++) { const hz = z - 40 + i * 12; if (Math.abs(hz - z) < 7) continue; const k = 'thai_house' + (1 + (i % 4)); jarBeside(model(k, riverX(hz) - 23, hz, -Math.PI / 2, 1.15), k, 1.15); }
  for (let i = 0; i < 12; i++) { const sx = x - 12 + (i % 4) * 7, sz = z - 16 + Math.floor(i / 4) * 11 + (r() - 0.5) * 2; if (pathClear(sx, sz, 1.8)) stall(B, sx, sz, r); }
  // pier
  B.put(BOX(PIER.x1 - PIER.x0, 0.35, PIER.z1 - PIER.z0), C.woodL, (PIER.x0 + PIER.x1) / 2, 0.42, (PIER.z0 + PIER.z1) / 2);
  for (let px = PIER.x0 + 2; px < PIER.x1; px += 4) [PIER.z0, PIER.z1].forEach((pz) => B.put(CYL(0.15, 0.15, 3, 5), C.woodD, px, -0.3, pz));
  model('thai_sala', x - 30, z + 20, 0, 1.4);
  for (let i = 0; i < 6; i++) banner(B, x - 22 + i * 9, z - 26, UMB[i], 5);
}
function zoneForest(B, r) {
  const { x, z } = ZONES[3];
  // garuda temple
  const gx = x - 4, gz = z - 18;
  [[14, 1.2], [11, 1.2], [8, 1.2]].forEach(([w, h], i) => B.put(BOX(w, h, w), i % 2 ? C.stoneD : C.stone, gx, h / 2 + i * 1.2, gz));
  boxC(gx, gz, 7, 7);
  garuda(B, gx, 3.6, gz, 1.25);
  [-1, 1].forEach((sd) => lion(B, gx + sd * 7, gz + 12, Math.PI));
  // pond + naga
  const px = x + 16, pz = z + 18, pr = 13;
  waters.push({ x: px, z: pz, r: pr });
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; rock(B, px + Math.cos(a) * (pr + 1), pz + Math.sin(a) * (pr + 1), 0.8 + r() * 0.5, r); colliders.pop(); }
  for (let i = 0; i < 10; i++) { const a = r() * 6.28, d = r() * (pr - 2); lotus(B, px + Math.cos(a) * d, pz + Math.sin(a) * d, r); }
  // the naga is now an animated model circling this pond (naga.js)
  // cliffs + waterfalls (west edge)
  for (let i = 0; i < 16; i++) { const cz = z - 50 + i * 7; const s = 5 + r() * 4; B.put(new THREE.DodecahedronGeometry(s, 0), i % 2 ? C.rock : '#7e756a', ZONES[3].x - 48 + r() * 4, s * 0.8, cz, { ry: r() * 6, sy: 1.6 }); }
  boxC(ZONES[3].x - 48, z, 6, 60);
  // stream from waterfalls to pond
  waters.push({ x: ZONES[3].x - 33, z: z + 8, r: 7 });
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 15 + r() * 45; rock(B, x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5 + r(), r); }
}
function lotus(B, x, z, r) {
  B.put(CYL(0.9, 0.9, 0.05, 10), '#3f9e46', x, 0.1, z, { shadow: false });
  if (r() < 0.6) B.put(CONE(0.35, 0.7, 6), '#f78fb3', x + 0.3, 0.45, z, { shadow: false });
}
function garuda(B, x, y, z, s) {
  const f = (g, c, lx, ly, lz, o = {}) => B.put(g, c, x + lx * s, y + ly * s, z + lz * s, { ...o, s: (o.s || 1) * s });
  f(CYL(0.9, 1.3, 3.2, 10), '#c0392b', 0, 4.2, 0);                         // torso
  f(CYL(1.35, 1.35, 0.5, 10), C.gold, 0, 2.9, 0);                          // belt
  f(CYL(1.1, 1.4, 1.6, 10), C.gold, 0, 2.0, 0);                            // skirt
  [-0.7, 0.7].forEach((lx) => { f(CYL(0.35, 0.25, 2.2, 6), C.gold, lx, 0.6, 0); f(BOX(0.8, 0.3, 1.1), C.goldD, lx, -0.4, 0.3); });
  f(SPH(1.05, 12, 10), '#d9483b', 0, 6.6, 0);                               // head
  f(CONE(0.45, 1.6, 6), C.gold, 0, 6.3, 1.3, { rx: Math.PI / 2 + 0.5 });   // beak
  f(SPH(0.2, 6, 5), '#fff', -0.42, 6.95, 0.85); f(SPH(0.2, 6, 5), '#fff', 0.42, 6.95, 0.85);
  f(SPH(0.11, 6, 5), '#111', -0.42, 6.95, 1.02); f(SPH(0.11, 6, 5), '#111', 0.42, 6.95, 1.02);
  [[1.1, 0], [0.8, 1], [0.55, 2], [0.3, 3]].forEach(([rr, i]) => f(CYL(rr * 0.9, rr, 0.8, 8), C.gold, 0, 7.6 + i * 0.75, 0));
  f(CONE(0.25, 1.4, 6), C.gold, 0, 11.2, 0);
  [-1, 1].forEach((sd) => { // arms up
    f(CYL(0.28, 0.3, 2.4, 6), '#c0392b', sd * 1.5, 6.1, 0, { rz: -sd * 0.9 });
    f(SPH(0.35, 6, 5), C.gold, sd * 2.4, 7.0, 0);
  });
  const w = new THREE.Shape();
  w.moveTo(0, 0); w.lineTo(2.5, 1.2); w.lineTo(5.6, 1.6); w.lineTo(7.4, 4.6); w.lineTo(6.2, 4.2); w.lineTo(6.6, 6.6); w.lineTo(5.0, 5.2); w.lineTo(4.8, 7.4); w.lineTo(3.4, 5.4); w.lineTo(2.4, 6.6); w.lineTo(1.6, 3.6); w.lineTo(0, 2.4); w.closePath();
  const wg = new THREE.ExtrudeGeometry(w, { depth: 0.25, bevelEnabled: false });
  const wg2 = wg.clone(); wg2.scale(0.8, 0.8, 1);
  [[1, 0], [-1, Math.PI]].forEach(([sd, ry]) => {
    f(wg, '#c0392b', sd * 0.8, 4.0, -0.6, { ry });
    f(wg2, C.gold, sd * 0.9, 4.1, -0.45, { ry });
  });
}
function zoneTheater(B, r, scene) {
  const { x, z } = ZONES[4];
  const f = frame(B, x, z, Math.PI / 2); // stage front (local +z) faces +x, toward spawn
  f(BOX(18, 1.6, 11), '#7a3b22', 0, 0.8, 0);
  f(BOX(18.6, 0.25, 11.6), C.gold, 0, 1.65, 0);
  [-8.5, -3, 3, 8.5].forEach((lx) => [-5, 5].forEach((lz) => f(CYL(0.32, 0.36, 6.5, 8), '#a52a2a', lx, 4.9, lz)));
  f(BOX(18, 6, 0.4), '#8e2430', 0, 4.8, -5.2);
  f(BOX(15, 4.5, 0.2), '#d9a441', 0, 4.8, -4.95);
  f(BOX(13.6, 3.6, 0.2), '#3f7f9e', 0, 4.8, -4.85);           // painted sky backdrop
  [-4.5, 0, 4.5].forEach((lx, i) => f(CONE(2.2 + i % 2, 2.8, 4), '#5c8f4a', lx, 3.9, -4.7, { ry: Math.PI / 4 }));
  f(gable(21, 14, 5.5), '#7b3f8f', 0, 8.1, 0); f(gable(21.6, 14.8, 4.8), C.gold, 0, 7.8, 0);
  f(gable(13, 10, 4.2), '#7b3f8f', 0, 10.4, 0);
  [-1, 1].forEach((sd) => { f(tri(9, 3.6, 0.25), C.gold, sd * 6.55, 10.5, 0); f(CONE(0.25, 2.2, 5), C.gold, sd * 6.8, 14.9, 0, { rz: -sd * 0.5 }); });
  [[-1, '#7b3f8f'], [1, '#9e2a2b']].forEach(([sd, col]) => banner(B, x + 9, z + sd * 12, col, 7));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.put(BOX(1, 0.5, 5), C.woodL, x + 12 + j * 3.2, 0.25, z - 9 + i * 6);
  [[-1, 0], [1, 0]].forEach(([sd]) => { B.put(CYL(0.9, 0.9, 1.4, 12), '#7a3b22', x + 9, 0.7, z + sd * 7); B.put(CYL(0.95, 0.95, 0.15, 12), '#f3e6c8', x + 9, 1.45, z + sd * 7); });
  boxC(x, z, 5.8, 9.4);
  // khon performers on stage
  const cast = [['hanuman', -6], ['thotsakan', -2], ['rama', 2], ['sida', 6]];
  cast.forEach(([role, lz], i) => {
    const ch = makeKhon(role);
    ch.root.position.set(x + 0.5, 1.78, z + lz);
    ch.root.rotation.y = Math.PI / 2;
    ch.root.scale.setScalar(1.5);
    ch.mixer.update(i * 0.6);
    scene.add(ch.root);
    animated.push((t, dt) => ch.update(dt));
  });
}
// City wall (กำแพงเมือง) around the whole city. West/north/south are straight; the east wall runs on the far
// bank so the river and the floating market stay inside the city, like Ayutthaya's island.
export const CITY = { w: -HALF + 6, n: -HALF + 6, s: WALL_Z };
function wallRun(B, x0, z0, x1, z1, gaps = [], h = 7, collide = true) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 4), ry = Math.atan2(-(z1 - z0), x1 - x0);
  const ox = -(z1 - z0) / len, oz = (x1 - x0) / len; // inward normal side for merlons
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (gaps.some(([gx, gz, gr]) => Math.hypot(x - gx, z - gz) < gr)) continue;
    B.put(BOX(len / n + 0.05, h, 4), C.brick, x, h / 2, z, { ry });
    [-1, 1].forEach((sd) => B.put(BOX(1.4, 1.2, 1), C.brickL, x + Math.cos(ry) * sd, h + 0.6, z - Math.sin(ry) * sd, { ry }));
    if (collide) circ(x, z, 2.4);
  }
}
function tower(B, x, z) { B.put(CYL(4.2, 4.6, 11, 10), C.brick, x, 5.5, z); B.put(CONE(5, 5, 10), C.roofR, x, 13.5, z); B.put(CYL(4.8, 4.8, 0.5, 10), C.brickL, x, 11, z); circ(x, z, 4.6); }
function fort(B, fx, fz) {
  B.put(CYL(9, 10, 8, 8), C.brick, fx, 4, fz); B.put(CYL(9.4, 9.4, 1, 8), C.brickL, fx, 8.4, fz);
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; B.put(BOX(2, 1.4, 1), C.brickL, fx + Math.cos(a) * 9, 9.5, fz + Math.sin(a) * 9, { ry: -a }); }
  B.put(CYL(0.6, 0.6, 3, 8), '#333', fx + 6, 9.5, fz - 4, { rz: 1.2 });
  circ(fx, fz, 10);
}
function cityWalls(B) {
  const { w, n, s } = CITY, gx = ZONES[5].x;
  const eastX = (z) => riverX(z) + 20, rw = riverX(s) - 15, re = riverX(s) + 16;
  wallRun(B, w, s, rw, s, [[gx, s, 6]]);                 // south, with the main gate
  wallRun(B, re, s, eastX(s), s, [], 7, false);          // south, far bank
  wallRun(B, w, n, w, s);                                // west
  const nw = riverX(n) - 15, ne = riverX(n) + 16;
  wallRun(B, w, n, nw, n);                               // north
  wallRun(B, ne, n, eastX(n), n, [], 7, false);
  for (let z = n; z < s; z += 8) wallRun(B, eastX(z), z, eastX(Math.min(z + 8, s)), Math.min(z + 8, s), [], 7, false); // east (far bank)
  [[w, n], [w, s], [eastX(n), n], [eastX(s), s]].forEach(([x, z]) => fort(B, x, z));
  [[rw, s], [re, s], [nw, n], [ne, n]].forEach(([x, z]) => tower(B, x, z));   // water gates flank the river
  for (let x = w + 45; x < rw - 20; x += 50) { if (Math.abs(x - gx) > 14) tower(B, x, s); tower(B, x, n); }
  for (let z = n + 50; z < s - 20; z += 50) { tower(B, w, z); tower(B, eastX(z), z); }
}
function zoneGate(B, r) {
  const gx = ZONES[5].x, wz = WALL_Z;
  cityWalls(B);
  // gatehouse
  [-6.5, 6.5].forEach((sd) => { B.put(BOX(4, 11, 6), C.brickL, gx + sd, 5.5, wz); circ(gx + sd, wz, 2.6); });
  B.put(BOX(17, 2.5, 6), C.brickL, gx, 9.9, wz);
  B.put(BOX(9, 1.2, 6.2), C.white, gx, 8.2, wz);
  thaiRoofOnly(B, gx, 11.2, wz, 15, 8, C.roofR);
  B.put(BOX(9, 0.2, 14), C.stone, gx, 0.1, wz, { shadow: false });
  // final treasure altar
  [[-14, -10], [14, -10]].forEach(([a, b]) => model('thai_sala', gx + a, wz + b - 8, 0, 1.4));
  [[-22, -6], [22, -6]].forEach(([a, b]) => banner(B, gx + a, wz + b, '#c0392b', 8));
}
function thaiRoofOnly(B, x, y, z, w, d, roof) {
  const h1 = d * 0.6;
  B.put(gable(w + 0.6, d + 0.8, h1 * 0.88), C.roofG, x, y - 0.3, z);
  B.put(gable(w, d, h1), roof, x, y, z);
  B.put(gable(w * 0.6, d * 0.8, h1 * 1.1), roof, x, y + h1 * 0.4, z);
  [-1, 1].forEach((sd) => B.put(CONE(0.25, 2, 5), C.gold, x + sd * w * 0.32, y + h1 * 1.5 + 0.4, z, { rz: -sd * 0.5 }));
}
// Welcome arches (ซุ้มประตู) at the start of every road from the central plaza, each signed with its destination.
function signTexture(text, sub, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#f6e3b4'; x.fillRect(0, 0, 512, 160);
  x.strokeStyle = color; x.lineWidth = 14; x.strokeRect(7, 7, 498, 146);
  x.strokeStyle = '#8a5a22'; x.lineWidth = 4; x.strokeRect(20, 20, 472, 120);
  x.fillStyle = '#4a2a12'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 58px Mitr, sans-serif'; x.fillText(text, 256, 70, 460);
  x.font = '500 28px Mitr, sans-serif'; x.fillStyle = '#7a4a22'; x.fillText(sub, 256, 122, 460);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function welcomeArches(B, scene) {
  const roads = PATHS.filter((p) => p.a[0] === SPAWN.x && p.a[1] === SPAWN.z), placed = [];
  for (const p of roads) {
    const zn = ZONES[roads.indexOf(p)];   // spawn roads are defined in ZONES order
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), dx = (p.b[0] - p.a[0]) / len, dz = (p.b[1] - p.a[1]) / len;
    let D = 14; while (placed.some(([px, pz]) => Math.hypot(p.a[0] + dx * D - px, p.a[1] + dz * D - pz) < 10) && D < len - 6) D += 3;
    const x = p.a[0] + dx * D, z = p.a[1] + dz * D, ry = Math.atan2(dx, dz), f = frame(B, x, z, ry), half = p.w / 2 + 0.9;
    placed.push([x, z]);
    [-1, 1].forEach((sd) => { f(CYL(0.22, 0.26, 4.6, 8), '#a52a2a', sd * half, 2.3, 0); f(BOX(0.7, 0.4, 0.7), C.gold, sd * half, 0.2, 0); circ(...wpos(x, z, ry, sd * half, 0), 0.4); });
    f(BOX(half * 2 + 0.8, 0.35, 0.5), C.gold, 0, 4.5, 0);
    f(gable(half * 2 + 1.6, 1.9, 1.3), C.roofG, 0, 4.62, 0); f(gable(half * 2 + 1.2, 1.5, 1.2), C.roofR, 0, 4.7, 0);
    [-1, 1].forEach((sd) => f(CONE(0.12, 0.9, 5), C.gold, sd * (half + 0.6), 6.0, 0, { rz: -sd * 0.5 }));
    const front = new THREE.MeshLambertMaterial({ map: signTexture(zn.name, 'ทางไป ➜', zn.color) });
    const back = new THREE.MeshLambertMaterial({ map: signTexture('ลานกลางเมือง', '⬅ กลับจุดเริ่มต้น', '#8a5a22') });
    [0, Math.PI].forEach((flip) => {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.06), flip ? back : front);
      sign.position.set(x - dx * (flip ? -0.27 : 0.27), 3.75, z - dz * (flip ? -0.27 : 0.27)); sign.rotation.y = ry + Math.PI + flip; scene.add(sign);
    });
  }
}
// ห้องนาฏศิลป์: open Thai pavilion near the spawn — teak floor, mirror wall + barre, khong wong, ranat, chada stands, KayKit furniture (CC0)
export const DANCE = { x: -6, z: 48 };
function danceHall(B, scene) {
  const { x, z } = DANCE, f = frame(B, x, z, 0), HW = 7, HD = 5, fl = 0.45, P = (n, lx, lz, ry = 0, sc = 0.9, y) => MODELS.push({ name: n, x: x + lx, z: z + lz, ry, sc, y });
  f(BOX(HW * 2, 0.45, HD * 2), C.woodD, 0, fl - 0.22, 0); PLATFORMS.push({ x, z, hw: HW, hd: HD, h: fl });
  f(BOX(HW * 2 - 0.4, 0.04, HD * 2 - 0.4), '#c98a4b', 0, fl + 0.02, 0);                       // polished teak
  f(BOX(3, 0.22, 1.2), C.woodD, 0, fl - 0.33, -HD - 0.6);                                          // front step
  for (let i = -2; i <= 2; i++) for (const sz of [-1, 1]) {                                       // posts (front middle left open)
    if (sz === -1 && Math.abs(i) < 1) continue;
    const px = i * HW / 2; f(CYL(0.18, 0.22, 3.6, 8), '#7a3b22', px, fl + 1.8, sz * HD); circ(x + px, z + sz * HD, 0.3);
  }
  for (const sx of [-1, 1]) { f(CYL(0.18, 0.22, 3.6, 8), '#7a3b22', sx * HW, fl + 1.8, 0); circ(x + sx * HW, z, 0.3); }
  // back wall with mirror + barre
  f(BOX(HW * 2, 3.4, 0.3), '#efe2c4', 0, fl + 1.7, HD - 0.15); boxC(x, z + HD - 0.15, HW, 0.3);
  f(BOX(HW * 2 - 3, 2.2, 0.06), '#bfe0f2', 0, fl + 1.55, HD - 0.33, { shadow: false }); f(BOX(HW * 2 - 2.8, 0.12, 0.08), C.gold, 0, fl + 2.7, HD - 0.33);
  f(CYL(0.05, 0.05, HW * 2 - 2, 6), C.woodL, 0, fl + 1.05, HD - 0.75, { rz: Math.PI / 2 });
  for (const bx of [-5, 0, 5]) f(BOX(0.06, 0.6, 0.45), C.woodL, bx, fl + 0.75, HD - 0.55);
  // low lattice rails on the sides
  for (const sx of [-1, 1]) { f(BOX(0.15, 0.9, HD * 2), C.woodL, sx * HW, fl + 0.45, 0); boxC(x + sx * HW, z, 0.15, HD); }
  // tiered Thai roof + chofa
  f(gable(HW * 2 + 2, HD * 2 + 2.4, 2.4), C.roofR, 0, fl + 3.6, 0); f(gable(HW * 2 + 0.6, HD * 2 - 1, 1.9), C.roofG, 0, fl + 4.4, 0);
  for (const sx of [-1, 1]) f(CONE(0.12, 1.1, 5), C.gold, sx * (HW + 0.9), fl + 6.6, 0, { rz: -sx * 0.5 });
  // sign over the entrance
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.6), new THREE.MeshLambertMaterial({ map: signTexture('ห้องนาฏศิลป์', 'โรงเรียนตราดสรรเสริญวิทยาคม', '#9b59b6') }));
  sign.position.set(x, fl + 3.1, z - HD - 0.25); sign.rotation.y = Math.PI; scene.add(sign);
  // khong wong yai: rattan ring + 16 bronze gongs
  const kx = -4.6, kz = 1.6;
  f(new THREE.TorusGeometry(1.1, 0.06, 6, 24, Math.PI * 1.6), '#8a5a22', kx, fl + 0.32, kz, { rx: Math.PI / 2, rz: Math.PI * 0.7 });
  for (let i = 0; i < 16; i++) { const a = Math.PI * 0.7 + (i / 15) * Math.PI * 1.6; f(CYL(0.13, 0.13, 0.07, 10), '#b8862b', kx + Math.cos(a) * 1.1, fl + 0.42, kz + Math.sin(a) * 1.1); f(CYL(0.05, 0.05, 0.05, 6), '#e0b040', kx + Math.cos(a) * 1.1, fl + 0.47, kz + Math.sin(a) * 1.1); }
  circ(x + kx, z + kz, 1.2);
  // ranat ek: curved boat body on a stand + 21 bars
  const rx = 4.6, rz = 1.8;
  f(BOX(0.5, 0.35, 0.5), '#5a2a14', rx, fl + 0.18, rz); f(BOX(2.2, 0.3, 0.55), '#7a3b22', rx, fl + 0.5, rz);
  for (const s of [-1, 1]) f(BOX(0.4, 0.3, 0.55), '#7a3b22', rx + s * 1.2, fl + 0.62, rz, { rz: s * 0.4 });
  for (let i = 0; i < 21; i++) f(BOX(0.075, 0.04, 0.42 - i * 0.008), i % 2 ? '#c99050' : '#a8743c', rx - 1 + i * 0.1, fl + 0.68, rz);
  circ(x + rx, z + rz, 1.2);
  // chada headdresses on stands along the left rail
  for (const [cx, cz] of [[-6.2, -2.6], [-6.2, -0.6]]) {
    f(CYL(0.08, 0.12, 1.1, 6), C.woodD, cx, fl + 0.55, cz); f(CYL(0.22, 0.2, 0.25, 10), C.gold, cx, fl + 1.2, cz);
    f(CONE(0.2, 0.5, 10), C.gold, cx, fl + 1.55, cz); f(CONE(0.12, 0.45, 8), '#f3d27a', cx, fl + 1.95, cz); f(CONE(0.05, 0.4, 6), C.gold, cx, fl + 2.3, cz);
    circ(x + cx, z + cz, 0.3);
  }
  // KayKit Furniture Bits (CC0)
  P('kk_rug_rectangle_stripes_A', 0, -0.4, 0, 2.2, fl + 0.05);
  P('kk_cabinet_medium_decorated', 5.7, -1.6, -Math.PI / 2, 0.9, fl); boxC(x + 5.7, z - 1.6, 0.5, 0.95);
  P('kk_shelf_B_large_decorated', -6.6, 3.0, Math.PI / 2, 0.9, fl);
  [-6.2, 6.2].forEach((lx) => P('kk_pictureframe_large_A', lx, HD - 0.3, Math.PI, 0.95, fl + 2.0));   // hung on the back wall beside the mirror
  for (const [lx, lz] of [[-6.3, 4.2], [6.3, 4.2]]) { P('kk_lamp_standing', lx, lz, 0, 0.8, fl); circ(x + lx, z + lz, 0.35); }
  for (const lx of [-2.4, -1.2, 0, 1.2, 2.4]) P('kk_pillow_A', lx, -3.7, 0, 1.3, fl + 0.1);
  P('kk_table_small', 5.4, -3.6, 0, 0.9, fl); P('kk_chair_A_wood', 5.4, -2.7, Math.PI, 0.9, fl); circ(x + 5.4, z - 3.4, 0.6);
}
function zoneSpawn(B, r, scene) {
  welcomeArches(B, scene);
  danceHall(B, scene);
  const { x, z } = SPAWN;
  model('thai_sala', x - 8, z - 16, Math.PI / 2, 1.4);   // north of the road hub, between the wat and palace roads
  model('thai_sala', x + 8, z - 16, -Math.PI / 2, 1.4);
  // small Thai village around the spawn
  [[-34, 10, 1], [-40, 36, 3], [30, 52, 2], [40, 14, 4], [-22, 58, 4]].forEach(([a, b, k]) => { const n = 'thai_house' + k; jarBeside(model(n, x + a, z + b, 0, 1.15, true, 'path'), n, 1.15); });
  banner(B, x - 6, z - 12, '#9e2a2b', 7); banner(B, x + 6, z - 12, '#9e2a2b', 7);
  const [wx, wz] = offPath(x - 7, z + 9, 1.9);
  B.put(CYL(1.6, 1.8, 1, 12), C.stone, wx, 0.5, wz); B.put(CYL(1.3, 1.3, 0.2, 12), '#4fb3e8', wx, 1.0, wz, { shadow: false }); circ(wx, wz, 1.9); WELL.x = wx; WELL.z = wz; // village well, off the road hub
}

// ================= ground, paths, water, sky =================
export const RICE = [{ x0: -40, x1: -16, z0: 54, z1: 76 }, { x0: 36, x1: 60, z0: 40, z1: 62 }];
const inRice = (x, z, m = 0) => RICE.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
const mudCol = new THREE.Color('#7f8f4e');
export const PATHS = [];
export const PLAZAS = [];
function definePaths() {
  const s = SPAWN, seg = (a, b, w = 4.5) => PATHS.push({ a, b, w });
  const [W, P, M, F, T, G] = ZONES;   // roads lead to each zone's entrance
  seg([s.x, s.z], [W.x, W.z + 47]); seg([W.x, W.z + 47], [W.x, W.z + 19], 6);
  seg([s.x, s.z], [P.x, P.z + 42]);
  seg([s.x, s.z], [M.x - 22, M.z]); seg([M.x - 22, M.z], [PIER.x0 + 2, M.z], 6);
  seg([s.x, s.z], [F.x + 6, F.z - 35]); seg([F.x + 6, F.z - 35], [F.x + 6, F.z - 13], 5);
  seg([s.x, s.z], [T.x + 16, T.z]);
  seg([s.x, s.z], [G.x, G.z - 8]); seg([G.x, G.z - 8], [G.x, WALL_Z + 10], 7);
  seg([F.x + 6, F.z - 35], [T.x + 16, T.z]); seg([P.x, P.z + 42], [M.x - 22, M.z]);
  for (const f of RICE) for (let it = 0; it < 60; it++) {
    let bad = null;
    for (let t = 0; t <= 1 && !bad; t += 0.05) for (const [px, pz] of [[f.x0 + (f.x1 - f.x0) * t, f.z0], [f.x0 + (f.x1 - f.x0) * t, f.z1], [f.x0, f.z0 + (f.z1 - f.z0) * t], [f.x1, f.z0 + (f.z1 - f.z0) * t]]) if (!pathClear(px, pz, 3)) { bad = [px, pz]; break; }
    if (!bad) break;
    const dl = [Math.abs(bad[0] - f.x0), Math.abs(bad[0] - f.x1), Math.abs(bad[1] - f.z0), Math.abs(bad[1] - f.z1)], k = dl.indexOf(Math.min(...dl));
    if (k === 0) f.x0 += 1; else if (k === 1) f.x1 -= 1; else if (k === 2) f.z0 += 1; else f.z1 -= 1;
  }
  PLAZAS.push({ x: SPAWN.x, z: SPAWN.z - 4, r: 10, c: '#efc995' }, { x: ZONES[0].x, z: ZONES[0].z, r: 42, c: '#e6a874' }, { x: ZONES[4].x + 12, z: ZONES[4].z, r: 16, c: '#efc995' }, { x: ZONES[5].x, z: WALL_Z - 14, r: 16, c: '#efc995' }, { x: ZONES[2].x - 2, z: ZONES[2].z, r: 24, c: '#ebbd88' });
}
const PALACE_YARD = () => ({ x: ZONES[1].x, z: ZONES[1].z, hw: 46, hd: 40 });
const pathCol = new THREE.Color(C.path), plazaCols = new Map();
function pathColorAt(x, z) {
  if (inRice(x, z)) return mudCol;
  for (const { a, b, w } of PATHS) if (distSeg(x, z, a, b) < w / 2 + 0.6) return pathCol;
  for (const p of PLAZAS) if (Math.hypot(x - p.x, z - p.z) < p.r) { if (!plazaCols.has(p.c)) plazaCols.set(p.c, new THREE.Color(p.c)); return plazaCols.get(p.c); }
  const y = PALACE_YARD(); if (Math.abs(x - y.x) < y.hw && Math.abs(z - y.z) < y.hd) return plazaCols.get('#efc995') || new THREE.Color('#efc995');
  return null;
}
function isSlab(x, z) {
  const y = PALACE_YARD();
  if (Math.abs(x - y.x) < y.hw && Math.abs(z - y.z) < y.hd) return true;
  return [PLAZAS[0], PLAZAS[1], PLAZAS[2], PLAZAS[3]].some((p) => Math.hypot(x - p.x, z - p.z) < p.r);
}
// footstep material under (x,z): wood | brick | stone (plaster) | dirt | grass
export function surfaceAt(x, z) {
  if (x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) return 'wood';
  if (PLATFORMS.some((p) => Math.abs(x - p.x) < p.hw && Math.abs(z - p.z) < p.hd)) return 'brick';
  const y = PALACE_YARD(); if (Math.abs(x - y.x) < y.hw && Math.abs(z - y.z) < y.hd) return 'brick';
  const w = PLAZAS[1]; if (w && Math.hypot(x - w.x, z - w.z) < w.r) return 'brick';
  if (isSlab(x, z)) return 'stone';
  if (inRice(x, z)) return 'dirt';
  for (const { a, b, w: pw } of PATHS) if (distSeg(x, z, a, b) < pw / 2 + 0.4) return 'dirt';
  for (const p of PLAZAS) if (Math.hypot(x - p.x, z - p.z) < p.r) return 'dirt';
  return 'grass';
}
function flatness(x, z) {
  let f = 1;
  if (inRice(x, z, 10)) return 0;
  for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z) - zn.r * 0.95; if (d < 30) f = Math.min(f, THREE.MathUtils.smoothstep(d, 0, 30)); }
  const dd = Math.hypot(x - DANCE.x, z - DANCE.z) - 10; f = Math.min(f, THREE.MathUtils.smoothstep(dd, 0, 12));   // flat ground under the dance hall
  const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z) - 26; f = Math.min(f, THREE.MathUtils.smoothstep(ds, 0, 20));
  for (const { a, b, w } of PATHS) { const d = distSeg(x, z, a, b) - w / 2 - 1; if (d < 14) f = Math.min(f, THREE.MathUtils.smoothstep(d, 0, 14)); }
  if (z > WALL_Z - 30) f = Math.min(f, THREE.MathUtils.smoothstep(WALL_Z - z, 8, 30));
  return f;
}
function grassMask(x, z) {
  if (pathColorAt(x, z)) return 0;
  if (Math.abs(x - riverX(z)) < 15.5) return 0;
  for (const w of waters) if (Math.hypot(x - w.x, z - w.z) < w.r + 0.8) return 0;
  if (z > WALL_Z - 2.5 && z < WALL_Z + 2.5) return 0;
  return 1;
}
function bakeAll() {
  bakeTerrain({ flatness, grassMask, riverX, half: HALF });
  for (const c of colliders) c.r !== undefined ? stampMask(c.x, c.z, c.r + 0.3) : stampBox(c.x, c.z, c.hw + 0.4, c.hd + 0.4);
  for (const p of PLATFORMS) stampBox(p.x, p.z, p.hw + 0.5, p.hd + 0.5);   // no grass through floors
  finalizeMask();
}
function buildWater(scene) {
  const pos = [];
  for (let z = -300; z < 300; z += 4) {
    const z1 = z + 4, a0 = riverX(z), a1 = riverX(z1), w = 16;
    pos.push(a0 - w, 0, z, a1 - w, 0, z1, a0 + w, 0, z, a0 + w, 0, z, a1 - w, 0, z1, a1 + w, 0, z1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const mat = buildWaterSurface(scene, { strips: [g], ponds: waters, uTime });
  // waterfalls
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const cx = cv.getContext('2d');
  cx.fillStyle = '#8fd6ff'; cx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) { cx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; cx.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 3, 20 + Math.random() * 50); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const fm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 });
  [[ZONES[3].x - 42, ZONES[3].z + 8, 13], [ZONES[3].x - 42, ZONES[3].z - 22, 10]].forEach(([x, z, h]) => {
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(6, h), fm); wf.position.set(x, h / 2, z); wf.rotation.y = Math.PI / 2; scene.add(wf);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 20), mat); pool.rotation.x = -Math.PI / 2; pool.position.set(x + 5, 0.07, z); scene.add(pool);
  });
  animated.push((t) => { tex.offset.y = t * 0.8; });
}
function fit(o, len) {
  const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3());
  o.scale.multiplyScalar(len / Math.max(sz.x, sz.z));
  const b2 = new THREE.Box3().setFromObject(o);
  o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  return o;
}
function buildBoats(scene) {
  const mk = (x, z, kind, rot = 0) => {
    const g = new THREE.Group(), b = prop(kind);
    if (!b) return g;
    const bb0 = new THREE.Box3().setFromObject(b), sz = bb0.getSize(new THREE.Vector3());
    if (sz.x > sz.z) b.rotation.y = Math.PI / 2;
    const inner = new THREE.Group(); inner.add(b); fit(inner, kind === 'Sail_ship' ? 18 : 6); g.add(inner);
    if (kind === 'Boat') {
      for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(ICO(0.28, 0), getMat(['#ff8c3d', '#ffd23f', '#8bd450', '#c0392b'][i % 4])); f.position.set((i % 2) * 0.5 - 0.25, 0.75, -0.8 - i * 0.25); g.add(f); }
    }
    g.position.set(x, kind === 'Sail_ship' ? -1.6 : -1.0, z); g.rotation.y = rot; scene.add(g);
    const ph = Math.random() * 6, y0 = g.position.y;
    animated.push((t) => { g.position.y = y0 + Math.sin(t * 1.4 + ph) * 0.08; g.rotation.z = Math.sin(t * 1.1 + ph) * 0.03; });
    return g;
  };
  mk(riverX(-14) + 5, -14, 'Sail_ship', 0.1);
  [[-46, 0], [6, 1], [58, 0], [92, 1]].forEach(([z, sd]) => mk(riverX(z) - 6 + sd * 9, z, 'Boat', sd ? 0.2 : -0.3));
  const drift = mk(riverX(0), 0, 'Boat', 0);
  animated.push((t) => { const z = ((t * 2.5) % 300) - 150; drift.position.x = riverX(z) + 3; drift.position.z = z; drift.rotation.y = Math.atan2(Math.cos(z / 28) * 6 / 28, 1); });
}
export const SUN_DIR = EVENING_DIR.clone(); // evening sun / night moon direction (updated by cycle.js)
export function buildSky(scene) {
  const g = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY.top }, mid: { value: SKY.mid }, hor: { value: SKY.hor }, sunDir: { value: SUN_DIR }, sunCol: { value: SKY.sunCol }, uTime, uNight: NIGHT, uNoise: { value: noiseTexture() } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, mid, hor, sunDir, sunCol; uniform float uTime, uNight; uniform sampler2D uNoise; varying vec3 vp;
      void main(){
        vec3 d = normalize(vp); float h = d.y;
        float sd = max(dot(d, sunDir), 0.0);
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h));
        c = mix(c, top, smoothstep(0.22, 0.85, h));
        c = mix(c, hor * 1.08, pow(sd, 3.0) * smoothstep(0.5, 0.0, h) * 0.7);      // warm band around the low sun
        // clouds: noise projected on a dome, lit warm toward the sun, lavender away from it
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 0.22 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = texture2D(uNoise, uv).r * 0.65 + texture2D(uNoise, uv * 2.7).g * 0.35;
          float cov = smoothstep(0.5, 0.72, n) * smoothstep(0.0, 0.12, h);
          vec3 cc = mix(vec3(0.72, 0.66, 0.9), vec3(1.0, 0.86, 0.72), pow(sd, 2.0) * 0.8 + 0.25);
          cc = mix(cc, vec3(0.13, 0.15, 0.32) + sunCol * pow(sd, 3.0) * 0.4, uNight);
          cc = mix(cc, vec3(1.0, 0.95, 0.85), smoothstep(0.65, 0.8, n) * 0.4);
          c = mix(c, cc, cov * 0.92);
          c += sunCol * pow(sd, 8.0) * cov * 0.9;                                        // silver lining
        }
        c += sunCol * (pow(sd, 1400.0) * 9.0 + pow(sd, 90.0) * 0.6 + pow(sd, 8.0) * 0.18) * (1.0 - uNight);
        // night: moon disc + halo, twinkling stars
        c += sunCol * (smoothstep(0.9993, 0.9996, sd) * 2.2 + pow(sd, 60.0) * 0.35) * uNight;
        if (h > 0.02) {
          vec3 sp = d * 220.0; vec3 cell = floor(sp); float rnd = fract(sin(dot(cell, vec3(12.98, 78.23, 37.71))) * 43758.5);
          float star = step(0.985, rnd) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + rnd * 60.0));
          c += vec3(0.9, 0.95, 1.0) * star * uNight * smoothstep(0.02, 0.25, h) * 1.4;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky);
  animated.push(() => sky.position.copy(scene.userData.camPos || sky.position));
  return sky;
}
function instanceProp(scene, name, list, size, tint = 1, sway = false) {
  const parts = propParts(name); if (!parts.length || !list.length) return;
  const bb = new THREE.Box3();
  parts.forEach((p) => { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); });
  const sz = bb.getSize(new THREE.Vector3()), k = size / Math.max(sz.x, sz.y, sz.z), d = new THREE.Object3D();
  for (const { geo, mat } of parts) {
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.scale(k, k, k);
    mat.color.multiplyScalar(tint);
    if (sway) {   // wind: tips bend more than the base, each clump on its own phase (like the grass)
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz; float k = position.y * position.y * 0.22;
          float gust = 0.6 + 0.4 * sin(uTime * 0.45 + ip.x * 0.03);
          transformed.x += sin(uTime * 2.1 + ip.x * 0.35 + ip.z * 0.2) * k * gust;
          transformed.z += cos(uTime * 1.6 + ip.x * 0.25 + ip.z * 0.31) * k * 0.6 * gust;`);
      };
      mat.customProgramCacheKey = () => 'rice-sway';
    }
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, ry, s], i) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }
}
function buildScatter(scene, r) {
  const free = (x, z, pad = 1) => !isBlockedWater(x, z) && grassAt(x, z) > 0.6 && !colliders.some((c) => c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + pad : Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) && z < WALL_Z - 4;
  // flowers (tiny instanced petals)
  const N = 0, d = new THREE.Object3D();   // ground flowers removed (too many)
  const fl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 7), new THREE.MeshLambertMaterial({ color: '#ffffff' }), N);
  const fc = ['#ffffff', '#fff3a0', '#c7a7ff', '#ff9ec7', '#ffffff', '#ffd27a'].map((c) => new THREE.Color(c));
  let k = 0;
  for (let tries = 0; k < N && tries < N * 6; tries++) {
    const x = (r() * 2 - 1) * HALF, z = (r() * 2 - 1) * HALF;
    if (grassAt(x, z) < 0.8 || isBlockedWater(x, z) || z > WALL_Z - 3) continue;
    d.position.set(x, terrainH(x, z) + 0.4 + r() * 0.3, z); d.rotation.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6); d.scale.setScalar(0.8 + r() * 0.6); d.updateMatrix();
    fl.setMatrixAt(k, d.matrix); fl.setColorAt(k++, fc[(r() * fc.length) | 0]);
  }
  fl.count = k; scene.add(fl);
  // bushes along paths and around zones
  const bushes = [], berries = [], rocks = [];
  for (const { a, b, w } of PATHS) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    for (let t = 0.08; t < 0.92; t += 7 / len) {
      if (r() < 0.45) continue;
      const sd = r() < 0.5 ? -1 : 1, off = w / 2 + 2 + r() * 3, x = a[0] + (b[0] - a[0]) * t + nx * off * sd, z = a[1] + (b[1] - a[1]) * t + nz * off * sd;
      if (!free(x, z, 1.5)) continue;
      (r() < 0.25 ? berries : bushes).push([x, terrainH(x, z) - 0.1, z, r() * 6, 0.8 + r() * 0.6]);
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = (r() * 2 - 1) * HALF, z = (r() * 2 - 1) * HALF; if (!free(x, z, 1.5)) continue;
    (r() < 0.6 ? bushes : rocks).push([x, terrainH(x, z) - 0.15, z, r() * 6, 0.6 + r() * 0.9]);
  }
  if (NAT.on) for (const [x, y, z, , sc] of [...bushes, ...berries]) NAT.bushes.push({ x, y: y + 0.1, z, h: 1.5 * sc, ry: hashRy(x, z) });
  for (const [x, y, z, ry, sc] of [...bushes, ...berries]) FOL.bushes.push({ x, y: y + 0.55 * sc, z, s: 1.05 * sc, sy: 0.75, ry, tint: 0.9 + r() * 0.2 });
  ['Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3'].forEach((n, i) => instanceProp(scene, n, rocks.filter((_, j) => j % 3 === i), 1.6, 1.2));
  // lilypads on the forest pond
  const pond = waters[0];
  if (pond) instanceProp(scene, 'Lilypad', Array.from({ length: 12 }, () => { const a = r() * 6.28, dd = r() * (pond.r - 2); return [pond.x + Math.cos(a) * dd, 0.08, pond.z + Math.sin(a) * dd, r() * 6, 0.8 + r() * 0.5]; }), 1.6, 1.2);
}
function buildLeafLitter(scene, r, low) {
  const N = low ? 200 : 500, geo = new THREE.PlaneGeometry(0.22, 0.32); geo.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), N), d = new THREE.Object3D();
  const cols = ['#7fae3a', '#a8c84a', '#d8c24e', '#c98f3a', '#5f9a34'].map((c) => new THREE.Color(c));
  let k = 0;
  for (let tries = 0; k < N && tries < N * 4; tries++) {
    const t = FOL.trees[(r() * FOL.trees.length) | 0]; if (!t) break;
    const onPath = r() < 0.35, a = r() * 6.28, dd = Math.sqrt(r()) * (onPath ? 9 : 5);
    const x = t.x + Math.cos(a) * dd, z = t.z + Math.sin(a) * dd;
    if (isBlockedWater(x, z)) continue;
    d.position.set(x, terrainH(x, z) + 0.04, z); d.rotation.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4); d.scale.setScalar(0.7 + r() * 0.8); d.updateMatrix();
    im.setMatrixAt(k, d.matrix); im.setColorAt(k++, cols[(r() * cols.length) | 0]);
  }
  im.count = k; im.receiveShadow = true; scene.add(im);
}
// waterfall pouring off the west cliffs into the forest stream pool
function buildWaterfall(scene) {
  const pool = { x: ZONES[3].x - 33, z: ZONES[3].z + 8 }, top = 12, W = 5, segY = 24;
  const g = new THREE.PlaneGeometry(W, 1, 8, segY), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {   // bend the sheet: lip at the cliff, curving out and down into the pool
    const t = p.getY(i) + 0.5, fall = 1 - t;          // t=1 top, 0 bottom
    p.setXYZ(i, p.getX(i) * (1 + fall * 0.25), top * t + 0.05, -9.5 + Math.pow(fall, 0.6) * 4.5);
  }
  g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 q = vec2(vUv.x * 9.0, vUv.y * 3.0 + uTime * 2.4);
        float s = n(q) * 0.6 + n(q * 2.3 + 5.0) * 0.4;
        vec3 c = mix(vec3(0.45, 0.72, 0.92), vec3(1.0), smoothstep(0.45, 0.85, s));
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = (0.55 + s * 0.45) * edge;
        a = mix(a, 1.0, smoothstep(0.15, 0.0, vUv.y) * edge * 0.6);   // white churn at the bottom
        gl_FragColor = vec4(c + (1.0 - vUv.y) * 0.15, a);
        #include <colorspace_fragment>
      }`,
  });
  const fallM = new THREE.Mesh(g, mat); fallM.position.set(pool.x, 0, pool.z); fallM.rotation.y = Math.PI / 2; scene.add(fallM);
  // foam ring + rising spray at the base
  const fx = pool.x - 5, fz = pool.z;
  const foam = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(fx, 0.12, fz); scene.add(foam);
  const N = 140, sp = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { seed[i] = Math.random(); pos.set([(Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4], i * 3); }
  sp.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sp.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const spray = new THREE.Points(sp, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime },
    vertexShader: `uniform float uTime; attribute float aSeed; varying float vA;
      void main(){ float t = fract(uTime * 0.6 + aSeed); vec3 p = position * (0.6 + t); p.y = t * 3.5 * (0.5 + aSeed);
        vA = (1.0 - t) * 0.7; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (18.0 + aSeed * 22.0) / -mv.z * 10.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 1.0, 1.0, vA * smoothstep(0.5, 0.0, d)); }',
  }));
  spray.position.set(fx, 0, fz); scene.add(spray);
  animated.push((t) => { foam.scale.setScalar(1 + Math.sin(t * 3) * 0.06); foam.material.opacity = 0.45 + Math.sin(t * 5) * 0.1; });
}
function buildRice(scene, r, low) {
  // Thai rice paddies: instanced blade clumps + low earth dikes
  const pts = [];
  for (const f of RICE) for (let x = f.x0 + 1; x < f.x1 - 0.5; x += low ? 1.4 : 0.9) for (let z = f.z0 + 1; z < f.z1 - 0.5; z += low ? 1.4 : 0.9) {
    if (Math.abs(((x - f.x0) % 8)) < 0.6 || Math.abs(((z - f.z0) % 8)) < 0.6) continue; // dikes
    pts.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3]);
  }
  // Quaternius Rice clumps (CC0), two variants
  const clumps = pts.filter((_, i) => i % 2 === 0).map(([x, z]) => [x, 0, z, r() * 6, 0.85 + r() * 0.35]);
  ['Rice_3', 'Rice_4'].forEach((n, k) => instanceProp(scene, n, clumps.filter((_, i) => i % 2 === k), 1.0, 1.05, true));
  const B = new Builder();
  for (const f of RICE) {
    for (let x = f.x0; x <= f.x1; x += 8) B.put(BOX(0.7, 0.35, f.z1 - f.z0), '#8a6a42', x, 0.15, (f.z0 + f.z1) / 2);
    for (let z = f.z0; z <= f.z1; z += 8) B.put(BOX(f.x1 - f.x0, 0.35, 0.7), '#8a6a42', (f.x0 + f.x1) / 2, 0.15, z);
    // shallow paddy water
    const w = new THREE.Mesh(new THREE.PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0), new THREE.MeshLambertMaterial({ color: '#6fb3b8', transparent: true, opacity: 0.55 }));
    w.rotation.x = -Math.PI / 2; w.position.set((f.x0 + f.x1) / 2, 0.06, (f.z0 + f.z1) / 2); w.receiveShadow = true; scene.add(w);
  }
  B.build(scene);
}
function buildLanterns(scene, r) {
  const spots = [];
  for (const { a, b, w } of PATHS) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    for (let t = 16; t < len - 8; t += 22) {
      const sd = (spots.length % 2) ? 1 : -1, x = a[0] + (b[0] - a[0]) * t / len + nx * (w / 2 + 1) * sd, z = a[1] + (b[1] - a[1]) * t / len + nz * (w / 2 + 1) * sd;
      if (pathClear(x, z, 0.3) && !isBlockedWater(x, z) && !colliders.some((c) => c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + 0.8 : Math.abs(x - c.x) < c.hw + 0.8 && Math.abs(z - c.z) < c.hd + 0.8)) spots.push([x, z]);
    }
  }
  // extra torches at gates and stages
  [[ZONES[1].x - 9, ZONES[1].z + 44], [ZONES[1].x + 9, ZONES[1].z + 44], [ZONES[5].x - 8, WALL_Z - 4], [ZONES[5].x + 8, WALL_Z - 4], [ZONES[4].x + 9, ZONES[4].z - 7], [ZONES[4].x + 9, ZONES[4].z + 7], [ZONES[0].x - 8, ZONES[0].z + 46], [ZONES[0].x + 8, ZONES[0].z + 46], [SPAWN.x - 5, SPAWN.z - 9], [SPAWN.x + 5, SPAWN.z - 9]].forEach(([x, z]) => spots.push(offPath(x, z, 0.3)));
  const n = spots.length, d = new THREE.Object3D();
  const post = new THREE.InstancedMesh(CYL(0.07, 0.1, 2.3, 6), getMat(C.woodD), n);
  const base = new THREE.InstancedMesh(CYL(0.26, 0.12, 0.3, 8), getMat('#3a2a1e'), n);
  const glow = new THREE.InstancedMesh(CYL(0.2, 0.2, 0.06, 8), new THREE.MeshLambertMaterial({ color: '#ffb347', emissive: '#ff8a2a', emissiveIntensity: 2 }), n);
  const cap = new THREE.InstancedMesh(BOX(0.05, 0.05, 0.05), getMat(C.woodD), n);
  const flames = [];
  spots.forEach(([x, z], i) => {
    const y = terrainH(x, z);
    [[post, y + 1.15, 0], [base, y + 2.4, 0], [glow, y + 2.56, 0], [cap, y + 0.02, 0]].forEach(([m, yy, ry]) => { d.position.set(x, yy, z); d.rotation.set(0, ry, 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    colliders.push({ x, z, r: 0.25 });
    flames.push([x, y + 2.6, z]);
  });
  torches(scene, flames, uTime);
  [post, base, glow, cap].forEach((m) => { m.castShadow = m !== glow; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); });
}
export function distSeg(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function scatterTrees(B, r) {
  const keepOut = [[SPAWN.x, SPAWN.z, 22], [ZONES[0].x, ZONES[0].z, 50], [ZONES[1].x, ZONES[1].z, 64], [ZONES[2].x, ZONES[2].z - 2, 36], [ZONES[4].x + 8, ZONES[4].z, 26], [ZONES[5].x, WALL_Z - 12, 24], [ZONES[3].x + 16, ZONES[3].z + 18, 30], [ZONES[3].x - 4, ZONES[3].z - 10, 20], [DANCE.x, DANCE.z, 14]];
  const ok = (x, z) => x > CITY.w + 6 && z > CITY.n + 6 && !inRice(x, z, 3) && !isBlockedWater(x, z) && Math.abs(x - riverX(z)) > 17 && !keepOut.some(([a, b, rr]) => Math.hypot(x - a, z - b) < rr) && !PATHS.some(({ a, b, w }) => distSeg(x, z, a, b) < w + 2) && z < WALL_Z - 5;
  let n = 0;
  for (let i = 0; i < 9000 && n < (scatterTrees.max || 380); i++) {
    const x = (r() * 2 - 1) * (HALF - 2), z = (r() * 2 - 1) * (HALF - 2);
    const inForest = Math.hypot(x - ZONES[3].x, z - ZONES[3].z) < 70;
    if (!inForest && r() < 0.3) continue;
    if (!ok(x, z)) continue;
    tree(B, x, z, r, inForest ? 1.2 + r() * 0.4 : 0.9 + r() * 0.4); n++;
  }
  // east bank & outer ring (decor only)
  for (let z = -HALF - 20; z < HALF + 20; z += 8) tree(B, riverX(z) + 24 + r() * 8, z, r, 1.1);
  for (let i = 0; i < 160; i++) { const a = r() * Math.PI * 2, d = HALF + 20 + r() * 40; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x - riverX(z)) < 20) continue; tree(B, x, z, r, 1.6 + r()); }
  colliders.splice(0, 0); // keep
}

// ================= entry =================
export function buildWorld(scene, { low = false } = {}) {
  definePaths();
  const r = rng(2026), B = new Builder();
  zoneSpawn(B, r, scene); zoneWat(B, r); zonePalace(B, r); zoneMarket(B, r); zoneForest(B, r); zoneTheater(B, r, scene); zoneGate(B, r);
  bakeAll();
  scatterTrees(B, r);
  buildGroundMesh(scene, { pathColorAt, isSlab });
  buildWater(scene);
  buildBoats(scene);
  buildScatter(scene, r);
  B.build(scene);
  for (const m of MODELS) { const o = prop(m.name); if (!o) continue; o.traverse((c) => { if (c.isMesh) c.material.side = THREE.DoubleSide; }); o.position.set(m.x, m.y ?? groundHeight(m.x, m.z), m.z); o.rotation.order = 'YZX'; o.rotation.set(m.rx || 0, m.ry, m.rz || 0); o.scale.setScalar(m.sc); scene.add(o); }
  const npcs = [
    [ZONES[1].x - 4, ZONES[1].z + 44, 0, 'guard'], [ZONES[1].x + 4, ZONES[1].z + 44, 0, 'guard'], [ZONES[1].x - 6, ZONES[1].z + 1, 0, 'guard'], [ZONES[1].x + 6, ZONES[1].z + 1, 0, 'guard'],
    [ZONES[5].x - 8, WALL_Z - 6, Math.PI, 'guard'], [ZONES[5].x + 8, WALL_Z - 6, Math.PI, 'guard'],
    [ZONES[2].x - 12, ZONES[2].z - 14, Math.PI / 2, 'merchant'], [ZONES[2].x + 2, ZONES[2].z - 3, -Math.PI / 2, 'merchant'], [ZONES[2].x - 5, ZONES[2].z + 8, 0, 'merchant'],
    [SPAWN.x + 9, SPAWN.z - 10, -0.5, 'villager'], [ZONES[0].x + 8, ZONES[0].z + 44, 0.3, 'monk'],
  ];
  npcs.length = 0;   // NPCs removed (classroom perf): guards/merchants/villagers
  npcs.forEach(([x0, z0, ry, role], i) => {
    const [x, z] = offPath(x0, z0, 0.6);
    const ch = makeCharacter(ROLE_LOOKS[role]); ch.root.position.set(x, groundHeight(x, z), z); ch.root.rotation.y = ry; scene.add(ch.root);
    ch.mixer.update(i * 0.37);
    colliders.push({ x, z, r: 0.6 });
    animated.push((t, dt) => ch.update(dt));
  });
  if (NAT.on) buildNatureTrees(scene, uTime);
  else {
    buildFoliage(scene, FOL.trees, { colorA: '#2c6a2e', colorB: '#b7e05c', uTime, planes: low ? 80 : 170, seed: 3 });
    buildFoliage(scene, FOL.bushes, { colorA: '#2f6f2a', colorB: '#c4e65a', uTime, planes: low ? 60 : 120, seed: 9 });
  }
  buildLeafLitter(scene, r, low);
  buildLanterns(scene, r);
  buildRice(scene, r, low);
  buildWaterfall(scene);
  const grass = NAT.on ? buildNatureGrass(scene, { patch: 60, uTime }) : buildGrass(scene, { sub: low ? 170 : 300, patch: low ? 38 : 60, uTime });
  return { grass };
}
