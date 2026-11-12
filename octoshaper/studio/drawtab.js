// The Draw tab: a flat editor for anything 2D. A point-list param is edited from
// above, the front or the side; a curve param on its 0 to 1 graph. Points snap to
// a grid, can be typed, and can be mirrored to make the other half of a shape.
import { wheelIntent } from './wheel.js?v=e2bbaab254';
import { curveValue } from './params.js?v=e2bbaab254';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const r3 = v => Math.round(v * 1000) / 1000 + 0;
// across and up on the screen, for each way of looking at 3D points
const PLANES = { top: { a: 0, b: 2, flip: true, label: 'From above (x, z)' }, front: { a: 0, b: 1, flip: false, label: 'From the front (x, y)' }, side: { a: 2, b: 1, flip: false, label: 'From the side (z, y)' } };
const OF_TOOL = { ground: 'top', front: 'front', side: 'side' };

// a point along a line through pts, u from 0 to 1: the same as oc_curve_at in the core
// (core/src/tools.c), so what is drawn here is what the nodes make
export function curveAt(pts, closed, mode, u) {
  const n = pts.length, segs = closed ? n : n - 1;
  if (!n) return [0, 0, 0];
  if (n === 1 || segs <= 0) return pts[0].slice();
  u = Math.min(1, Math.max(0, u)) * segs;
  let k = Math.floor(u);
  if (k >= segs) k = segs - 1;
  const f = u - k, out = [0, 0, 0];
  if (mode === 'round' && n > 2) {
    const c = f < 0.5 ? k : (k + 1) % n, g = f < 0.5 ? 0.5 + f : f - 0.5;
    const ends = !closed && (c === 0 || c === n - 1);
    for (let a = 0; a < 3; a++) {
      const pc = pts[c][a];
      if (ends) {
        const m = c === 0 ? (pc + pts[1][a]) / 2 : (pc + pts[n - 2][a]) / 2;
        out[a] = c === 0 ? pc + (m - pc) * (2 * g - 1) : m + (pc - m) * (2 * g);
      } else {
        const m0 = (pts[(c - 1 + n) % n][a] + pc) / 2, m1 = (pc + pts[(c + 1) % n][a]) / 2;
        out[a] = (1 - g) * (1 - g) * m0 + 2 * g * (1 - g) * pc + g * g * m1;
      }
    }
    return out;
  }
  const i1 = k, i2 = (k + 1) % n;
  const i0 = closed ? (k - 1 + n) % n : Math.max(0, k - 1), i3 = closed ? (k + 2) % n : Math.min(n - 1, k + 2);
  for (let a = 0; a < 3; a++) {
    const p0 = pts[i0][a], p1 = pts[i1][a], p2 = pts[i2][a], p3 = pts[i3][a];
    out[a] = mode !== 'smooth' ? p1 + (p2 - p1) * f
      : 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  }
  return out;
}
// the line as points close enough together to draw, with the segment each lies on
export function curveLine(pts, closed, mode) {
  const n = pts.length, segs = closed && n > 2 ? n : n - 1, per = mode === 'straight' ? 1 : 16, out = [];
  for (let k = 0; k < segs; k++) for (let s = 0; s < per; s++) out.push({ q: curveAt(pts, closed && n > 2, mode, (k + s / per) / segs), seg: k });
  if (n) out.push({ q: closed && n > 2 ? pts[0] : pts[n - 1], seg: Math.max(0, segs - 1) });
  return out;
}

// the other half: what lies on the right of the axis (or before the middle of a curve), mirrored
export function mirrored(pts, a, curve) {
  if (curve) {
    const left = pts.filter(p => p[0] <= 0.5 + 1e-6);
    return [...left, ...left.filter(p => p[0] < 0.5 - 1e-6).reverse().map(p => [r3(1 - p[0]), p[1]])];
  }
  const keep = pts.filter(p => p[a] >= -1e-6);
  return [...keep, ...keep.filter(p => p[a] > 1e-6).reverse().map(p => { const q = p.slice(); q[a] = -q[a]; return q; })];
}

