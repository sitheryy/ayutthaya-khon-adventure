// Life in the city: villagers walking the paths, market crowd, grazing animals, village props.
import * as THREE from 'three';
import { PATHS, ZONES, SPAWN, WALL_Z, RICE, groundHeight, colliders, animated, cullAt, riverX, isBlockedWater, rng, pathClear, WELL } from './world.js';
import { makeCharacter, studentLook, ROLE_LOOKS, makeAnimal, prop, propStatic } from './models.js';

const blocked = (x, z, pad) => isBlockedWater(x, z) || colliders.some((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + pad : Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad));

function fitTo(o, size) {
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  o.scale.multiplyScalar(size / Math.max(s.x, s.y, s.z));
  const b2 = new THREE.Box3().setFromObject(o);
  const g = new THREE.Group(); o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2); g.add(o);
  return g;
}

export function buildLife(scene, { low }) {
  const r = rng(77);
  const place = (name, x, z, ry, size, pad = 0.4) => {
    if (blocked(x, z, pad) || !pathClear(x, z, size * 0.4)) return null;   // never block a road
    const o = propStatic(name); if (!o) return null;
    const g = fitTo(o, size); g.position.set(x, groundHeight(x, z), z); g.rotation.y = ry; scene.add(g);
    colliders.push({ x, z, r: size * 0.35 });
    return g;
  };

  // ---------- villagers walking the paths ----------
  const looks = (i) => [studentLook(i + 3), ROLE_LOOKS.villager, studentLook(i + 7), ROLE_LOOKS.merchant, ROLE_LOOKS.monk, studentLook(i + 1)][i % 6];
  const nW = low ? 6 : 16;
  for (let i = 0; i < nW; i++) {
    const seg = PATHS[i % PATHS.length], ch = makeCharacter(looks(i));
    const kid = i % 6 === 0 || i % 6 === 2 || i % 6 === 5;
    if (kid) ch.root.scale.setScalar(0.85);
    const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]), nx = -(seg.b[1] - seg.a[1]) / len, nz = (seg.b[0] - seg.a[0]) / len;
    const st = { t: r(), dir: r() < 0.5 ? 1 : -1, off: (r() - 0.5) * (seg.w - 1.2), sp: 1.1 + r() * 0.7, wait: 0 };
    scene.add(ch.root); cullAt(ch.root, 90);
    animated.push((t, dt) => {
      if (st.wait > 0) { st.wait -= dt; if (ch.root.visible) ch.animate(dt, 0, false); return; }
      st.t += (st.dir * st.sp * dt) / len;
      if (st.t > 1 || st.t < 0) { st.t = THREE.MathUtils.clamp(st.t, 0, 1); st.dir *= -1; st.wait = 1.5 + r() * 3; }
      const x = seg.a[0] + (seg.b[0] - seg.a[0]) * st.t + nx * st.off, z = seg.a[1] + (seg.b[1] - seg.a[1]) * st.t + nz * st.off;
      ch.root.position.set(x, groundHeight(x, z), z);
      ch.root.rotation.y = Math.atan2((seg.b[0] - seg.a[0]) * st.dir, (seg.b[1] - seg.a[1]) * st.dir);
      if (ch.root.visible) ch.animate(dt, st.sp, false);
    });
  }

  // ---------- crowds: market shoppers, chatting kids at spawn, khon audience ----------
  const crowd = (cx, cz, n, rad, acts) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = 2 + r() * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (blocked(x, z, 0.5) || !pathClear(x, z, 0.3)) continue;
      const ch = makeCharacter(looks(i + 2)); if (i % 3 === 0) ch.root.scale.setScalar(0.85);
      ch.root.position.set(x, groundHeight(x, z), z); ch.root.rotation.y = Math.atan2(cx - x, cz - z) + (r() - 0.5);
      ch.play(acts[i % acts.length]); ch.mixer.update(r() * 3);
      scene.add(ch.root); colliders.push({ x, z, r: 0.45 }); cullAt(ch.root, 90);
      animated.push((t, dt) => { if (ch.root.visible) ch.update(dt); });
    }
  };
  const m = ZONES[2];
  crowd(m.x - 4, m.z - 6, low ? 4 : 8, 12, ['Idle', 'Interact', 'Idle', 'Use_Item', 'PickUp']);
  crowd(SPAWN.x + 7, SPAWN.z + 4, low ? 2 : 4, 3, ['Idle', 'Cheer', 'Interact']);
  crowd(ZONES[4].x + 15, ZONES[4].z, low ? 3 : 6, 6, ['Cheer', 'Idle', 'Sit_Floor_Idle', 'Cheer']);
  crowd(ZONES[0].x - 18, ZONES[0].z + 22, low ? 1 : 3, 5, ['Sit_Floor_Idle', 'Idle']);

  // ---------- animals wandering in an area ----------
  const herd = (name, n, area, size, opts = {}) => {
    for (let i = 0; i < n; i++) {
      const an = makeAnimal(name, opts); if (!an) return;
      const g = fitTo(an.root, size); scene.add(g); cullAt(g, 100);
      let [x, z] = area(); g.position.set(x, groundHeight(x, z), z);
      const st = { tx: x, tz: z, wait: r() * 4, sp: opts.speed || 1 };
      an.play('Eating'); an.mixer.update(r() * 2);
      animated.push((t, dt) => {
        if (st.wait > 0) { st.wait -= dt; if (g.visible) an.update(dt); if (st.wait <= 0) { [st.tx, st.tz] = area(); an.play('Walk'); } return; }
        const dx = st.tx - x, dz = st.tz - z, d = Math.hypot(dx, dz);
        if (d < 0.3) { st.wait = 3 + r() * 6; an.play(r() < 0.6 ? 'Eating' : 'Idle'); if (g.visible) an.update(dt); return; }
        const nx = x + (dx / d) * st.sp * dt, nz = z + (dz / d) * st.sp * dt;
        if (blocked(nx, nz, 0.3)) { st.wait = 1; an.play('Idle'); if (g.visible) an.update(dt); return; }
        x = nx; z = nz;
        g.position.set(x, groundHeight(x, z), z);
        g.rotation.y += Math.atan2(Math.sin(Math.atan2(dx, dz) - g.rotation.y), Math.cos(Math.atan2(dx, dz) - g.rotation.y)) * Math.min(1, dt * 4);
        if (g.visible) an.update(dt);
      });
    }
  };
  const rect = (x0, x1, z0, z1) => () => [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)];
  const disc = (cx, cz, rad) => () => { const a = r() * 6.28, d = Math.sqrt(r()) * rad; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };
  const [f0, f1] = RICE;
  herd('Bull', low ? 1 : 3, rect(f0.x0 - 10, f0.x0 - 3, f0.z0, f0.z1), 2.6, { tint: '#6a6a72', speed: 0.6 });   // ควาย by the paddies
  herd('Bull', low ? 1 : 2, rect(f1.x1 + 3, f1.x1 + 10, f1.z0, f1.z1), 2.6, { tint: '#6a6a72', speed: 0.6 });
  herd('Cow', low ? 1 : 3, disc(SPAWN.x - 50, SPAWN.z + 20, 10), 2.2, { speed: 0.7 });
  herd('Deer', low ? 2 : 5, disc(ZONES[3].x - 20, ZONES[3].z + 30, 22), 1.6, { speed: 1.2 });
  herd('Horse', low ? 1 : 3, disc(ZONES[1].x + 32, ZONES[1].z + 26, 8), 2.4, { speed: 0.9 });
  herd('ShibaInu', low ? 2 : 4, disc(SPAWN.x, SPAWN.z + 10, 22), 0.75, { speed: 2.2 });

  // ---------- props: carts, stands, barrels, hay, fences, bamboo ----------
  [[m.x - 22, m.z + 6, 0.5], [m.x + 6, m.z - 26, -0.3]].forEach(([x, z, ry]) => place('MarketStand_' + (1 + (r() < 0.5)), x, z, ry, 4));
  for (let i = 0; i < 14; i++) { const [x, z] = disc(m.x - 6, m.z, 22)(); place(['Barrel', 'Crate', 'Bags', 'Hay'][i % 4], x, z, r() * 6, 0.9 + r() * 0.4); }
  [[SPAWN.x - 24, SPAWN.z + 18], [SPAWN.x + 26, SPAWN.z - 6], [ZONES[5].x - 16, WALL_Z - 24], [m.x - 30, m.z - 10]].forEach(([x, z]) => place('Cart', x, z, r() * 6, 3));
  [[WELL.x - 4, WELL.z + 3], [WELL.x + 4, WELL.z + 3]].forEach(([x, z]) => place('Bench_1', x, z, Math.atan2(WELL.x - x, WELL.z - z) + Math.PI, 2)); // benches by the well
  for (const f of RICE) for (let x = f.x0; x < f.x1; x += 3.2) [f.z0 - 1.2, f.z1 + 1.2].forEach((z) => place('Fence', x + 1.6, z, 0, 3.2, 0));
  for (let i = 0; i < (low ? 14 : 34); i++) {
    const riverside = i % 2 === 0, z = -120 + r() * 240;
    const [x, zz] = riverside ? [riverX(z) - 18 - r() * 5, z] : disc(ZONES[3].x, ZONES[3].z, 55)();
    place('Bamboo_' + (1 + ((r() * 3) | 0)), x, zz, r() * 6, 5 + r() * 3, 0.2);
  }
}
