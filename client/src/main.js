import * as THREE from 'three';
import { STYLE } from './style.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { flyingLeaves, windLines, tiltShiftPasses, fireflies, gradePass } from './effects.js';
import { updateCycle } from './cycle.js';
import { buildLife } from './life.js';
import { startAmbience, updateAmbience } from './ambience.js';
import { spawnNaga } from './naga.js';
import { spawnElephants, nearestElephant, setElephant, animateElephants, elephants, SEAT, wanderElephants, setAnchor, eleClock } from './elephant.js';
import { CITY, SUN_DIR, buildWorld, buildSky, ZONES, SPAWN, HALF, WALL_Z, colliders, animated, uTime, groundHeight, isBlockedWater, zoneAt, riverX, PATHS, waters, surfaceAt } from './world.js';
import { makeNameTag } from './character.js';
import { foliageLod } from './foliage.js';
import { loadAssets, makeCharacter, studentLook, STUDENT_LOOKS } from './models.js';
import { Controls } from './controls.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LOW = params.has('low');   // every device gets the full graphics; the player taps the ⚡ button for light mode

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.25 : 1.75));
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
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun, sun.target);

const loginBtn = document.querySelector('#form-login button');
loginBtn.disabled = true; loginBtn.textContent = 'กำลังโหลดโลก... 0%';
await document.fonts.load('600 58px Mitr').catch(() => {});
await loadAssets((p) => (loginBtn.textContent = `กำลังโหลดโลก... ${Math.round(p * 100)}%`));
buildSky(scene);
const { grass } = buildWorld(scene, { low: LOW });
spawnElephants(scene, [[14, 36, 0.6], [-18, 6, -2.2]]);
spawnNaga(scene, animated);   // big animated พญานาค circling the Himmapan pond   // two rideable royal elephants near the plaza
animated.push(animateElephants); animated.push((t, dt) => wanderElephants(dt));
const leaves = flyingLeaves(scene, uTime, LOW ? 50 : 110);
windLines(scene, uTime, LOW ? 8 : 18);
loginBtn.disabled = false; loginBtn.textContent = 'เข้าสู่โลกผจญภัย';

// ---------- player ----------
export const me = { ride: -1, x: SPAWN.x, z: SPAWN.z, y: 0, vy: 0, face: Math.PI, speed: 0, grounded: true, look: 0, name: '', no: '', cls: '' };
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
let PR = 0.45; // player radius (bigger while riding an elephant)

function collide(x, z) {
  for (let i = 0; i < elephants.length; i++) if (i !== me.ride) { const e = elephants[i], dx = x - e.x, dz = z - e.z, rr = 2.2 + PR, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; x += dx * k; z += dz * k; } }
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
  const spd = (me.ride >= 0 ? (m.run ? 8.5 : 5) : (m.run ? 7.5 : 4.6)) * mag;
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
  if (!game.frozen && controls.takeJump() && me.grounded && me.ride < 0) { me.vy = 7.8; me.grounded = false; Sfx.jump?.(); }
  me.vy -= 22 * dt; me.y += me.vy * dt;
  if (me.y <= gh) { me.y = gh; me.vy = 0; me.grounded = true; } else if (me.y - gh > 0.05) me.grounded = false;
  if (controls.takeAct() && !game.frozen && !rideToggle()) game.onAct?.();
  $('prompt-ride').classList.toggle('hidden', !(me.ride >= 0 || (nearestElephant(me.x, me.z, 5) >= 0 && $('prompt').classList.contains('hidden'))));
  $('prompt-ride').innerHTML = (controls.touch ? '👆 แตะเพื่อ' : 'กด <b>E</b> เพื่อ') + (me.ride >= 0 ? 'ลงจากช้าง' : 'ขี่ช้าง 🐘');
  if (me.ride >= 0) {
    setElephant(me.ride, me.x, me.z, me.face, me.speed, dt);
    if (avatar) { avatar.root.position.set(me.x, me.y + SEAT, me.z); avatar.root.rotation.y = me.face; avatar.update(dt); }
    footsteps(dt); return;
  }
  footsteps(dt);
  if (avatar) {
    avatar.root.position.set(me.x, me.y, me.z);
    avatar.root.rotation.y = me.face;
    avatar.animate(dt, me.speed, !me.grounded);
  }
}

