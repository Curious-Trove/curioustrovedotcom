// WebGL2 renderer for octolang meshes: the main 3D view and the node previews.
// Vertex layout from the core: position, normal, colour, texture coordinates, glow, the colour painted over (15 floats).
// A mesh comes in runs of one material each; a material is one of seven presets
// (standard, unlit, toon, foliage, water, glass, glow), drawn by one shader here.

import { environment, onEnvironment } from './environment.js?v=e2bbaab254';

const STRIDE = 60;
const PRESETS = { standard: 0, unlit: 1, toon: 2, foliage: 3, water: 4, glass: 5, glow: 6 };

const VS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUV;
layout(location=4) in float aEmit;
layout(location=5) in vec3 aOver;
uniform mat4 uVP; uniform int uPreset; uniform float uTime;
out vec3 vNor; out vec3 vCol; out vec3 vPos; out vec2 vUV; out float vEmit; out vec3 vOver;
void main() {
  vec3 p = aPos;
  if (uPreset == 3) {
    // foliage sways, more the higher it is
    float k = 0.04 * clamp(p.y * 0.3, 0.0, 1.5);
    p.x += sin(uTime * 1.7 + p.x * 0.9 + p.z * 1.3) * k;
    p.z += cos(uTime * 1.3 + p.x * 1.1 - p.z * 0.7) * k;
  }
  vNor = aNor; vCol = aCol; vPos = p; vUV = aUV; vEmit = aEmit; vOver = aOver;
  gl_Position = uVP * vec4(p, 1.0);
}`;

// what every shader that runs an environment (environment.js) starts with; the
// environment's code comes next, then the shader's own
const ENV_HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform float uTime; uniform vec3 uWindow;
#line 1 1
`;

