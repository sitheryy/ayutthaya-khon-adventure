// Treasure hunt: 12 chests hidden around the city, a magic wand that blinks and beeps faster as you get
// closer, and a Khon quiz in every chest. Wrong answer = no points and the chest hides somewhere else.
// Online: the server owns chest positions, questions, answers and scores. Offline: same rules, run locally.
import * as THREE from 'three';
import { me, game, scene, controls, toast, beep, audio } from './main.js';
import { colliders, isBlockedWater, CITY, SPAWN, riverX, groundHeight, pathClear, rng, animated } from './world.js';
import { makeAnimal } from './models.js';
import { net } from './net.js';

const $ = (id) => document.getElementById(id);
const N_CHESTS = 12, OPEN_DIST = 2.4, FIND_BONUS = 20;
const st = { chests: [], score: 0, found: 0, total: N_CHESTS, bank: [], used: new Set(), muted: false, nextBeep: 0, blinkT: 0, busy: false, online: false };

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const blocked = (x, z, pad) => colliders.some((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + pad : Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad));

function freeSpot(r, avoid = []) {
  for (let i = 0; i < 500; i++) {
    const x = CITY.w + 10 + r() * (riverX(0) - 20 - CITY.w - 10), z = CITY.n + 10 + r() * (CITY.s - CITY.n - 20);
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 20 || isBlockedWater(x, z) || !pathClear(x, z, 0.8) || blocked(x, z, 1.6)) continue;
    if (avoid.some(([ax, az]) => Math.hypot(x - ax, z - az) < 15)) continue;
    if (Math.abs(groundHeight(x, z)) > 1.5) continue;
    return [x, z];
  }
  return [SPAWN.x + 30, SPAWN.z + 10];
}
// valid hiding spots spread over the city (the teacher's client sends these to the server on START)
export function generateSpots(n = 48) { const r = Math.random, out = []; for (let i = 0; i < n; i++) out.push(freeSpot(r, out).map((v) => +v.toFixed(1))); return out; }

function glowSprite(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size); return s;
}

function makeChest() {
  const an = makeAnimal('Chest'), g = new THREE.Group();
  const b = new THREE.Box3().setFromObject(an.root), sz = b.getSize(new THREE.Vector3());
  an.root.scale.multiplyScalar(1.7 / Math.max(sz.x, sz.z)); g.add(an.root);
  const glow = glowSprite('rgba(255,210,90,0.9)', 3.2); glow.position.y = 0.9; glow.visible = false; g.add(glow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 3.5; g.add(beam); scene.add(g);
  return { g, an, glow, beam, x: 0, z: 0, found: false, col: { x: 0, z: 0, r: 0.75 } };
}
function setPos(c, x, z) {
  c.x = x; c.z = z; c.g.position.set(x, groundHeight(x, z), z); c.g.rotation.y = (Math.abs(hash(x + ',' + z)) % 628) / 100;
  c.col.x = x; c.col.z = z; if (!colliders.includes(c.col)) colliders.push(c.col);
}
function playChest(c, open) {
  const acts = c.an.mixer._actions, a = acts.find((x) => x.getClip().name.endsWith(open ? 'Chest_Open' : 'Chest_Close'));
  acts.forEach((x) => x.stop()); if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); }
}
function setChests(list) {
  while (st.chests.length < list.length) st.chests.push(makeChest());
  st.chests.forEach((c, i) => {
    const d = list[i]; c.g.visible = !!d;
    if (!d) { const k = colliders.indexOf(c.col); if (k >= 0) colliders.splice(k, 1); return; }
    setPos(c, d.x, d.z); c.found = !!d.found; playChest(c, c.found);
  });
  st.total = list.length || N_CHESTS; updateHud();
}

// ---------- wand ----------
let wandGem = null;
function attachWand() {
  const hand = game.avatar?.handR; if (!hand || hand.userData.wand) return;
  const w = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.55, 8), new THREE.MeshLambertMaterial({ color: '#6b3e22' })); stick.position.y = 0.2; w.add(stick);
  [0.0, 0.4].forEach((y) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 12), new THREE.MeshLambertMaterial({ color: '#e9b73c' })); ring.rotation.x = Math.PI / 2; ring.position.y = y; w.add(ring); });
  wandGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshLambertMaterial({ color: '#9fe4ff', emissive: '#3aa0ff', emissiveIntensity: 0.4 }));
  wandGem.position.y = 0.53; w.add(wandGem);
  const halo = glowSprite('rgba(140,220,255,0.8)', 0.6); halo.position.y = 0.53; w.add(halo); wandGem.userData.halo = halo;
  w.scale.setScalar(1 / hand.getWorldScale(new THREE.Vector3()).x);   // undo the rig's scale
  hand.add(w); hand.userData.wand = w;
}

