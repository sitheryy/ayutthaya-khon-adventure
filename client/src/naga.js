// พญานาค (user-made Meshy model, 4.7k tris, 31-bone spine with no clips): slithers round the lotus pond in the Himmapan
// forest, then rests a few seconds and looks around. The wave is driven in code (a travelling sine along the spine).
// Position comes from the shared server clock, so every student sees it in the same place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZONES, groundHeight, focus } from './world.js';
import { eleClock } from './elephant.js';

const SCALE = 5.5;                                         // ~38 m of body, head ~9 m up: bigger than the old naga
const C = { x: ZONES[3].x + 16, z: ZONES[3].z + 18 }, R = 22;   // circle around the pond (pond r = 13)
const SPEED = 3.2, LAP = (2 * Math.PI * R) / SPEED, REST = 9, CYCLE = LAP + REST;

export async function spawnNaga(scene, animated) {
  let gltf; try { gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/naga.glb'); } catch { return; }
  const model = gltf.scene, root = new THREE.Group(); root.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;   // Lambert keeps the painted look of the rest of the world and is cheap on phones
    o.material = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, side: THREE.DoubleSide });
    o.castShadow = true; o.frustumCulled = false;   // skinned bounds move with the animation
  });
  // spine = the single bone chain, tail/neck order found from the rest pose: the end that is higher up is the head
  const bones = []; model.traverse((o) => { if (o.isBone && /^Bone_\d+$/.test(o.name)) bones.push(o); });
  bones.sort((a, b) => depth(a) - depth(b));
  model.updateMatrixWorld(true);
  const wy = (b) => b.getWorldPosition(new THREE.Vector3()).y;
  if (wy(bones[0]) > wy(bones[bones.length - 1])) bones.reverse();   // bones[0] = tail ... bones[n-1] = head
  const up = new THREE.Vector3(0, 1, 0), N = bones.length;
  const ax = bones.map((b) => {   // local axis most aligned with world up, and whether the bone itself runs vertically (neck)
    const q = b.getWorldQuaternion(new THREE.Quaternion()), cand = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    let best = 0, bd = 0; cand.forEach((v, i) => { const d = v.clone().applyQuaternion(q).dot(up); if (Math.abs(d) > Math.abs(bd)) { bd = d; best = i; } });
    const run = new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(up);   // chain direction: local +y
    return { axis: cand[best], sign: Math.sign(bd) || 1, vertical: Math.abs(run) > 0.7 };
  });
  const rest = bones.map((b) => b.quaternion.clone()), tmp = new THREE.Quaternion();
  // a snake's body follows its head, so while moving the spine is bent into the arc of the circle it swims on (bend per joint = length / R)
  const V3 = THREE.Vector3, seg = bones.map((b, i) => (i ? b.getWorldPosition(new V3()).distanceTo(bones[i - 1].getWorldPosition(new V3())) : 0));
  const LEN = seg.reduce((a, b) => a + b, 0) * SCALE;
  let phase = 0, amp = 0, bendSign = 1, bendK = 1;
  const setPose = (t, ampv, ph) => {
    for (let i = 0; i < N; i++) {
      const a = ax[i]; let ang;
      if (a.vertical) ang = Math.sin(t * 0.9 + i * 0.15) * (i > N - 9 ? 0.07 : 0) * (1 - ampv * 0.6);   // neck: slow look left/right, still while moving
      else ang = Math.sin(ph + i * 0.45) * 0.1 * ampv * (0.5 + 0.5 * Math.min(1, i / 6)) + bendSign * bendK * (seg[i] * SCALE / R) * ampv;   // travelling wave + arc
      bones[i].quaternion.copy(rest[i]).multiply(tmp.setFromAxisAngle(a.axis, ang * a.sign));
    }
  };
  // find bend direction and yaw so the bent body lies on the circle with the head in front (brute force, once)
  const fit = (sign, k) => {
    bendSign = sign; bendK = k; setPose(0, 1, 0); model.updateMatrixWorld(true);
    const P = bones.map((b) => b.getWorldPosition(new V3())), h = P[N - 1]; let best = { cost: Infinity };
    if (P[0].distanceTo(h) * SCALE < 0.7 * LEN) return best;   // folded up like a coil: not a swim pose
    for (let ki = 0; ki < 360; ki++) {
      const th = (ki * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th); let cost = 0, behind = 0;
      for (const p of P) { const dx = p.x - h.x, dz = p.z - h.z, rx = (c * dx + sn * dz) * SCALE, rz = (-sn * dx + c * dz) * SCALE, d = Math.hypot(R + rx, rz) - R; cost += d * d; behind += rz; }
      if (behind < 0 && cost < best.cost) best = { cost, th, h: h.clone(), sign, k };
    }
    return best;
  };
  let fb = { cost: Infinity };
  for (const sg of [1, -1]) for (let k = 0.5; k <= 5; k += 0.25) { const r = fit(sg, k); if (r.cost < fb.cost) fb = r; }
  bendSign = fb.sign; bendK = fb.k;
  const box = new THREE.Box3().setFromObject(model);
  model.position.set(-fb.h.x, -box.min.y, -fb.h.z); root.scale.setScalar(SCALE);   // head at the root origin, feet on the ground
  scene.add(root);
  let shOn = true;
  const pose = (dt, moving, t) => { amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 2.5); phase += dt * (3.2 + 2.0 * amp); setPose(t, amp, phase); };
  animated.push((t, dt) => {
    const s = ((Date.now() + eleClock.skew) / 1000) % CYCLE, moving = s < LAP, a = (Math.min(s, LAP) / LAP) * Math.PI * 2;
    const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R;
    root.position.set(x, groundHeight(x, z), z);
    root.rotation.y = fb.th - a;   // head on the circle, body trailing behind it along the arc (counter-clockwise round the pond)
    const d = Math.hypot(focus.x - C.x, focus.z - C.z);   // far from the pond: no draw, no shadow, no 31-bone pose (body reaches ~60 m from the circle)
    root.visible = d < 130;
    if (!root.visible) return;
    const sh = d < 85; if (sh !== shOn) { shOn = sh; root.traverse(o => { if (o.isMesh) o.castShadow = sh; }); }
    pose(dt, moving, t);
  });
}
function depth(o) { let d = 0; while (o.parent) { d++; o = o.parent; } return d; }
