import * as THREE from 'three';
import { STYLE } from './style.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { flyingLeaves, windLines, tiltShiftPasses, fireflies } from './effects.js';
import { updateCycle } from './cycle.js';
import { buildLife } from './life.js';
import { CITY, SUN_DIR, buildWorld, buildSky, ZONES, SPAWN, HALF, WALL_Z, colliders, animated, uTime, groundHeight, isBlockedWater, zoneAt, riverX, PATHS, waters, surfaceAt } from './world.js';
import { makeNameTag } from './character.js';
import { loadAssets, makeCharacter, studentLook, STUDENT_LOOKS } from './models.js';
import { Controls } from './controls.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer: coarse)').matches;
const LOW = params.has('low') || (TOUCH && Math.min(screen.width, screen.height) < 500);
const LIGHT = LOW || TOUCH;   // phones + tablets: no bloom, smaller shadow map

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
let dpr = Math.min(devicePixelRatio, LOW ? 1.25 : TOUCH ? 1.5 : 1.75);
renderer.setPixelRatio(dpr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#d9b8d0', 150, 600);
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2000);

// Bruno-style: warm sun + strong lavender sky fill => shadows read as soft blue-purple, never black
scene.add(new THREE.HemisphereLight('#aab4ff', '#86a86a', 1.55));
const sun = new THREE.DirectionalLight('#ffcf98', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(LIGHT ? 1024 : 2048, LIGHT ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun, sun.target);

const loginBtn = document.querySelector('#form-login button');
loginBtn.disabled = true; loginBtn.textContent = 'กำลังโหลดโลก... 0%';
await document.fonts.load('600 58px Mitr').catch(() => {});
await loadAssets((p) => (loginBtn.textContent = `กำลังโหลดโลก... ${Math.round(p * 100)}%`));
buildSky(scene);
const { grass } = buildWorld(scene, { low: LOW });
const leaves = flyingLeaves(scene, uTime, LOW ? 50 : 110);
windLines(scene, uTime, LOW ? 8 : 18);
loginBtn.disabled = false; loginBtn.textContent = 'เข้าสู่โลกผจญภัย';

// ---------- player ----------
export const me = { x: SPAWN.x, z: SPAWN.z, y: 0, vy: 0, face: Math.PI, speed: 0, grounded: true, look: 0, name: '', no: '', cls: '' };
let avatar = null;
function spawnAvatar() {
  if (avatar) scene.remove(avatar.root);
  const look = studentLook(me.look);
  avatar = makeCharacter(look);
  avatar.root.add(makeNameTag(me.name));
  scene.add(avatar.root);
  game.avatar = avatar;
}

const controls = new Controls(canvas);
controls.yaw = 0;
const PR = 0.45; // player radius

function collide(x, z) {
  for (const c of colliders) {
    if (c.r !== undefined) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + PR, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; x += dx * k; z += dz * k; }
    } else {
      const cx = Math.max(c.x - c.hw, Math.min(x, c.x + c.hw)), cz = Math.max(c.z - c.hd, Math.min(z, c.z + c.hd));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < PR * PR) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (PR - d) / d; x += dx * k; z += dz * k; }
        else { // inside box: push out along shortest axis
          const px = c.hw - Math.abs(x - c.x) + PR, pz = c.hd - Math.abs(z - c.z) + PR;
          if (px < pz) x += Math.sign(x - c.x || 1) * px; else z += Math.sign(z - c.z || 1) * pz;
        }
      }
    }
  }
  return [x, z];
}
function walkable(x, z) {
  if (isBlockedWater(x, z)) return false;
  if (Math.abs(x) > HALF || z < -HALF || z > HALF) return false;
  return true;
}

export const game = { frozen: false, onAct: null, onTick: null, others: new Map() };