// ---------- detector ----------
const playing = () => !st.online || net.phase === 'playing';
function nearest() {
  if (!playing()) return null;
  let best = null;
  st.chests.forEach((c, i) => { if (!c.found && c.g.visible) { const d = Math.hypot(c.x - me.x, c.z - me.z); if (!best || d < best.d) best = { c, i, d }; } });
  return best;
}
function detector(dt, t) {
  const n = nearest(), gem = $('det-gem'), txt = $('det-text'), arrow = { style: {} };
  if (!n) { txt.textContent = !playing() ? (net.phase === 'ended' ? 'จบเกมแล้ว' : 'รอครูเริ่มเกม...') : 'พบสมบัติครบแล้ว! 🎉'; arrow.style.opacity = 0; gem.classList.remove('on'); return; }
  const d = n.d, k = THREE.MathUtils.clamp((d - 4) / 66, 0, 1);       // 0 = right on it, 1 = far
  const interval = 0.09 + Math.pow(k, 1.3) * 1.5;
  txt.textContent = d < 8 ? 'ใกล้มาก! ✨' : d < 22 ? 'สัญญาณแรง' : d < 45 ? 'สัญญาณปานกลาง' : 'สัญญาณอ่อน';
  const ang = Math.atan2(n.c.x - me.x, n.c.z - me.z) - (controls.yaw + Math.PI);
  arrow.style.transform = `rotate(${-ang}rad)`; arrow.style.opacity = d < 45 ? 1 : 0.35;
  if (t >= st.nextBeep) { st.nextBeep = t + interval; st.blinkT = 0.08; if (!st.muted && !st.busy) beep(560 + (1 - k) * 760, 0.06, 0.035 + (1 - k) * 0.035, 'sine'); }
  st.blinkT -= dt;
  const on = st.blinkT > 0;
  gem.classList.toggle('on', on);
  if (wandGem) { wandGem.material.emissiveIntensity = on ? 3 : 0.4; wandGem.userData.halo.scale.setScalar(on ? 0.9 : 0.4); }
}
function chestFx(t) {
  for (const c of st.chests) {
    const cd = Math.hypot(c.x - me.x, c.z - me.z), live = playing() && !c.found;
    c.glow.visible = live && cd < 30; c.glow.material.opacity = 0.5 + Math.sin(t * 6) * 0.3;
    c.beam.material.opacity = live && cd < 9 ? 0.18 + Math.sin(t * 4) * 0.06 : 0;
  }
}

// ---------- quiz ----------
function showQuiz(q, onPick) {
  let sel = -1;
  $('quiz-q').textContent = q.q; $('quiz-res').classList.add('hidden');
  const ok = $('quiz-ok'); ok.disabled = true; ok.textContent = 'ยืนยันคำตอบ'; delete ok.dataset.done;
  const box = $('quiz-opts'); box.innerHTML = '';
  q.choices.forEach((ch, i) => {
    const b = document.createElement('button'); b.textContent = `${'กขคง'[i]}. ${ch}`;
    b.onclick = () => { if (ok.dataset.done) return; sel = i; [...box.children].forEach((x, j) => x.classList.toggle('sel', j === i)); ok.disabled = false; };
    box.appendChild(b);
  });
  $('quiz').classList.remove('hidden');
  ok.onclick = async () => {
    if (ok.dataset.done) return onPick(null);
    ok.disabled = true; ok.dataset.done = '1';
    const res = await onPick(sel);
    [...box.children].forEach((x, j) => { x.classList.toggle('right', j === res.answer); x.classList.toggle('wrong', j === sel && !res.right); });
    $('quiz-res').innerHTML = res.right
      ? `<b>✅ ถูกต้อง! +${res.points} คะแนน</b><br>${res.explain || ''}`
      : `<b>❌ ยังไม่ถูก</b> คำตอบคือ “${q.choices[res.answer]}”<br>${res.explain || ''}<br><i>หีบสมบัติหนีไปซ่อนที่ใหม่แล้ว ลองตามหาอีกครั้ง!</i>`;
    $('quiz-res').classList.remove('hidden');
    if (res.right) { beep(880, 0.15, 0.08, 'triangle'); setTimeout(() => beep(1320, 0.2, 0.08, 'triangle'), 140); } else beep(220, 0.3, 0.07, 'sawtooth');
    ok.textContent = 'เล่นต่อ'; ok.disabled = false;
  };
}
function closeQuiz() { $('quiz').classList.add('hidden'); st.busy = false; if (net.phase !== 'paused' && net.phase !== 'ended') game.frozen = false; }

