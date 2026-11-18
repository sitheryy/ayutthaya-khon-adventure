// พญานาค (user-made Meshy model, 4.7k tris, 31-bone spine with no clips): slithers round the lotus pond in the Himmapan
// forest, then rests a few seconds and looks around. The wave is driven in code (a travelling sine along the spine).
// Position comes from the shared server clock, so every student sees it in the same place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZONES, groundHeight } from './world.js';
import { eleClock } from './elephant.js';

const SCALE = 4.0;                                         // ~27 m of body, head ~7 m up: as big as the old naga
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
  // centre the body on the circle and stand it on the ground
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z); root.scale.setScalar(SCALE);
  scene.add(root);
  let phase = 0, amp = 0;
  const pose = (dt, moving, t) => {
    amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 2.5); phase += dt * (3.2 + 2.0 * amp);
    for (let i = 0; i < N; i++) {
      const a = ax[i]; let ang;
      if (a.vertical) ang = Math.sin(t * 0.9 + i * 0.15) * (i > N - 9 ? 0.07 : 0) * (1 - amp * 0.6);   // neck: slow look left/right, still while moving
      else ang = Math.sin(phase - i * 0.45) * 0.1 * amp * (0.5 + 0.5 * Math.min(1, i / 6));          // body: travelling wave, tail swings more
      bones[i].quaternion.copy(rest[i]).multiply(tmp.setFromAxisAngle(a.axis, ang * a.sign));
    }
  };
  animated.push((t, dt) => {
    const s = ((Date.now() + eleClock.skew) / 1000) % CYCLE, moving = s < LAP, a = (Math.min(s, LAP) / LAP) * Math.PI * 2;
    const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R;
    root.position.set(x, groundHeight(x, z), z);
    root.rotation.y = Math.PI / 2 - a;   // the model lies along x with its head toward -x: turn it to head counter-clockwise round the pond
    pose(dt, moving, t);
  });
}
function depth(o) { let d = 0; while (o.parent) { d++; o = o.parent; } return d; }