function updatePlayer(dt) {
  if (game.fly) { // teacher fly mode: free movement, no collisions
    const m = controls.move(), sy = Math.sin(controls.yaw), cy = Math.cos(controls.yaw), sp = m.run ? 32 : 16;
    me.x += (cy * m.x - sy * m.y) * sp * dt; me.z += (-sy * m.x - cy * m.y) * sp * dt;
    controls.takeJump();
    if (controls.keys.has('Space') || controls.jumpHeld) me.y += 12 * dt;
    if (controls.keys.has('KeyC')) me.y -= 12 * dt;
    me.y = Math.min(120, Math.max(groundHeight(me.x, me.z), me.y));
    me.x = THREE.MathUtils.clamp(me.x, -HALF - 40, HALF + 40); me.z = THREE.MathUtils.clamp(me.z, -HALF - 40, HALF + 40);
    me.vy = 0; me.speed = 0;
    if (avatar) { avatar.root.position.set(me.x, me.y, me.z); avatar.root.rotation.y = controls.yaw + Math.PI; avatar.animate(dt, 0, true); }
    return;
  }
  const m = game.frozen ? { x: 0, y: 0, run: false } : controls.move();
  const sy = Math.sin(controls.yaw), cy = Math.cos(controls.yaw);
  const dx = cy * m.x - sy * m.y, dz = -sy * m.x - cy * m.y;
  const mag = Math.min(1, Math.hypot(m.x, m.y));
  const spd = (m.run ? 7.5 : 4.6) * mag;
  let nx = me.x + (mag ? dx / Math.hypot(dx, dz) : 0) * spd * dt;
  let nz = me.z + (mag ? dz / Math.hypot(dx, dz) : 0) * spd * dt;
  if (!walkable(nx, nz)) { if (walkable(nx, me.z)) nz = me.z; else if (walkable(me.x, nz)) nx = me.x; else { nx = me.x; nz = me.z; } }
  [nx, nz] = collide(nx, nz);
  if (!walkable(nx, nz)) { nx = me.x; nz = me.z; }
  if (groundHeight(nx, nz) - me.y > 0.55) { nx = me.x; nz = me.z; } // ledge too high: jump onto it
  me.speed = Math.hypot(nx - me.x, nz - me.z) / Math.max(dt, 1e-4);
  me.x = nx; me.z = nz;
  if (mag > 0.05) {
    const target = Math.atan2(dx, dz);
    let d = target - me.face; d = Math.atan2(Math.sin(d), Math.cos(d));
    me.face += d * Math.min(1, dt * 12);
  }
  const gh = groundHeight(me.x, me.z);
  if (!game.frozen && controls.takeJump() && me.grounded) { me.vy = 7.8; me.grounded = false; Sfx.jump?.(); }
  me.vy -= 22 * dt; me.y += me.vy * dt;
  if (me.y <= gh) { me.y = gh; me.vy = 0; me.grounded = true; } else if (me.y - gh > 0.05) me.grounded = false;
  if (controls.takeAct() && !game.frozen) game.onAct?.();
  footsteps(dt);
  if (avatar) {
    avatar.root.position.set(me.x, me.y, me.z);
    avatar.root.rotation.y = me.face;
    avatar.animate(dt, me.speed, !me.grounded);
  }
}

export function teleport(x, z) { me.x = x; me.z = z; me.y = groundHeight(x, z); me.vy = 0; }

