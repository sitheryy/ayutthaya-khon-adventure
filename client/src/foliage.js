// Fluffy foliage (technique from Bruno Simon's folio-2025, MIT): a cluster = many alpha-tested leaf cards
// spread in a sphere with normals bent outward, so it shades like a soft ball. Instanced per canopy blob.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stylize } from './style.js';
import { WIND_GLSL, windUniforms } from './noise.js';

function leafTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // a cluster of small rounded leaves (crisp edges after alpha test)
  x.fillStyle = '#fff';
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 40, cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d, r = 9 + rnd() * 7;
    x.save(); x.translate(cx, cy); x.rotate(rnd() * Math.PI); x.beginPath();
    for (let k = 0; k < 7; k++) { const t = (k / 7) * Math.PI * 2, rr = r * (0.8 + rnd() * 0.35); x.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    x.closePath(); x.fill(); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; return t;
}

function clusterGeometry(count, seed) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const planes = [], v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const p = new THREE.PlaneGeometry(0.74, 0.74);
    p.rotateZ(rnd() * 9); p.rotateX(rnd() * 6.28); p.rotateY(rnd() * 6.28);
    const sp = new THREE.Spherical(1 - Math.pow(rnd(), 3), Math.acos(2 * rnd() - 1), rnd() * Math.PI * 2);
    const c = new THREE.Vector3().setFromSpherical(sp); p.translate(c.x, c.y, c.z);
    const nn = c.clone().normalize(), na = p.attributes.normal;
    for (let k = 0; k < 4; k++) { v.fromBufferAttribute(p.attributes.position, k); n.copy(v).lerp(nn, 0.85).normalize(); na.setXYZ(k, n.x, n.y, n.z); }
    planes.push(p);
  }
  return mergeGeometries(planes);
}

let leaf = null;
export function makeFoliageMaterial(colorA, colorB, uTime) {
  leaf ||= leafTexture();
  const m = new THREE.MeshLambertMaterial({ alphaMap: leaf, alphaTest: 0.5, side: THREE.DoubleSide });
  const u = { uTime, uColA: { value: new THREE.Color(colorA) }, uColB: { value: new THREE.Color(colorB) }, ...windUniforms() };
  m.onBeforeCompile = (sh) => {
    stylize(sh);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uTime;\n' + WIND_GLSL + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 w = windAt(ip.xz, uTime);
        transformed.xz += w * (position.y + 1.0) * 0.6;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        { vec3 ip2 = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float ang = length(windAt(ip2.xz + position.xy, uTime)) * 2.2;
          vec2 q = vAlphaMapUv - 0.5; vAlphaMapUv = vec2(q.x * cos(ang) - q.y * sin(ang), q.x * sin(ang) + q.y * cos(ang)) + 0.5; }`);
    sh.fragmentShader = 'uniform vec3 uColA, uColB;\n' + sh.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        float lf = 0.5;
        #if NUM_DIR_LIGHTS > 0
          lf = smoothstep(-0.05, 0.3, dot(normalize(vNormal), directionalLights[0].direction));
        #endif
        vec4 diffuseColor = vec4(mix(uColA, uColB, lf), opacity);`);
  };
  m.customProgramCacheKey = () => 'foliage';
  return m;
}

// items: [{x,y,z,s,tint}] -> one InstancedMesh
export function buildFoliage(scene, items, { colorA, colorB, uTime, planes = 70, seed = 1 }) {
  if (!items.length) return null;
  const geo = clusterGeometry(planes, seed), mat = makeFoliageMaterial(colorA, colorB, uTime);
  const im = new THREE.InstancedMesh(geo, mat, items.length), d = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.ry || 0, 0); d.scale.set(it.s, it.s * (it.sy || 0.9), it.s); d.updateMatrix();
    im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setScalar(it.tint ?? 1));
  });
  im.castShadow = true; im.receiveShadow = true;
  im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: leaf, alphaTest: 0.5 });
  im.computeBoundingSphere();
  scene.add(im);
  return im;
}
