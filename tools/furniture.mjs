// KayKit Furniture Bits (CC0) gltf -> single-file glb for the dance hall. Run from client/: node ../tools/furniture.mjs <gltf dir>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
const io = new NodeIO(), dir = process.argv[2];
const ITEMS = ['rug_rectangle_stripes_A', 'cabinet_medium_decorated', 'shelf_B_large_decorated', 'pictureframe_large_A', 'lamp_standing', 'pillow_A', 'table_small', 'chair_A_wood'];
for (const n of ITEMS) { const d = await io.read(`${dir}/${n}.gltf`); await d.transform(prune(), dedup()); await io.write(`public/models/kk_${n}.glb`, d); }
console.log('ok', ITEMS.length);