// ---------- camera ----------
const camTarget = new THREE.Vector3(me.x, 1.3, me.z), _fv = new THREE.Vector3();
function updateCamera(dt) {
  camTarget.lerp(new THREE.Vector3(me.x, me.y + 1.3, me.z), 1 - Math.exp(-dt * 12));
  const { yaw, pitch, dist } = controls;
  camera.position.set(camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist, camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  if (camera.position.y < 0.6) camera.position.y = 0.6;
  camera.lookAt(camTarget);
  grass.update(me.x, me.z, groundHeight(me.x, me.z));
  leaves.update(me.x, groundHeight(me.x, me.z), me.z);
  scene.userData.camPos = camera.position;
  if (tilt) { _fv.set(me.x, me.y + 1, me.z).project(camera); tilt.setFocus(THREE.MathUtils.clamp(_fv.y * 0.5 + 0.5, 0.2, 0.8)); }
  sun.position.set(me.x + SUN_DIR.x * 120, SUN_DIR.y * 120, me.z + SUN_DIR.z * 120);
  sun.target.position.set(me.x, 0, me.z);
}

// ---------- minimap ----------
const MAP_R = 160, MM = 600, mapImg = document.createElement('canvas');
mapImg.width = mapImg.height = MM;
export const w2m = (x, z) => [(x + MAP_R) / (2 * MAP_R) * MM, (z + MAP_R) / (2 * MAP_R) * MM];
function drawMapBase() {
  const c = mapImg.getContext('2d'), k = MM / (2 * MAP_R);
  c.fillStyle = '#76bd52'; c.fillRect(0, 0, MM, MM);
  c.fillStyle = '#4f9a3f'; c.beginPath(); c.arc(...w2m(ZONES[3].x, ZONES[3].z), 70 * k, 0, 7); c.fill();
  c.strokeStyle = '#3fa9e0'; c.lineWidth = 28 * k; c.beginPath();
  for (let z = -MAP_R; z <= MAP_R; z += 8) { const [a, b] = w2m(riverX(z), z); z === -MAP_R ? c.moveTo(a, b) : c.lineTo(a, b); } c.stroke();
  c.fillStyle = '#3fa9e0'; waters.forEach((w) => { c.beginPath(); c.arc(...w2m(w.x, w.z), w.r * k, 0, 7); c.fill(); });
  c.strokeStyle = '#e2c79a'; c.lineCap = 'round';
  PATHS.forEach(({ a, b, w }) => { c.lineWidth = w * k; c.beginPath(); c.moveTo(...w2m(...a)); c.lineTo(...w2m(...b)); c.stroke(); });
  c.strokeStyle = '#b8613f'; c.lineWidth = 4 * k; c.lineCap = 'square'; c.beginPath();      // city wall
  c.moveTo(...w2m(riverX(CITY.n) + 20, CITY.n)); c.lineTo(...w2m(CITY.w, CITY.n)); c.lineTo(...w2m(CITY.w, CITY.s)); c.lineTo(...w2m(riverX(CITY.s) + 20, CITY.s));
  for (let z = CITY.s; z >= CITY.n; z -= 8) c.lineTo(...w2m(riverX(z) + 20, z));
  c.stroke(); c.lineCap = 'round';
  ZONES.forEach((zn) => { c.fillStyle = zn.color; c.globalAlpha = 0.28; c.beginPath(); c.arc(...w2m(zn.x, zn.z), zn.r * k * 0.7, 0, 7); c.fill(); c.globalAlpha = 1; });
  c.fillStyle = '#5a3a22'; colliders.forEach((cl) => { if (cl.hw) { const [a, b] = w2m(cl.x - cl.hw, cl.z - cl.hd); c.fillRect(a, b, cl.hw * 2 * k, cl.hd * 2 * k); } else if (cl.r > 2.5) { c.beginPath(); c.arc(...w2m(cl.x, cl.z), cl.r * k, 0, 7); c.fill(); } });
  c.font = 'bold 22px Mitr, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  ZONES.forEach((zn) => { const [a, b] = w2m(zn.x, zn.z); c.fillStyle = '#fff'; c.beginPath(); c.arc(a, b, 15, 0, 7); c.fill(); c.fillStyle = zn.color; c.fillText(zn.id, a, b + 1); });
}
export const mapBase = mapImg;
const mm = $('minimap'), mctx = mm.getContext('2d');
export const minimapMarkers = []; // {x,z,color} extra dots (players, detector hint)
function drawMinimap() {
  const S = mm.width, view = 55, scale = S / (2 * view) / (MM / (2 * MAP_R));
  mctx.save(); mctx.clearRect(0, 0, S, S);
  const [px, pz] = w2m(me.x, me.z);
  mctx.translate(S / 2, S / 2); mctx.scale(scale, scale); mctx.translate(-px, -pz);
  mctx.drawImage(mapImg, 0, 0);
  for (const o of game.others.values()) { const [a, b] = w2m(o.x, o.z); mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(a, b, 5 / scale * 1.6, 0, 7); mctx.fill(); mctx.fillStyle = '#3aa0d8'; mctx.beginPath(); mctx.arc(a, b, 3.6 / scale * 1.6, 0, 7); mctx.fill(); }
  minimapMarkers.forEach((mk) => { const [a, b] = w2m(mk.x, mk.z); mctx.fillStyle = mk.color; mctx.beginPath(); mctx.arc(a, b, 6 / scale * 1.6, 0, 7); mctx.fill(); });
  mctx.restore();
  mctx.save(); mctx.translate(S / 2, S / 2); mctx.rotate(-me.face + Math.PI);
  mctx.fillStyle = '#ffd23f'; mctx.strokeStyle = '#5a3a22'; mctx.lineWidth = 3;
  mctx.beginPath(); mctx.moveTo(0, -18); mctx.lineTo(12, 13); mctx.lineTo(0, 6); mctx.lineTo(-12, 13); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

// ---------- HUD ----------
let curZone = null, bannerT = 0;
function updateZone(dt) {
  const z = zoneAt(me.x, me.z);
  if (z !== curZone) {
    curZone = z;
    if (z) { $('zone-name').textContent = z.name; $('zone-sub').textContent = z.sub; $('zone-banner').classList.add('show'); bannerT = 6; }
  }
  if (bannerT > 0 && (bannerT -= dt) <= 0) $('zone-banner').classList.remove('show');
}
export function toast(msg, ms = 3000) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

// ---------- tiny sfx (WebAudio) ----------
export const Sfx = {};
let actx = null;
export function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
export function beep(freq = 880, dur = 0.08, vol = 0.12, type = 'sine') {
  const a = audio(), o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02);
}
Sfx.jump = () => beep(520, 0.12, 0.06, 'triangle');
// footsteps: synthesised per surface (no audio files)
let noiseBuf = null;
function stepSound(kind, run) {
  const a = audio(), t0 = a.currentTime, v = run ? 1.25 : 1;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const P = { dirt: ['lowpass', 700, 0.09, 0.30], grass: ['bandpass', 3000, 0.12, 0.16], brick: ['bandpass', 1500, 0.05, 0.34], stone: ['highpass', 3200, 0.035, 0.30], wood: ['bandpass', 520, 0.08, 0.40] }[kind];
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf; src.playbackRate.value = 0.9 + Math.random() * 0.25;
  f.type = P[0]; f.frequency.value = P[1] * (0.9 + Math.random() * 0.2); f.Q.value = 0.8;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(P[3] * v, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + P[2]);
  src.connect(f).connect(g).connect(a.destination); src.start(t0, Math.random() * 0.1); src.stop(t0 + P[2] + 0.02);
  if (kind === 'wood' || kind === 'brick') beep(kind === 'wood' ? 150 : 210, 0.06, 0.05 * v, 'triangle');   // hollow thump / hard tick
}
let stepT = 0;
function footsteps(dt) {
  if (game.fly || game.frozen || !me.grounded || me.speed < 1) { stepT = 0.18; return; }
  stepT -= dt * (me.speed > 6 ? 1.5 : 1);
  if (stepT <= 0) { stepT = 0.46; try { stepSound(surfaceAt(me.x, me.z), me.speed > 6); } catch {} }
}


// ---------- loop ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.getDrawingBufferSize(STYLE.uRes.value);
  composer?.setSize(w, h); tilt?.setSize(STYLE.uRes.value.x, STYLE.uRes.value.y);
}
// bloom (desktop): glints on water, gold roofs, sun
let composer = null, tilt = null, bloomPass = null;
if (!LIGHT && !params.has('nobloom')) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass((bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.55, 0.95)));
  tilt = tiltShiftPasses(); tilt.passes.forEach((p) => composer.addPass(p));
  composer.addPass(new OutputPass());
}
addEventListener('resize', resize); resize();

