// The octolang core in the browser: a thin wrapper over octo.wasm's flat exports.

const enc = new TextEncoder(), dec = new TextDecoder();

export async function loadOcto(url = 'octo.wasm') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load the core (${url}: ${res.status} ${res.statusText})`);
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
  return new Octo(instance.exports);
}

class Octo {
  constructor(w) {
    this.w = w;
    const g = w.graph_new();
    this.types = JSON.parse(this.str(w.types_json(g)));
    w.graph_free(g);
    this.typeMap = Object.fromEntries(this.types.map(t => [t.name, t]));
    const g2 = w.graph_new();
    this.toolKinds = JSON.parse(this.str(w.tool_kinds_json(g2)));
    w.graph_free(g2);
    this.toolKindMap = Object.fromEntries(this.toolKinds.map(t => [t.name, t]));
  }
  // a NUL-terminated copy of s in wasm memory; free with release
  cstr(s) {
    const b = enc.encode(s);
    const p = this.w.alloc(b.length + 1);
    const m = new Uint8Array(this.w.memory.buffer, p, b.length + 1);
    m.set(b); m[b.length] = 0;
    return [p, b.length];
  }
  str(p) { return p ? dec.decode(new Uint8Array(this.w.memory.buffer, p, this.w.last_len())) : ''; }
  with(strings, fn) {
    const ptrs = strings.map(s => s == null ? [0, 0] : this.cstr(s));
    try { return fn(...ptrs.map(p => p[0]), ptrs); } finally { for (const [p] of ptrs) if (p) this.w.release(p); }
  }
  graph() { return new Graph(this); }
}

export class Graph {
  constructor(octo) { this.o = octo; this.w = octo.w; this.g = this.w.graph_new(); }
  free() { this.w.graph_free(this.g); this.g = 0; }
  parse(src) { return this.o.with([src], (p, ptrs) => this.w.parse(this.g, p, ptrs[0][1])); }
  text(layout = false) { return this.o.str(this.w.text(this.g, layout ? 1 : 0)); }
  json() { return JSON.parse(this.o.str(this.w.json(this.g))); }
  add(type, x, y) { return this.o.with([type], t => this.w.node_add(this.g, t, x, y)); }
  remove(id) { return this.w.node_remove(this.g, id); }
  rename(id, name) { return this.o.with([name], n => this.w.node_rename(this.g, id, n)); }
  set(id, key, text) { return this.o.with([key, text], (k, t) => this.w.node_set(this.g, id, k, t)); }
  connect(from, to, slot) { return this.w.node_connect(this.g, from, to, slot); }
  disconnect(to, slot) { return this.w.node_disconnect(this.g, to, slot); }
  move(id, x, y) { return this.w.node_move(this.g, id, x, y); }
  find(name) { return this.o.with([name], n => this.w.node_find(this.g, n)); }
  output() { return this.w.output(this.g); }
  addParam(name, v, lo, hi) { return this.o.with([name], n => this.w.param_add(this.g, n, v, lo, hi)); }
  removeParam(name) { return this.o.with([name], n => this.w.param_remove(this.g, n)); }
  renameParam(from, to) { return this.o.with([from, to], (a, b) => this.w.param_rename(this.g, a, b)); }
  paramRange(name, lo, hi) { return this.o.with([name], n => this.w.param_range(this.g, n, lo, hi)); }
  comment(id, text) { return this.o.with([text || ''], t => this.w.node_comment(this.g, id, t)); }
  setParam(name, v) { return this.o.with([name], n => this.w.param_set(this.g, n, v)); }
  // ---- point lists and tools ----
  floats(list) {
    const p = this.w.alloc(list.length * 4 + 4);
    new Float32Array(this.w.memory.buffer, p, list.length).set(list);
    return p;
  }
  addPoints(name, pts) {
    const p = this.floats(pts.flat());
    try { return this.o.with([name], n => this.w.param_add_points(this.g, n, p, pts.length)); } finally { this.w.release(p); }
  }
  setPoints(name, pts) {
    const p = this.floats(pts.flat());
    try { return this.o.with([name], n => this.w.param_set_points(this.g, n, p, pts.length)); } finally { this.w.release(p); }
  }
  addCurve(name, pts) {
    const p = this.floats(pts.flat());
    try { return this.o.with([name], n => this.w.param_add_curve(this.g, n, p, pts.length)); } finally { this.w.release(p); }
  }
  setCurve(name, pts) {
    const p = this.floats(pts.flat());
    try { return this.o.with([name], n => this.w.param_set_curve(this.g, n, p, pts.length)); } finally { this.w.release(p); }
  }
  // cells: [x, y, z, value] each
  addCells(name, cells) {
    const p = this.floats(cells.flat());
    try { return this.o.with([name], n => this.w.param_add_cells(this.g, n, p, cells.length)); } finally { this.w.release(p); }
  }
  setCells(name, cells) {
    const p = this.floats(cells.flat());
    try { return this.o.with([name], n => this.w.param_set_cells(this.g, n, p, cells.length)); } finally { this.w.release(p); }
  }
  // what was painted on a paint node: { width, height, data } with a byte a pixel (the number of a
  // colour of its palette, 255 for clear), or null when nothing was
  paint(id) {
    const p = this.w.node_paint(this.g, id), width = this.w.paint_width(), height = this.w.paint_height();
    return p && width && height ? { width, height, data: new Uint8Array(this.w.memory.buffer, p, width * height).slice() } : null;
  }
  setPaint(id, data, width, height) {
    const p = this.w.alloc(width * height + 1);
    new Uint8Array(this.w.memory.buffer, p, width * height).set(data);
    try { return this.w.node_set_paint(this.g, id, p, width, height); } finally { this.w.release(p); }
  }
  // a paint node's brushstrokes, as the lines of its paint block (core/src/stroke.c)
  strokes(id) { return this.o.str(this.w.node_strokes(this.g, id)); }
  setStrokes(id, text) { return this.o.with([text], t => this.w.node_set_strokes(this.g, id, t)); }
  vec(xyz) { new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32).set(xyz, 0); }
  addVector(name, xyz, lo = 0, hi = 0) { return this.o.with([name], n => { this.vec(xyz); return this.w.param_add_vector(this.g, n, lo, hi); }); }
  setVector(name, xyz) { return this.o.with([name], n => { this.vec(xyz); return this.w.param_set_vector(this.g, n); }); }
  // bounds: [x0, y0, z0, x1, y1, z1]
  addBounds(name, box, lo = 0, hi = 0) { return this.o.with([name], n => { this.vec(box); return this.w.param_add_box(this.g, n, lo, hi); }); }
  setBounds(name, box) { return this.o.with([name], n => { this.vec(box); return this.w.param_set_box(this.g, n); }); }
  tools() { return JSON.parse(this.o.str(this.w.tools_json(this.g))); }
  toolIndex(name) { return this.o.with([name], n => this.w.tool_find(this.g, n)); }
  addTool(name, kind, binds) { return this.o.with([name, kind, binds.join('\0') + '\0'], (n, k, b) => this.w.tool_add(this.g, n, k, b, binds.length)); }
  removeTool(name) { return this.o.with([name], n => this.w.tool_remove(this.g, n)); }
  setTool(name, key, text) { return this.o.with([name, key, text], (n, k, t) => this.w.tool_set(this.g, n, k, t)); }
  // the point on a handle's line or plane under a ray, or null
  projectHandle(tool, handle, origin, dir) {
    const v = new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32);
    v.set(origin, 0); v.set(dir, 3);
    if (this.w.handle_project(this.g, tool, handle) < 0) return null;
    const r = new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32); // memory may have grown
    return [r[6], r[7], r[8]];
  }
  // moves a handle to target; returns the handle's index afterwards, or -1
  dragHandle(tool, handle, target) {
    const v = new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32);
    v.set(target, 6);
    return this.w.handle_drag(this.g, tool, handle);
  }
  removeHandle(tool, handle) { return this.w.handle_remove(this.g, tool, handle); }
  // ---- files that `use` and `picture` read: provide(path, text or bytes), then eval again; json().wanted lists what is missing ----
  provide(path, text) {
    if (text == null) return this.o.with([path], p => this.w.file_provide(this.g, p, 0, 0));
    if (text instanceof Uint8Array) {
      const q = this.w.alloc(text.length + 1);
      new Uint8Array(this.w.memory.buffer, q, text.length).set(text);
      try { return this.o.with([path], p => this.w.file_provide(this.g, p, q, text.length)); } finally { this.w.release(q); }
    }
    return this.o.with([path, text], (p, t, ptrs) => this.w.file_provide(this.g, p, t, ptrs[1][1]));
  }
  // ---- finding shapes ----
  box() {
    const r = new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32);
    return { pos: [r[12], r[13], r[14]], axis: [[r[15], r[16], r[17]], [r[18], r[19], r[20]], [r[21], r[22], r[23]]], size: [r[24], r[25], r[26]] };
  }
  // the first shape of a node's output under a ray, or null:
  // { index, id, distance, point, normal, node (which made it), sourceIndex, box }
  pick(id, origin, dir) {
    const v = new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32);
    v.set(origin, 0); v.set(dir, 3);
    const index = this.w.pick(this.g, id);
    if (index < 0) return null;
    const r = new Float32Array(this.w.memory.buffer, this.w.vec_buf(), 32);
    return { index, id: this.w.hit_id() >>> 0, distance: this.w.hit_distance(), point: [r[6], r[7], r[8]], normal: [r[9], r[10], r[11]],
      node: this.w.hit_node(), sourceIndex: this.w.hit_source_index(), box: this.box() };
  }
  // one shape of a node: { id, box }, or null
  element(id, index) {
    if (!this.w.element_box(this.g, id, index)) return null;
    return { id: this.w.element_id() >>> 0, index, ...this.box() };
  }
  // which of a node's shapes has this id, or -1
  elementIndex(id, eid) { return this.w.element_find(this.g, id, eid); }
  elementCount(id) { return this.w.element_count(this.g, id); }
  // how many different meshes a node's shapes are: equal shapes are one, drawn once for each
  meshCount(id) { return this.w.node_meshes(this.g, id); }
  autolayout(all = false) { this.w.autolayout(this.g, all ? 1 : 0); }
  eval() { return this.w.eval(this.g); }
  // a binary glTF file of a node's output, copied out of wasm memory
  glb(id) {
    const p = this.w.glb(this.g, id), n = this.w.last_len();
    return p && n ? new Uint8Array(this.w.memory.buffer, p, n).slice() : null;
  }
  // copies the triangles out of wasm memory: 15 floats a vertex (position, normal, colour, uv, glow, colour over),
  // in runs of one material each (groups)
  mesh(id) {
    const p = this.w.mesh(this.g, id), n = this.w.mesh_count();
    const data = n ? new Float32Array(this.w.memory.buffer, p, n * VERTEX).slice() : new Float32Array(0);
    const bounds = Array.from(new Float32Array(this.w.memory.buffer, this.w.mesh_bounds(), 6));
    const gc = n ? this.w.mesh_group_count() : 0, gi = gc ? new Int32Array(this.w.memory.buffer, this.w.mesh_groups(), gc * 3) : [];
    const groups = [];
    for (let k = 0; k < gc; k++) groups.push({ material: gi[k * 3], first: gi[k * 3 + 1], count: gi[k * 3 + 2] });
    return { data, count: n, bounds, groups, look: this.look() };
  }
  // the materials and images of the last evaluation; an image's pixels come from image(i)
  look() {
    const l = JSON.parse(this.o.str(this.w.look_json(this.g)));
    l.image = i => this.image(i);
    return l;
  }
  pixels(p) {
    if (!p) return null;
    const width = this.w.image_width(), height = this.w.image_height();
    return { width, height, hash: this.w.image_hash() >>> 0, data: new Uint8ClampedArray(this.w.memory.buffer, p, width * height * 4).slice() };
  }
  image(i) { return this.pixels(this.w.image(this.g, i)); }
  // what an image node made: { width, height, data (rgba), hash }, or null
  nodeImage(id) { return this.pixels(this.w.node_image(this.g, id)); }
  png(id) {
    const p = this.w.png(this.g, id), n = this.w.last_len();
    return p && n ? new Uint8Array(this.w.memory.buffer, p, n).slice() : null;
  }
}

export const VERTEX = 15; // floats a vertex
