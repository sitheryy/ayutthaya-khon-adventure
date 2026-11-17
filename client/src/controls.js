// Keyboard + mouse drag + touch joystick + touch camera drag.
export class Controls {
  keys = new Set();
  joy = { x: 0, y: 0 };
  yaw = 0; pitch = 0.32; dist = 7.5;
  jumpQueued = false; actQueued = false;
  enabled = true;

  constructor(canvas) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.touch) document.body.classList.add('touch');
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input,textarea,select')) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.actQueued = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // camera drag (mouse or any touch not on joystick/buttons)
    const drags = new Map();
    canvas.addEventListener('pointerdown', (e) => { drags.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      const p = drags.get(e.pointerId); if (!p) return;
      const k = e.pointerType === 'touch' ? 0.008 : 0.005;
      this.yaw -= (e.clientX - p[0]) * k;
      this.pitch = Math.min(1.2, Math.max(0.02, this.pitch + (e.clientY - p[1]) * k * 0.8));
      p[0] = e.clientX; p[1] = e.clientY;
    });
    const end = (e) => drags.delete(e.pointerId);
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { this.dist = Math.min(14, Math.max(3.5, this.dist + e.deltaY * 0.01)); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // joystick
    const pad = document.getElementById('joy'), knob = document.getElementById('joy-knob');
    let jid = null;
    const setJoy = (e) => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
      const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.joy.x = dx / R; this.joy.y = -dy / R;
    };
    // mouse: pointer events; touch: touch events tracked by identifier so pressing jump with another finger never drops the stick
    pad.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; jid = e.pointerId; pad.setPointerCapture(jid); setJoy(e); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' && e.pointerId === jid) setJoy(e); });
    const jend = (e) => { if (e.pointerType === 'touch' || e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', jend); pad.addEventListener('pointercancel', jend);
    let tid = null;
    const find = (list) => [...list].find((t) => t.identifier === tid);
    pad.addEventListener('touchstart', (e) => { if (tid !== null) return; const t = e.changedTouches[0]; tid = t.identifier; setJoy(t); e.preventDefault(); }, { passive: false });
    const inPad = (t) => { const r = pad.getBoundingClientRect(), m = 40; return t.clientX > r.left - m && t.clientX < r.right + m && t.clientY > r.top - m && t.clientY < r.bottom + m; };
    addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) e.preventDefault();          // iOS: two fingers (stick + jump) must never become a pinch-zoom
      let t = tid !== null && find(e.changedTouches);
      if (!t && tid === null) { t = [...e.changedTouches].find(inPad); if (t) tid = t.identifier; }   // iOS cancelled the stick: re-grab the finger still on it
      if (t) { setJoy(t); e.preventDefault(); }
    }, { passive: false });
    ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
    const tend = (e) => { if (tid !== null && find(e.changedTouches)) { tid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; } };
    addEventListener('touchend', tend); addEventListener('touchcancel', tend);
    const jb = document.getElementById('btn-jump'); jb.addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpQueued = true; }); jb.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    document.getElementById('btn-act').addEventListener('pointerdown', (e) => { e.preventDefault(); this.actQueued = true; });
  }

  // returns {x: right, y: forward, run}
  move() {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) { const m = Math.hypot(x, y); x /= m; y /= m; }
    else { x = this.joy.x; y = this.joy.y; }
    const mag = Math.hypot(x, y);
    return { x, y, run: k.has('ShiftLeft') || k.has('ShiftRight') || mag > 0.85 };
  }
  takeJump() { const j = this.jumpQueued && this.enabled; this.jumpQueued = false; return j; }
  takeAct() { const a = this.actQueued && this.enabled; this.actQueued = false; return a; }
}
