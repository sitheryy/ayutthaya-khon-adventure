// Stylized lighting ported from Bruno Simon's folio-2025 (MIT) MeshDefaultMaterial, rewritten for WebGL:
// lit = base * lightColor * intensity; shadowed = base * shadowColor (purple); mix by max(core shadow, drop shadow).
// Fog = screen-space radial gradient (cyan -> lavender) instead of a flat color.
import * as THREE from 'three';

export const STYLE = {
  uLightColor: { value: new THREE.Color('#ffcf98') },
  uLightI: { value: 1.22 },
  uShadowColor: { value: new THREE.Color('#8a7ae0') },
  uCoreLo: { value: -0.15 },
  uCoreHi: { value: 0.35 },
  uFogA: { value: new THREE.Color('#ffd2a6') },
  uFogB: { value: new THREE.Color('#b4a8f0') },
  uRes: { value: new THREE.Vector2(1, 1) },
};

export function stylize(sh, extra = '') {
  Object.assign(sh.uniforms, STYLE);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform vec3 uLightColor, uShadowColor, uFogA, uFogB; uniform float uLightI, uCoreLo, uCoreHi; uniform vec2 uRes;`)
    .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', `
      vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
      {
        float extraShadow = 0.0;
        ${extra}
        vec3 base = diffuseColor.rgb;
        float core = 0.0, drop = 0.0;
        #if NUM_DIR_LIGHTS > 0
          core = smoothstep(uCoreHi, uCoreLo, dot(normal, directionalLights[0].direction));
        #endif
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
          if (receiveShadow) {
            DirectionalLightShadow dls = directionalLightShadows[0];
            drop = 1.0 - getShadow(directionalShadowMap[0], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[0]);
          }
        #endif
        float sm = clamp(max(max(core, drop), extraShadow), 0.0, 1.0);
        outgoingLight = mix(base * uLightColor * uLightI, base * uShadowColor, sm) + totalEmissiveRadiance;
      }`)
    .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        vec3 fogC = mix(uFogA, uFogB, smoothstep(0.1, 0.9, length((gl_FragCoord.xy / uRes - vec2(0.5, 0.35)) * vec2(1.0, 1.4))));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogFactor);
      #endif`);
}

// every Lambert material without its own hook gets the style
THREE.MeshLambertMaterial.prototype.onBeforeCompile = function (sh) { stylize(sh); };
