// The tools' handles in the 3D view. The core says where each handle is, what it
// moves along and what a drag does (octo_tool_* in core/src/tools.c); this only
// draws them over the view and turns the pointer into rays.
//
// Handles show for every tool when "Tools" is on in the view's header, and for the
// selected tool only when it is off. Drag a handle to change its params; drag the
// small handle between two spline points to add a point; double-click a spline
// point to take it out. A position has an arrow per axis: the core gives the
// position and the axis, and the arrow's length is picked here, on screen. A
// spline shows the arrows of the point last grabbed, or of the one under the pointer.
// A spline's points move in its plane, so only the arrow out of the plane shows;
// hold Shift while dragging a point to keep it on one axis. Press anywhere on a
// spline's line to add a point there, and Delete removes the point under the pointer.
// The coordinates of a point show while it is dragged.
//
// The pen (startPen) draws points in a plane (the ground unless told otherwise):
// click to add points, on a snapping grid; click the first point (on a closed
// line), double-click or press Enter to finish, Backspace takes the last point
// back, Escape stops. Dragging still orbits.

import { KEYS, keysCard } from './keys.js?v=e2bbaab254';

const HIT = 11; // px
const ARROW = 56; // px, an axis arrow's length on screen
const AXIS_COLORS = ['#e5484d', '#30a46c', '#3e63dd'];
const PEN_SNAP = 0.5;
const axisOf = d => (Math.abs(d[0]) > 0.5 ? 0 : Math.abs(d[1]) > 0.5 ? 1 : 2);

