// Quaternius "Stylized Nature MegaKit" (CC0) trees, bushes and grass clumps, drawn instanced with a wind shader.
// Trees/bushes: static instances (chunked so off-screen cells are culled); the wind bends them by height.
// Grass: clumps on a jittered grid that wraps around the player (same idea as terrain.js buildGrass), always on the ground.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stylize } from './style.js';
import { WIND_GLSL, windUniforms } from './noise.js';
import { T_HALF, terrainTex } from './terrain.js';

const BASE = import.meta.env.BASE_URL + 'nature/';
export const NAT = { on: false, trees: [], bushes: [] };   // filled by world.js while it lays the world out
const TREES = ['CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
const LOD_AT = 90;   // metres from the player to the centre of a 60 m cell: nearer cells use the full tree, farther ones the simplified copy
const GRASSES = [
  { n: 'Grass_Common_Short', sub: 36, h: 0.55 }, { n: 'Grass_Common_Tall', sub: 20, h: 0.95 },
  { n: 'Grass_Wispy_Short', sub: 15, h: 0.8 }, { n: 'Fern_1', sub: 9, h: 0.7 },
];
const models = {};

// each model -> [{geo, mat}] with the geometry moved to y=0 and scaled to height 1 (world scale then = wanted height)
async function loadOne(name) {
  const g = await new GLTFLoader().loadAsync(BASE + name + '.gltf');
  g.scene.updateMatrixWorld(true);
  const parts = [], box = new THREE.Box3();
  g.scene.traverse((o) => { if (o.isMesh) { const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); geo.deleteAttribute('tangent'); parts.push({ geo, src: o.material }); box.expandByObject(o); } });
  const k = 1 / (box.max.y - box.min.y);
  for (const p of parts) { p.geo.translate(0, -box.min.y, 0); p.geo.scale(k, k, k); }
  return { parts, h0: 1 / k };
}
export async function loadNature() {
  await Promise.all([...TREES, ...TREES.map((t) => t + '_lod'), 'Bush_Common', ...GRASSES.map((x) => x.n)].map((n) => loadOne(n).then((m) => (models[n] = m))));
  NAT.on = true;
}

const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export const natHash = hash;

// ---------------- trees & bushes ----------------
function treeMaterial(src, uTime, sway) {
  const m = new THREE.MeshLambertMaterial({ map: src.map, alphaTest: src.alphaTest || 0, side: THREE.DoubleSide });
  const u = { uTime, uSway: { value: sway }, ...windUniforms() };
  m.onBeforeCompile = (sh) => {
    stylize(sh);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uTime, uSway;\n' + WIND_GLSL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float hh = clamp(position.y, 0.0, 1.0);
        vec2 w = windAt(ip.xz, uTime);
        vec3 wl = transpose(mat3(instanceMatrix)) * vec3(w.x, 0.0, w.y);
        wl /= max(length(instanceMatrix[0].xyz), 1e-4);                 // world push -> local units of this tree
        transformed.xz += wl.xz * hh * hh * uSway * 3.0;                    // trunk stays, crown bends
        float fl = sin(uTime * 2.6 + dot(position.xz, vec2(13.0, 9.0)) + ip.x * 0.7) + 0.6 * sin(uTime * 4.1 + dot(position.xz, vec2(-7.0, 17.0)) + ip.z);
        transformed += vec3(fl * 0.5, fl * 0.25, -fl * 0.4) * 0.012 * smoothstep(0.3, 0.7, hh) * (0.5 + length(w) * 2.0);   // leaves flutter
      #endif`);
  };
  m.customProgramCacheKey = () => 'natTree' + sway;
  return m;
}

// items: [{x,y,z,h,ry,tint}] split into 60 m cells so the camera culls whole cells; lod = simplified model for far cells
const cellList = [];
function chunked(scene, model, lod, items, uTime, sway, cell = 60) {
  const cells = new Map();
  for (const it of items) { const k = Math.floor(it.x / cell) + ',' + Math.floor(it.z / cell); (cells.get(k) || cells.set(k, []).get(k)).push(it); }
  const d = new THREE.Object3D(), c = new THREE.Color();
  for (const [k, list] of cells) {
    const [cx, cz] = k.split(',').map((v) => (Number(v) + 0.5) * cell), entry = { cx, cz, near: [], far: [] };
    for (const [mdl, group] of [[model, entry.near], [lod, entry.far]]) {
      if (!mdl) continue;
      mdl.mats ||= mdl.parts.map((p) => treeMaterial(p.src, uTime, sway));
      mdl.depth ||= mdl.parts.map((p) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: p.src.map, alphaTest: p.src.alphaTest || 0 }));
      mdl.parts.forEach((p, pi) => {
        const im = new THREE.InstancedMesh(p.geo, mdl.mats[pi], list.length);
        list.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.ry, 0); d.scale.setScalar(it.h); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setScalar(it.tint)); });
        im.castShadow = group === entry.near; im.receiveShadow = true; im.customDepthMaterial = mdl.depth[pi];
        im.computeBoundingSphere(); im.boundingSphere.radius += 3;   // room for the sway
        scene.add(im); group.push(im);
      });
    }
    cellList.push(entry);
  }
}
function updateLod(x, z) {
  for (const e of cellList) {
    const near = !e.far.length || Math.hypot(e.cx - x, e.cz - z) < LOD_AT;
    for (const m of e.near) m.visible = near;
    for (const m of e.far) m.visible = !near;
  }
}