const FS = `
in vec3 vNor; in vec3 vCol; in vec3 vPos; in vec2 vUV; in float vEmit; in vec3 vOver;
uniform vec3 uEye; uniform float uFogDist;
uniform int uPreset; uniform int uAlpha; uniform bool uHasTex, uHasBump, uHasMask, uHasRough, uHasMetal, uHasGlow, uUnlitView;
uniform float uRough, uMetal;
uniform sampler2D uTex, uBump, uMask, uRoughMap, uMetalMap, uGlowMap;
out vec4 o;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 n = normalize(vNor);
  if (!gl_FrontFacing) n = -n;
  vec2 uv = vUV;
  if (uPreset == 4) uv += vec2(uTime * 0.03, uTime * 0.05);
  vec4 tex = uHasTex ? texture(uTex, uv) : vec4(1.0);
  // what wear, tone and touch painted lies over the texture, not under it
  vec3 base = vCol * tex.rgb + vOver;
  float a = tex.a;
  if (uHasMask) { vec4 m = texture(uMask, uv); a *= lum(m.rgb) * m.a; }
  if (uAlpha == 1 && a < 0.5) discard;
  if (uAlpha != 2) a = 1.0;
  if (uHasBump) {
    // dents from a height image, with no tangents: the slope of the height across the screen
    float h = lum(texture(uBump, uv).rgb);
    vec3 dpx = dFdx(vPos), dpy = dFdy(vPos);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    n = normalize(abs(det) * n - 0.35 * grad);
  }
  // the environment's light: from all around, and the sun
  vec3 sun = sunDir(), uSunCol = sunColor();
  vec3 tint = (ambient(vec3(0.0, 1.0, 0.0)) + 0.70 * uSunCol) / 1.16;
  vec3 v = normalize(uEye - vPos);
  float d = max(dot(n, sun), 0.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 col;
  float emit = vEmit;
  // images that say where: rough, metal and glowing where they are light
  float rough = uRough, metal = uMetal;
  if (uHasRough) { vec4 m = texture(uRoughMap, uv); rough *= lum(m.rgb) * m.a; }
  if (uHasMetal) { vec4 m = texture(uMetalMap, uv); metal *= lum(m.rgb) * m.a; }
  if (uHasGlow) { vec4 m = texture(uGlowMap, uv); emit *= lum(m.rgb) * m.a; }
  if (uPreset == 1 || uUnlitView) {
    col = base;
  } else if (uPreset == 2) {
    // toon: three flat bands of light and a rim
    float band = d > 0.55 ? 1.0 : d > 0.12 ? 0.72 : 0.45;
    col = (base * band + fres * 0.25 * base) * tint;
  } else if (uPreset == 3) {
    // foliage: light wraps around and shines through
    float wrap = max(dot(n, sun) * 0.5 + 0.5, 0.0);
    col = (base * (0.30 + 0.75 * wrap) + base * vec3(0.25, 0.3, 0.05) * max(dot(-n, sun), 0.0)) * tint;
  } else {
    col = base * (ambient(n) + 0.70 * d * uSunCol);
    // a highlight that sharpens as the surface gets glossy; metal tints it
    float gloss = 1.0 - rough;
    vec3 hv = normalize(sun + v);
    float spec = pow(max(dot(n, hv), 0.0), mix(4.0, 96.0, gloss * gloss)) * gloss * (0.25 + 1.5 * metal);
    col = mix(col, col * 0.55, metal) + spec * mix(vec3(1.0), base, metal) * d * uSunCol;
    col += fres * (0.06 + 0.3 * metal * gloss);
    if (uPreset == 4) {
      // water: ripples of light, the sky on its surface, foam where a mask says
      float rip = sin(vPos.x * 3.0 + uTime * 1.4) * sin(vPos.z * 2.6 - uTime * 1.1);
      col += vec3(0.5, 0.6, 0.7) * fres * 1.5 + 0.04 * rip;
      if (uAlpha == 0) a = 0.75 + 0.25 * fres;
    }
    if (uPreset == 5) {
      // glass: clear face on, bright at grazing angles
      col = mix(base * 0.6, vec3(0.85, 0.92, 1.0), fres) + spec;
      if (uAlpha == 0) a = 0.28 + 0.6 * fres;
    }
    if (uPreset == 6 && !uHasGlow) emit = max(emit, 1.0);
  }
  // glow: its own colour, whatever the light
  col = mix(col, base, min(emit, 1.0)) + base * max(emit - 1.0, 0.0) * 0.35;
  float f = clamp(length(uEye - vPos) / uFogDist, 0.0, 1.0);
  col = fog(col, normalize(vPos - uEye), f);
  o = vec4(pow(col, vec3(1.0/1.15)), a);
}`;

const GRID_VS = `#version 300 es
layout(location=0) in vec2 aP;
uniform mat4 uVP; uniform float uSize; uniform vec2 uC;
out vec2 vW;
void main() { vW = uC + aP * uSize; gl_Position = uVP * vec4(vW.x, -0.01, vW.y, 1.0); }`;

const GRID_FS = `
in vec2 vW; uniform float uStep; uniform float uSize; uniform vec2 uC; uniform vec3 uLine; uniform float uAlpha;
out vec4 o;
float line(vec2 p, float s) { vec2 g = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s); return 1.0 - min(min(g.x, g.y), 1.0); }
void main() {
  float a = line(vW, uStep) * 0.35 + line(vW, uStep * 5.0) * 0.45;
  float fade = 1.0 - smoothstep(0.35, 1.0, length(vW - uC) / uSize);
  // over a sky, a faint lighter or darker shade of it at the horizon; over the window, the theme's line
  vec4 b = background(normalize(vec3(1.0, 0.02, 0.3)));
  vec3 line = b.a < 0.5 ? uLine : mix(b.rgb, vec3(dot(b.rgb, vec3(0.333)) > 0.5 ? 0.0 : 1.0), 0.3);
  o = vec4(line, a * fade * (b.a < 0.5 ? uAlpha : 0.3));
}`;

