// Tileable value-noise texture (R: low freq, G: mid, B: high, A: cells) used for wind, ground detail, water.
import * as THREE from 'three';

function tileNoise(size, period, seed) {
  const g = new Float32Array(period * period);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(size * size), f = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * period, fy = (y / size) * period, ix = fx | 0, iy = fy | 0, u = f(fx - ix), v = f(fy - iy);
    const a = g[iy * period + ix], b = g[iy * period + (ix + 1) % period], c = g[((iy + 1) % period) * period + ix], d = g[((iy + 1) % period) * period + (ix + 1) % period];
    out[y * size + x] = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  return out;
}
function fbm(size, base, oct, seed) {
  const acc = new Float32Array(size * size); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const n = tileNoise(size, base << o, seed + o * 31); for (let i = 0; i < acc.length; i++) acc[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < acc.length; i++) acc[i] /= tot;
  return acc;
}
// stone slab / cobble pattern: jittered grid cells with darker gaps
function slabs(size, cells, seed) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = []; for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.2 + rnd() * 0.6) / cells, (j + 0.2 + rnd() * 0.6) / cells, rnd()]);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size, py = y / size; let d1 = 9, d2 = 9, id = 0;
    const cx = Math.floor(px * cells), cy = Math.floor(py * cells);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = (cx + i + cells) % cells, gy = (cy + j + cells) % cells, p = pts[gy * cells + gx];
      const dx = p[0] + (cx + i - gx) / cells - px, dy = p[1] + (cy + j - gy) / cells - py, d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d;
    }
    const edge = Math.min(1, (d2 - d1) * cells * 6); // 0 at crack
    out[y * size + x] = edge * (0.7 + id * 0.3);
  }
  return out;
}

let tex = null;
export function noiseTexture() {
  if (tex) return tex;
  const S = 256, r = fbm(S, 4, 4, 11), g = fbm(S, 8, 4, 23), b = fbm(S, 32, 3, 37), a = slabs(S, 10, 53);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = r[i] * 255; data[i * 4 + 1] = g[i] * 255; data[i * 4 + 2] = b[i] * 255; data[i * 4 + 3] = a[i] * 255; }
  tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}
export const WIND = { dir: new THREE.Vector2(Math.sin(Math.PI * 0.6), Math.cos(Math.PI * 0.6)), strength: { value: 0.85 } };
// GLSL wind (Bruno-style: two scrolling noise lookups along the wind direction)
export const WIND_GLSL = `
  uniform sampler2D uNoise; uniform vec2 uWindDir; uniform float uWindStr;
  vec2 windAt(vec2 p, float t) {
    float n1 = texture2D(uNoise, p * 0.05 + uWindDir * t * 0.1).r - 0.5;
    float n2 = texture2D(uNoise, p * 0.012 + uWindDir * t * 0.02).r - 0.5;
    return uWindDir * (n1 + n2 * 1.6) * uWindStr;
  }
`;
export function windUniforms() { return { uNoise: { value: noiseTexture() }, uWindDir: { value: WIND.dir }, uWindStr: WIND.strength }; }
