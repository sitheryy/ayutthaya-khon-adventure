// App flow: student login (name / number / class) or teacher login (password checked on the server).
import { startPlaying, toast, game } from './main.js';
import { connect, net, netTick, teacherLogin, SERVER } from './net.js';

const $ = (id) => document.getElementById(id);
const form = $('form-login'), tform = $('form-teacher');
let saved = null; try { saved = JSON.parse(localStorage.getItem('khon-profile') || 'null'); } catch {}
if (saved) { for (const k of ['name', 'no', 'cls']) form[k].value = saved[k] || ''; if (saved.sex) form.sex.value = saved.sex; }

function hookNet() { const prev = game.onTickNet; game.onTickNet = (dt) => { prev?.(dt); netTick(dt); }; $('net-badge').classList.remove('hidden'); }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = { name: form.name.value.trim(), no: form.no.value.trim(), cls: form.cls.value.trim() }, sex = form.sex.value;
  try { localStorage.setItem('khon-profile', JSON.stringify({ ...p, sex })); } catch {}
  p.look = ([...p.name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6) * 2 + (sex === 'm' ? 1 : 0);   // studentLook: even = girl, odd = boy
  const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'กำลังเชื่อมต่อ...';
  const online = await connect({ role: 'student', ...p });
  startPlaying(p);
  hookNet();
  if (!online) toast(SERVER ? '⚠️ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เล่นแบบคนเดียวไปก่อน' : '🎮 โหมดทดลองเล่นคนเดียว (ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์)', 4000);
  const m = await import('./treasure.js');
  m.startTreasureHunt({ online, seed: p.cls || 'OFFLINE' });
});

$('to-teacher').onclick = (e) => { e.preventDefault(); form.classList.toggle('hidden'); tform.classList.toggle('hidden'); };
tform.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('teacher-err').textContent = '';
  const r = await teacherLogin(tform.pw.value);
  if (!r.ok) { $('teacher-err').textContent = r.error || 'เข้าสู่ระบบไม่สำเร็จ'; return; }
  const online = await connect({ role: 'teacher', token: r.token });
  if (!online) { $('teacher-err').textContent = 'เชื่อมต่อห้องเรียนไม่ได้'; return; }
  startPlaying({ name: 'คุณครู', no: '-', cls: 'ครู' });
  hookNet();
  (await import('./teacher.js')).startTeacher(r.token);
  (await import('./treasure.js')).startTreasureHunt({ online: false, seed: 'TEACHER', gated: true });   // teacher plays too (own chests, not on the leaderboard)
});

if (new URLSearchParams(location.search).has('autoplay')) { form.name.value ||= 'ทดสอบ ระบบ'; form.no.value ||= '1'; form.cls.value ||= 'ม.3/1'; form.requestSubmit(); }
