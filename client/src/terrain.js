// Terrain data (height + grass mask + color variation) baked into one texture, shared by
// CPU (physics, placement) and GPU (ground mesh, wind-grass blades). Style: soft rolling hills,
// dense swaying grass, tinted shadows (inspired by bruno-simon.com).
import * as THREE from 'three';
import { stylize } from './style.js';
import { noiseTexture, WIND_GLSL, windUniforms } from './noise.js';
import { SKY } from './cycle.js';
import { SUN_DIR } from './world.js';

export const T_HALF = 230, T_RES = 512;
const N = T_RES * T_RES;
const H = new Float32Array(N), MASK = new Float32Array(N), VAR = new Float32Array(N);
const cell = (2 * T_HALF) / (T_RES - 1);

export function bakeTerrain({ flatness, grassMask, riverX, half }) {
  for (let j = 0; j < T_RES; j++) for (let i = 0; i < T_RES; i++) {
    const x = -T_HALF + i * cell, z = -T_HALF + j * cell, k = j * T_RES + i;
    let h = 1.5 * Math.sin(x * 0.031 + 1.3) * Math.cos(z * 0.027) + 0.9 * Math.sin((x - z) * 0.052) + 0.45 * Math.sin(x * 0.11 + z * 0.09);
    h = (h + 1.2) * flatness(x, z);                       // hills only in open fields
    const d = Math.abs(x - riverX(z));
    if (d < 16) h = h * THREE.MathUtils.smoothstep(d, 10, 16) - 2.4 * (1 - THREE.MathUtils.smoothstep(d, 9, 15));
    const e = Math.max(Math.abs(x), Math.abs(z)) - (half + 6);
    if (e > 0) h += e * 0.45 + Math.sin(x * 0.08) * Math.cos(z * 0.1) * e * 0.18;
    H[k] = h;
    MASK[k] = grassMask(x, z);
    VAR[k] = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.cos(z * 0.06) * 2.0) * Math.cos(z * 0.038 + x * 0.01);
  }
}
export function stampMask(x, z, r) { // clear grass in a circle
  const i0 = Math.max(0, Math.floor((x - r + T_HALF) / cell)), i1 = Math.min(T_RES - 1, Math.ceil((x + r + T_HALF) / cell));
  const j0 = Math.max(0, Math.floor((z - r + T_HALF) / cell)), j1 = Math.min(T_RES - 1, Math.ceil((z + r + T_HALF) / cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(-T_HALF + i * cell - x, -T_HALF + j * cell - z) < r) MASK[j * T_RES + i] = 0;
}
export function stampBox(x, z, hw, hd) {
  const i0 = Math.max(0, Math.floor((x - hw + T_HALF) / cell)), i1 = Math.min(T_RES - 1, Math.ceil((x + hw + T_HALF) / cell));
  const j0 = Math.max(0, Math.floor((z - hd + T_HALF) / cell)), j1 = Math.min(T_RES - 1, Math.ceil((z + hd + T_HALF) / cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) MASK[j * T_RES + i] = 0;
}
export function finalizeMask() {
  // soften mask edges (box blur x2) so grass fades into paths
  for (let pass = 0; pass < 2; pass++) {
    const src = MASK.slice();
    for (let j = 1; j < T_RES - 1; j++) for (let i = 1; i < T_RES - 1; i++) {
      const k = j * T_RES + i;
      MASK[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - T_RES] + src[k + T_RES]) / 8;
    }
  }
}

function sample(arr, x, z) {
  const fx = Math.min(T_RES - 1.001, Math.max(0, (x + T_HALF) / cell)), fz = Math.min(T_RES - 1.001, Math.max(0, (z + T_HALF) / cell));
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * T_RES + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + T_RES] * (1 - u) + arr[k + T_RES + 1] * u) * v;
}
export const terrainH = (x, z) => sample(H, x, z);
export const grassAt = (x, z) => sample(MASK, x, z);
export const colorVarAt = (x, z) => sample(VAR, x, z);