// E / ✋ near an elephant: climb on; again: climb off beside it. A chest in reach takes priority.
function rideToggle() {
  if (me.ride >= 0) {
    const i = me.ride, e = elephants[i]; me.ride = -1; PR = 0.45; e.rider = null;
    // the elephant carries on wandering from where it was left (online: the server tells everyone the new spot)
    setAnchor(i, e.x, e.z, Date.now() + eleClock.skew); game.netRide?.(i, false, e.x, e.z);
    const sx = Math.cos(me.face) * 3.4, sz = -Math.sin(me.face) * 3.4; me.x += sx; me.z += sz; [me.x, me.z] = collide(me.x, me.z); me.y = groundHeight(me.x, me.z);
    if (avatar) { avatar.locked = false; avatar.play('Idle'); }
    return true;
  }
  if (!$('prompt').classList.contains('hidden')) return false;
  const i = nearestElephant(me.x, me.z, 5); if (i < 0) return false;
  const e = elephants[i];
  if (e.rider === 'other') { toast('🐘 มีคนขี่ช้างตัวนี้อยู่ รอให้เขาลงก่อนนะ', 2000); return true; }
  if (game.netRide) { if (!rideToggle.wait) { rideToggle.wait = true; game.netRide(i, true); setTimeout(() => (rideToggle.wait = false), 3000); } return true; }   // server says yes/no
  mountElephant(i); return true;
}
// server replies to a ride request
game.rideResult = (m) => {
  rideToggle.wait = false;
  if (!m.on) return;
  if (m.ok) mountElephant(m.i); else toast('🐘 มีคนขี่ช้างตัวนี้อยู่ รอให้เขาลงก่อนนะ', 2000);
};
function mountElephant(i) {
  const e = elephants[i]; if (!e || me.ride >= 0) return;
  me.ride = i; PR = 1.9; e.rider = 'me'; me.x = e.x; me.z = e.z; me.face = e.ry; me.y = groundHeight(me.x, me.z); me.vy = 0;
  if (avatar) { avatar.play('Sit_Floor_Idle', 0.2); avatar.locked = true; }
  toast('🐘 ขี่ช้างแล้ว! กดปุ่มกลางจออีกครั้งเพื่อลง', 2200);
}
export function teleport(x, z) { if (me.ride >= 0) rideToggle(); me.x = x; me.z = z; me.y = groundHeight(x, z); me.vy = 0; }

// ---------- camera ----------
const camTarget = new THREE.Vector3(me.x, 1.3, me.z), _fv = new THREE.Vector3();
function updateCamera(dt) {
  camTarget.lerp(new THREE.Vector3(me.x, me.y + 1.3 + (me.ride >= 0 ? SEAT : 0), me.z), 1 - Math.exp(-dt * 12));
  const { yaw, pitch, dist } = controls;
  camera.position.set(camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist, camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  if (camera.position.y < 0.6) camera.position.y = 0.6;
  camera.lookAt(camTarget);
  grass.update(me.x, me.z, me.y); foliageLod(me.x, me.z);
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
let lastSizeKey = '';
let resizeTimer = 0;
const resizeSoon = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); };   // bursts of resize events -> one resize
function resize() {
  // The canvas CSS box and the render buffer must share ONE size, or iOS stretches the picture / leaves a bar:
  // take the biggest of visual viewport, layout viewport and (installed app only) the real screen.
  const vv = window.visualViewport;
  let w = Math.round(Math.max(vv?.width || 0, innerWidth)), h = Math.round(Math.max(vv?.height || 0, innerHeight));
  // iPad app/fullscreen mode reports a window ~24 px shorter than the screen (home-indicator strip): fill it
  if (matchMedia('(pointer: coarse)').matches) {
    const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height), land = w >= h, tw = land ? long : short, th = land ? short : long;
    if (th - h > 0 && th - h <= 48) h = th; if (tw - w > 0 && tw - w <= 48) w = tw;
  }
  const key = w + 'x' + h + '@' + renderer.getPixelRatio();
  if (key === lastSizeKey) return;   // control centre / brightness slider / toolbar wiggles fire resize with the same size: reallocating the buffers each time is what made it stutter
  lastSizeKey = key;
  renderer.setSize(w, h, true); camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.getDrawingBufferSize(STYLE.uRes.value);
  composer?.setSize(w, h); tilt?.setSize(STYLE.uRes.value.x, STYLE.uRes.value.y);
}
// bloom (desktop): glints on water, gold roofs, sun
let composer = null, tilt = null, bloomPass = null, grade = null;
if (!LOW && !params.has('nobloom')) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass((bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.55, 0.95)));
  { const setB = bloomPass.setSize.bind(bloomPass); bloomPass.setSize = (w, h) => setB(Math.max(2, w >> 1), Math.max(2, h >> 1)); }   // glow is blurry anyway: build it from a half-size image
  tilt = tiltShiftPasses(); tilt.passes.forEach((p) => composer.addPass(p));
  composer.addPass(new OutputPass());
  if (params.get('fx') !== '0') composer.addPass((grade = gradePass()));   // ?fx=0 = old look, for comparing
}
addEventListener('resize', resizeSoon); window.visualViewport?.addEventListener('resize', resizeSoon); addEventListener('orientationchange', () => setTimeout(resize, 300)); addEventListener('pageshow', resizeSoon);
resize(); setTimeout(resize, 400); setTimeout(resize, 1500);   // iOS settles its bars a moment after load
// "light graphics" button: lower resolution, no shadows, no bloom/tilt-shift. Remembered per device.
let light = false; try { light = localStorage.getItem('khon-light') === '1'; } catch {}
const PIXEL_RATIO = Math.min(devicePixelRatio, LOW ? 1.25 : 1.75);
// dynamic resolution: if the frame rate stays low the render scale steps down (min 0.6), and creeps back up when it is smooth again
let dynS = 1, dynFrozen = params.get('dynres') === '0';
function applyRatio() { const pr = (light ? 1 : PIXEL_RATIO) * dynS; renderer.setPixelRatio(pr); composer?.setPixelRatio(pr); resize(); }
function setLight(on) {
  light = on; try { localStorage.setItem('khon-light', on ? '1' : '0'); } catch {}
  sun.castShadow = !on; scene.fog.far = on ? 320 : 600;
  canvas.style.filter = on || LOW ? 'brightness(1.08) contrast(0.86) saturate(0.9)' : '';   // cheap stand-in for the Japanese-tone grade (the real one needs the effects pipeline)
  $('btn-light').textContent = on ? '⚡ ภาพเบา: เปิด' : '⚡ ภาพเบา: ปิด'; $('btn-light').classList.toggle('on', on); applyRatio();
}
$('btn-light').onclick = () => setLight(!light); setLight(light);

