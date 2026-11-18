// Villagers (user-made Meshy models, each with one walk clip): they stroll around their own area of the city and stop to
// chat when a student comes near, sharing short Khon facts through the same card as the plaza mascots (npc.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ZONES, HALF, WALL_Z, colliders, groundHeight, isBlockedWater, cullAt } from './world.js';
import { NPCS } from './npc.js';
import { makeNameTag } from './character.js';

const S = 1.5;   // 1.7 m models -> about the size of the plaza mascots' neighbours; clearly readable on a phone
const DEFS = [
  { file: 'monk', name: 'หลวงตา', sub: 'พระภิกษุ', at: [ZONES[0].x + 10, ZONES[0].z + 14], r: 10, speed: 0.7, facts: [
    'เจริญพร โยม ที่วัดมหาธาตุแห่งนี้ในอดีตเคยมีงานบุญใหญ่ และมีมหรสพสมโภชให้ชาวบ้านชม',
    'ก่อนการแสดงโขน ผู้แสดงต้องทำพิธีไหว้ครูทุกครั้ง เพื่อแสดงความเคารพต่อครูบาอาจารย์และหัวโขน',
    'หัวโขนถือเป็นของสูง ไม่ควรวางบนพื้น และผู้แสดงต้องไหว้ก่อนสวมทุกครั้ง',
  ] },
  { file: 'vendor', name: 'แม่ค้าใจดี', sub: 'พ่อค้าแม่ค้า', at: [ZONES[2].x - 8, ZONES[2].z + 6], r: 9, speed: 1.0, facts: [
    'ซื้อผลไม้ไหมจ๊ะ! สมัยก่อนตลาดริมน้ำคึกคักมาก พอมีงานเฉลิมฉลอง ชาวบ้านก็มาชมโขนกัน',
    'ตัวโขนแต่ละตัวมีสีกายเฉพาะ พระรามกายสีเขียว ทศกัณฐ์กายสีเขียว ส่วนหนุมานกายสีขาว',
    'ชุดโขนปักดิ้นเลื่อมงดงามมาก ต้องใช้ช่างฝีมือทำละเอียด ทั้งเสื้อ สนับเพลา และเครื่องประดับ',
  ] },
  { file: 'guard', name: 'นายทหารเฝ้าเมือง', sub: 'ทหารยาม', at: [ZONES[5].x, WALL_Z - 17], r: 9, speed: 1.0, facts: [
    'หยุดก่อน! ข้าเป็นทหารเฝ้าประตูเมือง ในรามเกียรติ์ก็มีทัพใหญ่ ทั้งทัพพระรามและทัพทศกัณฐ์',
    'ทัพของพระรามคือทัพวานร มีหนุมาน สุครีพ และองคตเป็นแม่ทัพ ส่วนทัพยักษ์ของกรุงลงกาก็เกรียงไกรไม่แพ้กัน',
    'พระลักษมณ์ น้องชายของพระราม เป็นผู้ติดตามคอยปกป้องพระรามตลอดการเดินทาง',
  ] },
  { file: 'old', name: 'คุณตา', sub: 'ผู้เฒ่าผู้แก่', at: [ZONES[1].x, ZONES[1].z + 30], r: 10, speed: 0.55, facts: [
    'มานั่งฟังตาเล่านะ รามเกียรติ์เล่าว่า นางสีดาถูกทศกัณฐ์ลักพาตัวไปกรุงลงกา พระรามจึงยกทัพไปตามช่วย',
    'ฉบับรามเกียรติ์ที่สมบูรณ์ที่สุดคือพระราชนิพนธ์ในพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราช รัชกาลที่ 1',
    'หนุมานเป็นทหารเอกที่เก่งกล้า เหาะไปสืบข่าวนางสีดา และช่วยพระรามรบจนได้ชัยชนะ',
  ] },
  { file: 'villager', name: 'ลุงสมชาย', sub: 'ชาวบ้าน', at: [ZONES[3].x + 8, ZONES[3].z - 4], r: 9, speed: 1.0, facts: [
    'การแสดงโขนมีวงปี่พาทย์บรรเลงประกอบ เช่น ระนาดเอก ฆ้องวง ตะโพน กลองทัด ปี่ และฉิ่ง',
    'เพลงที่ใช้ในโขนมีหลายแบบ เช่น เพลงเสมอ ใช้ตอนเดินทาง และเพลงเชิด ใช้ตอนออกรบหรือเหาะ',
    'ผู้พากย์และผู้เจรจาจะเป็นผู้บอกเรื่อง ส่วนผู้แสดงใช้ท่ารำสื่อความหมายแทนคำพูด',
  ] },
  { file: 'child', name: 'น้องปัน', sub: 'เด็กน้อย', at: [ZONES[4].x + 14, ZONES[4].z + 8], r: 8, speed: 1.3, facts: [
    'หนูอยากเป็นหนุมานจัง! หนุมานตัวขาว กระโดดเก่ง ใครๆ ก็ชอบ',
    'พี่ๆ บอกว่า ยักษ์กับลิงต้องสวมหัวโขน แต่พระกับนางไม่สวมหัว ใส่มงกุฎหรือชฎาแทน',
    'สมัยก่อนผู้แสดงโขนเป็นผู้ชายล้วน ตอนนี้มีผู้หญิงมาร่วมแสดงด้วยนะ',
  ] },
];

