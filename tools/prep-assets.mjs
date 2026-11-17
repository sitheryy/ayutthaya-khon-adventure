// Strip CC0 source models down to web-ready GLBs in client/public/models.
// Run: node tools/prep-assets.mjs
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, weld, quantize } from '@gltf-transform/functions';
import fs from 'node:fs';

const io = new NodeIO();
const SRC = 'assets-src', OUT = 'client/public/models';
fs.mkdirSync(OUT, { recursive: true });
const KEEP_ANIMS = ['Idle', 'Walking_A', 'Running_A', 'Jump_Start', 'Jump_Idle', 'Jump_Land', 'Interact', 'Cheer', 'PickUp', 'Use_Item', 'Spellcasting', 'Sit_Floor_Idle', 'Hit_A', 'Unarmed_Idle', 'Unarmed_Pose'];
const WEAPONS = /Knife|Crossbow|Throwable|Spellbook|Wand|Staff|Shield|Sword|Axe|Mug/;

async function character(name) {
  const doc = await io.read(`${SRC}/kaykit/${name}.glb`);
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (WEAPONS.test(n.getName())) n.dispose();
  for (const a of root.listAnimations()) killAnim(a);
  for (const t of root.listTextures()) t.dispose(); // texture is applied at runtime (recolored palette)
  dropOrphans(doc);
  await doc.transform(weld(), prune({ keepAttributes: true }), dedup());
  await io.write(`${OUT}/${name}.glb`, doc);
}
async function anims() {
  const doc = await io.read(`${SRC}/kaykit/Rogue.glb`);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP_ANIMS.includes(a.getName())) killAnim(a);
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setSkin(null); n.dispose(); }
  for (const t of root.listTextures()) t.dispose();
  dropOrphans(doc);
  await doc.transform(prune({ keepLeaves: true }), dedup());
  await io.write(`${OUT}/anims.glb`, doc);
}
function killAnim(a) { a.listSamplers().forEach((s) => s.dispose()); a.listChannels().forEach((c) => c.dispose()); a.dispose(); }
function dropOrphans(doc) { // prune() keeps unused animation accessors in some files
  for (const a of doc.getRoot().listAccessors()) if (a.listParents().every((p) => p.propertyType === 'Root')) a.dispose();
}
async function prop(file, out = file) {
  const doc = await io.read(`${SRC}/quaternius/${file}.glb`);
  await doc.transform(prune(), dedup(), weld());
  await io.write(`${OUT}/${out}.glb`, doc);
}

async function animal(file) { // keep only locomotion clips, strip the rest
  const doc = await io.read(`${SRC}/quaternius/${file}.glb`);
  for (const a of doc.getRoot().listAnimations()) if (!/\|(Walk|Idle|Eating)$/.test(a.getName())) killAnim(a);
  dropOrphans(doc);
  await doc.transform(weld(), prune({ keepAttributes: true }), dedup());
  await io.write(`${OUT}/${file}.glb`, doc);
}
for (const a of ['Bull', 'Cow', 'Deer', 'Horse', 'ShibaInu']) await animal(a);
for (const p of ['Cart', 'MarketStand_1', 'MarketStand_2', 'Barrel', 'Crate', 'Hay', 'Fence', 'Bench_1', 'Bags', 'Bamboo_1', 'Bamboo_2', 'Bamboo_3', 'Rice_3', 'Rice_4']) await prop(p);
for (const c of ['Rogue', 'Mage', 'Knight', 'Barbarian']) await character(c);
await anims();
for (const p of ['Chest', 'Bush', 'Flowers', 'Lilypad', 'Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3', 'BushBerries_1', 'PalmTree_1', 'PalmTree_2', 'Willow_1', 'Boat', 'Sail_ship', 'Cloud_1', 'Cloud_2', 'Star']) await prop(p);
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0) + 'KB');
