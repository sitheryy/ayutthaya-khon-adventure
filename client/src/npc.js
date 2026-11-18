// Knowledge mascots: the four Khon characters stand in the start plaza; walk up to one and a card tells short facts (tap = next).
// Content follows the quiz topics so students can pick up answers while exploring.
export const NPC_DEFS = [
  { id: 'rama', role: 'rama', name: 'พระราม', sub: 'ตัวพระ · เอกของรามเกียรติ์', dx: -4.5, facts: [
    'สวัสดีนักผจญภัย! ข้าคือพระราม เอกของเรื่องรามเกียรติ์ ซึ่งเป็นเรื่องที่ใช้แสดงโขน',
    'โขนเป็นนาฏศิลป์ชั้นสูงของไทย ผู้แสดงเต้นรำตามบท โดยมีผู้พากย์และเจรจาเป็นผู้ขับบทและพูดแทนตัวโขน',
    'ตัวละครในโขนแบ่งเป็น 4 ประเภทหลัก คือ พระ นาง ยักษ์ และลิง ข้าเป็นตัวพระ',
    'ตัวพระและตัวนางไม่สวมหัวโขน แต่สวมมงกุฎหรือชฎา ส่วนยักษ์กับลิงสวมหัวโขน',
  ] },
  { id: 'sida', role: 'sida', name: 'นางสีดา', sub: 'ตัวนาง · มเหสีพระราม', dx: -1.5, facts: [
    'สวัสดีจ้ะ ข้าคือนางสีดา มเหสีของพระราม เป็นตัวนางเอกในเรื่องรามเกียรติ์',
    'ตัวนางในโขนรำอ่อนช้อยงดงาม ต่างจากตัวยักษ์และตัวลิงที่ท่าทางทรงพลังและว่องไว',
    'ท่ารำของโขนมีแบบแผน แต่ละท่ามีความหมาย เช่น ท่าเดิน ท่าเหาะ และท่าต่อสู้',
  ] },
  { id: 'thotsakan', role: 'thotsakan', name: 'ทศกัณฐ์', sub: 'ตัวยักษ์ · เจ้ากรุงลงกา', dx: 1.5, facts: [
    'ฮ่า ฮ่า! ข้าคือทศกัณฐ์ เจ้ากรุงลงกา มี 10 หน้า 20 กร',
    'ข้าเป็นตัวยักษ์ ต้องสวมหัวโขน ส่วนตัวพระและตัวนางสวมมงกุฎหรือชฎา ไม่สวมหัวโขน',
    'หัวโขนทำด้วยมือด้วยความประณีต ปั้นด้วยกระดาษแล้วลงรักปิดทองประดับลวดลาย ถือเป็นของสูงที่ผู้แสดงต้องเคารพ',
  ] },
  { id: 'hanuman', role: 'hanuman', name: 'หนุมาน', sub: 'ตัวลิง · ทหารเอกของพระราม', dx: 4.5, facts: [
    'ข้าคือหนุมาน ลิงเผือกกายสีขาว เป็นทหารเอกของพระราม',
    'ในโขนยังมีตัวลิงอีกหลายตัว เช่น สุครีพ และองคต ผู้แสดงลิงสวมหัวโขนเหมือนตัวยักษ์',
    'ปี พ.ศ. 2561 องค์การยูเนสโกขึ้นทะเบียนโขนเป็นมรดกทางวัฒนธรรมที่จับต้องไม่ได้ของมนุษยชาติ',
  ] },
];

export const NPCS = [];   // filled by world.js: { def, x, z, i }
const $ = (id) => document.getElementById(id);
let cur = null, hiddenAt = 0;
const NEAR = 5.2, FAR = 7;

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