export function buildNatureTrees(scene, uTime) {
  const by = TREES.map(() => []);
  for (const t of NAT.trees) by[Math.floor(hash(t.x, t.z) * TREES.length)].push({ ...t, tint: 0.9 + hash(t.z, t.x) * 0.2, ry: hash(t.x + 1, t.z) * 6.28 });
  by.forEach((items, i) => items.length && chunked(scene, models[TREES[i]], models[TREES[i] + '_lod'], items, uTime, 0.2));
  chunked(scene, models.Bush_Common, null, NAT.bushes.map((b) => ({ ...b, tint: 0.9 + hash(b.z, b.x) * 0.2 })), uTime, 0.12);
}

// ---------------- grass clumps ----------------
const GRASS_TINT = { a: new THREE.Color('#8fbf4a'), b: new THREE.Color('#f2f06a') };
export function buildNatureGrass(scene, { patch = 60, uTime }) {
  const u = { uTime, uCenter: { value: new THREE.Vector2() }, uPatch: { value: patch }, uTerrain: { value: terrainTex() }, uHalf: { value: T_HALF },
    uPlayer: { value: new THREE.Vector3(0, -99, 0) }, uTintA: { value: GRASS_TINT.a }, uTintB: { value: GRASS_TINT.b }, ...windUniforms() };
  for (const v of GRASSES) {
    const m = models[v.n], p = m.parts[0], n = v.sub * v.sub, cell = patch / v.sub, base = new Float32Array(n * 2), rnd = new Float32Array(n);
    for (let ix = 0; ix < v.sub; ix++) for (let iz = 0; iz < v.sub; iz++) {
      const b = ix * v.sub + iz; base[b * 2] = (ix + Math.random()) * cell - patch / 2; base[b * 2 + 1] = (iz + Math.random()) * cell - patch / 2; rnd[b] = Math.random();
    }
    const geo = new THREE.InstancedBufferGeometry(); geo.index = p.geo.index;
    for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, p.geo.attributes[k]);
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 2));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 1));
    geo.instanceCount = n;
    const mat = new THREE.MeshLambertMaterial({ map: p.src.map, alphaTest: p.src.alphaTest || 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      stylize(sh, 'extraShadow = (1.0 - vH) * 0.55;');
      Object.assign(sh.uniforms, u, { uH: { value: v.h } });
      sh.vertexShader = `uniform float uTime, uPatch, uHalf, uH; uniform vec2 uCenter; uniform sampler2D uTerrain; uniform vec3 uPlayer;
        attribute vec2 aBase; attribute float aRnd; varying float vH; varying float vVar;\n` + WIND_GLSL + sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 wp = mod(aBase - uCenter + uPatch * 0.5, uPatch) - uPatch * 0.5 + uCenter;
          vec4 tr = texture2D(uTerrain, (wp + uHalf) / (2.0 * uHalf));
          float edge = smoothstep(1.0, 0.8, length(wp - uCenter) / (uPatch * 0.5));
          float mask = smoothstep(0.4, 0.8, tr.g) * edge;
          float hv = texture2D(uNoise, wp * 0.032).r + 0.5;
          float sc = uH * (0.7 + aRnd * 0.6) * hv * mask;
          float ca = cos(aRnd * 25.0), sa = sin(aRnd * 25.0);
          vec3 lp = vec3(position.x * ca - position.z * sa, position.y, position.x * sa + position.z * ca) * sc;
          vec2 w = windAt(wp, uTime) * position.y * position.y * sc * 1.8;
          vec2 away = wp - uPlayer.xz; float pd = length(away);
          w += (away / max(pd, 0.001)) * smoothstep(1.3, 0.2, pd) * position.y * sc * 0.7;
          vec3 transformed = vec3(wp.x + lp.x + w.x, tr.r + lp.y - dot(w, w) * 0.15, wp.y + lp.z + w.y);
          if (mask < 0.02) transformed.y -= 50.0;
          vH = position.y; vVar = tr.b;`);
      sh.fragmentShader = 'uniform vec3 uTintA, uTintB; varying float vH; varying float vVar;\n' + sh.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity );\n diffuseColor.rgb *= mix(uTintA, uTintB, vVar * 0.6 + vH * 0.25) * 1.15;')
        ;
    };
    mat.customProgramCacheKey = () => 'natGrass' + v.n;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { update(x, z, py) { u.uCenter.value.set(x, z); u.uPlayer.value.set(x, py, z); updateLod(x, z); } };
}