export function terrainTexture() {
  const data = new Uint16Array(N * 4), half = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N; k++) { data[k * 4] = half(H[k]); data[k * 4 + 1] = half(MASK[k]); data[k * 4 + 2] = half(VAR[k]); data[k * 4 + 3] = half(1); }
  const t = new THREE.DataTexture(data, T_RES, T_RES, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// ---------------- colors (shared by ground + grass so they blend) ----------------
export const GRASS = { a: new THREE.Color('#4f9e2f'), b: new THREE.Color('#8fc93a'), tip: new THREE.Color('#d6e86a') };
let TT = null; export const terrainTex = () => (TT ||= terrainTexture());

// Ground: vertex colors + world-space detail noise + stone slabs on plazas; under-grass floor sits in shadow (Bruno trick)
export function buildGroundMesh(scene, { pathColorAt, isSlab }) {
  const S = 2 * T_HALF, seg = 280;
  const g = new THREE.PlaneGeometry(S, S, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), mk = new Float32Array(p.count * 2), c = new THREE.Color();
  const sand = new THREE.Color('#e9c88c'), dirt = new THREE.Color('#d9a36a');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = terrainH(x, z); p.setY(i, y);
    const m = grassAt(x, z), v = colorVarAt(x, z);
    c.copy(GRASS.a).lerp(GRASS.b, 0.25 + v * 0.45);
    const pc = pathColorAt(x, z);
    c.lerp(pc || dirt, 1 - m);
    if (y < -0.2) c.lerp(sand, Math.min(1, -y * 0.9));
    col.set([c.r, c.g, c.b], i * 3);
    mk[i * 2] = m; mk[i * 2 + 1] = isSlab(x, z) ? 1 : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMk', new THREE.BufferAttribute(mk, 2)); g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const u = { uNoise: { value: noiseTexture() } };
  m.onBeforeCompile = (sh) => {
    stylize(sh, 'extraShadow = vMk.x * 0.55;');
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec2 aMk; varying vec2 vMk; varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMk = aMk; vWp = position;');
    sh.fragmentShader = 'uniform sampler2D uNoise; varying vec2 vMk; varying vec3 vWp;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 wp = vWp.xz;
      vec4 n1 = texture2D(uNoise, wp * 0.013), n2 = texture2D(uNoise, wp * 0.09), n3 = texture2D(uNoise, wp * 0.45);
      diffuseColor.rgb *= 0.8 + n1.r * 0.3 + (n2.g - 0.5) * 0.18 + (n3.b - 0.5) * 0.16;
      float pebble = smoothstep(0.72, 0.78, n3.b) * (1.0 - vMk.x) * (1.0 - vMk.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, pebble);
      float slab = texture2D(uNoise, wp * 0.11).a;
      vec3 slabC = mix(vec3(0.42, 0.25, 0.19), mix(vec3(0.93, 0.66, 0.42), vec3(1.0, 0.82, 0.6), n2.g), smoothstep(0.05, 0.35, slab));
      diffuseColor.rgb = mix(diffuseColor.rgb, slabC, vMk.y * (1.0 - vMk.x));`);
  };
  m.customProgramCacheKey = () => 'ground';
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
}

// Grass (Bruno style): one camera-facing triangle per blade on a jittered grid that wraps around the player.
export function buildGrass(scene, { sub, patch, uTime }) {
  const n = sub * sub, pos = new Float32Array(n * 9), base = new Float32Array(n * 6), rnd = new Float32Array(n * 3), cell = patch / sub;
  const shape = [[0, 1], [1, 0], [-1, 0]];
  for (let ix = 0; ix < sub; ix++) for (let iz = 0; iz < sub; iz++) {
    const b = ix * sub + iz, x = (ix / sub - 0.5) * patch + (Math.random() + 0.0) * cell, z = (iz / sub - 0.5) * patch + Math.random() * cell, r = Math.random();
    for (let k = 0; k < 3; k++) { pos.set([shape[k][0], shape[k][1], 0], b * 9 + k * 3); base.set([x, z], b * 6 + k * 2); rnd[b * 3 + k] = r; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 2));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 9).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const u = { uTime, uCenter: { value: new THREE.Vector2() }, uPatch: { value: patch }, uTerrain: { value: terrainTex() }, uHalf: { value: T_HALF },
    uA: { value: GRASS.a }, uB: { value: GRASS.b }, uTip: { value: GRASS.tip }, uPlayer: { value: new THREE.Vector3(0, -99, 0) }, ...windUniforms() };
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    stylize(sh, 'extraShadow = (1.0 - vTip) * 0.85;');
    Object.assign(sh.uniforms, u);
    sh.vertexShader = `uniform float uTime, uPatch, uHalf; uniform vec2 uCenter; uniform sampler2D uTerrain; uniform vec3 uPlayer;
      attribute vec2 aBase; attribute float aRnd; varying float vTip; varying float vVar;\n` + WIND_GLSL + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        vec2 wp = mod(aBase - uCenter + uPatch * 0.5, uPatch) - uPatch * 0.5 + uCenter;
        vec4 tr = texture2D(uTerrain, (wp + uHalf) / (2.0 * uHalf));
        float edge = smoothstep(1.0, 0.82, length(wp - uCenter) / (uPatch * 0.5));
        float mask = smoothstep(0.4, 0.8, tr.g) * edge;
        float tip = position.y;
        float hv = texture2D(uNoise, wp * 0.032).r + 0.5;
        float h = 0.8 * (0.4 + aRnd * 0.6) * hv * mask;
        float ang = atan(wp.y - cameraPosition.z, wp.x - cameraPosition.x) - 1.5708;
        vec2 side = vec2(cos(ang), sin(ang)) * position.x * 0.11 * mask;
        vec2 w = windAt(wp, uTime) * tip * h * 3.0;
        vec2 away = wp - uPlayer.xz; float pd = length(away);
        w += (away / max(pd, 0.001)) * smoothstep(1.3, 0.2, pd) * tip * h * 0.9;   // gentle lean away from the player
        vec3 transformed = vec3(wp.x + side.x + w.x, tr.r + tip * h - dot(w, w) * 0.25, wp.y + side.y + w.y);
        if (mask < 0.02) transformed.y -= 50.0;
        vTip = tip; vVar = tr.b;`);
    sh.fragmentShader = 'uniform vec3 uA, uB, uTip; varying float vTip; varying float vVar;\n' + sh.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec3 gc = mix(uA, uB, 0.25 + vVar * 0.45);
        gc = mix(gc, uTip, smoothstep(0.45, 1.0, vTip) * (0.35 + vVar * 0.4));
        vec4 diffuseColor = vec4(gc, 1.0);`);
  };
  m.customProgramCacheKey = () => 'grass2';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, update(x, z, py) { u.uCenter.value.set(x, z); u.uPlayer.value.set(x, py, z); } };
}

// Water: depth-tinted (shallow teal -> deep blue), animated foam on shorelines, sun glints (bloom picks them up).
export function buildWaterSurface(scene, { strips, ponds, uTime, level = -0.5 }) {
  const u = { uTime, uTerrain: { value: terrainTex() }, uHalf: { value: T_HALF }, uLevel: { value: level }, uNoise: { value: noiseTexture() }, uRefl: { value: SKY.refl }, uSunDir: { value: SUN_DIR } };
  const m = new THREE.MeshLambertMaterial({ transparent: true });
  m.onBeforeCompile = (sh) => {
    stylize(sh);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = `uniform sampler2D uTerrain, uNoise; uniform float uHalf, uLevel, uTime; uniform vec3 uRefl, uSunDir; varying vec3 vWp;\n` + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      vec2 wp = vWp.xz;
      float ground = texture2D(uTerrain, (wp + uHalf) / (2.0 * uHalf)).r;
      float depth = ground > -0.05 ? 0.9 : vWp.y - ground;       // ponds sit on flat ground: fake depth
      vec3 shallow = vec3(0.5, 0.86, 0.76), deep = vec3(0.07, 0.3, 0.45);
      vec3 wc = mix(shallow, deep, smoothstep(0.1, 1.8, depth));
      float n = texture2D(uNoise, wp * 0.08 + vec2(uTime * 0.02, uTime * 0.013)).g + texture2D(uNoise, wp * 0.21 - vec2(uTime * 0.03, 0.0)).b * 0.6;
      float foam = smoothstep(0.55, 0.62, n * 0.7 + (0.45 - depth) * 1.6);
      wc = mix(wc, vec3(1.0), foam * 0.9);
      // Bruno-like white streaks stretched along the flow (river runs along z)
      float sn = texture2D(uNoise, vec2(wp.x * 0.11, wp.y * 0.025 - uTime * 0.06)).g;
      float sn2 = texture2D(uNoise, vec2(wp.x * 0.23 + 0.3, wp.y * 0.05 - uTime * 0.1)).b;
      float streak = smoothstep(0.012, 0.0, abs(sn - 0.5)) * smoothstep(0.45, 0.65, sn2) * smoothstep(0.3, 1.2, depth);
      wc = mix(wc, vec3(0.98, 0.98, 0.95), streak);
      foam = max(foam, streak);
      float glint = smoothstep(0.86, 0.95, texture2D(uNoise, wp * 0.35 + vec2(uTime * 0.05, -uTime * 0.04)).b * texture2D(uNoise, wp * 0.12 - vec2(uTime * 0.03)).g * 1.9);
      vec3 V = normalize(cameraPosition - vWp);
      vec3 N = normalize(vec3((texture2D(uNoise, wp * 0.15 + uTime * 0.03).g - 0.5) * 0.35, 1.0, (texture2D(uNoise, wp * 0.13 - uTime * 0.025).b - 0.5) * 0.35));
      float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
      wc = mix(wc, uRefl, fres * 0.65 * (1.0 - foam));      // evening sky reflected at grazing angles
      vec3 L = uSunDir;
      float spec = pow(max(dot(reflect(-L, N), V), 0.0), 120.0);
      glint += spec * 1.4;
      vec4 diffuseColor = vec4(wc, mix(0.82, 1.0, foam));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.97, 0.85) * glint * 1.6;');
  };
  m.customProgramCacheKey = () => 'water';
  for (const geo of strips) { const w = new THREE.Mesh(geo, m); w.position.y = level; w.receiveShadow = true; scene.add(w); }
  for (const pd of ponds) { const pg = new THREE.CircleGeometry(pd.r + 0.6, 40); pg.rotateX(-Math.PI / 2); const w = new THREE.Mesh(pg, m); w.position.set(pd.x, 0.08, pd.z); w.receiveShadow = true; scene.add(w); }
  return m;
}
