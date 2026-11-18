// Ambient effects: leaves blown by the wind, Bruno-style wind lines, tilt-shift depth of field.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { WIND } from './noise.js';
import { NIGHT } from './cycle.js';

const center = new THREE.Vector3();

// Leaves drifting with the wind in a box that follows the player.
export function flyingLeaves(scene, uTime, count = 260) {
  const base = new THREE.PlaneGeometry(0.2, 0.13);
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const seed = new Float32Array(count * 4), col = new Float32Array(count * 3), pal = ['#9ccc4a', '#c8d64a', '#e2b84a', '#7fb03a', '#d9963a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) { seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4); const c = pal[(Math.random() * pal.length) | 0]; col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { uTime, uCenter: { value: center }, uDir: { value: WIND.dir }, uStr: WIND.strength },
    vertexShader: `uniform float uTime, uStr; uniform vec3 uCenter; uniform vec2 uDir; attribute vec4 aSeed; attribute vec3 aCol; varying vec3 vCol; varying float vA;
      mat3 rot(vec3 a){ vec3 s = sin(a), c = cos(a); return mat3(c.y*c.z, c.y*s.z, -s.y, s.x*s.y*c.z - c.x*s.z, s.x*s.y*s.z + c.x*c.z, s.x*c.y, c.x*s.y*c.z + s.x*s.z, c.x*s.y*s.z - s.x*c.z, c.x*c.y); }
      void main(){
        vec3 box = vec3(56.0, 7.0, 56.0);
        float t = uTime * (0.5 + aSeed.w * 0.7);
        vec3 p = (aSeed.xyz - 0.5) * box;
        p.xz += uDir * t * (4.0 + uStr * 6.0);
        p.x += sin(t * 2.1 + aSeed.w * 30.0) * 0.9; p.z += cos(t * 1.7 + aSeed.w * 17.0) * 0.9;
        p.y += sin(t * 1.3 + aSeed.w * 11.0) * 1.0 + t * 0.15;
        p.xz = mod(p.xz - uCenter.xz + box.xz * 0.5, box.xz) - box.xz * 0.5 + uCenter.xz;
        p.y = uCenter.y + 0.4 + mod(p.y, box.y);
        vec3 a = vec3(t * 3.1, t * 2.3 + aSeed.w * 6.0, t * 1.7);
        vec3 lp = rot(a) * position;
        vCol = aCol * (0.75 + 0.35 * abs(sin(a.x)));
        vA = smoothstep(1.0, 0.75, length(p.xz - uCenter.xz) / (box.x * 0.5));
        vA *= smoothstep(2.0, 4.0, distance(p, cameraPosition));
        gl_Position = projectionMatrix * viewMatrix * vec4(p + lp, 1.0);
      }`,
    fragmentShader: 'varying vec3 vCol; varying float vA; void main(){ gl_FragColor = vec4(vCol, vA);\n#include <colorspace_fragment>\n}',
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh);
  return { update(x, y, z) { center.set(x, y, z); } };
}

// Thin white streaks that travel with the wind (like folio-2025 WindLines).
export function windLines(scene, uTime, count = 18) {
  const seg = 24, pos = [], idx = [];
  for (let i = 0; i <= seg; i++) { const s = i / seg; pos.push(s, -1, 0, s, 1, 0); if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const g = new THREE.InstancedBufferGeometry(); g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const seed = new Float32Array(count * 4); for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime, uCenter: { value: center }, uDir: { value: WIND.dir } },
    vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform vec2 uDir; attribute vec4 aSeed; varying float vA;
      void main(){
        float life = fract(uTime * (0.18 + aSeed.w * 0.1) + aSeed.z);
        float cycle = floor(uTime * (0.18 + aSeed.w * 0.1) + aSeed.z);
        vec2 rnd = fract(vec2(sin((cycle + aSeed.x) * 91.3), sin((cycle + aSeed.y) * 57.1)) * 4375.85) - 0.5;
        vec2 side = vec2(-uDir.y, uDir.x);
        float len = 7.0 + aSeed.y * 5.0, s = position.x;
        vec2 start = uCenter.xz + rnd * 46.0 - uDir * len * 0.5 + uDir * life * 10.0;
        vec2 xz = start + uDir * s * len + side * sin(s * 6.28 + aSeed.x * 6.0 + uTime) * 0.35;
        float y = uCenter.y + 1.0 + aSeed.y * 3.0 + sin(s * 9.0 + uTime * 2.0) * 0.12;
        float head = life * 1.4 - 0.2;                     // visible window travels along the line
        vA = smoothstep(0.35, 0.0, abs(s - head)) * sin(life * 3.14159) * 0.35;
        vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
        mv.y += position.y * 0.03 * (1.0 - abs(s - 0.5) * 1.6);
        vA *= smoothstep(6.0, 14.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0), vA); }',
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh);
}

