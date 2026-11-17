// Teacher control panel: start / pause / resume / summon / end / broadcast, live roster, fly mode.
// Every button sends a command to the server, which applies it to all students in real time.
import { me, game, teleport, toast } from './main.js';
import { net, showLeaderboard, esc, teacherChangePassword } from './net.js';
import { generateSpots } from './treasure.js';

const $ = (id) => document.getElementById(id);
const PH = { lobby: 'รอเริ่มเกม', playing: '🟢 กำลังเล่น', paused: '⏸ หยุดชั่วคราว', ended: '⏹ จบเกมแล้ว' };

export function startTeacher(token) {
  $('tpanel').classList.remove('hidden');
  $('detector').classList.add('hidden');
  $('hud-tl').classList.add('hidden');
  game.isTeacher = true;
  const setPhase = (p) => { $('tp-phase').textContent = PH[p] || p; };
  setPhase(net.phase);
  net.on('phase', (m) => setPhase(m.phase));
  net.on('welcome', (m) => setPhase(m.phase));
  let rows = [];
  net.on('roster', (m) => {
    rows = m.list; const on = rows.filter((r) => r[10]).length;
    $('tp-count').textContent = `${on}/${rows.length}`;
    $('tp-rows').innerHTML = rows.sort((a, b) => b[11] - a[11]).map((r) =>
      `<tr data-sid="${esc(r[0])}"><td><span class="dot ${r[10] ? (net.phase === 'paused' ? 'frz' : 'on') : 'off'}"></span></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${r[11]}</td><td>${r[12]}</td><td>${r[13]}</td><td>${r[14]}</td></tr>`).join('');
  });
  $('tp-rows').onclick = (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const r = rows.find((x) => x[0] === tr.dataset.sid); if (!r) return;
    teleport(r[4] + 3, r[6] + 3); if (game.fly) me.y = r[5] + 6;
    toast(`✈️ ไปหา ${r[1]}`, 1500);
  };
  $('tpanel').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
    const c = b.dataset.c;
    if (c === 'end' && !confirmBox('จบเกมสำหรับนักเรียนทุกคน?')) return;
    if (c === 'start' && net.phase === 'playing' && !confirmBox('เริ่มรอบใหม่? คะแนนจะเริ่มนับใหม่')) return;
    net.send(c === 'start' ? { t: 'cmd', c, spots: generateSpots(48) } : { t: 'cmd', c });
    toast({ start: '▶ เริ่มเกมแล้ว', pause: '⏸ หยุดการเดินของนักเรียน', resume: '▶ ให้นักเรียนเดินต่อ', summon: '📣 เรียกนักเรียนมารวมที่ลานกลาง', end: '⏹ จบเกม' }[c], 1800);
  }));
  const send = () => { const t = $('tp-msg').value.trim(); if (!t) return; net.send({ t: 'cmd', c: 'broadcast', text: t }); $('tp-msg').value = ''; };
  $('tp-send').onclick = send; $('tp-msg').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
  $('tp-fly').onclick = () => { game.fly = !game.fly; $('tp-fly').textContent = `✈️ โหมดบิน: ${game.fly ? 'เปิด' : 'ปิด'}`; $('tp-fly').classList.toggle('on', game.fly); if (game.fly) me.y += 8; toast(game.fly ? 'บิน: WASD เคลื่อนที่ · Space ขึ้น · C ลง' : 'ลงเดินบนพื้น', 2500); };
  $('tp-lb').onclick = () => showLeaderboard(rows.map((r) => ({ name: r[1], no: r[2], cls: r[3], score: r[11], found: r[12] })).sort((a, b) => b.score - a.score));
  $('overlay').onclick = () => $('overlay').classList.add('hidden');
  $('tp-hide').onclick = (e) => { e.stopPropagation(); $('tpanel').classList.add('mini'); };
  $('tpanel').querySelector('.tp-head').onclick = () => $('tpanel').classList.remove('mini');
  $('tp-clear').onclick = () => { if (confirmBox('ลบรายชื่อนักเรียนที่ออฟไลน์ออกจากห้อง?')) net.send({ t: 'cmd', c: 'clear' }); };
  $('tp-pw').onclick = async () => {
    const pw = promptBox('รหัสผ่านใหม่ (อย่างน้อย 4 ตัว)'); if (!pw) return;
    const r = await teacherChangePassword(token, pw); toast(r.ok ? '🔑 เปลี่ยนรหัสผ่านแล้ว' : r.error || 'เปลี่ยนไม่สำเร็จ', 2500);
  };
}
// native confirm/prompt can be blocked inside some embeds; fall back to "yes"
function confirmBox(msg) { try { return window.confirm(msg); } catch { return true; } }
function promptBox(msg) { try { return window.prompt(msg); } catch { return null; } }