// the background: a triangle over the whole view, each pixel the environment's background along its ray
const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP;
out vec2 vN;
void main() { vN = aP; gl_Position = vec4(aP, 0.999, 1.0); }`;
const SKY_FS = `
in vec2 vN; uniform mat4 uInv; uniform vec3 uEye;
out vec4 o;
void main() {
  vec4 p = uInv * vec4(vN, 1.0, 1.0);
  vec4 b = background(normalize(p.xyz / p.w - uEye));
  o = vec4(pow(b.rgb, vec3(1.0/1.15)), b.a);
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); gl.deleteProgram(p); throw new Error(log); }
    gl.attachShader(p, s);
    gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ---- small matrix helpers (column-major) ----
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(e, t, u) {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
// the inverse of a 4 by 4 matrix (column-major), for the rays of the background
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = det ? 1 / det : 0;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

export function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

class GLScene {
  constructor(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false, ...opts });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.canvas = canvas;
    // the light comes from the studio's environment, and changes with it
    this.useEnvironment(environment());
    this.offEnvironment = onEnvironment(e => { try { this.useEnvironment(e); } catch { /* checked when it was saved */ } this.redraw(); });
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    [[3, 0], [3, 12], [3, 24], [2, 36], [1, 44], [3, 48]].forEach(([size, at], i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE, at);
    });
    this.gridVao = gl.createVertexArray();
    gl.bindVertexArray(this.gridVao);
    const gb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    // textures by the hash of their pixels: an image shared by materials, or unchanged, is uploaded once
    this.textures = new Map();
    // smooth or sharp pixels; repeating, or held at its edges for an image laid once on a face
    this.samplers = [0, 1, 2, 3].map(k => {
      const s = gl.createSampler(), wrap = k & 2 ? gl.CLAMP_TO_EDGE : gl.REPEAT;
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, k & 1 ? gl.NEAREST : gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, k & 1 ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, wrap);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, wrap);
      return s;
    });
    this.count = 0;
    this.runs = [];
    this.bounds = [0, 0, 0, 0, 0, 0];
    this.unlit = false;
    this.animated = false;
    this.bytes = 0;
  }

  // builds the shaders with an environment's code; throws (and keeps the ones it had) when it does not compile
  useEnvironment(env) {
    const gl = this.gl, code = env.code;
    const prog = compile(gl, VS, ENV_HEAD + code + FS);
    let grid, sky;
    try { grid = compile(gl, GRID_VS, ENV_HEAD + code + GRID_FS); sky = compile(gl, SKY_VS, ENV_HEAD + code + SKY_FS); }
    catch (e) { gl.deleteProgram(prog); if (grid) gl.deleteProgram(grid); throw e; }
    for (const p of [this.prog, this.gridProg, this.skyProg]) if (p) gl.deleteProgram(p);
    this.prog = prog; this.gridProg = grid; this.skyProg = sky;
    this.env = env;
    const at = (prog, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(prog, n)]));
    this.u = at(prog, ['uVP', 'uEye', 'uFogDist', 'uWindow', 'uPreset', 'uAlpha', 'uHasTex', 'uHasBump', 'uHasMask', 'uUnlitView', 'uRough', 'uMetal', 'uTime', 'uTex', 'uBump', 'uMask', 'uHasRough', 'uHasMetal', 'uHasGlow', 'uRoughMap', 'uMetalMap', 'uGlowMap']);
    this.gu = at(grid, ['uVP', 'uSize', 'uC', 'uStep', 'uLine', 'uAlpha', 'uTime', 'uWindow']);
    this.su = at(sky, ['uInv', 'uEye', 'uTime', 'uWindow']);
    // a sky that moves (it reads uTime) keeps the view drawing
    this.envAnimated = /\buTime\b/.test(code);
  }
  redraw() { if (this.changed) this.changed(); }

  texture(look, i, used) {
    const info = i >= 0 ? look.images[i] : null, gl = this.gl;
    if (!info) return null;
    used.add(info.hash);
    let t = this.textures.get(info.hash);
    if (!t) {
      const im = look.image(i);
      if (!im) return null;
      t = { tex: gl.createTexture(), bytes: im.width * im.height * 4 };
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, im.width, im.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(im.data.buffer));
      gl.generateMipmap(gl.TEXTURE_2D);
      this.textures.set(info.hash, t);
    }
    return t.tex;
  }

  // m: what Graph.mesh gives: { data, count, bounds, groups, look }
  setMesh(m) {
    const gl = this.gl, look = m.look || { materials: [], images: [] }, used = new Set();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.DYNAMIC_DRAW);
    this.count = m.count;
    this.bounds = m.bounds;
    this.runs = (m.groups && m.groups.length ? m.groups : [{ material: 0, first: 0, count: m.count }]).map(g => {
      const mat = look.materials[g.material] || {};
      return {
        first: g.first, count: g.count, preset: PRESETS[mat.material] || 0,
        alpha: mat.alpha === 'cut' ? 1 : mat.alpha === 'blend' ? 2 : 0,
        rough: mat.rough ?? 0.85, metal: mat.metal || 0, pixel: (mat.filter === 'pixel' ? 1 : 0) | (mat.map === 'face' ? 2 : 0),
        tex: this.texture(look, mat.texture ?? -1, used), bump: this.texture(look, mat.bump ?? -1, used), mask: this.texture(look, mat.mask ?? -1, used),
        roughMap: this.texture(look, mat.rough_map ?? -1, used), metalMap: this.texture(look, mat.metal_map ?? -1, used), glowMap: this.texture(look, mat.glow_map ?? -1, used),
      };
    });
    // see-through runs go last, over everything solid
    const through = r => r.alpha === 2 || ((r.preset === 4 || r.preset === 5) && r.alpha === 0);
    this.runs.forEach(r => { r.through = through(r); });
    this.runs.sort((a, b) => a.through - b.through);
    this.animated = this.runs.some(r => r.preset === 3 || r.preset === 4);
    // textures nothing uses any more are freed
    this.bytes = 0;
    for (const [hash, t] of this.textures) {
      if (used.has(hash)) this.bytes += t.bytes * 4 / 3;
      else { gl.deleteTexture(t.tex); this.textures.delete(hash); }
    }
  }

  // view: {target, dist, yaw, pitch}
  draw(view, w, h, { grid = true, bg = null, sky = true } = {}) {
    const gl = this.gl;
    const eye = [
      view.target[0] + view.dist * Math.cos(view.pitch) * Math.sin(view.yaw),
      view.target[1] + view.dist * Math.sin(view.pitch),
      view.target[2] + view.dist * Math.cos(view.pitch) * Math.cos(view.yaw)];
    const vp = mul(perspective(0.75, w / h, Math.max(0.05, view.dist * 0.01), view.dist * 20 + 100), lookAt(eye, view.target, [0, 1, 0]));
    // the window's colour, which an environment can show behind the model or fade into
    const win = bg || cssColor('--bg', [0.06, 0.07, 0.09]);
    const time = performance.now() / 1000 % 3600;
    gl.viewport(0, 0, w, h);
    if (bg) gl.clearColor(bg[0], bg[1], bg[2], 1); else gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);
    if (sky) {
      // the environment's background, over the clear colour
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.skyProg);
      gl.uniformMatrix4fv(this.su.uInv, false, invert(vp));
      gl.uniform3fv(this.su.uEye, eye);
      gl.uniform1f(this.su.uTime, time);
      gl.uniform3fv(this.su.uWindow, win);
      gl.bindVertexArray(this.gridVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    }
    gl.enable(gl.DEPTH_TEST);
    if (this.count) {
      const u = this.u;
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(u.uVP, false, vp);
      gl.uniform3fv(u.uEye, eye);
      gl.uniform3fv(u.uWindow, win);
      gl.uniform1f(u.uFogDist, view.dist * 3.5);
      gl.uniform1f(u.uTime, time);
      gl.uniform1i(u.uUnlitView, this.unlit ? 1 : 0);
      gl.uniform1i(u.uTex, 0); gl.uniform1i(u.uBump, 1); gl.uniform1i(u.uMask, 2);
      gl.uniform1i(u.uRoughMap, 3); gl.uniform1i(u.uMetalMap, 4); gl.uniform1i(u.uGlowMap, 5);
      gl.bindVertexArray(this.vao);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const r of this.runs) {
        gl.uniform1i(u.uPreset, r.preset);
        gl.uniform1i(u.uAlpha, r.alpha);
        gl.uniform1f(u.uRough, r.rough);
        gl.uniform1f(u.uMetal, r.metal);
        [r.tex, r.bump, r.mask, r.roughMap, r.metalMap, r.glowMap].forEach((t, k) => {
          gl.activeTexture(gl.TEXTURE0 + k);
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.bindSampler(k, this.samplers[r.pixel]);
        });
        gl.uniform1i(u.uHasTex, r.tex ? 1 : 0);
        gl.uniform1i(u.uHasBump, r.bump ? 1 : 0);
        gl.uniform1i(u.uHasMask, r.mask ? 1 : 0);
        gl.uniform1i(u.uHasRough, r.roughMap ? 1 : 0);
        gl.uniform1i(u.uHasMetal, r.metalMap ? 1 : 0);
        gl.uniform1i(u.uHasGlow, r.glowMap ? 1 : 0);
        if (r.through) { gl.enable(gl.BLEND); gl.depthMask(false); }
        gl.drawArrays(gl.TRIANGLES, r.first, r.count);
        if (r.through) { gl.disable(gl.BLEND); gl.depthMask(true); }
      }
      for (let k = 0; k < 6; k++) gl.bindSampler(k, null);
      gl.activeTexture(gl.TEXTURE0);
    }
    if (grid) {
      const b = this.bounds, size = Math.max(20, view.dist * 2.5);
      const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, view.dist / 8))));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(this.gridProg);
      gl.uniformMatrix4fv(this.gu.uVP, false, vp);
      gl.uniform1f(this.gu.uSize, size);
      gl.uniform2f(this.gu.uC, (b[0] + b[3]) / 2, (b[2] + b[5]) / 2);
      gl.uniform1f(this.gu.uStep, step);
      gl.uniform3fv(this.gu.uLine, cssColor('--grid-line', [0.5, 0.55, 0.7]));
      gl.uniform1f(this.gu.uAlpha, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-alpha')) || 0.35);
      gl.uniform1f(this.gu.uTime, time);
      gl.uniform3fv(this.gu.uWindow, win);
      gl.bindVertexArray(this.gridVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }
}