export class ToolOverlay {
  // doc: { graph, viewport, tools(), live(toolName), commit(), selected, select(name) }
  constructor(viewport, host) {
    this.vp = viewport;
    this.host = host;
    this.tools = [];
    this.showAll = true;
    this.hot = null;   // { tool, handle } under the pointer
    this.drag = null;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tool-overlay';
    viewport.canvas.after(this.canvas);
    viewport.afterDraw = () => this.draw();
    viewport.intercept = e => this.down(e);
    viewport.hover = e => this.move(e);
    viewport.canvas.addEventListener('dblclick', e => this.dbl(e));
    viewport.canvas.addEventListener('pointerleave', () => { if (!this.drag) this.setHot(null); if (this.shapes) this.shapes.leave(); if (this.pen) { this.pen.at = null; this.vp.dirty = true; } });
    viewport.canvas.addEventListener('pointerup', e => this.penUp(e));
    // Delete or Backspace takes out the spline point under the pointer
    window.addEventListener('keydown', e => {
      if (this.pen || this.drag || !this.hot || !this.hot.removable || !(e.key === 'Delete' || e.key === 'Backspace')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
      const t = this.tools[this.hot.tool], h = this.hot.handle;
      if (!t) return;
      e.preventDefault();
      this.hot = null;
      this.host.edit(g => g.removeHandle(g.toolIndex(t.name), h));
    });
    this.pen = null;
  }

  // ---- the pen: a new outline drawn on the ground ----

  // opts: axis out of the plane (1, the ground), offset (its height), snap, closed, onEnd
  startPen(done, { axis = 1, offset = 0, snap = PEN_SNAP, closed = true, onEnd = null } = {}) {
    this.stopPen();
    const key = e => {
      if (!this.pen) return;
      if (e.key === 'Escape') { e.preventDefault(); this.stopPen(); }
      else if (e.key === 'Enter') { e.preventDefault(); this.finishPen(); }
      else if (e.key === 'Backspace') { e.preventDefault(); this.pen.pts.pop(); this.vp.dirty = true; }
    };
    this.pen = { pts: [], at: null, done, key, down: null, axis, offset, snap, closed, onEnd, min: closed ? 3 : 2 };
    // what the keys do while drawing, in the same card as everywhere else
    const [title, rows] = KEYS.pen;
    this.penCard = keysCard([[title, rows.filter(r => closed || r[0] !== 'Close an outline')]], 'pinned');
    this.vp.canvas.parentElement.append(this.penCard);
    window.addEventListener('keydown', key, true);
    this.vp.canvas.classList.add('pen');
    this.vp.dirty = true;
  }
  stopPen() {
    if (!this.pen) return;
    const end = this.pen.onEnd;
    window.removeEventListener('keydown', this.pen.key, true);
    if (this.penCard) { this.penCard.remove(); this.penCard = null; }
    this.pen = null;
    if (end) end();
    this.vp.canvas.classList.remove('pen');
    this.vp.dirty = true;
  }
  finishPen() {
    const p = this.pen;
    if (!p) return;
    const pts = p.pts.slice();
    this.stopPen();
    if (pts.length >= p.min) p.done(pts);
  }
  // the snapped point in the pen's plane under the pointer, or null
  ground(e) {
    const { origin: o, dir: d } = this.vp.ray(...this.local(e));
    const p = this.pen, a = p.axis;
    if (Math.abs(d[a]) < 1e-4) return null;
    const t = (p.offset - o[a]) / d[a];
    if (t <= 0) return null;
    const snap = v => Math.round(Math.round(v / p.snap) * p.snap * 1000) / 1000 + 0;
    return [0, 1, 2].map(k => k === a ? p.offset : snap(o[k] + d[k] * t));
  }
  penUp(e) {
    const p = this.pen;
    if (!p || e.button !== 0 || !p.down) return;
    const moved = Math.hypot(e.clientX - p.down[0], e.clientY - p.down[1]);
    p.down = null;
    if (moved > 4) return; // an orbit, not a click
    const q = this.ground(e);
    if (!q) return;
    const last = p.pts[p.pts.length - 1], first = p.pts[0];
    if (p.closed && p.pts.length >= 3) {
      const a = this.vp.project(first), [x, y] = this.local(e);
      if (a && Math.hypot(a[0] - x, a[1] - y) <= HIT) { this.finishPen(); return; }
    }
    if (last && last[0] === q[0] && last[2] === q[2]) return; // the second click of a double-click
    p.pts.push(q);
    this.vp.dirty = true;
  }
  drawPen(ctx, col) {
    const p = this.pen, pts = p.at ? [...p.pts, p.at] : p.pts;
    const sc = pts.map(q => this.vp.project(q));
    ctx.strokeStyle = col.sel;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    sc.forEach((a, k) => { if (a) { if (k) ctx.lineTo(a[0], a[1]); else ctx.moveTo(a[0], a[1]); } });
    ctx.stroke();
    if (p.closed && sc.length >= 3 && sc[0] && sc[sc.length - 1]) {
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(...sc[sc.length - 1]); ctx.lineTo(...sc[0]); ctx.stroke();
      ctx.setLineDash([]);
    }
    sc.forEach((a, k) => {
      if (!a) return;
      ctx.beginPath(); ctx.arc(a[0], a[1], k === sc.length - 1 && p.at ? 3.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = col.fill; ctx.fill(); ctx.stroke();
    });
  }

  set(tools) { this.tools = tools; this.vp.dirty = true; }
  visible(t) { return !t.error && (this.showAll || t.name === this.host.selected); }

  colors() {
    const css = getComputedStyle(document.documentElement);
    return {
      line: css.getPropertyValue('--ct-violet').trim() || '#7c5cff',
      sel: css.getPropertyValue('--ct-coral').trim() || '#ff7a59',
      fill: css.getPropertyValue('--ct-surface').trim() || '#fff',
      text: css.getPropertyValue('--ct-ink').trim() || '#1d1739',
    };
  }

  draw() {
    const c = this.canvas, v = this.vp.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = v.clientWidth, h = v.clientHeight;
    Object.assign(c.style, { left: v.offsetLeft + 'px', top: v.offsetTop + 'px', width: w + 'px', height: h + 'px' });
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const col = this.colors();
    this.screen = [];
    this.segs = [];
    if (this.pen) { this.drawPen(ctx, col); return; }
    this.tools.forEach((t, ti) => {
      if (!this.visible(t)) return;
      const sel = t.name === this.host.selected;
      ctx.strokeStyle = sel ? col.sel : col.line;
      ctx.lineWidth = sel ? 2.5 : 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const inserts = t.kind === 'spline' ? t.handles.filter(x => x.role === 'insert').length : 0;
      const points = t.handles.filter(x => x.role === 'move').length;
      const perSeg = inserts ? Math.max(1, Math.round(t.lines.length / 6 / inserts)) : 0;
      for (let k = 0; k + 5 < t.lines.length + 0; k += 6) {
        const a = this.vp.project(t.lines.slice(k, k + 3)), b = this.vp.project(t.lines.slice(k + 3, k + 6));
        if (!a || !b) continue;
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        if (perSeg) this.segs.push({ tool: ti, handle: points + Math.min(inserts - 1, Math.floor(k / 6 / perSeg)), a, b });
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      // a spline's arrows show for one point at a time: the one last grabbed, or under the pointer
      const owners = new Set(t.handles.filter(x => x.role === 'axis').map(x => x.of));
      const shows = hd => {
        if (t.kind === 'spline') {
          const own = t.handles[hd.of];
          if (own && Math.abs(own.dir[0] * hd.dir[0] + own.dir[1] * hd.dir[1] + own.dir[2] * hd.dir[2]) < 0.5) return false;
        }
        if (owners.size <= 1) return true;
        const a = this.active, h = this.hot;
        if (a && a.tool === t.name && a.point === hd.of) return true;
        return !!(h && h.tool === ti && (h.handle === hd.of || (t.handles[h.handle] && t.handles[h.handle].role === 'axis' && t.handles[h.handle].of === hd.of)));
      };
      // arrows first, so the middle handle sits on top of them
      const order = t.handles.map((hd, hi) => hi).sort((a, b) => (t.handles[b].role === 'axis') - (t.handles[a].role === 'axis'));
      order.forEach(hi => {
        const hd = t.handles[hi];
        const p = this.vp.project(hd.pos);
        if (!p) return;
        const hot = this.hot && this.hot.tool === ti && this.hot.handle === hi;
        if (hd.role === 'axis') {
          if (!shows(hd)) return;
          const tip = this.arrowTip(hd);
          const q = tip && this.vp.project(tip);
          if (!q) return;
          const ax = axisOf(hd.dir);
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (len < 6) return; // pointing at the camera: nothing to grab
          this.screen.push({ tool: ti, handle: hi, x: q[0], y: q[1], role: 'axis', axis: ax });
          const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len, s = hot ? 9 : 7;
          ctx.strokeStyle = AXIS_COLORS[ax]; ctx.fillStyle = AXIS_COLORS[ax];
          ctx.lineWidth = hot ? 3.5 : 2.5;
          ctx.beginPath(); ctx.moveTo(p[0] + ux * 7, p[1] + uy * 7); ctx.lineTo(q[0] - ux * s, q[1] - uy * s); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(q[0] + ux * 3, q[1] + uy * 3);
          ctx.lineTo(q[0] - ux * s * 1.4 - uy * s * 0.75, q[1] - uy * s * 1.4 + ux * s * 0.75);
          ctx.lineTo(q[0] - ux * s * 1.4 + uy * s * 0.75, q[1] - uy * s * 1.4 - ux * s * 0.75);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = col.fill; ctx.lineWidth = 1.5; ctx.stroke();
          return;
        }
        this.screen.push({ tool: ti, handle: hi, x: p[0], y: p[1], role: hd.role, removable: hd.removable });
        ctx.beginPath();
        if (hd.role === 'insert') {
          const r = hot ? 6 : 4;
          ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.fillStyle = col.fill; ctx.fill();
          ctx.strokeStyle = sel ? col.sel : col.line; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p[0] - r + 1.5, p[1]); ctx.lineTo(p[0] + r - 1.5, p[1]);
          ctx.moveTo(p[0], p[1] - r + 1.5); ctx.lineTo(p[0], p[1] + r - 1.5);
          ctx.stroke();
        } else {
          const r = hot ? 8 : 6;
          // a handle that moves along a line is a diamond, one that moves on the ground a disc
          if (hd.on === 'line') { ctx.moveTo(p[0], p[1] - r - 1); ctx.lineTo(p[0] + r + 1, p[1]); ctx.lineTo(p[0], p[1] + r + 1); ctx.lineTo(p[0] - r - 1, p[1]); ctx.closePath(); }
          else ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.fillStyle = sel || hot ? col.sel : col.line; ctx.fill();
          ctx.strokeStyle = col.fill; ctx.lineWidth = 2; ctx.stroke();
        }
      });
    });
    if (this.shapes) this.shapes.draw(ctx, col);
    this.drawLabel(ctx, col);
  }

  // the dragged point's coordinates, beside it
  drawLabel(ctx, col) {
    const d = this.drag;
    if (!d || !d.moved) return;
    const t = this.tools.find(x => x.name === d.tool), hd = t && t.handles[d.handle];
    if (!hd || hd.role !== 'move') return;
    const p = this.vp.project(hd.pos);
    if (!p) return;
    const n = hd.dir, f = v => (Math.round(v * 100) / 100).toString().replace('-', '\u2212');
    const parts = [0, 1, 2].filter(a => t.kind !== 'spline' || Math.abs(n[a]) < 0.5).map(a => `${'xyz'[a]} ${f(hd.pos[a])}`);
    const text = parts.join('   ') + (d.lock != null ? `   (${'xyz'[d.lock]} only)` : '');
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = col.fill; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p[0] + 12, p[1] - 30, w, 22, 6) : ctx.rect(p[0] + 12, p[1] - 30, w, 22); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = col.sel; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col.text; ctx.fillText(text, p[0] + 19, p[1] - 15);
  }

  // an arrow's tip in the world: ARROW pixels from the position, along its axis
  arrowTip(hd) {
    const e = this.vp.eye(), h = this.vp.canvas.clientHeight || 1;
    const dist = Math.hypot(hd.pos[0] - e[0], hd.pos[1] - e[1], hd.pos[2] - e[2]);
    const len = ARROW * 2 * dist * Math.tan(0.375) / h;
    return [hd.pos[0] + hd.dir[0] * len, hd.pos[1] + hd.dir[1] * len, hd.pos[2] + hd.dir[2] * len];
  }

  pick(e) {
    const r = this.vp.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = HIT;
    // later handles are drawn on top; move handles win over insert ones at the same spot
    for (const s of this.screen || []) {
      const d = Math.hypot(s.x - x, s.y - y) + (s.role === 'insert' ? 3 : 0);
      if (d <= bd) { bd = d; best = s; }
    }
    if (best) return best;
    // on a spline's line: its segment's insert handle, which adds a point where pressed
    let ld = 6;
    for (const g of this.segs || []) {
      const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - g.a[0]) * dx + (y - g.a[1]) * dy) / l2));
      const d = Math.hypot(g.a[0] + dx * u - x, g.a[1] + dy * u - y);
      if (d <= ld) { ld = d; best = { tool: g.tool, handle: g.handle, x, y, role: 'insert', onLine: true }; }
    }
    return best;
  }
  local(e) { const r = this.vp.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  setHot(h) {
    const same = (h && this.hot && h.tool === this.hot.tool && h.handle === this.hot.handle) || (!h && !this.hot);
    if (same) return;
    this.hot = h ? { tool: h.tool, handle: h.handle, removable: !!h.removable, onLine: !!h.onLine } : null;
    this.vp.canvas.classList.toggle('on-handle', !!h);
    this.vp.canvas.title = h ? (h.onLine ? 'Press to add a point here' : h.role === 'insert' ? 'Drag to add a point' : h.role === 'axis' ? `Drag to move along ${'xyz'[h.axis]}` : h.removable ? 'Drag to move (Shift: one axis) · double-click or Delete to remove' : 'Drag to change') : '';
    this.vp.dirty = true;
  }

  move(e) {
    if (this.pen) { this.pen.at = this.ground(e); this.vp.dirty = true; return; }
    const s = this.pick(e);
    // hovering a spline point brings up its arrows, which stay while the pointer goes to them
    if (s && s.role === 'move' && this.tools[s.tool].kind === 'spline') {
      const t = this.tools[s.tool].name;
      if (!this.active || this.active.tool !== t || this.active.point !== s.handle) { this.active = { tool: t, point: s.handle }; this.vp.dirty = true; }
    }
    this.setHot(s);
    if (!s && this.shapes) this.shapes.hover(e);
  }

  down(e) {
    if (e.button !== 0) return false;
    if (this.pen) { this.pen.down = [e.clientX, e.clientY]; return false; }
    // a brush that is painting takes every press; else a handle does, then a shape's grips
    if (this.shapes && this.shapes.host.brush()) return this.shapes.down(e);
    const s = this.pick(e);
    if (!s) return this.shapes ? this.shapes.down(e) : false;
    const t = this.tools[s.tool];
    const g = this.host.graph(), index = g.toolIndex(t.name);
    const { origin, dir } = this.vp.ray(...this.local(e));
    const p0 = g.projectHandle(index, s.handle, origin, dir);
    if (!p0) return true;
    const hp = t.handles[s.handle].pos;
    const offset = s.onLine ? [0, 0, 0] : [hp[0] - p0[0], hp[1] - p0[1], hp[2] - p0[2]];
    this.drag = { tool: t.name, index, handle: s.handle, offset, moved: false, start: hp.slice(), normal: t.handles[s.handle].dir.slice(), lock: null, spline: t.kind === 'spline' };
    const grabbed = t.handles[s.handle];
    if (grabbed.role === 'move' && t.kind === 'spline') this.active = { tool: t.name, point: s.handle };
    this.host.select(t.name);
    const canvas = this.vp.canvas;
    canvas.setPointerCapture(e.pointerId);
    document.body.classList.add('no-select');
    const move = ev => {
      const d = this.drag;
      const r = this.vp.ray(...this.local(ev));
      const gg = this.host.graph();
      const p = gg.projectHandle(d.index, d.handle, r.origin, r.dir);
      if (!p) return;
      const target = [p[0] + d.offset[0], p[1] + d.offset[1], p[2] + d.offset[2]];
      // Shift keeps a spline point on the in-plane axis it has moved along most
      d.lock = null;
      if (ev.shiftKey && d.spline) {
        let best = -1, bv = -1;
        for (let a = 0; a < 3; a++) if (Math.abs(d.normal[a]) < 0.5 && Math.abs(target[a] - d.start[a]) > bv) { bv = Math.abs(target[a] - d.start[a]); best = a; }
        for (let a = 0; a < 3; a++) if (a !== best && Math.abs(d.normal[a]) < 0.5) target[a] = d.start[a];
        d.lock = best;
      }
      const next = gg.dragHandle(d.index, d.handle, target);
      if (next >= 0) {
        if (next !== d.handle) { d.offset = [0, 0, 0]; d.start = target.slice(); this.active = { tool: d.tool, point: next }; } // a new point: it sits under the pointer
        d.handle = next;
        d.moved = true;
        this.hot = { tool: s.tool, handle: next };
        this.host.live(d.tool);
      }
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      document.body.classList.remove('no-select');
      const d = this.drag;
      this.drag = null;
      this.vp.dirty = true;
      if (d && d.moved) this.host.commit(d.tool);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return true;
  }

  dbl(e) {
    if (this.pen) { if (this.pen.pts.length >= this.pen.min) this.finishPen(); return; }
    const s = this.pick(e);
    if (!s || !s.removable) return;
    const t = this.tools[s.tool];
    this.host.edit(g => g.removeHandle(g.toolIndex(t.name), s.handle));
  }
}