// Tilt-shift depth of field: sharp band around the player, soft blur toward top/bottom of the screen.
const TiltShift = (horizontal) => ({
  uniforms: { tDiffuse: { value: null }, uFocus: { value: 0.45 }, uRes: { value: new THREE.Vector2(1, 1) }, uDirH: { value: horizontal ? 1 : 0 }, uMax: { value: 3.2 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uFocus, uDirH, uMax; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      float amt = smoothstep(0.14, 0.6, abs(vUv.y - uFocus)) * uMax;
      if (amt < 0.02) { gl_FragColor = texture2D(tDiffuse, vUv); return; }   // sharp band in the middle: skip the blur taps
      vec2 d = (uDirH > 0.5 ? vec2(1.0 / uRes.x, 0.0) : vec2(0.0, 1.0 / uRes.y)) * amt;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270;
      c += (texture2D(tDiffuse, vUv + d * 1.3846) + texture2D(tDiffuse, vUv - d * 1.3846)) * 0.3162162;
      c += (texture2D(tDiffuse, vUv + d * 3.2308) + texture2D(tDiffuse, vUv - d * 3.2308)) * 0.0702703;
      gl_FragColor = c;
    }`,
});
export function tiltShiftPasses() {
  const h = new ShaderPass(TiltShift(true)), v = new ShaderPass(TiltShift(false));
  return { passes: [h, v], setSize(w, hh) { [h, v].forEach((p) => p.uniforms.uRes.value.set(w, hh)); }, setFocus(y) { [h, v].forEach((p) => (p.uniforms.uFocus.value = y)); } };
}

// Torches (คบเพลิง): flickering billboard flames + warm light pool on the ground. Additive, bloom makes them glow.
export function torches(scene, spots, uTime, drop = 2.35) {   // drop = height of the flame spot above the ground, so the light pool lands on the floor
  const n = spots.length; if (!n) return;
  const mk = (geo, vs, fs, blending = THREE.AdditiveBlending) => {
    const g = new THREE.InstancedBufferGeometry(); g.index = geo.index; g.attributes.position = geo.attributes.position; g.attributes.uv = geo.attributes.uv;
    const a = new Float32Array(n * 4); spots.forEach(([x, y, z], i) => a.set([x, y, z, Math.random()], i * 4));
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4)); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({ uniforms: { uTime, uNight: NIGHT }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh);
  };
  // flame
  mk(new THREE.PlaneGeometry(0.55, 0.9),
    `uniform float uTime; attribute vec4 aP; varying vec2 vUv; varying float vF;
     void main(){ vUv = uv; vF = 0.85 + 0.15 * sin(uTime * 17.0 + aP.w * 40.0) * sin(uTime * 7.3 + aP.w * 13.0);
       vec4 mv = viewMatrix * vec4(aP.xyz + vec3(0.0, 0.45, 0.0), 1.0);
       mv.xy += position.xy * vec2(1.0, vF);
       gl_Position = projectionMatrix * mv; }`,
    `uniform float uTime; varying vec2 vUv; varying float vF;
     void main(){ vec2 p = vUv - vec2(0.5, 0.28);
       p.x += sin(vUv.y * 9.0 - uTime * 11.0) * 0.05 * vUv.y;
       float r = length(p * vec2(1.0, 0.55 + vUv.y * 0.9));
       float core = smoothstep(0.22, 0.0, r), body = smoothstep(0.42, 0.05, r) * smoothstep(1.0, 0.45, vUv.y);
       vec3 c = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.8, 0.35), body) * body * 2.2 + vec3(1.0, 0.95, 0.8) * core * 2.5;
       gl_FragColor = vec4(c * vF, max(body, core)); }`);
  // light pool on the ground (fake point light, costs one quad)
  const pool = new THREE.PlaneGeometry(9, 9); pool.rotateX(-Math.PI / 2);
  mk(pool,
    `uniform float uTime, uNight; attribute vec4 aP; varying vec2 vUv; varying float vF;
     void main(){ vUv = uv; vF = (0.8 + 0.2 * sin(uTime * 13.0 + aP.w * 40.0)) * (1.0 + uNight * 1.3);
       gl_Position = projectionMatrix * viewMatrix * vec4(position * (1.0 + uNight * 0.6) + vec3(aP.x, aP.y - ${drop.toFixed(2)}, aP.z), 1.0); }`,
    `varying vec2 vUv; varying float vF;
     void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2) * 0.55 * vF;
       gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a, a); }`);
}

// Fireflies (หิ่งห้อย): glowing points drifting around the player, only at night.
export function fireflies(scene, uTime, count = 160) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set([Math.random(), Math.random(), Math.random()], i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uNight: NIGHT, uCenter: { value: center } },
    vertexShader: `uniform float uTime, uNight; uniform vec3 uCenter; attribute float aSeed; varying float vA;
      void main(){
        vec3 box = vec3(44.0, 4.0, 44.0), p = (position - 0.5) * box;
        float t = uTime * (0.25 + aSeed * 0.3);
        p += vec3(sin(t + aSeed * 40.0) * 2.5, sin(t * 1.7 + aSeed * 9.0) * 0.8, cos(t * 0.9 + aSeed * 21.0) * 2.5);
        p.xz = mod(p.xz - uCenter.xz + box.xz * 0.5, box.xz) - box.xz * 0.5 + uCenter.xz;
        p.y = uCenter.y + 0.6 + mod(p.y + 2.0, box.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = uNight * (0.35 + 0.65 * pow(max(sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 30.0), 0.0), 3.0));
        gl_PointSize = 70.0 / -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.95, 0.45) * a * vA * 2.2, a * vA); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
}

