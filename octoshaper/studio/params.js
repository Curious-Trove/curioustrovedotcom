// The graph's params: the `param` lines of the code, as a card of sliders, and its
// tools (the `tool` lines), which edit params with handles in the 3D view. In the
// graph panel each param can also be renamed, given a range or removed, and tools
// can be added and removed.
import { popup } from './menu.js?v=e2bbaab254';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const num = v => String(Math.round(v * 10000) / 10000);
// the button that opens a param's range and remove: a pencil
const PENCIL = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M11.2 2.3a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3L6 12.5l-3.2.8.8-3.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.8 3.7l2.5 2.5" stroke="currentColor" stroke-width="1.6"/></svg>';
const editButton = (title, open) => {
  const b = h('button', 'pmore pedit' + (open ? ' on' : ''));
  b.innerHTML = PENCIL;
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
};

// what "+ Add tool" makes: the tool and fresh params for it
const TOOL_PRESETS = [
  { label: 'Drag a value', hint: 'drag', kind: 'drag', tool: 'lift', params: [{ name: 'height', value: 6, lo: 0, hi: 30 }] },
  { label: 'Radius', hint: 'radius', kind: 'radius', tool: 'area', params: [{ name: 'radius', value: 8, lo: 1, hi: 40 }] },
  { label: 'Bounds', hint: 'a box', kind: null, tool: 'area', params: [{ name: 'area', bounds: [-8, 0, -8, 8, 4, 8] }] },
  { label: 'Position', hint: 'x y z', kind: null, tool: 'spot', params: [{ name: 'spot', vector: [0, 0, 0] }] },
  { label: 'Spline', hint: 'spline', kind: 'spline', tool: 'curve', params: [{ name: 'path', points: [[-12, 0, 0], [0, 0, 8], [12, 0, 0]] }] },
  { label: 'Brush', hint: 'place by hand', kind: 'brush', tool: 'brush', params: [{ name: 'spots', points: [] }], paint: true },
  { label: 'Stamp', hint: 'build with cells', kind: 'stamp', tool: 'build', params: [{ name: 'blocks', cells: [[0, 0, 0, 1]] }], stamp: true },
  { label: 'Draw an outline', hint: 'in 3D', draw: true },
];

// a curve param at t: the same smooth line through its points as the core draws
// (oc_curve_value in core/src/expr.c)
export function curveValue(pts, t) {
  const n = pts.length;
  if (!n) return 0;
  if (n === 1 || !(t > pts[0][0])) return pts[0][1];
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  let k = 0;
  while (k + 2 < n && t >= pts[k + 1][0]) k++;
  const hh = pts[k + 1][0] - pts[k][0];
  if (!(hh > 1e-9)) return pts[k + 1][1];
  const d = [0, 1, 2].map(i => {
    const a = Math.max(0, Math.min(n - 2, k - 1 + i)), w = pts[a + 1][0] - pts[a][0];
    return w > 1e-9 ? (pts[a + 1][1] - pts[a][1]) / w : 0;
  });
  const m = [0, 1].map(i => d[i] * d[i + 1] <= 0 ? 0 : 2 * d[i] * d[i + 1] / (d[i] + d[i + 1]));
  const u = (t - pts[k][0]) / hh, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * pts[k][1] + (u3 - 2 * u2 + u) * hh * m[0] + (-2 * u3 + 3 * u2) * pts[k + 1][1] + (u3 - u2) * hh * m[1];
}

export class ParamsCard {
  // edit(fn) runs fn(graph) and refreshes; live(name, v) sets a value while dragging;
  // tools: { selected(), select(name) } for the tools' rows
  constructor(root, { editable, edit, live, toast, tools, lines }) {
    this.root = root;
    this.editable = editable;
    this.edit = edit;
    this.live = live;
    this.toolHost = tools || { selected: () => null, select: () => {} };
    this.toast = toast || (() => {});
    this.lines = lines || null; // Draw and Flat on spline tools (the 3D view's card)
    this.open = new Set();
    this.key = null;
  }

