// Knowledge NPCs: a few Khon characters stand at fixed spots; walk up to one and a card tells short facts (tap = next).
// Content follows the quiz topics so students can pick up answers while exploring.
export const NPC_DEFS = [
  { id: 'rama', kind: 'khon', role: 'rama', name: 'พระราม', sub: 'เอกของเรื่องรามเกียรติ์', at: 'spawn', dx: 7, dz: -6, facts: [
    'สวัสดีนักผจญภัย! ข้าคือพระราม เอกของเรื่องรามเกียรติ์ ซึ่งเป็นเรื่องที่ใช้แสดงโขน',
    'โขนเป็นนาฏศิลป์ชั้นสูงของไทย ผู้แสดงเต้นรำตามบท โดยมีผู้พากย์และเจรจาเป็นผู้ขับบทและพูดแทนตัวโขน',
    'ตัวละครในโขนแบ่งเป็น 4 ประเภทหลัก คือ พระ นาง ยักษ์ และลิง',
    'ข้ามีกายสีเขียว และนางสีดาคือมเหสีของข้า',
  ] },
  { id: 'monk', kind: 'look', look: 'monk', name: 'หลวงตา', sub: 'เล่าเรื่องโขนกรุงศรี', at: 0, dx: 8, dz: 44, facts: [
    'โมทนา ที่ได้พบกัน โขนเป็นศิลปะที่มีหลักฐานการแสดงมาตั้งแต่สมัยกรุงศรีอยุธยา',
    'เรื่องรามเกียรติ์ของไทยได้แรงบันดาลใจจากมหากาพย์รามายณะของอินเดีย แล้วไทยนำมาแต่งใหม่เป็นแบบของเรา',
    'ปี พ.ศ. 2561 องค์การยูเนสโกขึ้นทะเบียนโขนเป็นมรดกทางวัฒนธรรมที่จับต้องไม่ได้ของมนุษยชาติ',
  ] },
  { id: 'thotsakan', kind: 'khon', role: 'thotsakan', name: 'ทศกัณฐ์', sub: 'เจ้ากรุงลงกา', at: 1, dx: 8, dz: 42, facts: [
    'ฮ่า ฮ่า! ข้าคือทศกัณฐ์ เจ้ากรุงลงกา มี 10 หน้า 20 กร',
    'ข้าเป็นตัวยักษ์ ต้องสวมหัวโขน ส่วนตัวพระและตัวนางสวมมงกุฎหรือชฎา ไม่สวมหัวโขน',
    'หัวโขนทำด้วยมือด้วยความประณีต ปั้นด้วยกระดาษแล้วลงรักปิดทองประดับลวดลาย ถือเป็นของสูงที่ผู้แสดงต้องเคารพ',
  ] },
  { id: 'musician', kind: 'look', look: 'merchant', name: 'ลุงปี่พาทย์', sub: 'ครูดนตรีไทย', at: 2, dx: -6, dz: 8, facts: [
    'การแสดงโขนมีวงปี่พาทย์บรรเลงประกอบตลอดเรื่อง',
    'วงปี่พาทย์มีเครื่องดนตรีอย่างปี่ ระนาดเอก ฆ้องวง ตะโพน กลอง และฉิ่ง',
    'ทำนองเพลงบอกอารมณ์และการกระทำของตัวละครได้ เช่น เพลงเสมอใช้ตอนเดินทาง ลองฟังให้ดีนะ',
  ] },
  { id: 'hanuman', kind: 'khon', role: 'hanuman', name: 'หนุมาน', sub: 'ทหารเอกของพระราม', at: 3, dx: 12, dz: -34, facts: [
    'ข้าคือหนุมาน ลิงเผือกกายสีขาว เป็นทหารเอกของพระราม',
    'ในโขนยังมีตัวลิงอีกหลายตัว เช่น สุครีพ และองคต ผู้แสดงลิงสวมหัวโขนเหมือนตัวยักษ์',
    'ป่าหิมพานต์ในวรรณคดีไทยเป็นป่าในตำนาน มีสัตว์วิเศษ เช่น ครุฑ นาค และกินรี',
  ] },
  { id: 'narrator', kind: 'look', look: 'guard', name: 'ผู้พากย์', sub: 'เสียงของโขน', at: 5, dx: -9, dz: -8, facts: [
    'ข้าคือผู้พากย์และเจรจา ผู้ขับบทบรรยายและพูดแทนตัวโขน เพราะตัวโขนที่สวมหัวไม่พูดเอง',
    'โขนที่แสดงกลางแจ้งบนลานดินเรียกว่า โขนกลางแปลง',
    'โขนยังมีรูปแบบอื่นอีก เช่น โขนหน้าจอ โขนโรงใน และโขนฉาก',
  ] },
];

export const NPCS = [];   // filled by world.js: { def, x, z, i }
const $ = (id) => document.getElementById(id);
let cur = null, hiddenAt = 0;
const NEAR = 4.2, FAR = 7;

function render() {
  const n = cur; if (!n) return;
  $('npc-name').innerHTML = `${n.def.name}<small>${n.def.sub}</small>`;
  $('npc-text').textContent = n.def.facts[n.i];
  $('npc-more').textContent = `${n.i + 1} / ${n.def.facts.length} · แตะเพื่ออ่านต่อ`;
}
function show(n) { cur = n; render(); $('npc-say').classList.remove('hidden'); }
function hide() { cur = null; hiddenAt = performance.now(); $('npc-say').classList.add('hidden'); }

let wired = false;
function wire() {
  wired = true;
  const el = $('npc-say');
  const next = (e) => { e.preventDefault(); e.stopPropagation(); if (!cur) return; cur.i = (cur.i + 1) % cur.def.facts.length; render(); };
  el.addEventListener('pointerup', next);
}

// called every frame with the player; `busy` = a quiz / overlay is open
export function updateNpc(me, busy) {
  if (!NPCS.length) return;
  if (!wired) wire();
  if (busy) { if (cur) hide(); return; }
  let best = null, bd = 1e9;
  for (const n of NPCS) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < bd) { bd = d; best = n; } }
  if (cur) { if (Math.hypot(cur.x - me.x, cur.z - me.z) > FAR) hide(); }
  else if (bd < NEAR && best !== null && performance.now() - hiddenAt > 600) show(best);
}
// distance to the nearest NPC, so far-away ones can skip their animation
export function nearestNpcDist(x, z) { let d = 1e9; for (const n of NPCS) d = Math.min(d, Math.hypot(n.x - x, n.z - z)); return d; }
