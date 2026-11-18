import * as THREE from 'three';
// Footstep dust: a small pool of soft sprites kicked up behind the feet while running. Colour follows the ground.
const TINT = { dirt: '#c9a273', grass: '#a8bd78', brick: '#c4a58a', stone: '#c4c0b8', wood: '#b99f80' };
export function makeDust(scene) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c), N = 16, pool = [];
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
    s.visible = false; s.userData = { age: 9, life: 0.6, vy: 0, size: 0.4 }; scene.add(s); pool.push(s);
  }
  let next = 0, acc = 0;
  return {
    update(dt, me, on, kind) {
      if (on) {
        acc += dt;
        if (acc > 0.09) {
          acc = 0; const s = pool[next++ % N], u = s.userData;
          const back = me.face + Math.PI;   // behind the player
          s.position.set(me.x + Math.sin(back) * 0.35 + (Math.random() - 0.5) * 0.4, me.y + 0.12, me.z + Math.cos(back) * 0.35 + (Math.random() - 0.5) * 0.4);
          s.material.color.set(TINT[kind] || TINT.dirt); u.age = 0; u.life = 0.45 + Math.random() * 0.25; u.vy = 0.5 + Math.random() * 0.4; u.size = 0.5 + Math.random() * 0.25; s.visible = true;
        }
      } else acc = 0.09;
      for (const s of pool) {
        const u = s.userData; if (!s.visible) continue;
        u.age += dt; const k = u.age / u.life;
        if (k >= 1) { s.visible = false; continue; }
        s.position.y += u.vy * dt; s.scale.setScalar(u.size * (1 + k * 2.2)); s.material.opacity = 0.75 * (1 - k);
      }
    },
  };
}