const clock = new THREE.Timer();
let fpsAcc = 0, fpsN = 0, running = false, adA = 0, adN = 0;
const showFps = params.has('debug');
if (showFps) $('fps').classList.remove('hidden');
function frame() {
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05), t = clock.getElapsed();
  uTime.value = t;
  const night = updateCycle({ sunDir: SUN_DIR, fog: scene.fog, bloom: bloomPass });
  sun.color.setScalar(1);
  if (running) { updatePlayer(dt); updateZone(dt); drawMinimap(); game.onTick?.(dt, t); game.onTickNet?.(dt); }
  updateCamera(dt);
  for (const fn of animated) fn(t, dt);
  composer ? composer.render(dt) : renderer.render(scene, camera);
  if (showFps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000) | 0}k tris`; fpsAcc = fpsN = 0; } }
  // adaptive resolution: drop render scale when frames are slow, raise it back when there is headroom
  adA += dt; adN++;
  if (adA > 2) { const fps = adN / adA; adA = adN = 0;
    const nd = fps < 45 ? Math.max(0.75, dpr - 0.25) : fps > 57 ? Math.min(devicePixelRatio, LOW ? 1.25 : TOUCH ? 1.5 : 1.75, dpr + 0.125) : dpr;
    if (nd !== dpr) { dpr = nd; renderer.setPixelRatio(dpr); resize(); } }
  requestAnimationFrame(frame);
}
drawMapBase();
requestAnimationFrame(frame);
$('btn-fs').onclick = async () => {
  const d = document, el = d.documentElement, isFs = d.fullscreenElement || d.webkitFullscreenElement;
  try {
    if (isFs) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else if (el.requestFullscreen || el.webkitRequestFullscreen) await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    else throw 0;
  } catch { toast('iPhone เต็มจอไม่ได้จากปุ่มนี้: กด แชร์ ⬆ → "เพิ่มไปยังหน้าจอโฮม" แล้วเปิดเกมจากไอคอน', 6000); }
};

// idle camera orbit behind login screen
controls.pitch = 0.25; controls.dist = 14;
animated.push((t) => { if (!running) controls.yaw = t * 0.05; });

export { scene, camera, renderer, controls };
window.__dev = { me, teleport, controls, game, groundHeight, scene, collide, walkable, colliders, PATHS, mapBase: mapImg };

export function startPlaying(profile) {
  Object.assign(me, profile);
  me.look = [...me.name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % STUDENT_LOOKS;
  $('screen-login').classList.add('hidden'); $('hud').classList.remove('hidden');
  spawnAvatar();
  teleport(me.x, me.z);
  controls.yaw = 0; controls.pitch = 0.3; controls.dist = 7.5;
  running = true;
  audio();
}

// offline / dev entry (net.js replaces this flow in multiplayer)
import('./app.js');
