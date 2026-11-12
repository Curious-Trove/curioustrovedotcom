// Single shapes in the 3D view. Click a shape to find the node and code line that
// made it. With a shape found, its arrows move it, Turn and Scale change it, the
// swatch recolours it and Delete drops it: each of these writes an edit into a
// `tweak` node after the node that made the shape (the studio adds one when there
// is none). Shape ids stay with their shapes when the graph changes, so the edits
// survive most changes; one whose shape is gone becomes a warning on the tweak.
//
// The brush is here too: with a brush tool painting, a click or a drag on a surface
// adds points to its list, kept `spacing` apart, and Shift takes points away.
//
// The core finds what is under the pointer (octo_node_pick); this only turns the
// pointer into rays and edits into text.
import { colorPicker } from './colorpick.js?v=e2bbaab254';

const HIT = 12;
const AXIS_COLORS = ['#e5484d', '#30a46c', '#3e63dd'];
const PASS = new Set(['merge', 'output']);
const r3 = v => Math.round(v * 1000) / 1000 + 0;
const numText = v => String(r3(v));
const idText = id => (id >>> 0).toString(16);
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const IDENTITY = { move: [0, 0, 0], turn: [0, 0, 0], scale: [1, 1, 1] };

// "[@4f2a move 0 1 0, @91c0 drop]" as [{ id, op, v }]; one number is a scale for
// every axis or a turn around the up axis, as in the core
export function parseEdits(text) {
  const out = [];
  const body = String(text || '').trim().replace(/^\[|\]$/g, '');
  for (const part of body.split(',')) {
    const m = part.trim().match(/^@([0-9a-fA-F]{1,8})\s+([a-z]+)((?:\s+-?[\d.]+)*)$/);
    if (!m) continue;
    let v = m[3].trim() ? m[3].trim().split(/\s+/).map(Number) : [];
    if (v.length === 1 && m[2] === 'scale') v = [v[0], v[0], v[0]];
    if (v.length === 1 && m[2] === 'turn') v = [0, v[0], 0];
    out.push({ id: parseInt(m[1], 16) >>> 0, op: m[2], v });
  }
  return out;
}
export function printEdits(list) {
  const one = e => {
    let v = e.v.map(numText);
    if (e.op === 'scale' && v[0] === v[1] && v[1] === v[2]) v = [v[0]];
    if (e.op === 'turn' && +v[0] === 0 && +v[2] === 0) v = [v[1]];
    return `@${idText(e.id)} ${e.op}${v.length ? ' ' + v.join(' ') : ''}`;
  };
  return `[${list.map(one).join(', ')}]`;
}

