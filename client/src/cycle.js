// Time of day: the city alternates between golden evening and moonlit night (no morning/noon).
// Driven by wall-clock time so every student in a room sees the same sky.
import * as THREE from 'three';
import { STYLE } from './style.js';

export const NIGHT = { value: 0 };          // 0 = evening, 1 = night (shared uniform)
export const SKY = { top: new THREE.Color(), mid: new THREE.Color(), hor: new THREE.Color(), sunCol: new THREE.Color(), refl: new THREE.Color() };
export const EVENING_DIR = new THREE.Vector3(-0.62, 0.34, 0.7).normalize();
const MOON_DIR = new THREE.Vector3(0.5, 0.55, 0.67).normalize();

const P = {
  evening: { light: '#ffcf98', li: 1.22, shadow: '#8a7ae0', fogA: '#ffd2a6', fogB: '#b4a8f0', top: '#3f57b8', mid: '#8fa6e8', hor: '#ffc58e', sun: '#ffd49a', refl: '#ffd1a8', fog: '#d9b8d0' },
  night:   { light: '#9db4ff', li: 0.62, shadow: '#2b2f73', fogA: '#2c3a78', fogB: '#181c4a', top: '#060a22', mid: '#121a52', hor: '#33397e', sun: '#dfe8ff', refl: '#5a6fb8', fog: '#1d2456' },
};
const E = {}, Nn = {};
for (const k of Object.keys(P.evening)) if (typeof P.evening[k] === 'string') { E[k] = new THREE.Color(P.evening[k]); Nn[k] = new THREE.Color(P.night[k]); }

const EVE = 150, FADE = 20, NIG = 150, PERIOD = EVE + FADE + NIG + FADE;
export function nightFactor(sec) {
  const t = ((sec % PERIOD) + PERIOD) % PERIOD;
  if (t < EVE) return 0;
  if (t < EVE + FADE) return THREE.MathUtils.smoothstep(t, EVE, EVE + FADE);
  if (t < EVE + FADE + NIG) return 1;
  return 1 - THREE.MathUtils.smoothstep(t, EVE + FADE + NIG, PERIOD);
}

const params = new URLSearchParams(location.search);
export function updateCycle({ sunDir, fog, bloom }) {
  const n = 0;   // evening only
  NIGHT.value = n;
  const mix = (k, out) => out.copy(E[k]).lerp(Nn[k], n);
  mix('light', STYLE.uLightColor.value); STYLE.uLightI.value = THREE.MathUtils.lerp(P.evening.li, P.night.li, n);
  mix('shadow', STYLE.uShadowColor.value); mix('fogA', STYLE.uFogA.value); mix('fogB', STYLE.uFogB.value);
  mix('top', SKY.top); mix('mid', SKY.mid); mix('hor', SKY.hor); mix('sun', SKY.sunCol); mix('refl', SKY.refl);
  if (fog) mix('fog', fog.color);
  sunDir.copy(EVENING_DIR).lerp(MOON_DIR, n).normalize();
  if (bloom) bloom.strength = THREE.MathUtils.lerp(0.38, 0.75, n);
  return n;
}