export function fitView(bounds, yaw = 0.7, pitch = 0.55, pad = 1.0, aspect = 1) {
  const c = [(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2];
  const r = Math.max(0.5, Math.hypot(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]) / 2);
  const half = Math.min(0.375, Math.atan(Math.tan(0.375) * aspect));
  return { target: c, dist: r / Math.sin(half) * pad, yaw, pitch };
}

// The main view: orbit with the left button, pan with the right one or shift, zoom with the wheel.
export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new GLScene(canvas);
    this.view = { target: [0, 0, 0], dist: 40, yaw: 0.7, pitch: 0.55 };
    this.dirty = true;
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      // a tool's handle under the pointer takes the drag (see handles.js)
      if (this.intercept && this.intercept(e)) return;
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) { if (this.hover) this.hover(e); return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const v = this.view;
      if (drag.pan) {
        const s = v.dist * 0.0016;
        const cx = Math.cos(v.yaw), sx = Math.sin(v.yaw);
        v.target[0] -= (dx * cx - dy * sx * Math.sin(v.pitch)) * s;
        v.target[2] -= (-dx * sx - dy * cx * Math.sin(v.pitch)) * s;
        v.target[1] += dy * Math.cos(v.pitch) * s;
      } else {
        v.yaw -= dx * 0.008;
        v.pitch = Math.max(-0.2, Math.min(1.5, v.pitch + dy * 0.006));
      }
      this.dirty = true;
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.view.dist *= Math.exp(e.deltaY * 0.0012);
      this.dirty = true;
    }, { passive: false });
    new ResizeObserver(() => { this.dirty = true; }).observe(canvas);
    const loop = () => {
      if (this.disposed) return;
      // a view in a hidden tab waits until it is shown, and fits then
      if (this.pendingFit && canvas.clientWidth) { this.pendingFit = false; this.fit(); }
      // foliage sways and water flows: those keep drawing, while the view is on screen
      if ((this.dirty || ((this.scene.animated || this.scene.envAnimated) && canvas.offsetParent)) && canvas.clientWidth) { this.dirty = false; this.draw(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // a closed document gives its WebGL context back
  dispose() {
    this.disposed = true;
    const gl = this.scene.gl;
    if (this.scene.offEnvironment) this.scene.offEnvironment();
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }
  setMesh(m, refit) {
    this.scene.setMesh(m);
    if (refit) this.fit();
    this.dirty = true;
  }
  fit() {
    const c = this.canvas;
    if (!c.clientWidth) { this.pendingFit = true; return; }
    // frame the part of the view that nothing floats over (the params card, below it)
    const W = c.clientWidth || 1, H = c.clientHeight || 1;
    const cover = Math.max(0, Math.min(H * 0.6, this.coverBottom ? this.coverBottom() : 0));
    const v = fitView(this.scene.bounds, this.view.yaw, this.view.pitch, 0.95, W / H);
    if (cover) {
      const b = this.scene.bounds, t = Math.tan(0.375), free = (H - cover) / H;
      const r = Math.max(0.5, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2);
      const half = Math.min(Math.atan(t * free), Math.atan(t * W / H));
      v.dist = r / Math.sin(half) * 0.95;
      // look below the model by half the covered height, so it sits in the free part
      const shift = v.dist * t * cover / H;
      const up = [-Math.sin(v.pitch) * Math.sin(v.yaw), Math.cos(v.pitch), -Math.sin(v.pitch) * Math.cos(v.yaw)];
      v.target = v.target.map((x, k) => x - up[k] * shift);
    }
    this.view = v;
    this.dirty = true;
  }
  // eases the camera to another view over ms milliseconds
  look(to, ms = 280) {
    const from = { ...this.view, target: this.view.target.slice() }, t0 = performance.now();
    let dy = to.yaw - from.yaw;
    dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; // the short way round
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), e = k * k * (3 - 2 * k);
      const mix = (a, b) => a + (b - a) * e;
      this.view = { target: from.target.map((v, i) => mix(v, to.target[i])), dist: Math.exp(mix(Math.log(from.dist), Math.log(to.dist))), yaw: from.yaw + dy * e, pitch: mix(from.pitch, to.pitch) };
      this.dirty = true;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  draw() {
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.scene.draw(this.view, w, h, { grid: true });
    if (this.afterDraw) this.afterDraw();
  }

  // ---- for overlays: the camera in CSS pixels ----
  eye() {
    const v = this.view;
    return [v.target[0] + v.dist * Math.cos(v.pitch) * Math.sin(v.yaw), v.target[1] + v.dist * Math.sin(v.pitch),
      v.target[2] + v.dist * Math.cos(v.pitch) * Math.cos(v.yaw)];
  }
  // where a world point lands on the canvas: [x, y] in CSS pixels, or null behind the camera
  project(p) {
    const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1, v = this.view;
    const vp = mul(perspective(0.75, w / h, Math.max(0.05, v.dist * 0.01), v.dist * 20 + 100), lookAt(this.eye(), v.target, [0, 1, 0]));
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const cw = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (cw <= 1e-6) return null;
    return [(x / cw + 1) / 2 * w, (1 - y / cw) / 2 * h];
  }
  // the ray from the camera through a canvas point (CSS pixels): { origin, dir }
  ray(px, py) {
    const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1, v = this.view;
    const e = this.eye();
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const f = norm([v.target[0] - e[0], v.target[1] - e[1], v.target[2] - e[2]]);
    const r = norm([f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const t = Math.tan(0.75 / 2), nx = (2 * px / w - 1) * t * (w / h), ny = (1 - 2 * py / h) * t;
    return { origin: e, dir: norm([f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny]) };
  }
}

// Node previews: one hidden WebGL canvas renders each preview, then it is copied into the node's 2D canvas.
export class Previewer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.scene = new GLScene(this.canvas, { preserveDrawingBuffer: true });
  }
  render(target, m) {
    const count = m.count, bounds = m.bounds;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(target.clientWidth * dpr) || 400, h = Math.round(target.clientHeight * dpr) || 220;
    if (target.width !== w || target.height !== h) { target.width = w; target.height = h; }
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!count) return;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scene.setMesh(m);
    this.scene.draw(fitView(bounds, 0.75, 0.6, 0.85, w / h), w, h, { grid: false, sky: false });
    ctx.drawImage(this.canvas, 0, 0);
  }
  // draws a mesh from a camera and leaves it in this.canvas (opaque, for pictures)
  shot(m, w, h, view, { grid = true, bg } = {}) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scene.setMesh(m);
    this.scene.draw(view, w, h, { grid, bg });
    return this.canvas;
  }
  // a PNG data URL, for an AI agent or a test: the camera is a preset, or yaw and pitch in degrees
  image(m, { width = 512, height = 384, view = 'iso', yaw, pitch, zoom = 1, grid = true, bg, current } = {}) {
    return this.shot(m, width, height, camera(m.bounds, width / height, { view, yaw, pitch, zoom, current }), { grid, bg }).toDataURL('image/png');
  }
}

