// Villagers (user-made Meshy models, each with one walk clip): they stroll around their own area of the city and stop to
// chat when a student comes near, sharing short Khon facts through the same card as the plaza mascots (npc.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ZONES, HALF, WALL_Z, colliders, groundHeight, isBlockedWater, cullAt } from './world.js';
import { NPCS, talkingTo } from './npc.js';
import { makeNameTag } from './character.js';

const S = 1.5;   // 1.7 m models -> about the size of the plaza mascots' neighbours; clearly readable on a phone
const TYPES = {
  monk: { names: ['หลวงตา', 'หลวงพี่', 'พระอาจารย์'], sub: 'พระภิกษุ', speed: 0.7, facts: [
    'เจริญพร โยม ที่วัดมหาธาตุแห่งนี้ในอดีตเคยมีงานบุญใหญ่ และมีมหรสพสมโภชให้ชาวบ้านชม',
    'ก่อนการแสดงโขน ผู้แสดงต้องทำพิธีไหว้ครูทุกครั้ง เพื่อแสดงความเคารพต่อครูบาอาจารย์และหัวโขน',
    'หัวโขนถือเป็นของสูง ไม่ควรวางบนพื้น และผู้แสดงต้องไหว้ก่อนสวมทุกครั้ง',
  ] },
  vendor: { names: ['แม่ค้าใจดี', 'ป้าแดง', 'พี่นวล'], sub: 'พ่อค้าแม่ค้า', speed: 1.0, facts: [
    'ซื้อผลไม้ไหมจ๊ะ! สมัยก่อนตลาดริมน้ำคึกคักมาก พอมีงานเฉลิมฉลอง ชาวบ้านก็มาชมโขนกัน',
    'ตัวโขนแต่ละตัวมีสีกายเฉพาะ พระรามกายสีเขียว ทศกัณฐ์กายสีเขียว ส่วนหนุมานกายสีขาว',
    'ชุดโขนปักดิ้นเลื่อมงดงามมาก ต้องใช้ช่างฝีมือทำละเอียด ทั้งเสื้อ สนับเพลา และเครื่องประดับ',
  ] },
  guard: { names: ['นายทหารเฝ้าเมือง', 'ทหารกล้า', 'ผู้กองแก้ว'], sub: 'ทหารยาม', speed: 1.0, facts: [
    'หยุดก่อน! ข้าเป็นทหารเฝ้าประตูเมือง ในรามเกียรติ์ก็มีทัพใหญ่ ทั้งทัพพระรามและทัพทศกัณฐ์',
    'ทัพของพระรามคือทัพวานร มีหนุมาน สุครีพ และองคตเป็นแม่ทัพ ส่วนทัพยักษ์ของกรุงลงกาก็เกรียงไกรไม่แพ้กัน',
    'พระลักษมณ์ น้องชายของพระราม เป็นผู้ติดตามคอยปกป้องพระรามตลอดการเดินทาง',
  ] },
  old: { names: ['คุณยาย', 'ยายทองใบ', 'ยายมา'], sub: 'ยายผู้เฒ่า', speed: 0.55, facts: [
    'มานั่งฟังยายเล่านะลูก รามเกียรติ์เล่าว่า นางสีดาถูกทศกัณฐ์ลักพาตัวไปกรุงลงกา พระรามจึงยกทัพไปตามช่วย',
    'ฉบับรามเกียรติ์ที่สมบูรณ์ที่สุดคือพระราชนิพนธ์ในพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราช รัชกาลที่ 1',
    'หนุมานเป็นทหารเอกที่เก่งกล้า เหาะไปสืบข่าวนางสีดา และช่วยพระรามรบจนได้ชัยชนะ',
  ] },
  villager: { names: ['ลุงสมชาย', 'ลุงบุญ', 'พี่ชาย'], sub: 'ชาวบ้าน', speed: 1.0, facts: [
    'การแสดงโขนมีวงปี่พาทย์บรรเลงประกอบ เช่น ระนาดเอก ฆ้องวง ตะโพน กลองทัด ปี่ และฉิ่ง',
    'เพลงที่ใช้ในโขนมีหลายแบบ เช่น เพลงเสมอ ใช้ตอนเดินทาง และเพลงเชิด ใช้ตอนออกรบหรือเหาะ',
    'ผู้พากย์และผู้เจรจาจะเป็นผู้บอกเรื่อง ส่วนผู้แสดงใช้ท่ารำสื่อความหมายแทนคำพูด',
  ] },
  child: { names: ['น้องปัน', 'น้องเก่ง', 'น้องนิด'], sub: 'เด็กน้อย', speed: 1.3, facts: [
    'หนูอยากเป็นหนุมานจัง! หนุมานตัวขาว กระโดดเก่ง ใครๆ ก็ชอบ',
    'พี่ๆ บอกว่า ยักษ์กับลิงต้องสวมหัวโขน แต่พระกับนางไม่สวมหัว ใส่มงกุฎหรือชฎาแทน',
    'สมัยก่อนผู้แสดงโขนเป็นผู้ชายล้วน ตอนนี้มีผู้หญิงมาร่วมแสดงด้วยนะ',
  ] },
};
// who lives where: a mix of types per zone, each spread around the zone's anchor
const CAST = [
  { at: [ZONES[0].x + 10, ZONES[0].z + 14], cast: ['monk'] },
  { at: [ZONES[1].x, ZONES[1].z + 30], cast: ['old'] },
  { at: [ZONES[2].x - 8, ZONES[2].z + 6], cast: ['vendor'] },
  { at: [ZONES[3].x + 8, ZONES[3].z - 4], cast: ['villager'] },
  { at: [ZONES[4].x + 14, ZONES[4].z + 8], cast: ['child'] },
  { at: [ZONES[5].x, WALL_Z - 17], cast: ['guard'] },
];
const R = 8;