  render(doc) {
    this.doc = doc;
    const tools = doc.tools || [];
    const key = doc.params.map(p => p.kind === 'cells' ? `${p.name}:c${p.cells.length}` : p.kind === 'points' ? `${p.name}:[${p.points.length}]` : `${p.name}:${p.kind}:${p.lo}:${p.hi}`).join('|') + [...this.open].join() +
      '#' + tools.map(t => `${t.name}:${t.kind}:${t.binds.join(',')}:${t.error || ''}:${t.implicit}`).join('|') + '#' + this.toolHost.selected() + (this.lines ? `#${this.lines.drawing()}#${this.lines.flatOn()}#${this.lines.painting()}#${this.lines.stampValue()}` : '');
    if (key !== this.key) { this.key = key; this.build(doc); }
    doc.params.forEach((p, k) => {
      const row = this.rows[k];
      if (row && row.vec) row.vec.forEach((inp, a) => { if (document.activeElement !== inp) inp.value = num(p.value[a]); });
      if (row && row.curve) row.curve(p.points);
      if (!row || !row.range) return;
      if (document.activeElement !== row.range) row.range.value = p.value;
      row.range.style.setProperty('--fill', `${(100 * (p.value - p.lo) / ((p.hi - p.lo) || 1)).toFixed(1)}%`);
      if (document.activeElement !== row.value) row.value.value = num(p.value);
    });
    this.root.closest('.params-panel, .graph-params').classList.toggle('empty', !doc.params.length && !tools.length);
  }

  build(doc) {
    // rebuilding must not move the card's scroll (opening a param's details, say)
    const scroller = this.root.closest('.graph-params, .params-panel');
    const top = scroller ? scroller.scrollTop : 0;
    this.buildRows(doc);
    if (scroller) scroller.scrollTop = top;
  }