const blocked = (x, z) => isBlockedWater(x, z) || Math.abs(x) > HALF - 4 || z > WALL_Z - 5 || z < -HALF + 8
  || colliders.some((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + 1.0 : Math.abs(x - c.x) < c.hw + 1.0 && Math.abs(z - c.z) < c.hd + 1.0));
const clearLine = (x0, z0, x1, z1) => { for (let k = 1; k <= 6; k++) if (blocked(x0 + (x1 - x0) * k / 6, z0 + (z1 - z0) * k / 6)) return false; return true; };

export async function spawnVillagers(scene, animated, me) {
  const loader = new GLTFLoader();
  for (const def of DEFS) {
    let g; try { g = await loader.loadAsync(import.meta.env.BASE_URL + `models/npc_${def.file}.glb`); } catch { continue; }
    // find a free spot near the preferred one
    let hx = def.at[0], hz = def.at[1];
    for (let k = 0; k < 60 && blocked(hx, hz); k++) { const a = k * 2.4, d = 1 + k * 0.35; hx = def.at[0] + Math.cos(a) * d; hz = def.at[1] + Math.sin(a) * d; }
    if (blocked(hx, hz)) continue;
    const root = new THREE.Group(), model = g.scene; root.add(model);
    model.traverse((o) => { if (o.isMesh) { const m = o.material; o.material = new THREE.MeshLambertMaterial({ map: m.map, color: m.color }); o.castShadow = true; o.frustumCulled = false; } });
    root.scale.setScalar(S);
    const tag = makeNameTag(def.name, def.sub, '#ffe08a'); tag.position.y = new THREE.Box3().setFromObject(model).max.y + 0.3; tag.scale.multiplyScalar(1.0 / S); model.add(tag);   // tag lives in model units, so undo the root scale
    const mixer = new THREE.AnimationMixer(model), act = mixer.clipAction(g.animations[0]); act.play();
    const npc = { def, x: hx, z: hz, i: 0 }; NPCS.push(npc);
    let tx = hx, tz = hz, wait = Math.random() * 3, walking = false, yaw = Math.random() * 6.28;
    const stand = () => { walking = false; act.time = 0; mixer.update(0); act.paused = true; };
    const go = () => { walking = true; act.paused = false; };
    stand();
    root.position.set(hx, groundHeight(hx, hz), hz); root.rotation.y = yaw; scene.add(root); cullAt(root, 80);
    animated.push((t, dt) => {
      if (!root.visible) return;
      const near = Math.hypot(me.x - npc.x, me.z - npc.z) < 6.5;
      if (near) {   // stop and face the student
        if (walking) stand();
        const want = Math.atan2(me.x - npc.x, me.z - npc.z); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 4);
      } else if (walking) {
        const dx = tx - npc.x, dz = tz - npc.z, dist = Math.hypot(dx, dz), step = def.speed * dt;
        if (dist < 0.3 || blocked(npc.x + dx / dist * step, npc.z + dz / dist * step)) { stand(); wait = 1.5 + Math.random() * 4; }
        else { npc.x += dx / dist * step; npc.z += dz / dist * step; const want = Math.atan2(dx, dz); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 5); mixer.update(dt); }
      } else if ((wait -= dt) <= 0) {   // pick a new spot inside the home area
        for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, d = 2 + Math.random() * def.r, x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d; if (!blocked(x, z) && clearLine(npc.x, npc.z, x, z)) { tx = x; tz = z; go(); break; } }
        wait = 1 + Math.random() * 2;
      }
      root.position.set(npc.x, groundHeight(npc.x, npc.z), npc.z); root.rotation.y = yaw;
    });
  }
}
