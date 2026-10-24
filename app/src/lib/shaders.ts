// GLSL for the brain view. Kept apart from the scene so the System check can compile them on this computer's GPU.
export const DOT_VERT = /* glsl */ `
  attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
  uniform float uDpr; uniform float uFocus; uniform float uScale; uniform float uHalo;
  varying vec3 vColor; varying float vAlpha; varying float vPx; varying float vCore;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.1, -mv.z);
    float core = max(2.0, aSize * uScale / dist) * uDpr;
    vPx = core * (1.0 + 1.2 * uHalo); vCore = 1.0 / (1.0 + 1.2 * uHalo); gl_PointSize = vPx; // room around the dot for its halo
    vColor = aColor; vAlpha = aAlpha * clamp(1.0 - (dist - uFocus) * 0.06, 0.55, 1.0); // a little dimmer further back
    gl_Position = projectionMatrix * mv;
  }`;
export const DOT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uHalo;
  varying vec3 vColor; varying float vAlpha; varying float vPx; varying float vCore;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
    float solid = clamp((vCore - d) * vPx * 0.5 + 0.5, 0.0, 1.0); // crisp dot, one pixel of smoothing
    float glow = d > vCore ? exp(-pow((d - vCore) / 0.22, 2.0)) * 0.38 * uHalo : 0.0; // soft halo around it
    float a = clamp(solid + glow, 0.0, 1.0); if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }`;
export const RIM_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// RIM_FRAG: uFill adds a faint glass body (used by the skull only; the brain passes 0).
export const RIM_FRAG = /* glsl */ `
  precision highp float; uniform float uLo; uniform float uHi; uniform float uGain; uniform float uFill; uniform vec3 uTint; varying vec3 vN; varying vec3 vV;
  void main() { float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = smoothstep(uLo, uHi, f) * uGain + uFill * (0.4 + 0.6 * f); if (a <= 0.0) discard; gl_FragColor = vec4(uTint, a); }`;