export class ShapeTools {
  // host: { graph(), doc(), shown(), edit(fn, opts), live(fn, kind), found(sel), select(name), brush(), toast(text) }
  constructor(viewport, overlay, host) {
    this.vp = viewport;
    this.overlay = overlay;
    this.host = host;
    this.sel = null;     // { eid, name (the node that made it), box }
    this.mode = 'move';
    this.grips = [];
    this.hot = null;
    this.press = null;
    this.stroke = null;
    this.ring = null;    // where the brush is, on a surface
    this.bar = document.createElement('div');
    this.bar.className = 'shape-bar';
    this.bar.hidden = true;
    viewport.canvas.parentElement.append(this.bar);
    this.bar.addEventListener('pointerdown', e => e.stopPropagation());
    viewport.canvas.addEventListener('pointerup', e => this.up(e));
    this.key = e => {
      if (!this.sel || this.overlay.pen || this.overlay.hot) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable)) return;
      if (!viewport.canvas.offsetParent || !this.host.active()) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.drop(); }
      else if (e.key === 'Escape') { this.clear(); }
    };
    window.addEventListener('keydown', this.key);
  }
  dispose() { window.removeEventListener('keydown', this.key); this.bar.remove(); }

  // ---- which node made a shape ----

  // from a node down through the ones that only pass shapes on: the node that made
  // the shape, and the tweak (if any) on the way that already edits it
  maker(id, eid) {
    const doc = this.host.doc(), g = this.host.graph(), byId = new Map(doc.nodes.map(n => [n.id, n]));
    let n = byId.get(id), tweak = null;
    for (let guard = 0; n && guard < 64; guard++) {
      if (n.type === 'tweak') { tweak = tweak || n; n = byId.get(n.inputs[0]); continue; }
      if (!PASS.has(n.type)) break;
      const from = n.inputs.map(i => byId.get(i)).find(m => m && g.elementIndex(m.id, eid) >= 0);
      if (!from) break;
      n = from;
    }
    return n ? { node: n, tweak } : null;
  }

  // the shape under a canvas point, as { hit, node, tweak }, or null
  at(x, y, skip = null) {
    const shown = this.host.shown();
    if (!shown) return null;
    const g = this.host.graph();
    let { origin, dir } = this.vp.ray(x, y);
    for (let k = 0; k < 12; k++) {
      const hit = g.pick(shown.id, origin, dir);
      if (!hit) return null;
      const m = this.maker(shown.id, hit.id);
      if (!skip || !m || !skip(m.node)) return { hit, node: m ? m.node : shown, tweak: m ? m.tweak : null };
      origin = add(hit.point, dir, 0.002); // through it, to what is behind
    }
    return null;
  }

  // what an AI's find_at answers with
  describe(x, y) {
    const f = this.at(x, y);
    if (!f) return null;
    const b = f.hit.box;
    return { node: f.node.name, type: f.node.type, shape: '@' + idText(f.hit.id), index: f.hit.index, position: b.pos.map(r3), size: b.size.map(r3), point: f.hit.point.map(r3), tweak: f.tweak ? f.tweak.name : null };
  }

  find(x, y) {
    const f = this.at(x, y);
    if (!f) { this.clear(); return; }
    this.sel = { eid: f.hit.id, name: f.node.name, box: f.hit.box };
    this.host.found(this.sel);
    this.render();
  }
  clear() {
    if (!this.sel) return;
    this.sel = null;
    this.host.found(null);
    this.render();
  }

  // after every change: where the found shape is now, or nothing if it is gone
  sync() {
    if (this.sel) {
      const shown = this.host.shown(), g = this.host.graph();
      const k = shown ? g.elementIndex(shown.id, this.sel.eid) : -1;
      const e = k >= 0 ? g.element(shown.id, k) : null;
      if (!e) { this.sel = null; this.host.found(null); }
      else {
        this.sel.box = e;
        const m = this.maker(shown.id, this.sel.eid);
        if (m && m.node.name !== this.sel.name) { this.sel.name = m.node.name; this.host.found(this.sel); }
      }
    }
    this.render();
  }

  // ---- the tweak node and its edits ----

  tweakFor(create) {
    const doc = this.host.doc(), shown = this.host.shown();
    const m = shown && this.maker(shown.id, this.sel.eid);
    if (!m) return null;
    if (m.tweak) return m.tweak;
    const after = doc.nodes.find(n => n.type === 'tweak' && n.inputs[0] === m.node.id);
    if (after || !create) return after || null;
    // a new tweak after the maker: everything that read the maker reads the tweak
    const taken = new Set([...doc.params.map(p => p.name), ...(doc.tools || []).map(t => t.name), ...doc.nodes.map(n => n.name)]);
    let name = `${m.node.name}_edit`, k = 1;
    while (taken.has(name)) name = `${m.node.name}_edit${++k}`;
    const readers = [];
    for (const n of doc.nodes) n.inputs.forEach((i, slot) => { if (i === m.node.id) readers.push([n.id, slot]); });
    const showing = shown.id === m.node.id;
    this.host.edit(g => {
      const id = g.add('tweak', m.node.x + 260, m.node.y + 40);
      if (id < 0) return;
      g.rename(id, name);
      g.connect(m.node.id, id, 0);
      for (const [to, slot] of readers) g.connect(id, to, slot);
    }, { kind: 'tweak:' + this.sel.eid });
    // looking at the maker alone would hide the edit: look at the tweak
    if (showing) this.host.select(name);
    return this.host.doc().nodes.find(n => n.name === name) || null;
  }
  edits(t) { return t ? parseEdits(t.settings.edits.text) : []; }
  current(op) {
    const e = this.edits(this.tweakFor(false)).find(x => x.id === this.sel.eid && x.op === op);
    return e ? e.v.slice() : (IDENTITY[op] || []).slice();
  }
  // sets one kind of edit on the found shape; v null takes it away
  write(op, v, live = true) {
    const t = this.tweakFor(true);
    if (!t) return;
    const list = this.edits(t).filter(e => !(e.id === this.sel.eid && e.op === op));
    const same = v && IDENTITY[op] && v.every((x, k) => Math.abs(x - IDENTITY[op][k]) < 1e-6);
    if (v && !same) list.push({ id: this.sel.eid, op, v });
    const text = printEdits(list);
    const run = g => g.set(t.id, 'edits', text);
    if (live) this.host.live(run, 'tweak:' + this.sel.eid);
    else this.host.edit(run, { rebuild: false });
  }
  drop() {
    if (!this.sel) return;
    const name = this.sel.name;
    this.write('drop', [], false);
    this.sel = null;
    this.host.found(null);
    this.render();
    this.host.toast(`Deleted one shape of ${name}: the edit is in the tweak node, and Undo brings it back.`);
  }
  reset() {
    const t = this.tweakFor(false);
    if (!t) return;
    const text = printEdits(this.edits(t).filter(e => e.id !== this.sel.eid));
    this.host.edit(g => g.set(t.id, 'edits', text), { rebuild: false });
  }

  // ---- the bar over a found shape ----

  render() {
    const s = this.sel, bar = this.bar;
    this.vp.dirty = true;
    if (!s) { bar.hidden = true; this.barKey = null; return; }
    const t = this.tweakFor(false);
    const mine = this.edits(t).filter(e => e.id === s.eid);
    const key = `${s.name}|${s.eid}|${this.mode}|${mine.length}`;
    bar.hidden = false;
    if (key === this.barKey) return;
    this.barKey = key;
    bar.textContent = '';
    const btn = (label, title, run, cls = '') => {
      const b = document.createElement('button');
      b.className = 'small ' + cls;
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', run);
      bar.append(b);
      return b;
    };
    const node = this.host.doc().nodes.find(n => n.name === s.name);
    const who = btn(s.name, `Made by ${s.name}${node ? ` (${node.type})` : ''}: click to show that node alone. Its line is marked in the code.`, () => this.host.select(s.name), 'who');
    who.dataset.id = '@' + idText(s.eid);
    for (const [m, label, title] of [['move', 'Move', 'Drag an arrow to move this one shape'], ['turn', 'Turn', 'Drag the ring to turn it'], ['scale', 'Scale', 'Drag a square to stretch it, the middle to scale it whole']]) {
      btn(label, title, () => { this.mode = m; this.render(); }, 'toggle' + (this.mode === m ? ' on' : ''));
    }
    const sw = btn('', 'Recolour this one shape', () => {
      const cur = this.current('color');
      const hex = cur.length === 3 ? '#' + cur.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('') : '#ffffff';
      colorPicker(sw.getBoundingClientRect(), hex, { onInput: c => this.write('color', [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16) / 255)) });
    }, 'swatch');
    const col = mine.find(e => e.op === 'color');
    if (col) sw.style.background = `rgb(${col.v.map(c => Math.round(c * 255)).join(',')})`;
    btn('Delete', 'Drop this one shape (Delete)', () => this.drop(), 'danger');
    if (mine.length) btn('Reset', `Take back the ${mine.length} edit${mine.length === 1 ? '' : 's'} on this shape`, () => this.reset());
  }

  // ---- drawing: the found shape's box and its grips ----

  corners(b) {
    const out = [];
    for (let k = 0; k < 8; k++) {
      let p = b.pos;
      for (let a = 0; a < 3; a++) p = add(p, b.axis[a], (k >> a & 1 ? 0.5 : -0.5) * b.size[a]);
      out.push(p);
    }
    return out;
  }
  // a length in the world that is px pixels on screen at p
  worldLen(p, px) {
    const e = this.vp.eye(), h = this.vp.canvas.clientHeight || 1;
    return px * 2 * Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) * Math.tan(0.375) / h;
  }

  draw(ctx, col) {
    this.grips = [];
    this.drawRing(ctx, col);
    const s = this.sel;
    if (!s) return;
    const b = s.box, c = this.corners(b).map(p => this.vp.project(p));
    if (c.some(p => !p)) { this.bar.style.visibility = 'hidden'; return; }
    ctx.strokeStyle = col.sel;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) for (let a = 0; a < 3; a++) if (!(k >> a & 1)) { const j = k | 1 << a; ctx.moveTo(c[k][0], c[k][1]); ctx.lineTo(c[j][0], c[j][1]); }
    ctx.stroke();
    // the bar sits over the box
    const top = Math.min(...c.map(p => p[1])), mid = (Math.min(...c.map(p => p[0])) + Math.max(...c.map(p => p[0]))) / 2;
    const v = this.vp.canvas, bw = this.bar.offsetWidth || 260;
    Object.assign(this.bar.style, { visibility: '', left: Math.max(6, Math.min(v.clientWidth - bw - 6, mid - bw / 2)) + v.offsetLeft + 'px', top: Math.max(6, top - 46) + v.offsetTop + 'px' });
    const o = this.vp.project(b.pos);
    if (!o) return;
    const len = this.worldLen(b.pos, 62);
    const hotIs = (kind, axis) => this.hot && this.hot.kind === kind && this.hot.axis === axis;
    if (this.mode === 'move' || this.mode === 'scale') {
      for (let a = 0; a < 3; a++) {
        const dir = this.mode === 'move' ? [0, 1, 2].map(k => (k === a ? 1 : 0)) : b.axis[a];
        const q = this.vp.project(add(b.pos, dir, len));
        if (!q) continue;
        const l = Math.hypot(q[0] - o[0], q[1] - o[1]);
        if (l < 8) continue;
        const ux = (q[0] - o[0]) / l, uy = (q[1] - o[1]) / l, hot = hotIs(this.mode, a), sz = hot ? 9 : 7;
        this.grips.push({ kind: this.mode, axis: a, dir, x: q[0], y: q[1] });
        ctx.strokeStyle = AXIS_COLORS[a]; ctx.fillStyle = AXIS_COLORS[a];
        ctx.lineWidth = hot ? 3.5 : 2.5;
        ctx.beginPath(); ctx.moveTo(o[0] + ux * 6, o[1] + uy * 6); ctx.lineTo(q[0] - ux * sz, q[1] - uy * sz); ctx.stroke();
        ctx.beginPath();
        if (this.mode === 'move') {
          ctx.moveTo(q[0] + ux * 3, q[1] + uy * 3);
          ctx.lineTo(q[0] - ux * sz * 1.4 - uy * sz * 0.75, q[1] - uy * sz * 1.4 + ux * sz * 0.75);
          ctx.lineTo(q[0] - ux * sz * 1.4 + uy * sz * 0.75, q[1] - uy * sz * 1.4 - ux * sz * 0.75);
          ctx.closePath();
        } else ctx.rect(q[0] - sz * 0.8, q[1] - sz * 0.8, sz * 1.6, sz * 1.6);
        ctx.fill();
        ctx.strokeStyle = col.fill; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (this.mode === 'scale') {
        const hot = hotIs('whole', -1);
        this.grips.push({ kind: 'whole', axis: -1, x: o[0], y: o[1] });
        ctx.beginPath(); ctx.arc(o[0], o[1], hot ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = col.sel; ctx.fill(); ctx.strokeStyle = col.fill; ctx.lineWidth = 2; ctx.stroke();
      }
    } else {
      // a ring on the ground plane through the shape, and one grip on it
      const turn = this.current('turn')[1] * Math.PI / 180, r = len;
      ctx.strokeStyle = AXIS_COLORS[1]; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = k / 48 * Math.PI * 2, p = this.vp.project([b.pos[0] + Math.cos(a) * r, b.pos[1], b.pos[2] - Math.sin(a) * r]);
        if (!p) continue;
        if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      }
      ctx.stroke();
      const q = this.vp.project([b.pos[0] + Math.cos(turn) * r, b.pos[1], b.pos[2] - Math.sin(turn) * r]);
      if (q) {
        const hot = hotIs('turn', 1);
        this.grips.push({ kind: 'turn', axis: 1, x: q[0], y: q[1] });
        ctx.beginPath(); ctx.arc(q[0], q[1], hot ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = AXIS_COLORS[1]; ctx.fill(); ctx.strokeStyle = col.fill; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    if (this.label) {
      ctx.font = '600 12px system-ui, sans-serif';
      const w = ctx.measureText(this.label).width + 14;
      ctx.fillStyle = col.fill; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(o[0] + 14, o[1] + 10, w, 22, 6) : ctx.rect(o[0] + 14, o[1] + 10, w, 22); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col.sel; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col.text; ctx.fillText(this.label, o[0] + 21, o[1] + 25);
    }
  }

  gripAt(x, y) {
    let best = null, bd = HIT;
    for (const g of this.grips) { const d = Math.hypot(g.x - x, g.y - y); if (d <= bd) { bd = d; best = g; } }
    return best;
  }
  hover(e) {
    const [x, y] = this.overlay.local(e);
    if (this.host.brush()) { const br = this.host.brush(); this.ring = br.stamp ? this.stampAt(x, y, e.shiftKey) : this.surface(x, y, e.shiftKey); this.vp.dirty = true; return; }
    const g = this.gripAt(x, y);
    const same = (g && this.hot && g.kind === this.hot.kind && g.axis === this.hot.axis) || (!g && !this.hot);
    if (same) return;
    this.hot = g ? { kind: g.kind, axis: g.axis } : null;
    this.vp.canvas.classList.toggle('on-handle', !!g);
    this.vp.dirty = true;
  }
  leave() { if (this.ring) { this.ring = null; this.vp.dirty = true; } }

  // how far along a line (from p, along unit d) the pointer's ray comes closest
  along(e, p, d) {
    const { origin: o, dir: r } = this.vp.ray(...this.overlay.local(e));
    const w = sub(o, p), b = dot(d, r), den = 1 - b * b;
    if (den < 1e-5) return null;
    return (dot(w, d) - b * dot(w, r)) / den;
  }
  // the angle around the up axis of the pointer on the shape's ground plane
  angle(e, c) {
    const { origin: o, dir: r } = this.vp.ray(...this.overlay.local(e));
    if (Math.abs(r[1]) < 1e-4) return null;
    const t = (c[1] - o[1]) / r[1];
    if (t <= 0) return null;
    return Math.atan2(-(o[2] + r[2] * t - c[2]), o[0] + r[0] * t - c[0]);
  }

  // the pointer went down and no tool handle took it: true when this does
  down(e) {
    if (e.button !== 0) return false;
    const [x, y] = this.overlay.local(e);
    if (this.host.brush()) return e.altKey ? false : this.host.brush().stamp ? this.stamp(e) : this.paint(e);
    const g = this.sel && this.gripAt(x, y);
    if (!g) { this.press = [e.clientX, e.clientY]; return false; }
    const b = this.sel.box, centre = b.pos.slice();
    const base = this.current(g.kind === 'whole' ? 'scale' : g.kind);
    const s0 = g.dir ? this.along(e, centre, g.dir) : null, a0 = g.kind === 'turn' ? this.angle(e, centre) : null;
    const y0 = e.clientY;
    const canvas = this.vp.canvas;
    canvas.setPointerCapture(e.pointerId);
    document.body.classList.add('no-select');
    const f2 = v => (Math.round(v * 100) / 100).toString().replace('-', '−');
    const move = ev => {
      const fine = ev.shiftKey;
      if (g.kind === 'move') {
        const s = this.along(ev, centre, g.dir);
        if (s == null || s0 == null) return;
        const step = fine ? 0.01 : 0.05, d = Math.round((s - s0) / step) * step;
        const v = base.slice(); v[g.axis] = r3(base[g.axis] + d);
        this.label = `${'xyz'[g.axis]} ${d < 0 ? '−' : '+'}${f2(Math.abs(d))}`;
        this.write('move', v);
      } else if (g.kind === 'scale') {
        const s = this.along(ev, centre, g.dir);
        if (s == null || !s0) return;
        const f = Math.max(0.05, s / s0), v = base.slice();
        v[g.axis] = r3(base[g.axis] * f);
        this.label = `${['width', 'height', 'depth'][g.axis]} × ${f2(v[g.axis])}`;
        this.write('scale', v);
      } else if (g.kind === 'whole') {
        const f = Math.exp((y0 - ev.clientY) / 140), v = base.map(x => r3(x * f));
        this.label = `× ${f2(f)}`;
        this.write('scale', v);
      } else {
        const a = this.angle(ev, centre);
        if (a == null || a0 == null) return;
        const step = fine ? 1 : 5;
        let d = Math.round((a - a0) * 180 / Math.PI / step) * step;
        const v = base.slice();
        v[1] = ((base[1] + d + 540) % 360) - 180;
        this.label = `${f2(v[1])}°`;
        this.write('turn', v);
      }
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      document.body.classList.remove('no-select');
      this.label = null;
      this.vp.dirty = true;
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return true;
  }
  // a click (not an orbit) finds the shape under it
  up(e) {
    const p = this.press;
    this.press = null;
    if (!p || e.button !== 0 || this.overlay.pen || this.host.brush()) return;
    if (Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 4) return;
    this.find(...this.overlay.local(e));
  }

  // ---- the brush ----

  // whether a node's shapes come from a param (so the brush does not paint on what it places)
  uses(node, param, seen = new Map()) {
    if (seen.has(node.id)) return seen.get(node.id);
    seen.set(node.id, false);
    const re = new RegExp(`(^|[^\\w.])${param}($|[^\\w])`);
    const doc = this.host.doc();
    let yes = Object.values(node.settings).some(s => s.set && re.test(s.text));
    if (!yes) yes = node.inputs.some(i => { const m = doc.nodes.find(n => n.id === i); return m && this.uses(m, param, seen); });
    seen.set(node.id, yes);
    return yes;
  }
  // the point under the pointer: on a shape, else on the ground. erasing also lands on what the brush placed
  surface(x, y, erasing) {
    const br = this.host.brush();
    if (!br) return null;
    const seen = new Map();
    const f = this.at(x, y, erasing ? null : n => this.uses(n, br.param, seen));
    if (f) return { point: f.hit.point, normal: f.hit.normal };
    const { origin: o, dir: d } = this.vp.ray(x, y);
    if (d[1] > -1e-4) return null;
    const t = -o[1] / d[1];
    return { point: add(o, d, t), normal: [0, 1, 0] };
  }
  paint(e) {
    const br = this.host.brush();
    const canvas = this.vp.canvas;
    let pts = br.points.map(p => p.slice()), changed = false;
    const touch = ev => {
      const erasing = ev.shiftKey || br.erase;
      const s = this.surface(...this.overlay.local(ev), erasing);
      this.ring = s;
      if (!s) return;
      const near = p => Math.hypot(p[0] - s.point[0], p[1] - s.point[1], p[2] - s.point[2]);
      if (erasing) {
        const keep = pts.filter(p => near(p) > Math.max(br.spacing, 0.25));
        if (keep.length === pts.length) return;
        pts = keep;
      } else {
        if (pts.some(p => near(p) < Math.max(br.spacing, 0.05))) return;
        pts.push(s.point.map(v => Math.round(v * 100) / 100 + 0));
      }
      changed = true;
      const list = pts.map(p => p.slice());
      this.host.live(g => g.setPoints(br.param, list), 'brush:' + br.param);
    };
    canvas.setPointerCapture(e.pointerId);
    document.body.classList.add('no-select');
    touch(e);
    const up = () => {
      canvas.removeEventListener('pointermove', touch);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      document.body.classList.remove('no-select');
      if (changed) this.host.painted(br);
    };
    canvas.addEventListener('pointermove', touch);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return true;
  }
  // ---- the stamp: cells added and taken away by hand ----

  // the cell a point is in
  cellOf(p, size) { return [Math.round(p[0] / size), Math.floor(p[1] / size + 1e-4), Math.round(p[2] / size)]; }
  // the cell under the pointer: the one a click would add (beside the side pointed at, or on the
  // ground), or with erasing the one pointed at. { cell, axis, erase }, or null
  stampAt(x, y, erasing) {
    const br = this.host.brush();
    if (!br) return null;
    const f = this.at(x, y);
    const s = br.size;
    if (f) {
      const n = f.hit.normal, axis = [0, 1, 2].reduce((a, k) => (Math.abs(n[k]) > Math.abs(n[a]) ? k : a), 0);
      const step = [0, 0, 0];
      step[axis] = (n[axis] < 0 ? -1 : 1) * (erasing ? -1 : 1) * s / 2;
      return { cell: this.cellOf(add(f.hit.point, step, 1), s), axis, erase: !!erasing, size: s };
    }
    if (erasing) return null;
    const { origin: o, dir: d } = this.vp.ray(x, y);
    if (d[1] > -1e-4) return null;
    const p = add(o, d, -o[1] / d[1]);
    return { cell: this.cellOf([p[0], s / 2, p[2]], s), axis: 1, erase: false, size: s };
  }
  stamp(e) {
    const br = this.host.brush();
    const canvas = this.vp.canvas, s = br.size;
    const cells = new Map(br.cells.map(c => [c.slice(0, 3).join(), c.slice()]));
    let changed = false, plane = null;
    // each press is its own step to undo
    this.stamps = (this.stamps || 0) + 1;
    const kind = `stamp:${br.param}:${this.stamps}`;
    const touch = ev => {
      const erasing = ev.shiftKey;
      const [x, y] = this.overlay.local(ev);
      let at = null;
      if (plane && !erasing) {
        // a drag lays cells on the layer of the first one
        const { origin: o, dir: d } = this.vp.ray(x, y), a = plane.axis;
        if (Math.abs(d[a]) > 1e-4) {
          const t = (plane.at - o[a]) / d[a];
          if (t > 0) at = { cell: this.cellOf(add(o, d, t), s), axis: a, erase: false, size: s };
        }
      } else at = this.stampAt(x, y, erasing);
      this.ring = at;
      this.vp.dirty = true;
      if (!at) return;
      const key = at.cell.join();
      if (erasing) { if (!cells.delete(key)) return; }
      else {
        if (!plane) plane = { axis: at.axis, at: at.axis === 1 ? (at.cell[1] + 0.5) * s : at.cell[at.axis] * s };
        const have = cells.get(key);
        if (have && have[3] === br.value) return;
        cells.set(key, [...at.cell, br.value]);
      }
      changed = true;
      const list = [...cells.values()];
      this.host.live(g => g.setCells(br.param, list), kind);
    };
    canvas.setPointerCapture(e.pointerId);
    document.body.classList.add('no-select');
    touch(e);
    const up = () => {
      canvas.removeEventListener('pointermove', touch);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      document.body.classList.remove('no-select');
      if (changed) this.host.painted(br);
    };
    canvas.addEventListener('pointermove', touch);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return true;
  }
  // the outline of the cell a click would add or take away
  drawCell(ctx, col, s) {
    const z = s.size, c = [s.cell[0] * z, (s.cell[1] + 0.5) * z, s.cell[2] * z];
    const corner = k => this.vp.project([c[0] + (k & 1 ? 0.5 : -0.5) * z, c[1] + (k & 2 ? 0.5 : -0.5) * z, c[2] + (k & 4 ? 0.5 : -0.5) * z]);
    ctx.strokeStyle = s.erase ? '#e0564a' : col.sel; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) for (const b of [1, 2, 4]) {
      if (k & b) continue;
      const p = corner(k), q = corner(k | b);
      if (!p || !q) continue;
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
  }
  drawRing(ctx, col) {
    const br = this.host.brush(), s = this.ring;
    if (!br || !s) return;
    if (br.stamp) { if (s.cell) this.drawCell(ctx, col, s); return; }
    // a circle of the spacing, lying on the surface
    const n = s.normal, ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const u = norm(cross(n, ref)), v = cross(n, u), r = Math.max(br.spacing, 0.05) / 2;
    ctx.strokeStyle = col.sel; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 32; k++) {
      const a = k / 32 * Math.PI * 2, p = this.vp.project(add(add(s.point, u, Math.cos(a) * r), v, Math.sin(a) * r));
      if (!p) continue;
      if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
    }
    ctx.stroke();
    const c = this.vp.project(s.point);
    if (c) { ctx.beginPath(); ctx.arc(c[0], c[1], 2.5, 0, Math.PI * 2); ctx.fillStyle = col.sel; ctx.fill(); }
  }
}
