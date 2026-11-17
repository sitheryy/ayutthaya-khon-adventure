// Nature ambience: looping layers whose volume follows where the player stands.
// Sounds: CC0 from Freesound via github.com/abetusk/noixer (birds: sonidosreales245, frogs+crickets: greysound,
// waterfall: ali-k) and github.com/Muges/ambientsounds (wind: felix.blume). Trimmed to seamless mono loops.
import { ZONES, riverX, RICE, waters } from './world.js';

const FILES = { birds: 'amb-birds.mp3', night: 'amb-night.mp3', water: 'amb-water.mp3', wind: 'amb-wind.mp3', music: 'music-bg.mp3' };   // music: "Echoes of Siam", supplied by the project owner
const FALL = { x: ZONES[3].x - 38, z: ZONES[3].z + 8 };   // waterfall pool (see buildWaterfall)
let layers = null, master = null;

export async function startAmbience(ctx) {
  if (layers) return;
  layers = {};
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    try {
      const buf = await ctx.decodeAudioData(await (await fetch(import.meta.env.BASE_URL + f)).arrayBuffer());
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = true; g.gain.value = 0; src.connect(g).connect(master);
      src.start(0, k === 'music' ? 0 : Math.random() * buf.duration);   // random offset: two layers never line up the same way
      layers[k] = g;
    } catch {}
  }));
}

const near = (d, r0, r1) => Math.max(0, Math.min(1, (r1 - d) / (r1 - r0)));   // 1 inside r0, 0 beyond r1
export function updateAmbience(ctx, me, muted) {
  if (!layers || !master) return;
  const forest = near(Math.hypot(me.x - ZONES[3].x, me.z - ZONES[3].z), ZONES[3].r * 0.6, ZONES[3].r * 1.5);
  const rice = Math.max(0, ...RICE.map((f) => near(Math.max(f.x0 - me.x, me.x - f.x1, f.z0 - me.z, me.z - f.z1, 0), 0, 25)));
  const water = Math.max(near(Math.hypot(me.x - FALL.x, me.z - FALL.z), 6, 40),
    0.55 * near(Math.abs(me.x - riverX(me.z)), 4, 30), 0.35 * Math.max(0, ...waters.map((w) => near(Math.hypot(me.x - w.x, me.z - w.z) - w.r, 0, 14))));
  const want = {
    birds: 0.12 + 0.2 * forest,                         // everywhere, a lot more in the forest
    night: 0.08 + 0.17 * Math.max(forest, rice),        // evening: crickets and frogs, loud by the paddies
    water: water * 0.95,
    wind: 0.22 + 0.1 * Math.min(1, me.y / 6),           // a little stronger up on terraces
    music: 0.42,                                        // background music everywhere
  };
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : 0.55, t, 0.3);
  for (const k in layers) layers[k].gain.setTargetAtTime(want[k], t, 0.6);
}
