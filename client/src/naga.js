// พญานาค (user-made rigged model, naga_v2_game.glb trimmed to ~39k tris): slithers round the lotus pond in the
// Himmapan forest, then rests a few seconds and looks around. Position comes from the shared server clock,
// so every student sees it in the same place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZONES, groundHeight } from './world.js';
import { eleClock } from './elephant.js';

const SCALE = 2.0;                                         // ~25 m long, ~10 m tall (as big as the old statue-naga)
const C = { x: ZONES[3].x + 16, z: ZONES[3].z + 18 }, R = 22;   // circle around the pond (pond r = 13)
const SPEED = 1.6 * SCALE, LAP = (2 * Math.PI * R) / SPEED, REST = 9, CYCLE = LAP + REST;

export async function spawnNaga(scene, animated) {
  let gltf; try { gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/naga.glb'); } catch { return; }
  const root = gltf.scene; root.scale.setScalar(SCALE);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material, gold = /Gold/.test(m.name);
    // Lambert keeps the painted look of the rest of the world and is cheap on phones
    o.material = new THREE.MeshLambertMaterial({ map: m.map, normalMap: m.normalMap, color: m.color, emissive: gold ? '#3a2600' : '#000000' });
    o.castShadow = true; o.frustumCulled = false;   // skinned bounds move with the animation
  });
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root), act = {};
  for (const c of gltf.animations) act[c.name] = mixer.clipAction(c);
  let cur = null;
  const play = (n) => { const a = act[n]; if (!a || a === cur) return; a.reset().play(); if (cur) cur.crossFadeTo(a, 0.6, false); cur = a; };
  animated.push((t, dt) => {
    const s = ((Date.now() + eleClock.skew) / 1000) % CYCLE, moving = s < LAP, a = (Math.min(s, LAP) / LAP) * Math.PI * 2;
    const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R;
    root.position.set(x, groundHeight(x, z), z);
    root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));   // face along the circle (counter-clockwise, +z forward)
    play(moving ? 'Slither' : 'Head_LookLR');
    mixer.update(dt);
  });
}
