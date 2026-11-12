// Environments: the light, sky and fog the 3D view shows a model in. They belong to the
// studio, not to a file: nothing here is saved in a document or exported to glTF. Each is a
// piece of GLSL that the renderer (render.js) puts into its shaders, so a person can write
// their own in View ▸ Environment ▸ Edit. A custom one is kept in this browser (or app).
//
// An environment defines five functions. Directions are in the world, y up. It can read
// uTime (seconds) and uWindow (the colour of the window behind the view, as the theme has it).
//
//   vec3 sunDir()                               towards the sun, unit length
//   vec3 sunColor()                             the colour of the sun's light
//   vec3 ambient(vec3 n)                        light from all around on a surface facing n
//   vec4 background(vec3 d)                     what is seen behind the model along d; alpha 0 shows the window
//   vec3 fog(vec3 col, vec3 d, float far)       col seen through the air; far is 0 at the eye, 1 far away

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const STUDIO = `// The studio: a plain neutral light, the window's own colour behind.
vec3 sunDir() { return normalize(vec3(0.44, 0.83, 0.34)); }
vec3 sunColor() { return vec3(1.0); }
vec3 ambient(vec3 n) { return mix(vec3(0.30, 0.32, 0.40), vec3(0.46), 0.5 + 0.5 * n.y); }
vec4 background(vec3 d) { return vec4(0.0); }
vec3 fog(vec3 col, vec3 d, float far) { return mix(col, uWindow, far * far * 0.45); }
`;

// a sky with a horizon, a zenith and a glow around the sun, and ground below
const sky = ({ note, sun, sunCol, zenith, horizon, ground, below, fogCol, fogAmt, glow = 0.35, stars = false }) => `// ${note}
vec3 sunDir() { return normalize(vec3(${sun})); }
vec3 sunColor() { return vec3(${sunCol}); }
vec3 ambient(vec3 n) {
  vec3 up = 0.12 + 0.45 * vec3(${zenith}), down = vec3(${ground});
  return mix(down, up, 0.5 + 0.5 * n.y);
}
vec4 background(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  vec3 c = h > 0.0 ? mix(vec3(${horizon}), vec3(${zenith}), pow(h, 0.55)) : mix(vec3(${horizon}), vec3(${below}), smoothstep(0.0, 0.9, -h) * 0.8);
  // the glow around the sun
  c += vec3(${sunCol}) * ${glow.toFixed(2)} * pow(max(dot(d, sunDir()), 0.0), 12.0);${stars ? `
  // a few stars
  vec3 q = floor(d * 160.0);
  float s = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  c += step(0.997, s) * smoothstep(0.0, 0.25, h) * 0.6;` : ''}
  return vec4(c, 1.0);
}
vec3 fog(vec3 col, vec3 d, float far) { return mix(col, vec3(${fogCol}), far * far * ${fogAmt}); }
`;

export const BUILT_IN = [
  { name: 'studio', code: STUDIO },
  { name: 'day', code: sky({ note: 'Day: a clear sky and a warm sun.', sun: '0.50, 0.80, 0.35', sunCol: '1.00, 0.95, 0.86', zenith: '0.38, 0.60, 0.90', horizon: '0.80, 0.88, 0.95', ground: '0.36, 0.34, 0.30', below: '0.46, 0.45, 0.42', fogCol: '0.72, 0.83, 0.95', fogAmt: '0.55' }) },
  { name: 'overcast', code: sky({ note: 'Overcast: soft light from a grey sky, no shadows to speak of.', sun: '0.24, 0.92, 0.29', sunCol: '0.55, 0.56, 0.58', zenith: '0.62, 0.65, 0.69', horizon: '0.76, 0.78, 0.80', ground: '0.40, 0.40, 0.41', below: '0.52, 0.53, 0.54', fogCol: '0.68, 0.71, 0.74', fogAmt: '0.75', glow: 0.05 }) },
  { name: 'sunset', code: sky({ note: 'Sunset: a low orange sun.', sun: '0.84, 0.30, 0.45', sunCol: '1.00, 0.62, 0.34', zenith: '0.42, 0.40, 0.62', horizon: '0.98, 0.66, 0.42', ground: '0.28, 0.22, 0.28', below: '0.30, 0.24, 0.30', fogCol: '0.94, 0.64, 0.46', fogAmt: '0.65', glow: 0.8 }) },
  { name: 'dusk', code: sky({ note: 'Dusk: the sun gone, a violet sky.', sun: '-0.64, 0.43, 0.64', sunCol: '0.78, 0.52, 0.60', zenith: '0.16, 0.16, 0.34', horizon: '0.46, 0.36, 0.52', ground: '0.16, 0.15, 0.24', below: '0.14, 0.13, 0.20', fogCol: '0.31, 0.28, 0.46', fogAmt: '0.7', glow: 0.25 }) },
  { name: 'night', code: sky({ note: 'Night: moonlight, and stars.', sun: '-0.40, 0.85, -0.35', sunCol: '0.38, 0.46, 0.66', zenith: '0.02, 0.03, 0.08', horizon: '0.08, 0.11, 0.20', ground: '0.07, 0.08, 0.12', below: '0.04, 0.05, 0.08', fogCol: '0.05, 0.07, 0.13', fogAmt: '0.7', glow: 0.15, stars: true }) },
];

// what the studio uses, and who wants to know when it changes
const listeners = new Set();
let customs = [];
try { customs = JSON.parse(store.get('octo.environments') || '[]').filter(e => e && e.name && typeof e.code === 'string'); } catch { customs = []; }
let current = store.get('octo.environment') || 'studio';

export function environments() { return [...BUILT_IN, ...customs.map(e => ({ ...e, custom: true }))]; }
export function environment() { return environments().find(e => e.name === current) || BUILT_IN[0]; }
export function setEnvironment(name) {
  current = name;
  store.set('octo.environment', name);
  for (const f of listeners) f(environment());
}
// keep (or replace) a custom one by name, and use it
export function saveEnvironment(name, code) {
  if (BUILT_IN.some(e => e.name === name)) throw new Error(`${name} is a built-in environment: give yours another name`);
  customs = customs.filter(e => e.name !== name).concat([{ name, code }]);
  store.set('octo.environments', JSON.stringify(customs));
  setEnvironment(name);
}
export function removeEnvironment(name) {
  customs = customs.filter(e => e.name !== name);
  store.set('octo.environments', JSON.stringify(customs));
  if (current === name) setEnvironment('studio'); else for (const f of listeners) f(environment());
}
// shows an environment in every view without keeping it (the editor, while typing)
export function previewEnvironment(env) { for (const f of listeners) f(env); }
export function onEnvironment(f) { listeners.add(f); return () => listeners.delete(f); }
