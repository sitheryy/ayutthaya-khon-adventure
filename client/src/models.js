// Loads CC0 models (KayKit chibi characters + Quaternius props) and builds recolored character instances.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = import.meta.env.BASE_URL + 'models/';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function loadGLB(name) {
  if (import.meta.env.VITE_INLINE_MODELS) { // preview build: models inlined as base64 (tools/build-artifact.sh)
    const b64 = (await import('./models-inline.js')).default[name];
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return loader.parseAsync(bin.buffer, BASE);
  }
  return loader.loadAsync(BASE + name + '.glb');
}
const cache = {};
export const assets = { clips: {}, ready: false };

const CHARS = ['Rogue', 'Mage', 'Knight', 'Barbarian'];
const PROPS = ['rustic_chest', 'Bush', 'BushBerries_1', 'Flowers', 'Lilypad', 'Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3', 'PalmTree_1', 'PalmTree_2', 'Willow_1', 'Boat', 'Sail_ship', 'Star', 'thai_house1', 'thai_house2', 'thai_house3', 'thai_house4', 'thai_sala', 'thai_jar', 'thai_canoe', 'Bull', 'Cow', 'Deer', 'Horse', 'ShibaInu', 'Cart', 'MarketStand_1', 'MarketStand_2', 'Barrel', 'Crate', 'Hay', 'Fence', 'Bench_1', 'Bags', 'Bamboo_1', 'Bamboo_2', 'Bamboo_3', 'Rice_3', 'Rice_4', ...['rug_rectangle_stripes_A', 'cabinet_medium_decorated', 'shelf_B_large_decorated', 'pictureframe_large_A', 'lamp_standing', 'pillow_A', 'table_small', 'chair_A_wood'].map((n) => 'kk_' + n), 'thai_buddha', 'elephant'];

const loadImg = (src) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });

export async function loadAssets(onProgress) {
  const jobs = [
    ...CHARS.map((n) => loadGLB(n).then((g) => (cache[n] = g))),
    ...CHARS.map((n) => loadImg(BASE + n.toLowerCase() + '_texture.png').then((i) => (cache[n + '_tex'] = i))),
    ...PROPS.map((n) => loadGLB(n).then((g) => (cache[n] = g))),
    loadGLB('anims').then((g) => g.animations.forEach((a) => (assets.clips[a.name] = a))),
  ];
  let done = 0;
  await Promise.all(jobs.map((j) => j.then(() => onProgress?.(++done / jobs.length))));
  assets.ready = true;
}

