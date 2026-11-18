// Networking: one WebSocket to the classroom Durable Object. Students stream their position and
// see each other; the teacher's commands (start / pause / summon / end / broadcast) arrive here.
import * as THREE from 'three';
import { me, game, scene, toast, teleport, beep } from './main.js';
import { makeCharacter, studentLook, STUDENT_LOOKS, ROLE_LOOKS } from './models.js';
import { makeNameTag } from './character.js';
import { elephants, setElephant, SEAT, setAnchor, eleClock } from './elephant.js';

// elephants: server says who rides each one and where riderless ones were left
function applyEles(list, now) {
  if (!list) return; if (now) eleClock.skew = now - Date.now();
  const mine = net.role === 'teacher' ? 'teacher' : net.sid;
  list.forEach(([taken, key, x, z, t0], i) => { const e = elephants[i]; if (!e) return;
    if (e.rider !== 'me' || key !== mine) e.rider = taken ? (key === mine ? 'me' : 'other') : (e.rider === 'me' ? 'me' : null);
    if (!taken) setAnchor(i, x, z, t0); });
}
game.netRide = null;

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const SERVER = (import.meta.env.VITE_SERVER || (local ? 'http://localhost:8787' : '')).replace(/\/$/, '');
const $ = (id) => document.getElementById(id);
const hash = (s) => [...(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

export const net = {
  ws: null, online: false, role: null, phase: 'lobby', sid: sessionStorage.getItem('khon-sid') || '', listeners: {}, join: null,
  on(t, fn) { (this.listeners[t] ||= []).push(fn); },
  emit(t, m) { (this.listeners[t] || []).forEach((fn) => fn(m)); },
  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); },
};

// ---------- connection with auto-reconnect ----------
let retry = 0, lastMsg = 0, reopenTimer = 0, openFn = null;
// Back from the lock screen / another app: a socket the phone killed while asleep may still look open, and the
// reconnect back-off may be long. Wait until the screen has settled, then check the socket and reconnect right away.
function wake() {
  if (net.leaving || !openFn || !net.join) return;
  const ws = net.ws;
  if (!ws || ws.readyState === 3) { clearTimeout(reopenTimer); retry = 0; openFn(); return; }
  if (ws.readyState !== 1) return;
  const t0 = Date.now(); net.send({ t: 'ping' });
  setTimeout(() => {
    if (net.ws !== ws || lastMsg >= t0) return;            // answered (or already replaced): fine
    ws.onmessage = ws.onclose = null; try { ws.close(); } catch {}
    net.online = false; game.netRide = null; setBadge(); clearTimeout(reopenTimer); retry = 0; openFn();
  }, 2500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(wake, 1500); });
export function connect(join) {
  net.join = join;
  return new Promise((resolve) => {
    if (!SERVER) return resolve(false);
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const open = () => {
      const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/ws'); net.ws = ws;
      const timer = setTimeout(() => { if (!settled) { ws.close(); done(false); } }, 12000);   // slow tablets: main thread busy loading the world
      ws.onopen = () => { retry = 0; net.online = true; net.send({ t: 'join', ...net.join, sid: net.sid }); };
      ws.onmessage = (e) => { lastMsg = Date.now(); const m = JSON.parse(e.data); handle(m); if (m.t === 'welcome') { clearTimeout(timer); done(true); } if (m.t === 'error' && m.msg === 'unauthorized') done(false); };
      ws.onclose = (e) => {
        if (net.leaving) return;
        clearTimeout(timer); const was = net.online; net.online = false; game.netRide = null; setBadge();
        if (e.code === 4000 || e.code === 4001) { toast(e.code === 4001 ? 'ครูนำคุณออกจากห้อง' : 'มีการเข้าใช้ชื่อนี้จากอีกเครื่อง'); return; }
        if (!settled) return done(false);
        if (was) toast('🔌 การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่...', 2500);
        reopenTimer = setTimeout(open, Math.min(8000, 800 * 2 ** retry++));
      };
    };
    openFn = open; open();
  });
}
function setBadge() { const b = $('net-badge'); if (b) { b.textContent = net.online ? `🟢 ออนไลน์ ${others.size + (net.role === 'student' ? 1 : 0)} คน` : '🔴 ออฟไลน์'; } }

// ---------- other players ----------
const others = new Map();
function upsertPlayer(r) {
  const [sid, name, no, cls, x, y, z, ry, s, a] = r, e = r[15] || 0, look = r[16] >= 0 ? r[16] : Math.abs(hash(name)) % STUDENT_LOOKS;
  if ((sid === net.sid && net.role === 'student') || (sid === 'teacher' && net.role === 'teacher')) return;
  let o = others.get(sid);
  if (!o) {
    const isT = sid === 'teacher', ch = makeCharacter(isT ? ROLE_LOOKS.monk : studentLook(look));
    ch.root.add(makeNameTag(isT ? '👩‍🏫 ครู' : name, '', isT ? '#ffe08a' : undefined));
    ch.root.position.set(x, y, z); scene.add(ch.root);
    o = { ch, tx: x, ty: y, tz: z, try: ry, s: 0, a: 0, seen: 0 };
    others.set(sid, o);
  }
  Object.assign(o, { tx: x, ty: y, tz: z, try: ry, s, a, e, seen: performance.now(), name, no, cls });
  game.others.set(sid, { x, z });
}
export function updateOthers(dt) {
  const k = 1 - Math.exp(-dt * 10), now = performance.now();
  for (const [sid, o] of others) {
    if (now - o.seen > 4000) { scene.remove(o.ch.root); others.delete(sid); game.others.delete(sid); continue; }
    const p = o.ch.root.position; p.x += (o.tx - p.x) * k; p.y += (o.ty - p.y) * k; p.z += (o.tz - p.z) * k;
    let d = o.try - o.ch.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.ch.root.rotation.y += d * k;
    if (o.e && elephants[o.e - 1]) {   // riding: move that elephant, sit on its back
      const el = elephants[o.e - 1]; el.remote = now; setElephant(o.e - 1, p.x, p.z, o.ch.root.rotation.y, o.s, dt);
      o.ch.root.position.y = p.y + SEAT; if (!o.sitting) { o.ch.play('Sit_Floor_Idle', 0.2); o.ch.locked = true; o.sitting = true; } o.ch.update(dt);
    } else { if (o.sitting) { o.ch.locked = false; o.sitting = false; } o.ch.animate(dt, o.s, !!o.a); }
  }
}