// Final colour grade (after tone mapping): gentle S-curve contrast, saturation, split-toning (violet shadows / gold highlights),
// warm vignette and a soft sun glare when the sun is in front of the camera.
export function gradePass() {
  const p = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 }, uAspect: { value: 1 }, uAmt: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uSunVis, uAspect, uAmt; varying vec2 vUv;
      void main(){
        vec3 c0 = texture2D(tDiffuse, vUv).rgb, c = c0;
        // Japanese-photo tone: bright and airy, lifted blacks, low contrast, soft pastel colour, cool-green shadows, cream-pink lights
        c *= 1.10;                                                                    // exposure up
        c = mix(c, c * c * (3.0 - 2.0 * c), -0.12);                                   // flatter contrast
        c = c * 0.88 + 0.10;                                                          // lift the blacks (milky shadows)
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 0.90);                                                    // slightly softer saturation
        c *= mix(vec3(0.94, 1.00, 1.04), vec3(1.04, 1.00, 0.98), smoothstep(0.2, 0.9, l));   // aqua shadows, warm cream lights
        c = 1.0 - (1.0 - c) * (1.0 - vec3(0.07, 0.06, 0.07) * (0.4 + l));             // soft white haze
        vec2 q = vUv - 0.5; q.x *= uAspect;
        c *= 1.0 - smoothstep(0.45, 1.0, length(q)) * 0.10;                           // very light vignette
        vec2 d = vUv - uSun; d.x *= uAspect; float r = length(d);
        c += vec3(1.0, 0.86, 0.72) * (exp(-r * 4.0) * 0.16 + exp(-r * 16.0) * 0.12) * uSunVis;   // soft sun glow
        gl_FragColor = vec4(mix(c0, c, uAmt), 1.0);
      }`,
  });
  const v = new THREE.Vector3(), fwd = new THREE.Vector3();
  p.update = (camera, sunDir, w, h) => {
    v.copy(camera.position).addScaledVector(sunDir, 2000).project(camera);
    p.uniforms.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5); p.uniforms.uAspect.value = w / h;
    camera.getWorldDirection(fwd);
    p.uniforms.uSunVis.value = THREE.MathUtils.smoothstep(fwd.dot(sunDir), 0.2, 0.9) * (v.z < 1 ? 1 : 0);
  };
  return p;
}