// ---------- palette recolor ----------
// KayKit textures are an 8x4 grid of vertical gradient swatches. cell [col,row] -> color.
const texCache = new Map();
function paletteTexture(base, recolor) {
  const key = base + JSON.stringify(recolor);
  if (texCache.has(key)) return texCache.get(key);
  const img = cache[base + '_tex'], S = img.width, cw = S / 8, ch = S / 4;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  for (const [cell, color] of Object.entries(recolor)) {
    const [cx, cy] = cell.split(',').map(Number), col = new THREE.Color(color);
    const g = x.createLinearGradient(0, cy * ch, 0, (cy + 1) * ch);
    g.addColorStop(0, '#' + col.clone().offsetHSL(0, 0, 0.1).getHexString());
    g.addColorStop(1, '#' + col.clone().offsetHSL(0, 0, -0.12).getHexString());
    x.fillStyle = g; x.fillRect(cx * cw, cy * ch, cw, ch);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.magFilter = THREE.LinearFilter;
  texCache.set(key, t);
  return t;
}

// ---------- looks ----------
// Student looks (Thai school kids): white shirt + colored โจงกระเบน/shorts.
const HAIR = ['#3b2416', '#1f140c', '#4a2c1a', '#2a1a10'];
const PANTS = ['#9e2a2b', '#2f5d9e', '#3d8b4f', '#7b3f8f', '#c0622f', '#9e2a2b'];
export const STUDENT_LOOKS = 12;
export function studentLook(i) {
  const girl = i % 2 === 0, hair = HAIR[i % HAIR.length], pants = PANTS[(i >> 1) % PANTS.length];
  return girl
    ? { base: 'Rogue', hide: /Cape/, recolor: { '1,0': hair, '0,1': '#f6f2ea', '1,1': '#f6f2ea', '5,2': '#f6f2ea', '5,0': '#f6f2ea', '6,0': '#c9a227', '3,0': '#e9b73c', '3,2': pants } }
    : { base: 'Mage', hide: /Hat|Cape/, recolor: { '1,0': hair, '0,1': '#f6f2ea', '4,0': '#f6f2ea', '3,0': '#c9a227', '5,0': '#c9a227', '2,2': '#e9b73c', '7,2': '#f6f2ea', '3,2': pants } };
}
export const ROLE_LOOKS = {
  guard: { base: 'Knight', hide: /Cape/, recolor: { '0,1': '#3d6b3a', '1,1': '#2f5530', '3,2': '#2a2a2a' }, scale: 1 },
  merchant: { base: 'Barbarian', hide: /Cape/, recolor: { '0,1': '#f0a35e', '1,1': '#d9824a', '3,2': '#5e3820' } },
  villager: { base: 'Rogue', hide: /Cape/, recolor: { '1,0': '#2a1a10', '0,1': '#ffffff', '1,1': '#ffffff', '3,2': '#3b6ea8' } },
  monk: { base: 'Mage', hide: /Hat|Cape/, recolor: { '1,0': '#e8b98c', '0,1': '#e8902c', '4,0': '#e8902c', '7,2': '#e8902c', '3,2': '#e8902c', '2,2': '#e8902c' } },
};

// Khon performers: KayKit body + procedural ชฎา / mask on the head bone.
const KHON = {
  hanuman: { skin: '#ffffff', body: '#f2f2f2', pants: '#e9b73c', crown: 'short', mask: true },
  thotsakan: { skin: '#3f9e5a', body: '#c0392b', pants: '#e9b73c', crown: 'tall', mask: true, fangs: true },
  rama: { skin: '#2f6e5a', body: '#e9b73c', pants: '#2f5d9e', crown: 'tall' },
  sida: { skin: '#f6d2b0', body: '#e9b73c', pants: '#c0392b', crown: 'tall' },
};

export class Character {
  constructor(look) {
    const src = cache[look.base];
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(src.scene);
    const tex = paletteTexture(look.base, look.recolor || {});
    this.model.traverse((o) => {
      if (o.isMesh) {
        if (look.hide && look.hide.test(o.name)) { o.visible = false; return; }
        o.material = new THREE.MeshLambertMaterial({ map: tex });
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;   // stand in the shade of walls/trees too
      }
      if (o.name === 'head') this.head = o;
      if (o.name === 'handslotr') this.handR = o;
    });
    this.model.scale.setScalar((look.scale || 1) * 0.87); // KayKit rig ~1.95 units -> ~1.7 m chibi
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.cur = null;
    this.play('Idle');
  }
  action(name) {
    if (!this.actions[name]) { const c = assets.clips[name]; if (!c) return null; this.actions[name] = this.mixer.clipAction(c); }
    return this.actions[name];
  }
  play(name, fade = 0.2, once = false) {
    if (this.cur === name) return;
    const a = this.action(name); if (!a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
    a.fadeIn(fade).play();
    if (this.cur) this.actions[this.cur]?.fadeOut(fade);
    this.cur = name;
  }
  // locomotion helper: speed (m/s), airborne
  animate(dt, speed, air) {
    if (air) this.play('Jump_Idle', 0.1);
    else if (speed > 5.2) { this.play('Running_A', 0.15); this.actions.Running_A.timeScale = speed / 6.5; }
    else if (speed > 0.3) { this.play('Walking_A', 0.15); this.actions.Walking_A.timeScale = Math.max(0.6, speed / 3.6); }
    else if (!this.locked) this.play('Idle', 0.25);
    this.mixer.update(dt);
  }
  update(dt) { this.mixer.update(dt); }
}

export function makeCharacter(look) { return new Character(look); }

export function makeKhon(role) {
  const k = KHON[role];
  const ch = new Character({ base: 'Knight', hide: /Helmet|Cape/, recolor: { '0,0': k.skin, '0,1': k.body, '1,1': '#e9b73c', '3,0': '#e9b73c', '4,0': '#c9a227', '3,2': k.pants, '1,0': k.skin } });
  if (ch.head) ch.head.add(khonHeadwear(k));
  ch.play('Spellcasting');
  return ch;
}
function khonHeadwear(k) {
  const g = new THREE.Group(), gold = new THREE.MeshLambertMaterial({ color: '#e9b73c' }), gold2 = new THREE.MeshLambertMaterial({ color: '#c08b24' });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const tiers = k.crown === 'tall' ? 5 : 2;
  add(new THREE.CylinderGeometry(0.62, 0.7, 0.22, 12), gold, 0, 0.95, 0);
  for (let i = 0; i < tiers; i++) add(new THREE.CylinderGeometry(0.48 - i * 0.08, 0.56 - i * 0.08, 0.22, 10), i % 2 ? gold2 : gold, 0, 1.15 + i * 0.21, 0);
  add(new THREE.ConeGeometry(0.13, k.crown === 'tall' ? 0.7 : 0.35, 8), gold, 0, 1.2 + tiers * 0.21 + 0.2, 0);
  [-1, 1].forEach((sd) => { const e = add(new THREE.ConeGeometry(0.1, 0.5, 5), gold, sd * 0.68, 0.6, 0); e.rotation.z = sd * 0.4; });
  if (k.mask) {
    const red = new THREE.MeshLambertMaterial({ color: '#c0392b' }), white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    [-1, 1].forEach((sd) => { add(new THREE.SphereGeometry(0.13, 8, 6), white, sd * 0.22, 0.55, 0.52).scale.set(1.2, 0.7, 0.4); add(new THREE.SphereGeometry(0.06, 8, 6), red, sd * 0.22, 0.55, 0.58); });
    add(new THREE.BoxGeometry(0.4, 0.06, 0.05), red, 0, 0.22, 0.6);
    if (k.fangs) [-1, 1].forEach((sd) => { const f = add(new THREE.ConeGeometry(0.04, 0.14, 4), white, sd * 0.12, 0.15, 0.6); f.rotation.x = Math.PI; });
  }
  return g;
}

// ---------- props ----------
const matCache = new Map();   // one material per (source, tint): clones of a prop share state, so the GPU switches less
function sharedMat(src, vc, tint) {
  const k = `${src.uuid}|${vc}|${tint || 1}`; let mat = matCache.get(k);
  if (!mat) { mat = new THREE.MeshLambertMaterial({ color: src.color, map: src.map || null, vertexColors: vc }); if (tint) mat.color.multiplyScalar(tint); matCache.set(k, mat); }
  return mat;
}
// A static prop (no skeleton, no child lookups): bakes all meshes that share a material into ONE mesh -> far fewer draw calls (and shadow draws).
export function propStatic(name, opts) {
  const o = prop(name, opts); if (!o) return o;
  o.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), groups = new Map();
  o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh && !m.isInstancedMesh) { const l = groups.get(m.material) || []; l.push(m); groups.set(m.material, l); } });
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const keep = ['position', 'normal', 'uv', 'color'].filter((a) => list.every((m) => m.geometry.attributes[a]));
    const geos = list.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (!keep.includes(a)) g.deleteAttribute(a);
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    });
    const geo = mergeGeometries(geos); if (!geo) continue;   // incompatible attributes: leave this group as it was
    geos.forEach((g) => g.dispose()); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true;
    list.forEach((m) => m.parent.remove(m)); o.add(mesh);
  }
  return o;
}
export function prop(name, { scale = 1, tint } = {}) {
  const g = cache[name]; if (!g) return null;
  const o = g.scene.clone(true);
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true; m.receiveShadow = true;
      m.material = sharedMat(m.material, !!m.geometry.attributes.color, tint);
    }
  });
  o.scale.setScalar(scale);
  return o;
}
export function propAnimations(name) { return cache[name]?.animations || []; }
// Returns merged geometry+material list for instancing a static prop many times.
export function propParts(name) {
  const parts = []; const g = cache[name]; if (!g) return parts;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((m) => { if (m.isMesh) { const geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); parts.push({ geo, mat: new THREE.MeshLambertMaterial({ color: m.material.color, map: m.material.map || null }) }); } });
  return parts;
}

// Quaternius animals (CC0): skinned + Walk/Idle/Eating clips
export function makeAnimal(name, { tint } = {}) {
  const g = cache[name]; if (!g) return null;
  const root = new THREE.Group(), o = SkeletonUtils.clone(g.scene); root.add(o);
  o.traverse((m) => { if (m.isMesh) { const src = m.material; m.material = new THREE.MeshLambertMaterial({ color: src.color, map: src.map || null }); if (tint) m.material.color.multiply(new THREE.Color(tint)); m.castShadow = true; m.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(o), acts = {};
  for (const c of g.animations) acts[c.name.split('|').pop()] = mixer.clipAction(c);
  let cur = null;
  return { root, mixer, play(n) { if (cur === n || !acts[n]) return; acts[n].reset().fadeIn(0.3).play(); if (cur) acts[cur].fadeOut(0.3); cur = n; }, update(dt) { mixer.update(dt); } };
}