  buildRows(doc) {
    this.root.replaceChildren();
    this.rows = [];
    for (const p of doc.params) {
      const wrap = h('div', 'param-wrap');
      const row = h('div', 'param' + (p.kind === 'points' ? ' points' : ''));
      let name;
      if (this.editable) {
        name = h('input', 'pname');
        name.value = p.name;
        name.spellcheck = false;
        name.title = 'Rename: every setting that uses it follows';
        name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); if (e.key === 'Escape') { name.value = p.name; name.blur(); } });
        name.addEventListener('change', () => {
          const v = name.value.trim();
          if (!v || v === p.name) { name.value = p.name; return; }
          let res = -1;
          this.edit(g => { res = g.renameParam(p.name, v); });
          if (res < 0) { name.value = p.name; this.toast(`${v} can't be a param name: it is taken, built in, or not a name`); }
        });
      } else name = h('span', 'pname', p.name);
      if (p.kind === 'points') {
        // a point list: edited with a spline tool, or in the code
        const n = p.points.length;
        const info = h('span', 'pinfo', `${n} point${n === 1 ? '' : 's'}`);
        info.title = p.points.map(q => q.join(' ')).join(', ');
        row.append(name, info, h('span'));
        wrap.append(row);
        if (this.editable) {
          const more = editButton('Edit: remove', this.open.has(p.name));
          more.addEventListener('click', () => { this.open.has(p.name) ? this.open.delete(p.name) : this.open.add(p.name); this.key = null; this.render(this.doc || doc); });
          row.append(more);
          if (this.open.has(p.name)) {
            const d = h('div', 'param-details');
            const del = h('button', 'small danger', 'Remove');
            del.addEventListener('click', () => { this.open.delete(p.name); this.edit(g => g.removeParam(p.name)); });
            d.append(h('span', 'hint', 'Edit the points with a spline tool, or in the code.'), del);
            wrap.append(d);
          }
        }
        this.root.append(wrap);
        this.rows.push({});
        continue;
      }
      if (p.kind === 'cells') {
        // cells: built with a stamp tool, or written in the code
        const n = p.cells.length;
        row.classList.add('points');
        const info = h('span', 'pinfo', `${n} cell${n === 1 ? '' : 's'}`);
        row.append(name, info, h('span'));
        wrap.append(row);
        if (this.editable) {
          const more = editButton('Edit: remove', this.open.has(p.name));
          more.addEventListener('click', () => { this.open.has(p.name) ? this.open.delete(p.name) : this.open.add(p.name); this.key = null; this.render(this.doc || doc); });
          row.append(more);
          if (this.open.has(p.name)) {
            const d = h('div', 'param-details');
            const del = h('button', 'small danger', 'Remove');
            del.addEventListener('click', () => { this.open.delete(p.name); this.edit(g => g.removeParam(p.name)); });
            d.append(h('span', 'hint', 'Build the cells with a stamp tool, or in the code.'), del);
            wrap.append(d);
          }
        }
        this.root.append(wrap);
        this.rows.push({});
        continue;
      }
      if (p.kind === 'vector' || p.kind === 'bounds') {
        this.root.append(this.vectorRow(doc, p, name));
        continue;
      }
      if (p.kind === 'curve') {
        this.root.append(this.curveRow(doc, p, name));
        continue;
      }
      const step = (p.hi - p.lo) > 10 && Number.isInteger(p.value) ? 1 : (p.hi - p.lo) / 100;
      const range = h('input');
      range.type = 'range';
      range.min = p.lo; range.max = p.hi; range.step = step;
      range.addEventListener('input', () => this.live(p.name, parseFloat(range.value)));
      const value = h('input', 'pvalue');
      value.spellcheck = false;
      value.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') value.blur(); });
      value.addEventListener('change', () => {
        const v = parseFloat(value.value);
        if (!Number.isFinite(v)) return;
        // typing a value outside the range widens it
        this.edit(g => {
          if (v < p.lo || v > p.hi) g.paramRange(p.name, Math.min(p.lo, v), Math.max(p.hi, v));
          g.setParam(p.name, v);
        });
      });
      row.append(name, range, value);
      wrap.append(row);
      if (this.editable) {
        const more = editButton('Edit the range, or remove', this.open.has(p.name));
        more.addEventListener('click', () => { this.open.has(p.name) ? this.open.delete(p.name) : this.open.add(p.name); this.key = null; this.render(this.doc || doc); });
        row.append(more);
        if (this.open.has(p.name)) wrap.append(this.details(p));
      }
      this.root.append(wrap);
      this.rows.push({ range, value });
    }
    this.buildTools(doc);
    if (this.editable) {
      // one button for every kind of param: a number, a position, a point list, a curve or cells
      const fresh = base => {
        const names = new Set([...doc.params.map(p => p.name), ...(doc.tools || []).map(t => t.name), ...doc.nodes.map(n => n.name)]);
        let k = 1, name = base;
        while (names.has(name)) name = `${base}${++k}`;
        return name;
      };
      const focusName = name => {
        const last = [...this.root.querySelectorAll('input.pname')].find(i => i.value === name);
        if (last) { last.focus(); last.select(); }
      };
      const KINDS = [
        { label: 'Number', hint: 'a slider', run: () => { const n = fresh('amount'); this.edit(g => g.addParam(n, 1, 0, 10)); focusName(n); } },
        { label: 'Position', hint: 'x y z, with a handle', run: () => { const n = fresh('spot'); this.edit(g => g.addVector(n, [0, 0, 0], -20, 20)); focusName(n); } },
        { label: 'Bounds', hint: 'a box, with handles', run: () => { const n = fresh('area'); this.edit(g => g.addBounds(n, [-8, 0, -8, 8, 4, 8], -60, 60)); focusName(n); } },
        { label: 'Point list', hint: 'a path to draw', run: () => { const n = fresh('path'); this.edit(g => g.addPoints(n, [[-10, 0, 0], [0, 0, 6], [10, 0, 0]])); focusName(n); } },
        { label: 'Curve', hint: 'a profile, as name(t)', run: () => {
          const n = fresh('profile');
          this.edit(g => g.addCurve(n, [[0, 0], [0.5, 0.8], [1, 1]]));
          this.toast(`New curve ${n}: use it in a setting as ${n}(t), or with any value from 0 to 1.`);
        } },
        { label: 'Cells', hint: 'places on a grid', run: () => { const n = fresh('cells'); this.edit(g => g.addCells(n, [[0, 0, 0, 1]])); focusName(n); } },
      ];
      const add = h('button', 'small add-param', '+ Add param');
      add.title = 'A number, a position, a point list, a curve or cells. Or type a new name into any setting';
      add.addEventListener('click', () => {
        const r = add.getBoundingClientRect();
        popup(KINDS, null, { x: r.left, y: r.bottom + 4 });
      });
      const addTool = h('button', 'small add-param', '+ Add tool');
      addTool.title = 'A handle in the 3D view that sets params';
      addTool.addEventListener('click', () => {
        const r = addTool.getBoundingClientRect();
        popup(TOOL_PRESETS.map(t => ({ label: t.label, hint: t.hint, run: () => this.addTool(doc, t) })), null, { x: r.left, y: r.bottom + 4 });
      });
      const buttons = h('div', 'param-buttons');
      buttons.append(add, addTool);
      this.root.append(buttons);
    }
  }

  // a curve: its points on a small graph. Drag a point, click the line to add one,
  // double-click a point to remove it. Settings call it as name(t).
  curveRow(doc, p, name) {
    const wrap = h('div', 'param-wrap');
    const row = h('div', 'param points');
    const info = h('span', 'pinfo', `${p.name}(t)`);
    info.title = 'A curve: use it in a setting as ' + p.name + '(t), with any value from 0 to 1 in place of t';
    row.append(name, info, h('span'));
    wrap.append(row);
    const c = h('canvas', 'curve-edit');
    c.title = 'Drag a point · click to add one · double-click a point to remove it';
    wrap.append(c);
    let pts = p.points.map(q => q.slice()), drag = -1;
    const span = () => { const vs = pts.map(q => q[1]); return [Math.min(0, ...vs), Math.max(1, ...vs)]; };
    const PAD = 7;
    const xy = q => { const [lo, hi] = span(), w = c.clientWidth - PAD * 2, hh = c.clientHeight - PAD * 2; return [PAD + q[0] * w, PAD + (1 - (q[1] - lo) / (hi - lo)) * hh]; };
    const at = e => { const r = c.getBoundingClientRect(), [lo, hi] = span(); return [Math.max(0, Math.min(1, (e.clientX - r.left - PAD) / (r.width - PAD * 2))), lo + (1 - (e.clientY - r.top - PAD) / (r.height - PAD * 2)) * (hi - lo)]; };
    const near = e => { const r = c.getBoundingClientRect(); return pts.findIndex(q => { const [x, y] = xy(q); return Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top)) < 9; }); };
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth, hh = c.clientHeight;
      if (!w) return;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
      const g = c.getContext('2d'), css = getComputedStyle(c);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, hh);
      g.strokeStyle = css.getPropertyValue('--ct-line') || '#ccc';
      g.lineWidth = 1;
      for (const v of [0, 1]) { const y = xy([0, v])[1]; g.beginPath(); g.moveTo(PAD, y); g.lineTo(w - PAD, y); g.stroke(); }
      g.strokeStyle = css.getPropertyValue('--ct-violet') || '#6d5ccc';
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k <= 64; k++) { const [x, y] = xy([k / 64, curveValue(pts, k / 64)]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = css.getPropertyValue('--ct-surface') || '#fff';
      for (const q of pts) { const [x, y] = xy(q); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.stroke(); }
    };
    const send = () => { this.live(p.name, { curve: pts.map(q => q.slice()) }); };
    const round = v => Math.round(v * 100) / 100;
    c.addEventListener('pointerdown', e => {
      e.preventDefault();
      drag = near(e);
      if (drag < 0) {
        if (pts.length >= 16) { this.toast('A curve has at most 16 points'); return; }
        const q = at(e).map(round);
        drag = pts.findIndex(o => o[0] > q[0]);
        if (drag < 0) drag = pts.length;
        pts.splice(drag, 0, q);
        send();
      }
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      if (drag < 0) { c.style.cursor = near(e) >= 0 ? 'grab' : 'crosshair'; return; }
      const q = at(e).map(round);
      const lo = drag ? pts[drag - 1][0] : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] : 1;
      pts[drag] = [Math.max(lo, Math.min(hi, q[0])), q[1]];
      send();
    });
    const up = () => { drag = -1; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', e => {
      const k = near(e);
      if (k < 0 || pts.length <= 2) return;
      // the click that began the double-click added nothing: it landed on the point
      pts.splice(k, 1);
      send();
    });
    if (this.editable) {
      const more = editButton('Edit: remove', this.open.has(p.name));
      more.addEventListener('click', () => { this.open.has(p.name) ? this.open.delete(p.name) : this.open.add(p.name); this.key = null; this.render(this.doc || doc); });
      row.append(more);
      if (this.open.has(p.name)) {
        const d = h('div', 'param-details');
        const del = h('button', 'small danger', 'Remove');
        del.addEventListener('click', () => { this.open.delete(p.name); this.edit(g => g.removeParam(p.name)); });
        d.append(h('span', 'hint', `Use it in a setting as ${p.name}(t).`), del);
        wrap.append(d);
      }
    }
    this.rows.push({ curve: next => { if (drag < 0) pts = next.map(q => q.slice()); draw(); } });
    requestAnimationFrame(draw);
    return wrap;
  }

  // the tools, one row each: click to show its handles (when not all are shown)
  buildTools(doc) {
    // a position's own tool is its row in the params
    const tools = (doc.tools || []).filter(t => !t.implicit);
    if (!tools.length) return;
    this.root.append(h('div', 'tools-title', 'Tools'));
    for (const t of tools) {
      const wrap = h('div', 'param-wrap');
      const row = h('div', 'tool-row' + (t.name === this.toolHost.selected() ? ' selected' : '') + (t.error ? ' bad' : ''));
      row.append(h('span', 'tname', t.name), h('span', 'tsig', `${t.kind}(${t.binds.join(', ')})`));
      row.title = t.error || 'Click to show its handles in the 3D view';
      row.addEventListener('click', () => this.toolHost.select(t.name === this.toolHost.selected() ? null : t.name));
      if (this.lines && t.kind === 'spline' && !t.error) {
        const act = (label, on, title, run) => {
          const b = h('button', 'small toggle tool-act' + (on ? ' on' : ''), label);
          b.title = title;
          b.addEventListener('click', e => { e.stopPropagation(); run(t.name); });
          return b;
        };
        row.append(
          act('Draw', this.lines.drawing() === t.name, 'Draw its points again: click to add them, Enter (or the first point, on a closed line) to finish, Escape to stop', this.lines.draw),
          act('Flat', this.lines.flatOn() === t.name, 'Look straight at its plane; again to go back', this.lines.flat));
      }
      if (this.lines && t.kind === 'brush' && !t.error) {
        const b = h('button', 'small toggle tool-act' + (this.lines.painting() === t.name ? ' on' : ''), 'Paint');
        b.title = 'Click or drag on surfaces in the 3D view to place points; Shift takes them away. Again, or Escape, to stop';
        b.addEventListener('click', e => { e.stopPropagation(); this.lines.paint(t.name); });
        row.append(b);
      }
      if (this.lines && t.kind === 'stamp' && !t.error) {
        const on = this.lines.painting() === t.name;
        if (on) {
          const v = h('input', 'pvalue stamp-value');
          v.value = String(this.lines.stampValue());
          v.title = 'The value new cells get (also the keys 1 to 9): settings read it as value, to tell kinds of cell apart';
          v.addEventListener('click', e => e.stopPropagation());
          v.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') v.blur(); });
          v.addEventListener('change', () => { const x = parseFloat(v.value); if (Number.isFinite(x)) this.lines.setStampValue(x); });
          row.append(v);
        }
        const b = h('button', 'small toggle tool-act' + (on ? ' on' : ''), 'Stamp');
        b.title = 'Click the ground or a side of a cell in the 3D view to add a cell there; Shift takes cells away. Again, or Escape, to stop';
        b.addEventListener('click', e => { e.stopPropagation(); this.lines.paint(t.name); });
        row.append(b);
      }
      if (this.editable) {
        const del = h('button', 'pmore', '×');
        del.title = 'Remove the tool (its params stay)';
        del.addEventListener('click', e => { e.stopPropagation(); this.edit(g => g.removeTool(t.name)); });
        row.append(del);
      }
      wrap.append(row);
      if (t.error) wrap.append(h('div', 'tool-err', t.error));
      this.root.append(wrap);
    }
  }

  // a new tool with the params it needs, named so nothing clashes
  addTool(doc, preset) {
    if (preset.draw) { this.toolHost.draw(); return; }
    const taken = new Set([...doc.params.map(p => p.name), ...(doc.tools || []).map(t => t.name), ...doc.nodes.map(n => n.name)]);
    const fresh = base => { let k = 1, n = base; while (taken.has(n)) n = `${base}${++k}`; taken.add(n); return n; };
    const binds = preset.params.map(p => ({ ...p, name: fresh(p.name) }));
    const name = fresh(preset.tool);
    this.edit(g => {
      for (const p of binds) {
        if (p.cells) g.addCells(p.name, p.cells);
        else if (p.points) g.addPoints(p.name, p.points);
        else if (p.vector) g.addVector(p.name, p.vector);
        else if (p.bounds) g.addBounds(p.name, p.bounds, -60, 60);
        else g.addParam(p.name, p.value, p.lo, p.hi);
      }
      if (preset.kind) g.addTool(name, preset.kind, binds.map(b => b.name));
    });
    if (!preset.kind) {
      // a position, or bounds, moves in 3D by itself
      const n = binds[0].name;
      this.toolHost.select(n);
      if (binds[0].bounds) this.toast(`New bounds ${n}: drag its sides in the 3D view. Use ${n}.x0 … ${n}.z1, ${n}.x ${n}.y ${n}.z (the middle) or ${n}.w ${n}.h ${n}.d (the size) in settings.`);
      else this.toast(`New position ${n}: drag its arrows in the 3D view. Use ${n}.x, ${n}.y, ${n}.z in settings, or at: ${n} in a tool.`);
      return;
    }
    if (preset.stamp) {
      this.toolHost.select(name);
      this.toast(`New stamp ${name}: add a cells node with cells: ${binds[0].name}, then press Stamp on its row in the 3D view's Params and click to build.`);
      return;
    }
    if (preset.paint) {
      this.toolHost.select(name);
      this.toast(`New brush ${name}: press Paint on its row in the 3D view's Params, then click on surfaces. Use its points with along(piece, path: ${binds[0].name}, mode: each).`);
      return;
    }
    this.toolHost.select(name);
    this.toast(`New tool ${name}: drag its handles in the 3D view. Use ${binds.map(b => b.name).join(', ')} in settings.`);
  }

  // a position: x y z fields; bounds: the same for each corner. Drag an axis letter to
  // scrub it, click the row to show its handles in the 3D view
  vectorRow(doc, p, name) {
    const box = p.kind === 'bounds';
    const wrap = h('div', 'param-wrap');
    const tool = (doc.tools || []).find(t => (t.implicit && t.name === p.name) || (t.kind === (box ? 'bounds' : 'point') && t.binds.length === 1 && t.binds[0] === p.name));
    const row = h('div', 'param vector' + (box ? ' bounds' : '') + (tool && tool.name === this.toolHost.selected() ? ' selected' : ''));
    const inputs = [];
    // the latest value: the row outlives drags in the 3D view
    const now = () => ((this.doc || doc).params.find(q => q.name === p.name) || p).value.slice();
    let cur = now();
    const clampv = v => (p.lo < p.hi ? Math.min(p.hi, Math.max(p.lo, v)) : v);
    const set = g => (box ? g.setBounds(p.name, cur) : g.setVector(p.name, cur));
    // bounds keep the low corner low: a side stops at the other one
    const fit = (k, v) => !box ? v : k < 3 ? Math.min(v, cur[k + 3]) : Math.max(v, cur[k - 3]);
    const field = k => {
      const a = 'xyz'[k % 3];
      const f = h('label', 'vfield a' + a);
      const l = h('span', 'vaxis', a);
      l.title = `Drag to change ${box ? a + (k < 3 ? '0' : '1') : a}`;
      const i = h('input', 'pvalue');
      i.spellcheck = false;
      i.value = num(p.value[k]);
      i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
      i.addEventListener('change', () => {
        const v = parseFloat(i.value);
        if (!Number.isFinite(v)) { i.value = num(cur[k]); return; }
        cur = now(); cur[k] = v;
        this.edit(g => {
          if (p.lo < p.hi && (v < p.lo || v > p.hi)) g.paramRange(p.name, Math.min(p.lo, v), Math.max(p.hi, v));
          set(g);
        });
      });
      i.addEventListener('click', e => e.stopPropagation());
      // scrub: pixels to units scaled by the range, or 0.05 a pixel
      l.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        l.setPointerCapture(e.pointerId);
        const x0 = e.clientX, start = now(), per = p.lo < p.hi ? (p.hi - p.lo) / 800 : 0.05;
        let moved = false;
        document.body.classList.add('no-select');
        const mv = ev => {
          moved = true;
          cur = start.slice();
          const v = Math.round(fit(k, clampv(start[k] + (ev.clientX - x0) * per * (ev.shiftKey ? 0.1 : 1))) * 1000) / 1000;
          cur[k] = v;
          i.value = num(v);
          this.live(p.name, cur.slice());
        };
        const up = () => {
          l.removeEventListener('pointermove', mv); l.removeEventListener('pointerup', up); l.removeEventListener('pointercancel', up);
          document.body.classList.remove('no-select');
          if (moved) this.edit(set);
        };
        l.addEventListener('pointermove', mv); l.addEventListener('pointerup', up); l.addEventListener('pointercancel', up);
      });
      f.append(l, i);
      inputs.push(i);
      return f;
    };
    const line = (ks, label) => {
      const vec = h('div', 'vec');
      if (label) vec.append(h('span', 'vcorner', label));
      for (const k of ks) vec.append(field(k));
      return vec;
    };
    if (box) {
      const both = h('div', 'vecs');
      both.append(line([0, 1, 2], 'min'), line([3, 4, 5], 'max'));
      row.append(name, both);
      row.title = 'Bounds: a box from its min corner to its max. Drag its sides in the 3D view, or an axis letter here. Settings read ' + `${p.name}.x0 … ${p.name}.z1, the middle ${p.name}.x .y .z and the size ${p.name}.w .h .d`;
    } else {
      row.append(name, line([0, 1, 2]));
      row.title = 'A position: drag its arrows in the 3D view, or an axis letter here';
    }
    if (tool) row.addEventListener('click', e => { if (e.target.closest('input, button')) return; this.toolHost.select(tool.name === this.toolHost.selected() ? null : tool.name); });
    wrap.append(row);
    if (this.editable) {
      const more = editButton('Edit the range, or remove', this.open.has(p.name));
      more.addEventListener('click', e => { e.stopPropagation(); this.open.has(p.name) ? this.open.delete(p.name) : this.open.add(p.name); this.key = null; this.render(this.doc || doc); });
      row.append(more);
      if (this.open.has(p.name)) wrap.append(this.details(p));
    }
    this.rows.push({ vec: inputs });
    return wrap;
  }

  details(p) {
    const d = h('div', 'param-details');
    const field = (label, v, set) => {
      const l = h('label', null, label);
      const i = h('input', 'pvalue');
      i.value = num(v);
      i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
      i.addEventListener('change', () => { const x = parseFloat(i.value); if (Number.isFinite(x)) set(x); });
      l.append(i);
      return l;
    };
    // a position may have no range: its fields start empty
    const ranged = p.lo < p.hi;
    const from = field('from', p.lo, v => this.edit(g => g.paramRange(p.name, v, ranged ? Math.max(v + 0.001, p.hi) : v + 100)));
    const to = field('to', p.hi, v => this.edit(g => g.paramRange(p.name, ranged ? Math.min(v - 0.001, p.lo) : v - 100, v)));
    if (!ranged) for (const f of [from, to]) { const i = f.querySelector('input'); i.value = ''; i.placeholder = 'any'; }
    d.append(from, to);
    const del = h('button', 'small danger', 'Remove');
    del.title = 'Settings that use it will show an error until you change them';
    del.addEventListener('click', () => { this.open.delete(p.name); this.edit(g => g.removeParam(p.name)); });
    d.append(del);
    return d;
  }
}
