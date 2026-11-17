// End-of-game certificate (เกียรติบัตร): drawn on a canvas so students can save it as a picture.
const TEACHER = 'ขวัญชนก ถึกสุวรรณ';
const W = 1600, H = 1130;

const thaiDate = (d) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
const mmss = (s) => `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วินาที`;

function draw({ name, no, cls, score, found, total, secs }) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), F = (sz, w = 500) => `${w} ${sz}px Mitr, sans-serif`;
  // paper + double gold frame
  const bg = x.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, '#fffaf0'); bg.addColorStop(1, '#f3e2bd'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#8a5a1c'; x.lineWidth = 18; x.strokeRect(30, 30, W - 60, H - 60);
  x.strokeStyle = '#d9a63a'; x.lineWidth = 6; x.strokeRect(62, 62, W - 124, H - 124);
  // corner ornaments (Thai-style lotus diamonds)
  x.fillStyle = '#c99027';
  for (const [cx, cy] of [[62, 62], [W - 62, 62], [62, H - 62], [W - 62, H - 62]]) {
    x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillRect(-22, -22, 44, 44); x.fillStyle = '#8a5a1c'; x.fillRect(-10, -10, 20, 20); x.restore(); x.fillStyle = '#c99027';
  }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#8a5a1c'; x.font = F(34); x.fillText('ผจญภัยตามล่าสมบัติโขนกรุงศรีอยุธยา', W / 2, 160);
  const g = x.createLinearGradient(0, 190, 0, 300); g.addColorStop(0, '#e9b73c'); g.addColorStop(1, '#9a6416');
  x.fillStyle = g; x.font = F(110, 600); x.fillText('เกียรติบัตร', W / 2, 290);
  x.fillStyle = '#5a3a22'; x.font = F(34, 400); x.fillText('ขอมอบเกียรติบัตรฉบับนี้ไว้เพื่อแสดงว่า', W / 2, 370);
  x.fillStyle = '#3b2414'; x.font = F(70, 600); x.fillText(name, W / 2, 470, W - 260);
  x.fillStyle = '#5a3a22'; x.font = F(34, 400); x.fillText(`ชั้น ${cls}  เลขที่ ${no}`, W / 2, 525);
  x.fillText('ได้ร่วมภารกิจตามล่าสมบัติและเรียนรู้เรื่องโขน มรดกทางวัฒนธรรมของไทย', W / 2, 590);
  // stat boxes
  const stats = [['⭐ คะแนน', `${score}`], ['🧰 สมบัติที่พบ', `${found} / ${total} หีบ`], ['⏱ เวลาที่ใช้', mmss(secs)]];
  stats.forEach(([k, v], i) => {
    const bx = W / 2 + (i - 1) * 430, by = 640, bw = 390, bh = 150;
    x.fillStyle = 'rgba(233,183,60,.18)'; x.strokeStyle = '#c99027'; x.lineWidth = 4;
    x.beginPath(); x.roundRect(bx - bw / 2, by, bw, bh, 22); x.fill(); x.stroke();
    x.fillStyle = '#8a5a1c'; x.font = F(30, 500); x.fillText(k, bx, by + 50);
    x.fillStyle = '#3b2414'; x.font = F(i === 2 ? 38 : 50, 600); x.fillText(v, bx, by + 115, bw - 30);
  });
  x.fillStyle = '#5a3a22'; x.font = F(30, 400); x.fillText(`ให้ไว้ ณ วันที่ ${thaiDate(new Date())}`, W / 2, 845);
  // signature
  const sx = W / 2, sy = 950;
  x.fillStyle = '#1f3a8a'; x.font = `italic 400 48px Mitr, sans-serif`; x.fillText(TEACHER.split(' ')[0], sx, sy - 18);
  x.strokeStyle = '#5a3a22'; x.lineWidth = 2; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(sx - 220, sy); x.lineTo(sx + 220, sy); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#3b2414'; x.font = F(32, 500); x.fillText(`(${TEACHER})`, sx, sy + 42);
  x.fillStyle = '#5a3a22'; x.font = F(28, 400); x.fillText('ครูผู้สอน', sx, sy + 80);
  return c;
}

export async function showCertificate(info) {
  try { await document.fonts.load('600 60px Mitr'); } catch {}
  const c = draw(info), url = c.toDataURL('image/png');
  let el = document.getElementById('cert');
  if (!el) { el = document.createElement('div'); el.id = 'cert'; document.body.appendChild(el); }
  el.innerHTML = `<button class="cert-x" type="button" aria-label="ปิด">✕</button><div class="cert-box"><img alt="เกียรติบัตร" /><div class="cert-btns">
    <a class="btn-gold" download="เกียรติบัตร-${info.name}.png">💾 บันทึกรูป</a><button class="btn-gold" type="button">ปิด</button></div>
    <div class="cert-tip">บน iPad/มือถือ: แตะรูปค้างไว้แล้วเลือก “บันทึกรูปภาพ”</div></div>`;
  el.querySelector('img').src = url; el.querySelector('a').href = url;
  // iPhone/iPad: close on touch-up too (a plain click can be swallowed by the game's touch handlers); tap the dark edge also closes
  const close = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('hidden'); };
  el.querySelectorAll('.cert-x, .cert-btns button').forEach((b) => { b.addEventListener('pointerup', close); b.addEventListener('click', close); });
  el.onpointerup = (e) => { if (e.target === el) close(e); };
  el.classList.remove('hidden');
}