// ---------- messages ----------
function overlay(title, body) {
  if (!title) return $('overlay').classList.add('hidden');
  $('overlay-title').textContent = title; $('overlay-body').innerHTML = body || ''; $('overlay').classList.remove('hidden');
}
function applyPhase(ph) {
  net.phase = ph;
  if (net.role !== 'student') return;
  game.frozen = ph === 'paused';   // lobby/ended: free to walk (chests still wait for START)
  if (ph === 'paused') overlay('⏸ หยุดเกมชั่วคราว', 'รอครูสั่งเล่นต่อนะ');
  else if (ph !== 'ended') overlay(null);
}
function runCountdown(kind, secs = 3) {
  const el = $('countdown'), end = kind === 'end'; let n = secs;
  const tick = () => {
    if (n > 0) { el.textContent = n; el.className = end ? 'end' : ''; beep(end ? 520 : 660, 0.14, 0.12, 'square'); n--; setTimeout(tick, 1000); }
    else { el.textContent = end ? '⏹ จบเกม' : '🚀 เริ่ม!'; beep(end ? 330 : 1320, 0.5, 0.14, 'triangle'); setTimeout(() => el.classList.add('hidden'), 900); return; }
    el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  };
  tick();
}
function handle(m) {
  switch (m.t) {
    case 'welcome':
      net.role = m.role; net.welcome = m; applyEles(m.eles, m.now);
      game.netRide = (i, on, x, z) => net.send({ t: 'ride', i, on, x, z });
      if (m.sid) { net.sid = m.sid; sessionStorage.setItem('khon-sid', m.sid); }
      if (m.me && net.role === 'student' && (m.me.x || m.me.z)) teleport(m.me.x, m.me.z);
      applyPhase(m.phase); break;
    case 'players': for (const r of m.list) upsertPlayer(r); setBadge(); break;
    case 'phase': applyPhase(m.phase); break;
    case 'summon': teleport(m.x, m.z); toast(m.text, 3500); beep(660, 0.2, 0.08, 'triangle'); break;
    case 'broadcast': toast(m.text, 5000); beep(880, 0.12, 0.08, 'triangle'); setTimeout(() => beep(1175, 0.18, 0.08, 'triangle'), 130); break;
    case 'countdown': runCountdown(m.kind, m.secs); break;
    case 'notice': toast(m.msg, 2000); break;
    case 'eles': applyEles(m.list, m.now); break;
    case 'ride': game.rideResult?.(m); break;
    case 'leaderboard': if (net.role === 'student') showLeaderboard(m.rows); break;
  }
  net.emit(m.t, m);
}
$('overlay').onclick = () => { if (net.phase !== 'paused') overlay(null); };   // results can be dismissed
export function showLeaderboard(rows) {
  const mine = rows.findIndex((r) => r.name === me.name && r.no === me.no);
  overlay('🏆 จบเกม — สรุปคะแนน', `<table class="lb"><tr><th>#</th><th>ชื่อ</th><th>เลขที่</th><th>ชั้น</th><th>คะแนน</th><th>สมบัติ</th></tr>${rows.slice(0, 15).map((r, i) => `<tr class="${i === mine ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.no)}</td><td>${esc(r.cls)}</td><td>${r.score}</td><td>${r.found}</td></tr>`).join('')}</table>`);
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- position stream (8 Hz, only when changed) ----------
let last = '', acc = 0;
export function netTick(dt) {
  updateOthers(dt);
  if (!net.online || (net.role !== 'student' && net.role !== 'teacher')) return;
  acc += dt; if (acc < 0.125) return; acc = 0;
  const msg = { t: 'pos', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), ry: +me.face.toFixed(2), s: +me.speed.toFixed(1), a: me.grounded ? 0 : 1, e: me.ride + 1, k: Math.floor(game.secs || 0) };
  const key = JSON.stringify(msg); if (key === last) return; last = key; net.send(msg);
}

export async function teacherLogin(password) {
  if (!SERVER) return { ok: false, error: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์เกม' };
  try { const r = await fetch(SERVER + '/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }); return await r.json(); }
  catch { return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }; }
}
export async function teacherChangePassword(token, newPassword) {
  const r = await fetch(SERVER + '/api/teacher/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, newPassword }) }); return r.json();
}
export const othersMap = others;