const blocked = (x, z) => isBlockedWater(x, z) || Math.abs(x) > HALF - 4 || z > WALL_Z - 5 || z < -HALF + 8
  || colliders.some((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + 1.0 : Math.abs(x - c.x) < c.hw + 1.0 && Math.abs(z - c.z) < c.hd + 1.0));
const clearLine = (x0, z0, x1, z1) => { for (let k = 1; k <= 6; k++) if (blocked(x0 + (x1 - x0) * k / 6, z0 + (z1 - z0) * k / 6)) return false; return true; };

export async function spawnVillagers(scene, animated, me) {
  const loader = new GLTFLoader(), gl = {};   // each file is loaded once and cloned per villager
  const list = []; CAST.forEach((z) => z.cast.forEach((file, k) => { const a = (k / z.cast.length) * 6.28 + 0.7, d = z.cast.length > 1 ? 5 : 0; list.push({ file, at: [z.at[0] + Math.cos(a) * d, z.at[1] + Math.sin(a) * d], n: k }); }));
  for (const it of list) {
    const T = TYPES[it.file]; if (!(it.file in gl)) { try { gl[it.file] = await loader.loadAsync(import.meta.env.BASE_URL + `models/npc_${it.file}.glb`); } catch { gl[it.file] = null; } }
    const g = gl[it.file]; if (!g) continue;
    const def = { ...T, r: R, at: it.at, name: T.names[it.n % T.names.length] };
    // find a free spot near the preferred one
    let hx = def.at[0], hz = def.at[1];
    for (let k = 0; k < 60 && blocked(hx, hz); k++) { const a = k * 2.4, d = 1 + k * 0.35; hx = def.at[0] + Math.cos(a) * d; hz = def.at[1] + Math.sin(a) * d; }
    if (blocked(hx, hz)) continue;
    const root = new THREE.Group(), model = SkeletonUtils.clone(g.scene); root.add(model);
    model.traverse((o) => { if (o.isMesh) { const m = o.material; o.material = new THREE.MeshLambertMaterial({ map: m.map, color: m.color }); o.castShadow = true; o.frustumCulled = false; } });
    root.scale.setScalar(S);
    const tag = makeNameTag(def.name, def.sub, '#ffe08a'); tag.position.y = new THREE.Box3().setFromObject(model).max.y + 0.3; tag.scale.multiplyScalar(1.0 / S); model.add(tag);   // tag lives in model units, so undo the root scale
    const mixer = new THREE.AnimationMixer(model), act = mixer.clipAction(g.animations[0]); act.play();
    const npc = { def, x: hx, z: hz, i: Math.floor(Math.random() * def.facts.length) }; NPCS.push(npc);
    let tx = hx, tz = hz, walking = false, yaw = Math.random() * 6.28;
    // standing pose = the model's rest pose with the arms brought down beside the body (the clip is only a walk, and the rest pose is arms-out)
    const rest = []; model.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    root.rotation.y = 0; root.updateMatrixWorld(true);
    const bn = (n) => model.getObjectByProperty('name', 'mixamorig' + n), wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const la = bn('LeftArm'), lf = bn('LeftForeArm'), ra = bn('RightArm'), rfo = bn('RightForeArm');
    if (la && lf && ra && rfo) {
      const side = wp(la).sub(wp(ra)).setY(0).normalize(), pq = new THREE.Quaternion(), dq = new THREE.Quaternion();
      for (const [arm, fore, sg] of [[la, lf, 1], [ra, rfo, -1]]) {
        const cur = wp(fore).sub(wp(arm)).normalize(), want = new THREE.Vector3(0, -1, 0).addScaledVector(side, sg * 0.1).normalize();
        dq.setFromUnitVectors(cur, want); arm.parent.getWorldQuaternion(pq);
        arm.quaternion.premultiply(pq.clone().invert().multiply(dq).multiply(pq));   // world-space delta -> parent space
        rest.find((r) => r[0] === arm)[2].copy(arm.quaternion);
        arm.parent.updateMatrixWorld(true);
      }
    }
    let br = Math.random() * 6;
    const stand = () => { walking = false; act.paused = true; for (const [o, p, q, sc] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); } };
    const go = () => { walking = true; act.paused = false; };
    const pick = () => {   // next spot inside the home area
      for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, d = 2 + Math.random() * def.r, x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d; if (!blocked(x, z) && clearLine(npc.x, npc.z, x, z)) { tx = x; tz = z; return true; } }
      return false;
    };
    const turn = (want, k) => { let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, k); };
    stand();
    root.position.set(hx, groundHeight(hx, hz), hz); root.rotation.y = yaw; scene.add(root); cullAt(root, 80);
    animated.push((t, dt) => {
      if (!root.visible) return;
      if (talkingTo() === npc) {   // chatting: stop, arms at the sides, face the student
        if (walking) stand();
        turn(Math.atan2(me.x - npc.x, me.z - npc.z), dt * 4);
      } else {   // otherwise keep strolling
        if (!walking && pick()) go();
        if (walking) {
          let dx = tx - npc.x, dz = tz - npc.z, dist = Math.hypot(dx, dz), step = def.speed * dt;
          if (dist < 0.4 || blocked(npc.x + dx / dist * step, npc.z + dz / dist * step)) { if (pick()) { dx = tx - npc.x; dz = tz - npc.z; dist = Math.hypot(dx, dz) || 1; } else stand(); }
          if (walking) { npc.x += dx / dist * step; npc.z += dz / dist * step; turn(Math.atan2(dx, dz), dt * 5); mixer.update(dt); }
        }
      }
      if (!walking) { br += dt * 1.8; model.scale.y = 1 + Math.sin(br) * 0.006; } else model.scale.y = 1;
      root.position.set(npc.x, groundHeight(npc.x, npc.z), npc.z); root.rotation.y = yaw;
    });
  }
}