function openChest(n) {
  st.busy = true; game.frozen = true; playChest(n.c, true); audio();
  if (st.online) { st.pendingChest = n.i; net.send({ t: 'open', chest: n.i }); return; }   // server replies with 'question'
  if (st.used.size >= st.bank.length) st.used.clear();
  let qi; do qi = (Math.random() * st.bank.length) | 0; while (st.used.has(qi));
  st.used.add(qi); const q = st.bank[qi];
  setTimeout(() => showQuiz(q, (sel) => {
    if (sel === null) { finish(n.c, n.c.found); return; }
    const right = sel === q.answer, points = right ? (q.points || 100) + FIND_BONUS : 0;
    if (right) { st.score += points; st.found++; n.c.found = true; }
    updateHud(); return { right, answer: q.answer, explain: q.explain, points };
  }), 500);
}
function finish(c, right) {
  closeQuiz();
  if (!right) {
    playChest(c, false);
    if (!st.online) { const [x, z] = freeSpot(Math.random, st.chests.filter((o) => o !== c && !o.found).map((o) => [o.x, o.z])); setTimeout(() => setPos(c, x, z), 300); }
    else if (c.next) setTimeout(() => setPos(c, c.next.x, c.next.z), 300);
  }
  if (st.found >= st.total) toast(`🎉 พบสมบัติครบ ${st.total} หีบ! คะแนนรวม ${st.score}`, 6000);
}
function updateHud() { $('hud-score').textContent = st.score; $('hud-chests').textContent = st.found; $('hud-total').textContent = st.total; }

// ---------- entry ----------
export async function startTreasureHunt({ online, seed = 'OFFLINE' }) {
  st.online = online;
  if (online) {
    net.on('welcome', (m) => { if (m.chests) setChests(m.chests); if (m.me) { st.score = m.me.score; st.found = m.me.found; } st.total = m.total; updateHud(); });
    if (net.welcome?.chests) setChests(net.welcome.chests);
    if (net.welcome?.me) { st.score = net.welcome.me.score; st.found = net.welcome.me.found; st.total = net.welcome.total; }
    net.on('chests', (m) => { setChests(m.chests); st.score = m.score; st.found = m.found; updateHud(); });
    net.on('question', (m) => {
      const c = st.chests[m.chest];
      setTimeout(() => showQuiz(m, (sel) => {
        if (sel === null) return finish(c, c.found);
        return new Promise((resolve) => {
          net.listeners.result = [(r) => { c.found = r.chestState.found; c.next = r.chestState; st.score = r.score; st.found = r.found; updateHud(); resolve(r); }];
          net.send({ t: 'answer', chest: m.chest, choice: sel });
        });
      }), 400);
    });
    // server refused to open (not started / too far): release the player
    net.on('notice', () => { if (st.busy && $('quiz').classList.contains('hidden')) { st.busy = false; game.frozen = net.phase === 'paused' || net.phase === 'ended'; const c = st.chests[st.pendingChest]; if (c) playChest(c, false); } });
  } else {
    try { st.bank = (await (await fetch(import.meta.env.BASE_URL + 'questions.json')).json()).questions; }
    catch { st.bank = [{ q: 'โขนนิยมแสดงเรื่องใด', choices: ['รามเกียรติ์', 'อิเหนา', 'พระอภัยมณี', 'ขุนช้างขุนแผน'], answer: 0, explain: '', points: 100 }]; }
    const r = rng(hash(seed)), list = [];
    for (let i = 0; i < N_CHESTS; i++) { const [x, z] = freeSpot(r, list.map((c) => [c.x, c.z])); list.push({ x, z, found: false }); }
    setChests(list);
  }
  animated.push((t, dt) => st.chests.forEach((c) => c.an.update(dt)));
  updateHud(); attachWand();
  window.__hunt = st;
  $('detector').onclick = () => { st.muted = !st.muted; toast(st.muted ? '🔇 ปิดเสียงไม้กายสิทธิ์' : '🔊 เปิดเสียงไม้กายสิทธิ์', 1200); };
  $('detector').style.pointerEvents = 'auto';
  game.onAct = () => { if (st.busy) return; const n = nearest(); if (n && n.d < OPEN_DIST) openChest(n); };
  game.onTick = (dt, t) => {
    attachWand(); detector(dt, t); chestFx(t);
    st.chests.forEach((c) => (c.g.visible = playing() || c.found));
    const n = nearest();
    $('prompt').classList.toggle('hidden', !(n && n.d < OPEN_DIST) || st.busy);
  };
}