export class DrawPanel {
  // host: { doc(), graph(), live(fn, kind), edit(fn), toast(text) }
  constructor(root, host) {
    this.root = root;
    this.host = host;
    this.name = null;
    this.plane = 'top';
    this.planeOf = new Map(); // the plane chosen for each param
    this.sel = -1;
    this.view = null;         // { cx, cy, zoom }: the middle of the canvas in units, and pixels a unit
    this.stroke = 0;
    this.pick = root.querySelector('.draw-param');
    this.planePick = root.querySelector('.draw-plane');
    this.snapIn = root.querySelector('.draw-snap');
    this.ax = root.querySelector('.draw-x');
    this.ay = root.querySelector('.draw-y');
    this.info = root.querySelector('.draw-info');
    this.canvas = root.querySelector('.draw-canvas');
    this.linePick = root.querySelector('.draw-line');
    this.closedBtn = root.querySelector('[data-act=drawclosed]');
    this.linePick.addEventListener('change', () => this.setLine('curve', this.linePick.value));
    this.closedBtn.addEventListener('click', () => this.setLine('closed', this.closed ? 'open' : 'closed'));
    for (const [k, p] of Object.entries(PLANES)) { const o = h('option', null, p.label); o.value = k; this.planePick.append(o); }
    this.pick.addEventListener('change', () => { this.name = this.pick.value; this.sel = -1; this.view = null; this.update(); });
    this.planePick.addEventListener('change', () => { this.plane = this.planePick.value; this.planeOf.set(this.name, this.plane); this.view = null; this.update(); });
    this.snapIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.snapIn.blur(); });
    this.snapIn.addEventListener('change', () => { const v = parseFloat(this.snapIn.value); this.snap = v > 0 ? v : 0; this.snapSet = true; this.draw(); });
    for (const [inp, k] of [[this.ax, 0], [this.ay, 1]]) {
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value), pts = this.points();
        if (!Number.isFinite(v) || this.sel < 0 || this.sel >= pts.length) { this.fields(); return; }
        // what is typed is the coordinate itself, whichever way the view shows it
        const x = this.axes(), pt = pts[this.sel].slice();
        pt[k ? x.b : x.a] = v;
        if (this.param().kind === 'curve') pt[0] = Math.min(1, Math.max(0, pt[0]));
        pts[this.sel] = pt;
        this.commit(pts, null);
      });
    }
    root.querySelector('[data-act=mirror]').addEventListener('click', () => {
      const p = this.param();
      if (!p) return;
      this.sel = -1;
      this.commit(mirrored(this.points(), this.axes().a, p.kind === 'curve'), null);
    });
    root.querySelector('[data-act=drawfit]').addEventListener('click', () => { this.view = null; this.draw(); });
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('dblclick', e => this.dbl(e));
    c.addEventListener('wheel', e => this.wheel(e), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.tabIndex = 0;
    c.addEventListener('keydown', e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel >= 0) { e.preventDefault(); e.stopPropagation(); this.remove(this.sel); }
    });
    new ResizeObserver(() => this.draw()).observe(c);
  }

  // show this param (from a node's Draw button)
  choose(name) { this.name = name; this.sel = -1; this.view = null; this.update(); }
  param() { return this.host.doc().params.find(p => p.name === this.name) || null; }
  points() { const p = this.param(); return p ? (p.points || []).map(q => q.slice()) : []; }
  axes() { const p = this.param(); return p && p.kind === 'curve' ? { a: 0, b: 1, flip: false } : PLANES[this.plane]; }
  // a point as across and up, and back again (keeping what the plane does not show)
  flat(p) { const x = this.axes(); return [p[x.a], x.flip ? -p[x.b] : p[x.b]]; }
  lift(q, from) {
    const p = this.param(), x = this.axes();
    if (p.kind === 'curve') return [r3(Math.min(1, Math.max(0, q[0]))), r3(q[1])];
    const out = from.slice();
    out[x.a] = r3(q[0]); out[x.b] = r3(x.flip ? -q[1] : q[1]);
    return out;
  }

  update() {
    const doc = this.host.doc();
    const list = doc.params.filter(p => p.kind === 'points' || p.kind === 'curve');
    if (!list.some(p => p.name === this.name)) { this.name = list.length ? list[0].name : null; this.sel = -1; this.view = null; }
    const key = list.map(p => `${p.name}:${p.kind}`).join('|');
    if (key !== this.pickKey) {
      this.pickKey = key;
      this.pick.replaceChildren(...list.map(p => { const o = h('option', null, `${p.name} (${p.kind === 'curve' ? 'curve' : 'points'})`); o.value = p.name; return o; }));
    }
    this.pick.value = this.name || '';
    this.pick.hidden = !list.length;
    const p = this.param(), curve = !!p && p.kind === 'curve';
    // a spline tool on the param says which way it lies, how it snaps, and whether it closes
    const tool = p ? (doc.tools || []).find(t => t.kind === 'spline' && t.binds[0] === p.name) : null;
    const st = (tool && tool.settings) || {};
    if (p && !curve) this.plane = this.planeOf.get(p.name) || OF_TOOL[st.plane && st.plane.text] || 'top';
    // how the line goes: the spline tool's settings, or the first node that follows these points
    const users = p && !curve ? this.users(p.name) : [];
    const said = k => (st[k] && st[k].text) || (users.find(n => n.settings[k] && n.settings[k].set) || users[0] || { settings: {} }).settings[k]?.text;
    this.closed = !curve && said('closed') === 'closed';
    this.mode = curve ? 'smooth' : ['smooth', 'straight', 'round'].includes(said('curve')) ? said('curve') : 'smooth';
    if (document.activeElement !== this.linePick) this.linePick.value = this.mode;
    this.closedBtn.classList.toggle('on', this.closed);
    for (const e of this.root.querySelectorAll('.draw-points')) e.hidden = !p || curve;
    if (!this.snapSet || this.snapFor !== this.name) {
      const ts = parseFloat(st.snap && st.snap.text);
      this.snap = curve ? 0.05 : ts > 0 ? ts : 0.5;
      this.snapFor = this.name; this.snapSet = false;
    }
    if (document.activeElement !== this.snapIn) this.snapIn.value = String(this.snap);
    for (const e of this.root.querySelectorAll('.draw-only')) e.hidden = !p;
    this.planePick.hidden = !p || curve;
    this.planePick.value = this.plane;
    this.info.textContent = p ? '' : 'nothing to draw yet: add a spline tool or a curve in Params, or draw an outline in the 3D view';
    if (p && this.sel >= p.points.length) this.sel = -1;
    this.fields();
    this.draw();
  }
  fields() {
    const pts = this.points(), on = this.sel >= 0 && this.sel < pts.length, p = this.param();
    const x = this.axes(), names = p && p.kind === 'curve' ? ['t', 'v'] : ['xyz'[x.a], 'xyz'[x.b]];
    this.ax.disabled = this.ay.disabled = !on;
    this.ax.previousElementSibling.textContent = names[0];
    this.ay.previousElementSibling.textContent = names[1];
    if (document.activeElement !== this.ax) this.ax.value = on ? String(r3(pts[this.sel][x.a])) : '';
    if (document.activeElement !== this.ay) this.ay.value = on ? String(r3(pts[this.sel][x.b])) : '';
  }

  // the nodes that follow a point-list param: a setting that is just its name, and a curve setting
  users(name) {
    return this.host.doc().nodes.filter(n => n.settings.curve && Object.values(n.settings).some(s => s && s.text === name));
  }
  // curve or closed, set on the spline tool and on every node that follows the points, so they agree
  setLine(key, value) {
    const p = this.param();
    if (!p) return;
    const doc = this.host.doc();
    const tools = (doc.tools || []).filter(t => t.kind === 'spline' && t.binds[0] === p.name);
    const nodes = this.users(p.name).filter(n => n.settings[key]);
    if (!tools.length && !nodes.length) { this.host.toast(`Nothing follows ${p.name} yet: wire it into a node's path, and the line takes its curve from there.`); this.update(); return; }
    this.host.edit(g => {
      for (const t of tools) g.setTool(t.name, key, value);
      for (const n of nodes) g.set(n.id, key, value);
    });
  }

  commit(pts, kind) {
    const p = this.param();
    if (!p) return;
    const name = p.name, curve = p.kind === 'curve';
    if (curve) {
      // a curve reads from left to right; the point being moved stays the selected one
      const selp = this.sel >= 0 ? pts[this.sel] : null;
      pts.sort((u, v) => u[0] - v[0]);
      if (selp) this.sel = pts.indexOf(selp);
    }
    const set = g => (curve ? g.setCurve(name, pts) : g.setPoints(name, pts));
    if (kind) this.host.live(set, kind); else this.host.edit(set);
  }
  remove(k) {
    const pts = this.points(), p = this.param();
    if (pts.length <= (p.kind === 'curve' ? 2 : 1)) return;
    pts.splice(k, 1);
    this.sel = -1;
    this.commit(pts, null);
  }

  // ---- the view ----

  size() {
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr) || 400, hh = Math.round(c.clientHeight * dpr) || 300;
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    return { w, h: hh, dpr };
  }
  fit(s) {
    const p = this.param();
    let lo = [0, 0], hi = [1, 1];
    if (p && p.kind !== 'curve') {
      const f = this.points().map(q => this.flat(q));
      lo = [-4, -4]; hi = [4, 4];
      if (f.length) { lo = [0, 1].map(k => Math.min(...f.map(q => q[k]))); hi = [0, 1].map(k => Math.max(...f.map(q => q[k]))); }
    } else if (p) {
      const vs = p.points.map(q => q[1]);
      lo = [0, Math.min(0, ...vs)]; hi = [1, Math.max(1, ...vs)];
    }
    const span = [Math.max(hi[0] - lo[0], 1e-3), Math.max(hi[1] - lo[1], 1e-3)];
    this.view = { cx: (lo[0] + hi[0]) / 2, cy: (lo[1] + hi[1]) / 2, zoom: Math.min(s.w / span[0], s.h / span[1]) * 0.78 };
    if (p && p.kind !== 'curve') this.view.zoom = Math.min(this.view.zoom, s.h / 4);
  }
  // units to canvas pixels (up is up), and back
  to(q, s) { return [s.w / 2 + (q[0] - this.view.cx) * this.view.zoom, s.h / 2 - (q[1] - this.view.cy) * this.view.zoom]; }
  from(x, y, s) { return [this.view.cx + (x - s.w / 2) / this.view.zoom, this.view.cy - (y - s.h / 2) / this.view.zoom]; }
  local(e, s) { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) * s.dpr, (e.clientY - r.top) * s.dpr]; }
  snapped(q, e) { const st = this.snap; return st > 0 && !(e && e.altKey) ? [Math.round(q[0] / st) * st, Math.round(q[1] / st) * st] : q; }

  draw() {
    const c = this.canvas, ctx = c.getContext('2d'), s = this.size(), p = this.param();
    ctx.clearRect(0, 0, s.w, s.h);
    if (!p) return;
    if (!this.view) this.fit(s);
    const css = getComputedStyle(this.root);
    const ink = css.getPropertyValue('--ct-heading').trim() || '#2b1a6e', line = css.getPropertyValue('--ct-line-strong').trim() || '#d6ccf3';
    const accent = '#14bfa0', curve = p.kind === 'curve';
    // the grid: the snap step, doubled until its lines are apart enough to read
    let step = this.snap > 0 ? this.snap : 0.5;
    while (step * this.view.zoom < 14 * s.dpr) step *= 2;
    const lo = this.from(0, s.h, s), hi = this.from(s.w, 0, s);
    ctx.lineWidth = 1;
    for (let k = Math.ceil(lo[0] / step); k * step <= hi[0]; k++) {
      const x = Math.round(this.to([k * step, 0], s)[0]) + 0.5;
      ctx.strokeStyle = k === 0 ? ink : line; ctx.globalAlpha = k === 0 ? 0.55 : k % 5 === 0 ? 0.9 : 0.45;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s.h); ctx.stroke();
    }
    for (let k = Math.ceil(lo[1] / step); k * step <= hi[1]; k++) {
      const y = Math.round(this.to([0, k * step], s)[1]) + 0.5;
      ctx.strokeStyle = k === 0 ? ink : line; ctx.globalAlpha = k === 0 ? 0.55 : k % 5 === 0 ? 0.9 : 0.45;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s.w, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (curve) {
      // the 0 to 1 range a curve is read over
      const a = this.to([0, 0], s), b = this.to([1, 1], s);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.setLineDash([6 * s.dpr, 5 * s.dpr]);
      ctx.strokeRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    } else {
      // the other point lists, faintly, to draw against
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.22; ctx.lineWidth = 1.5 * s.dpr;
      for (const o of this.host.doc().params) {
        if (o.kind !== 'points' || o.name === p.name || !o.points.length) continue;
        ctx.beginPath();
        o.points.forEach((q, k) => { const t = this.to(this.flat(q), s); if (k) ctx.lineTo(t[0], t[1]); else ctx.moveTo(t[0], t[1]); });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const pts = p.points, scr = pts.map(q => this.to(curve ? q : this.flat(q), s));
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5 * s.dpr; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (curve) {
      for (let x = 0; x <= s.w; x += 3) {
        const t = this.from(x, 0, s)[0], y = this.to([t, curveValue(pts, t)], s)[1];
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
    } else {
      // the line as the nodes make it, and its points joined faintly when it does not pass through them
      curveLine(pts, this.closed, this.mode).forEach(({ q }, k) => { const t = this.to(this.flat(q), s); if (k) ctx.lineTo(t[0], t[1]); else ctx.moveTo(t[0], t[1]); });
      if (this.mode !== 'straight') {
        ctx.stroke();
        ctx.save(); ctx.strokeStyle = ink; ctx.globalAlpha = 0.3; ctx.lineWidth = 1 * s.dpr; ctx.setLineDash([4 * s.dpr, 4 * s.dpr]);
        ctx.beginPath();
        scr.forEach((q, k) => { if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        if (this.closed && scr.length > 2) ctx.closePath();
        ctx.stroke(); ctx.restore();
        ctx.beginPath();
      }
    }
    ctx.stroke();
    scr.forEach((q, k) => {
      ctx.beginPath(); ctx.arc(q[0], q[1], (k === this.sel ? 6.5 : 5) * s.dpr, 0, Math.PI * 2);
      ctx.fillStyle = k === this.sel ? accent : '#ffffff'; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 2 * s.dpr; ctx.stroke();
      if (!curve && k === 0) { ctx.beginPath(); ctx.arc(q[0], q[1], 2 * s.dpr, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill(); }
    });
  }

  // ---- the pointer ----

  // the point under the pointer, or -1; and the stretch of the line under it, or -1
  hit(m, s) {
    const p = this.param(), curve = p.kind === 'curve';
    const scr = p.points.map(q => this.to(curve ? q : this.flat(q), s));
    let best = -1, bd = 10 * s.dpr;
    scr.forEach((q, k) => { const d = Math.hypot(q[0] - m[0], q[1] - m[1]); if (d <= bd) { bd = d; best = k; } });
    if (best >= 0) return { point: best, seg: -1 };
    let seg = -1, sd = 7 * s.dpr;
    // the line as drawn: a press on it adds a point to the segment it is on
    const line = curve ? [] : curveLine(p.points, this.closed, this.mode).map(o => ({ q: this.to(this.flat(o.q), s), seg: o.seg }));
    for (let k = 0; k + 1 < line.length; k++) {
      const a = line[k].q, b = line[k + 1].q, vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((m[0] - a[0]) * vx + (m[1] - a[1]) * vy) / l2));
      const d = Math.hypot(a[0] + vx * t - m[0], a[1] + vy * t - m[1]);
      if (d <= sd) { sd = d; seg = line[k].seg; }
    }
    if (curve && seg < 0) {
      const q = this.from(m[0], m[1], s);
      if (q[0] >= 0 && q[0] <= 1 && Math.abs(this.to([q[0], curveValue(p.points, q[0])], s)[1] - m[1]) <= 7 * s.dpr) seg = p.points.filter(u => u[0] < q[0]).length - 1;
    }
    return { point: -1, seg };
  }

  down(e) {
    const p = this.param();
    if (!p) return;
    const c = this.canvas, s = this.size(), m = this.local(e, s);
    c.focus();
    if (!this.view) this.fit(s);
    const drag = (move, done) => {
      c.setPointerCapture(e.pointerId);
      const up = () => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); if (done) done(); };
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    };
    const f = e.button === 0 ? this.hit(m, s) : { point: -1, seg: -1 };
    if (e.button !== 0 || (f.point < 0 && f.seg < 0)) {
      // the empty canvas, or another button: pan
      const v0 = { ...this.view };
      if (e.button === 0 && this.sel >= 0) { this.sel = -1; this.fields(); this.draw(); }
      drag(ev => { const q = this.local(ev, s); this.view = { ...v0, cx: v0.cx - (q[0] - m[0]) / v0.zoom, cy: v0.cy + (q[1] - m[1]) / v0.zoom }; this.draw(); });
      return;
    }
    e.preventDefault();
    let pts = this.points();
    const kind = `draw:${p.name}:${++this.stroke}`;
    if (f.point < 0) {
      // a press on the line adds a point there, and holds it
      const at = this.snapped(this.from(m[0], m[1], s), e);
      const model = pts[f.seg] || pts[pts.length - 1];
      pts.splice(f.seg + 1, 0, this.lift(at, model));
      this.sel = f.seg + 1;
      this.commit(pts, kind);
    } else this.sel = f.point;
    this.fields();
    this.draw();
    drag(ev => {
      pts = this.points();
      if (this.sel < 0 || this.sel >= pts.length) return;
      const q = this.snapped(this.from(...this.local(ev, s), s), ev);
      pts[this.sel] = this.lift(q, pts[this.sel]);
      this.commit(pts, kind);
    });
  }
  // double-click: a point goes away; the empty canvas gets a new last point
  dbl(e) {
    const p = this.param();
    if (!p) return;
    const s = this.size(), m = this.local(e, s), f = this.hit(m, s);
    if (f.point >= 0) { this.remove(f.point); return; }
    if (f.seg >= 0) return;
    const pts = this.points();
    const model = pts.length ? pts[pts.length - 1] : [0, 0, 0];
    pts.push(this.lift(this.snapped(this.from(m[0], m[1], s), e), model));
    this.sel = p.kind === 'curve' ? -1 : pts.length - 1;
    this.commit(pts, null);
  }
  wheel(e) {
    if (!this.view) return;
    e.preventDefault();
    const s = this.size();
    if (wheelIntent(e) === 'pan') {
      const a = this.from(0, 0, s), b = this.from(e.deltaX, e.deltaY, s);
      this.view.cx += b[0] - a[0]; this.view.cy += b[1] - a[1];
      this.draw();
      return;
    }
    const m = this.local(e, s), before = this.from(m[0], m[1], s);
    this.view.zoom = Math.max(2, Math.min(4000, this.view.zoom * Math.exp(-e.deltaY * 0.0015)));
    const after = this.from(m[0], m[1], s);
    this.view.cx += before[0] - after[0]; this.view.cy += before[1] - after[1];
    this.draw();
  }
}