const clock = new THREE.Timer();
let fpsAcc = 0, fpsN = 0, running = false;
let dynT = 0, dynN = 0, dynWarm = 0, dynUp = 0, dynPrev = 0, dynDown = false;
let dynSkip = 0;
function onResume() {
  if (document.hidden) return;
  dynSkip = 4; dynT = dynN = 0; dynDown = false;                // the first seconds after waking are slow for every device: do not read them as 'weak device'
  setTimeout(() => { try { if (actx && actx.state !== 'running') actx.resume(); } catch {} }, 400);   // audio comes back after the picture has settled
}
document.addEventListener('visibilitychange', onResume); addEventListener('pageshow', onResume);
function dynRes(dt) {
  if (dynSkip > 0) { dynSkip -= dt; dynT = dynN = 0; return; }
  if (!running || light || dynFrozen || document.hidden) { dynT = dynN = 0; return; }
  dynT += dt; dynN++; if (dynT < 1.5) return;
  const fps = dynN / dynT; dynT = dynN = 0;
  if (++dynWarm <= 2) return;                       // ignore the first seconds (shader compile, asset upload)
  if (dynDown && fps - dynPrev < 2) { dynS = Math.min(1, dynS + 0.1); dynFrozen = true; applyRatio(); return; }   // lower resolution did not help (capped at 30 fps, say): undo and stop
  dynDown = false;
  if (fps < 40 && dynS > 0.61) { dynPrev = fps; dynDown = true; dynUp = 0; dynS = Math.max(0.6, dynS - 0.1); applyRatio(); }
  else if (fps > 57 && dynS < 1) { if (++dynUp >= 3) { dynUp = 0; dynS = Math.min(1, dynS + 0.1); applyRatio(); } }
  else dynUp = 0;
}
const showFps = params.has('debug');
if (showFps) $('fps').classList.remove('hidden');
function frame() {
  clock.update(); const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.getElapsed();
  uTime.value = t;
  const night = updateCycle({ sunDir: SUN_DIR, fog: scene.fog, bloom: bloomPass });
  sun.color.setScalar(1);
  if (running) { updatePlayer(dt); updateZone(dt); drawMinimap(); game.onTick?.(dt, t); game.onTickNet?.(dt); updateAmbience(actx, me, game.quiet); }
  updateCamera(dt);
  for (const fn of animated) fn(t, dt);
  dynRes(Math.min(rawDt, 0.5));
  grade?.update(camera, SUN_DIR, innerWidth, innerHeight);
  composer && !light ? composer.render(dt) : renderer.render(scene, camera);
  if (showFps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} fps · x${dynS.toFixed(1)} · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000) | 0}k tris`; fpsAcc = fpsN = 0; } }
  if (running && !light && !lagHinted) { lagT += dt; lagN++; if (lagT > 6) { if (lagN / lagT < 22) { lagHinted = true; toast('🐢 เครื่องช้าใช่ไหม? แตะ ⚡ ภาพเบา ที่มุมขวาจะลื่นขึ้น', 6000); } lagT = lagN = 0; } }
  requestAnimationFrame(frame);
}
let lagT = 0, lagN = 0, lagHinted = false;
drawMapBase();
requestAnimationFrame(frame);
// already running as an installed app (home-screen icon) = already full screen: no button needed
if (navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) $('btn-fs').classList.add('hidden');
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
window.__dev = { elephants, me, teleport, controls, game, groundHeight, scene, collide, walkable, colliders, PATHS, mapBase: mapImg };

export function startPlaying(profile) {
  Object.assign(me, profile);
  if (!(me.look >= 0)) me.look = [...me.name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % STUDENT_LOOKS;
  $('screen-login').classList.add('hidden'); $('hud').classList.remove('hidden');
  spawnAvatar();
  startAmbience(audio());   // login tap = user gesture, so the AudioContext may start
  teleport(me.x, me.z);
  controls.yaw = 0; controls.pitch = 0.3; controls.dist = 7.5;
  running = true;
  audio();
}

// offline / dev entry (net.js replaces this flow in multiplayer)
import('./app.js');