// camera presets; front looks along -z, so +x is to the right
export const VIEWS = {
  iso: [40, 32], front: [0, 6], back: [180, 6], left: [-90, 6], right: [90, 6], top: [0, 86], below: [0, -10],
};
// the ray of a view through a point of its picture (fx, fy from 0 to 1, from the top left)
export function viewRay(v, aspect, fx, fy) {
  const e = [v.target[0] + v.dist * Math.cos(v.pitch) * Math.sin(v.yaw), v.target[1] + v.dist * Math.sin(v.pitch), v.target[2] + v.dist * Math.cos(v.pitch) * Math.cos(v.yaw)];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const f = norm([v.target[0] - e[0], v.target[1] - e[1], v.target[2] - e[2]]);
  const r = norm([-f[2], 0, f[0]]);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const t = Math.tan(0.75 / 2), nx = (2 * fx - 1) * t * aspect, ny = (1 - 2 * fy) * t;
  return { origin: e, dir: norm([f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny]) };
}
export function camera(bounds, aspect, { view = 'iso', yaw, pitch, zoom = 1, current } = {}) {
  if (view === 'current' && current) return { target: [...current.target], dist: current.dist / zoom, yaw: current.yaw, pitch: current.pitch };
  const p = VIEWS[view] || VIEWS.iso;
  const rad = Math.PI / 180;
  const v = fitView(bounds, (yaw ?? p[0]) * rad, Math.max(-85, Math.min(86, pitch ?? p[1])) * rad, 0.95, aspect);
  v.dist /= zoom;
  return v;
}

// whether an environment's code compiles: null, or the compiler's message (its lines count from 1)
let checker = null;
export function checkEnvironment(code) {
  if (!checker) checker = document.createElement('canvas').getContext('webgl2');
  if (!checker) return null;
  try {
    for (const [vs, fs] of [[VS, FS], [GRID_VS, GRID_FS], [SKY_VS, SKY_FS]]) checker.deleteProgram(compile(checker, vs, ENV_HEAD + code + fs));
    return null;
  } catch (e) { return String(e.message || e).replace(/\0/g, '').replace(/ERROR: \d+:(\d+): /g, 'line $1: ').trim(); }
}
