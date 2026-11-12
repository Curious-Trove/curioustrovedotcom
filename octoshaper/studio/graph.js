// The node editor. It draws the graph from the core's JSON and turns every
// gesture into one call of the core's editing API; the app then re-reads the
// graph and rewrites the code, which stays the one true copy.
import { wheelIntent } from './wheel.js?v=e2bbaab254';
import { explain, meaning, VARS, PIXEL_VARS, FUNCS, OPS, LABEL } from './help.js?v=e2bbaab254';
import { colorPicker } from './colorpick.js?v=e2bbaab254';

const NS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const isPlainNumber = s => /^-?\d+(\.\d+)?$/.test(String(s).trim());
const UNKNOWN = /^unknown name '([A-Za-z_]\w*)'(; did you mean)?/;
let dotSeq = 0;
// nothing on the page is selected as text while something is dragged in the graph
export function noTextSelect(on) {
  document.body.classList.toggle('no-select', on);
  if (on) { const sel = getSelection && getSelection(); if (sel) sel.removeAllRanges(); }
}
const fmt = v => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};

export class GraphView {
  constructor(root, octo, { edit, select, changed, declare, nodeDoc, openUsed, openEditor }) {
    this.onOpenUsed = openUsed || null; // a use node double-clicked
    this.onOpenEditor = openEditor || null; // a node's Paint, Pick tiles or Draw button
    this.root = root;
    this.octo = octo;
    this.edit = edit;          // edit(fn, {rebuild}) runs fn(graph) and refreshes
    this.onSelect = select;
    this.onChanged = changed;  // positions changed (no evaluation needed)
    this.onDeclare = declare;  // declare(name, setting) makes a param; returns true if it did
    this.doc = null;
    this.pan = { x: 60, y: 60 };
    this.zoom = 0.85;
    this.selected = -1;          // the node shown in 3D (and the code's line)
    this.selection = new Set();  // every selected node, for moves and deletes
    this.nodeDoc = nodeDoc || null;
    this.selectedWire = null;
    this.nodes = new Map();    // id -> element
    this.opened = new Set();   // names of nodes showing their folded settings
    root.classList.add('graph');
    // the dots are an SVG pattern, so they stay exactly under the nodes at any zoom
    // (a CSS background rounds its tile to whole pixels and drifts)
    const pid = 'dots' + (++dotSeq);
    this.dots = document.createElementNS(NS, 'svg');
    this.dots.classList.add('graph-dots');
    this.dots.innerHTML = `<defs><pattern id="${pid}" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.3"/></pattern></defs><rect width="100%" height="100%" fill="url(#${pid})"/>`;
    this.dotPattern = this.dots.querySelector('pattern');
    this.dotCircle = this.dots.querySelector('circle');
    root.append(this.dots);
    this.world = h('div', 'world');
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('wires');
    this.world.append(this.svg);
    this.hint = h('div', 'graph-hint', 'Double-click or press Tab to add a node');
    root.append(this.world, this.hint);
    this.palette = new Palette(root, octo, (type) => this.paletteChose(type));
    this.palette.nodeDoc = this.nodeDoc;
    this.help = new Help(root, octo);
    this.toastEl = h('div', 'toast');
    root.append(this.toastEl);
    this.bind();
    this.apply();
    // a graph in a hidden tab fits once it is shown
    new ResizeObserver(() => { if (this.pendingFit && root.clientWidth) { this.pendingFit = false; this.fit(); } }).observe(root);
  }

  // ---- view transform ----
  apply() {
    this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    if (this.help && this.help.input) this.help.place(); // the field moved: keep the card off it
    this.dotPattern.setAttribute('patternTransform', `translate(${this.pan.x} ${this.pan.y}) scale(${this.zoom})`);
    // dots keep their size on screen, and fade out when zoomed far out
    this.dotCircle.setAttribute('r', String(Math.max(1.1, 1.3 / this.zoom * Math.min(1, this.zoom * 1.6))));
    this.dots.style.opacity = this.zoom < 0.35 ? '0.5' : '';
  }
  toWorld(cx, cy) {
    const r = this.root.getBoundingClientRect();
    return { x: (cx - r.left - this.pan.x) / this.zoom, y: (cy - r.top - this.pan.y) / this.zoom };
  }
  fit() {
    if (!this.doc || !this.doc.nodes.length) return;
    if (!this.root.clientWidth) { this.pendingFit = true; return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.doc.nodes) {
      const el = this.nodes.get(n.id);
      const w = el ? el.offsetWidth : 220, hh = el ? el.offsetHeight : 260;
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + hh);
    }
    const r = this.root.getBoundingClientRect();
    // a long graph is shown from its start at a readable size rather than as a strip of dots
    const z = Math.min(1.1, Math.max(0.42, Math.min((r.width - 60) / (x1 - x0), (r.height - 60) / (y1 - y0))));
    this.zoom = z;
    const px = (x1 - x0) * z > r.width - 60 ? 30 - x0 * z : (r.width - (x1 - x0) * z) / 2 - x0 * z;
    const py = (y1 - y0) * z > r.height - 60 ? 30 - y0 * z : (r.height - (y1 - y0) * z) / 2 - y0 * z;
    this.pan = { x: px, y: py };
    this.apply();
  }

  // ---- drawing ----
  setDoc(doc, rebuild) {
    this.doc = doc;
    this.hint.style.display = doc.nodes.length ? 'none' : '';
    if (rebuild) this.build(); else this.status();
    this.computing();
    this.wires();
    this.help.refresh(doc);
  }

  // wires pulse once, upstream first, each time the graph is worked out
  computing() {
    const byId = new Map(this.doc.nodes.map(n => [n.id, n]));
    const memo = new Map();
    const depth = id => {
      if (memo.has(id)) return memo.get(id);
      memo.set(id, 0);
      const n = byId.get(id);
      const d = n ? Math.max(-1, ...n.inputs.filter(s => byId.has(s)).map(depth)) + 1 : 0;
      memo.set(id, d);
      return d;
    };
    for (const n of this.doc.nodes) depth(n.id);
    this.depth = memo;
    const last = Math.max(0, ...memo.values());
    this.root.classList.add('computing');
    clearTimeout(this.computeTimer);
    this.computeTimer = setTimeout(() => this.root.classList.remove('computing'), last * 140 + 900);
  }

  // nodes an AI agent just changed glow for a moment
  markTouched(names) {
    const want = new Set(names);
    for (const n of this.doc.nodes) {
      const el = this.nodes.get(n.id);
      if (!el || !want.has(n.name)) continue;
      el.classList.remove('touched');
      void el.offsetWidth;
      el.classList.add('touched');
      setTimeout(() => el.classList.remove('touched'), 2600);
    }
  }

  toast(text, action) {
    const t = this.toastEl;
    t.replaceChildren(h('span', null, text));
    if (action) {
      const b = h('button', 'small', action.label);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); t.classList.remove('on'); action.run(); });
      t.append(b);
    }
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), action ? 7000 : 3200);
  }

  build() {
    for (const el of this.nodes.values()) el.remove();
    this.nodes.clear();
    const byId = new Map(this.doc.nodes.map(n => [n.id, n]));
    for (const n of this.doc.nodes) {
      const t = this.octo.typeMap[n.type];
      const el = h('div', `node cat-${t.category}`);
      el.dataset.id = n.id;
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      const head = h('div', 'head');
      const typeEl = h('span', 'type', n.type);
      if (this.nodeDoc) this.nodeDoc.attach(typeEl, n.type);
      head.append(typeEl);
      head.append(this.nameInput(n));
      if (t.settings.some(s => s.name === 'seed')) {
        const dice = h('button', 'reroll', '⚄');
        dice.title = 'Another random variation (changes seed)';
        dice.addEventListener('click', () => {
          const v = n.settings.seed;
          const next = isPlainNumber(v.text) ? Math.round(parseFloat(v.text)) + 1 : 2;
          this.edit(g => g.set(n.id, 'seed', String(next)), { rebuild: true });
        });
        head.append(dice);
      }
      if (!n.comment) {
        const add = h('button', 'add-note', '✎');
        add.title = 'Add a note (a // comment above the line)';
        add.addEventListener('click', () => this.editNote(el, n, true));
        head.append(add);
      }
      head.append(h('span', 'count'));
      const out = h('div', 'port out' + (t.out === 'image' ? ' image' : ''));
      out.dataset.port = 'out';
      out.dataset.kind = t.out;
      out.title = 'Drag to connect';
      head.append(out);
      el.append(head);
      if (n.comment) {
        const note = h('div', 'note', n.comment);
        note.title = 'Click to edit the note';
        note.addEventListener('click', () => this.editNote(el, n, false));
        el.append(note);
      }
      const pv = h('div', 'preview' + (t.out === 'image' ? ' image' : ''));
      pv.append(h('canvas'));
      el.append(pv);
      // a node with a view of its own to edit it in: a button that opens it
      const editor = this.editorFor(n);
      if (editor && this.onOpenEditor) {
        const open = h('button', 'small open-editor', editor.label);
        open.title = editor.title;
        open.addEventListener('pointerdown', e => e.stopPropagation());
        open.addEventListener('click', e => { e.stopPropagation(); this.onOpenEditor(n, editor); });
        el.append(open);
      }
      const rows = h('div', 'rows');
      // a node that takes any number of inputs has them after its named ones, then a free port
      const fixed = t.inputs.length;
      const inputs = !t.variadic ? t.inputs
        : [...Array.from({ length: Math.max(fixed, n.inputs.length) }, (_, k) => (fixed ? t.inputs[Math.min(k, fixed - 1)] : 'in')), '+'];
      inputs.forEach((label, k) => {
        const row = h('div', 'row input');
        const kind = (t.inputKinds && t.inputKinds[t.variadic ? 0 : k]) || 'shapes';
        const port = h('div', 'port in' + (kind === 'image' ? ' image' : ''));
        port.dataset.slot = k;
        port.dataset.kind = kind;
        if (kind !== t.out || k >= (t.positional ?? 99)) row.title = kind === 'image' ? `Takes an image node (in the code: ${label}: name)` : '';
        const src = byId.get(n.inputs[k]);
        if (src) port.classList.add('on');
        row.append(port, h('span', 'label', label === '+' ? (fixed && t.variadic ? `another ${t.inputs[fixed - 1]}` : n.inputs.length ? 'add input' : 'inputs') : label));
        if (src) row.append(h('span', 'src', src.name));
        rows.append(row);
      });
      for (const s of t.settings) rows.append(this.settingRow(n, s));
      // a used file's params are this node's settings
      for (const u of n.use || []) {
        rows.append(this.settingRow(n, { name: u.name, kind: 'number', default: fmt(u.default), lo: u.lo, hi: u.hi, doc: `the used file's param ${u.name}, from ${fmt(u.lo)} to ${fmt(u.hi)}: one value, or a formula for each shape` }));
      }
      if (t.settings.some(s => s.when === '+')) {
        // settings most graphs never touch stay folded away
        const more = h('div', 'row more'), b = h('button', null, '');
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => {
          if (this.opened.has(n.name)) this.opened.delete(n.name); else this.opened.add(n.name);
          this.status();
          this.wires();
        });
        more.append(b);
        rows.append(more);
      }
      el.append(rows, h('div', 'meshes'), h('div', 'err'));
      this.world.append(el);
      this.nodes.set(n.id, el);
    }
    this.status();
    this.markSelected();
  }

  settingRow(n, s) {
    const v = n.settings[s.name] || { text: s.default, set: false, error: null };
    const row = h('div', 'row setting');
    row.dataset.key = s.name;
    row.dataset.kind = s.kind;
    row.dataset.unset = s.default;
    if (s.when) { row.dataset.when = s.when; row.dataset.doc = s.doc + (s.kind === 'number' ? ' (drag to change)' : ''); }
    if (s.name === 'seed') row.classList.add('seed');
    const label = h('span', 'label', s.name);
    label.title = s.doc + (s.kind === 'number' ? ' (drag to change)' : '');
    row.append(label);
    let input;
    const commit = (text) => {
      this.edit(g => g.set(n.id, s.name, text === '' ? null : text), { rebuild: false, keepFocus: true });
      this.checkUnknown(n.id, s);
    };
    if (s.kind === 'choice') {
      input = h('select');
      const options = s.options.split('|');
      // a formula that picks for each shape (written in the code) shows as it is
      if (!options.includes(v.text)) options.push(v.text);
      for (const o of options) {
        const opt = h('option', null, o);
        opt.value = o;
        input.append(opt);
      }
      input.value = v.text;
      input.addEventListener('change', () => { commit(input.value); this.status(); });
    } else if (s.kind === 'file') {
      // a file to use, shown without its quotes; the arrow opens it in its own tabs
      input = h('input', 'num path');
      input.value = v.text.replace(/^"|"$/g, '');
      input.spellcheck = false;
      input.placeholder = 'kit/window.octo';
      input.title = 'An .octo file next to this one. Double-click the node to open it.';
      input.addEventListener('change', () => commit(JSON.stringify(input.value.trim().replace(/"/g, ''))));
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
    } else if (s.kind === 'edits') {
      // edits are made in the 3D view: here, how many there are, and a way to take them all back
      const count = (v.text.match(/@/g) || []).length;
      input = h('button', 'small edits');
      input.type = 'button';
      input.textContent = count ? `${count} edit${count === 1 ? '' : 's'} · clear` : 'none yet';
      input.disabled = !count;
      input.title = count ? 'Take every edit back. Click a shape in the 3D view to edit it; each edit is also in the code.' : 'Click a shape in the 3D view, then move, turn, scale, colour or delete it';
      input.addEventListener('pointerdown', e => e.stopPropagation());
      input.addEventListener('click', () => commit(''));
    } else if (s.kind === 'points' || s.kind === 'colors' || s.kind === 'numbers') {
      // a point-list param's name, or points written out: [x y z, ...]; or a list of colours
      input = h('input', 'num path');
      input.value = v.text;
      input.spellcheck = false;
      input.title = s.kind === 'numbers' ? 'A list of numbers: [1, 3, 1]' : s.kind === 'colors' ? 'A list of colours: [#rrggbb, #rrggbb]' : 'A point-list param (edit it with a spline tool), or [x y z, x y z]';
      input.addEventListener('change', () => commit(input.value.trim()));
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
    } else if (s.kind === 'color') {
      // the studio's own picker, as in the code
      input = h('button', 'swatch');
      input.type = 'button';
      input.title = 'Pick a colour';
      input.style.background = v.text;
      input.addEventListener('pointerdown', e => e.stopPropagation());
      input.addEventListener('click', e => {
        e.stopPropagation();
        colorPicker(input.getBoundingClientRect(), v.text, { onInput: c => { input.style.background = c; commit(c); } });
      });
    } else {
      input = h('input', 'num');
      input.value = v.text;
      input.spellcheck = false;
      input.addEventListener('change', () => commit(input.value.trim()));
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = this.doc.nodes.find(m => m.id === n.id).settings[s.name]?.text ?? s.default; input.blur(); }
      });
      const saved = () => this.doc.nodes.find(m => m.id === n.id)?.settings[s.name];
      input.addEventListener('focus', () => {
        // a default is shown, not set: the first key replaces it
        input.dataset.fresh = saved()?.set ? '' : '1';
        this.help.show(input, n.id, s);
      });
      input.addEventListener('beforeinput', e => {
        if (!input.dataset.fresh) return;
        input.dataset.fresh = '';
        if (e.inputType.startsWith('delete')) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); }
        else if (e.inputType.startsWith('insert')) input.value = '';
      });
      input.addEventListener('input', () => { this.help.update(); markExpr(row, input.value); });
      input.addEventListener('blur', () => {
        this.help.hide();
        input.dataset.fresh = '';
        // a value filled in from the help card fires no change event: save it here
        const cur = saved();
        if (cur && input.value.trim() !== cur.text && !(input.value.trim() === '' && !cur.set)) commit(input.value.trim());
      });
      markExpr(row, v.text);
      label.classList.add('scrub');
      label.addEventListener('pointerdown', e => this.scrub(e, n, s, input));
    }
    if (!v.set) row.classList.add('default');
    row.append(input);
    return row;
  }

  scrub(e, n, s, input) {
    e.preventDefault();
    e.stopPropagation();
    if (!isPlainNumber(input.value)) return;
    const start = parseFloat(input.value), x0 = e.clientX;
    const range = (s.hi - s.lo) || 10;
    const step = range > 50 ? 1 : range > 8 ? 0.1 : 0.01;
    const integral = Number.isInteger(start) && (Number.isInteger(s.lo) && Number.isInteger(s.hi) && range >= 4);
    const target = e.target;
    target.setPointerCapture(e.pointerId);
    let pending = null, raf = 0;
    const move = ev => {
      let v = start + (ev.clientX - x0) * (range / 300);
      v = integral ? Math.round(v) : Math.round(v / step) * step;
      pending = fmt(v);
      input.value = pending;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        this.edit(g => g.set(n.id, s.name, pending), { rebuild: false, keepFocus: true, live: true });
      });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      if (pending != null) this.edit(g => g.set(n.id, s.name, pending), { rebuild: false, keepFocus: true });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  // a name the expression does not know becomes a param, unless it looks like a typo
  checkUnknown(id, s) {
    const n = this.doc.nodes.find(m => m.id === id);
    const err = n && n.settings[s.name]?.error;
    const m = err && err.match(UNKNOWN);
    if (!m) return;
    const name = m[1];
    if (m[2]) {
      this.toast(err, { label: `Make ${name} a param`, run: () => this.onDeclare(name, s) });
    } else if (this.onDeclare(name, s)) {
      this.toast(`New param ${name}. Set its value and range in Params.`);
    }
  }

  nameInput(n) {
    const input = h('input', 'name');
    input.value = n.name;
    input.spellcheck = false;
    input.title = 'The node\'s name in the code. Click to rename.';
    input.size = Math.max(3, n.name.length);
    const finish = ok => {
      const v = input.value.trim();
      if (!ok || !v || v === n.name) { input.value = n.name; return; }
      let res = -1;
      this.edit(g => { res = g.rename(n.id, v); }, { rebuild: true });
      if (res < 0) this.toast(/^[A-Za-z_]\w*$/.test(v) ? `Another node or param is already called ${v}` : 'A name is letters, digits and _, and starts with a letter');
    };
    input.addEventListener('input', () => { input.size = Math.max(3, input.value.length); });
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = n.name; input.blur(); }
    });
    input.addEventListener('change', () => finish(true));
    return input;
  }

  editNote(el, n, fresh) {
    let note = el.querySelector('.note');
    if (!note) {
      note = h('div', 'note');
      el.querySelector('.head').after(note);
      this.wires();
    }
    if (note.isContentEditable) return;
    note.contentEditable = 'plaintext-only';
    note.dataset.placeholder = 'What is this node for?';
    note.focus();
    const sel = getSelection();
    sel.selectAllChildren(note);
    if (!fresh) sel.collapseToEnd();
    const done = ok => {
      note.contentEditable = 'false';
      const text = note.innerText.trim();
      if (ok && text !== (n.comment || '')) this.edit(g => g.comment(n.id, text), { rebuild: true });
      else this.edit(() => {}, { rebuild: true });
    };
    note.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); note.blur(); }
      if (e.key === 'Escape') { note.textContent = n.comment || ''; note.blur(); }
    });
    note.addEventListener('blur', () => done(true), { once: true });
  }

  // a deformer's cost: whether its shapes still share a mesh (and so instance), and a way back when they do not
  meshBadge(n, el) {
    const m = n.error ? null : n.meshes;
    el.textContent = '';
    el.className = 'meshes';
    if (!m) return;
    const tris = m.triangles >= 10000 ? `${Math.round(m.triangles / 1000)}k` : m.triangles.toLocaleString();
    const heavy = m.unique > 8 && m.reason;
    const why = {
      space: 'space: world lays the pattern across the scene, so no two shapes are alike',
      formula: 'a setting uses i, t or rand(), which are different for every shape',
      seed: 'the seed is different for every shape',
      near: 'what is near each shape is different, and it is painted where they meet',
    }[m.reason];
    const text = h('span', null, m.unique === 1 ? `1 mesh × ${m.shapes.toLocaleString()}` : `${m.unique.toLocaleString()} ${m.unique === m.shapes ? 'unique ' : ''}meshes, ${tris} triangles`);
    text.title = m.unique === 1
      ? `Every shape is the same mesh (${tris} triangles), stored once and drawn ${m.shapes.toLocaleString()} times: instancing still works`
      : `${m.unique.toLocaleString()} different meshes for ${m.shapes.toLocaleString()} shapes, ${m.triangles.toLocaleString()} triangles to store` + (why ? `: ${why}. Shapes that share a mesh are stored once and drawn fast` : '');
    el.append(text);
    if (!heavy) return;
    el.classList.add('heavy');
    const fix = m.reason === 'seed' && n.settings.seed ? ['limit to 8 variants', () => this.edit(g => g.set(n.id, 'seed', `(${n.settings.seed.text}) % 8`), { rebuild: true })]
      : m.reason === 'space' ? ['use local space', () => this.edit(g => g.set(n.id, 'space', 'local'), { rebuild: true })] : null;
    if (fix) {
      const b = h('button', 'link', fix[0]);
      b.title = m.reason === 'seed' ? 'Eight different meshes shared by all the shapes, in place of one each' : 'The pattern is laid on each shape by itself, so equal shapes are one mesh again';
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', fix[1]);
      el.append(b);
    }
  }

  // counts, errors and setting state, without rebuilding the DOM
  status() {
    for (const n of this.doc.nodes) {
      const el = this.nodes.get(n.id);
      if (!el) continue;
      el.querySelector('.count').textContent = n.error ? '!' : n.image ? `${n.image[0]} px` : n.count.toLocaleString();
      el.querySelector('.count').title = n.error ? '' : n.image ? `an image, ${n.image[0]} by ${n.image[1]} pixels` : `${n.count} shape${n.count === 1 ? '' : 's'}`;
      el.classList.toggle('failed', !!n.error);
      el.querySelector('.err').textContent = n.error || n.warning || '';
      el.classList.toggle('warned', !n.error && !!n.warning);
      this.meshBadge(n, el.querySelector('.meshes'));
      // settings that only apply to some values of the first one (a shape's kind)
      const t = this.octo.typeMap[n.type];
      const first = t.settings[0], ctl = first && first.kind === 'choice' ? el.querySelector('.row.setting select') : null;
      for (const sel of el.querySelectorAll('.row.setting select')) {
        const text = n.settings[sel.closest('.row').dataset.key].text;
        if (document.activeElement === sel) continue;
        if (![...sel.options].some(o => o.value === text)) { const o = h('option', null, text); o.value = text; sel.append(o); }
        sel.value = text;
      }
      const kind = ctl ? ctl.value : '';
      // a kind picked by a formula can be any of them: every setting may apply
      const anyKind = ctl && !first.options.split('|').includes(kind);
      const open = this.opened.has(n.name);
      let folded = 0;
      for (const row of el.querySelectorAll('.row.setting')) {
        const v = n.settings[row.dataset.key] || { text: row.dataset.unset || '', set: false, error: null };
        const when = row.dataset.when;
        if (when === '+') {
          // folded away until set, or until the node is opened
          row.classList.toggle('hidden', !open && !v.set);
          if (!v.set) folded++;
        } else if (when && when[0] === '@') {
          // only with one of these inputs connected
          const applies = when.slice(1).split('|').some(name => n.inputs[t.inputs.indexOf(name)] >= 0);
          row.classList.toggle('hidden', !applies && !v.set);
          row.classList.toggle('unused', !applies && v.set);
          row.querySelector('.label').title = (applies ? '' : 'Needs an image plugged in. ') + row.dataset.doc;
        } else if (when) {
          const applies = anyKind || when.split('|').includes(kind);
          row.classList.toggle('hidden', !applies && !v.set);
          row.classList.toggle('unused', !applies && v.set);
          const label = row.querySelector('.label');
          label.title = (applies ? '' : `Not used by a ${kind}. `) + row.dataset.doc;
        }
        row.classList.toggle('bad', !!v.error);
        row.classList.toggle('default', !v.set);
        row.title = v.error || '';
        const input = row.querySelector('input.num');
        if (input && document.activeElement !== input) { input.value = row.dataset.kind === 'file' ? v.text.replace(/^"|"$/g, '') : v.text; markExpr(row, v.text); }
        const edits = row.querySelector('button.edits');
        if (edits) {
          const count = (v.text.match(/@/g) || []).length;
          edits.textContent = count ? `${count} edit${count === 1 ? '' : 's'} · clear` : 'none yet';
          edits.disabled = !count;
        }
      }
      const more = el.querySelector('.row.more');
      if (more) {
        more.hidden = !folded;
        more.firstChild.textContent = open ? 'less' : `${folded} more…`;
      }
    }
  }

  previewCanvas(id) {
    const el = this.nodes.get(id);
    return el ? el.querySelector('.preview canvas') : null;
  }

  portPos(id, slot) {
    const el = this.nodes.get(id);
    if (!el) return null;
    const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    if (slot === 'out') {
      const p = el.querySelector('.port.out');
      return { x: x + el.offsetWidth, y: y + p.offsetTop + p.offsetHeight / 2 };
    }
    const p = el.querySelectorAll('.port.in')[slot];
    if (!p) return { x, y: y + 20 };
    const row = p.parentElement;
    return { x, y: y + row.offsetTop + row.offsetHeight / 2 };
  }

  wires() {
    this.svg.replaceChildren();
    if (!this.doc) return;
    const byId = new Map(this.doc.nodes.map(n => [n.id, n]));
    for (const n of this.doc.nodes) {
      n.inputs.forEach((src, k) => {
        if (src < 0 || !byId.has(src)) return;
        const a = this.portPos(src, 'out'), b = this.portPos(n.id, k);
        if (!a || !b) return;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', curve(a, b));
        p.classList.add('wire');
        if (this.octo.typeMap[byId.get(src).type].out === 'image') p.classList.add('image');
        if (this.selectedWire && this.selectedWire.to === n.id && this.selectedWire.slot === k) p.classList.add('selected');
        p.dataset.to = n.id;
        p.dataset.slot = k;
        const hit = document.createElementNS(NS, 'path');
        hit.setAttribute('d', curve(a, b));
        hit.classList.add('wire-hit');
        hit.dataset.to = n.id;
        hit.dataset.slot = k;
        const pulse = document.createElementNS(NS, 'path');
        pulse.setAttribute('d', curve(a, b));
        pulse.setAttribute('pathLength', '100');
        pulse.classList.add('wire-pulse');
        pulse.style.animationDelay = `${(this.depth?.get(src) || 0) * 0.14}s`;
        this.svg.append(p, pulse, hit);
      });
    }
    if (this.dragWire) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', curve(this.dragWire.a, this.dragWire.b));
      p.classList.add('wire', 'dragging');
      if (this.dragKind === 'image') p.classList.add('image');
      this.svg.append(p);
    }
  }

  select(id) {
    this.selected = id;
    this.selection = new Set(id >= 0 ? [id] : []);
    this.selectedWire = null;
    this.markSelected();
    this.wires();
    this.onSelect(id);
  }
  markSelected() {
    // a node picked elsewhere (the code, an agent) is the selection
    if (this.selected >= 0 && !this.selection.has(this.selected)) this.selection = new Set([this.selected]);
    if (this.selected < 0 && this.selection.size === 1) this.selection.clear();
    const live = new Set(this.nodes.keys());
    for (const id of [...this.selection]) if (!live.has(id)) this.selection.delete(id);
    for (const [id, el] of this.nodes) {
      el.classList.toggle('selected', this.selection.has(id));
      el.classList.toggle('primary', id === this.selected);
    }
  }
  // the node that made the shape found in the 3D view: ringed, and brought into view
  markFound(id) {
    this.found = id;
    for (const [nid, el] of this.nodes) el.classList.toggle('found', nid === id);
    const el = this.nodes.get(id), n = el && this.doc.nodes.find(m => m.id === id);
    if (!n || !this.root.clientWidth) return;
    const x = n.x * this.zoom + this.pan.x, y = n.y * this.zoom + this.pan.y, w = el.offsetWidth * this.zoom, hgt = Math.min(el.offsetHeight * this.zoom, 200);
    const W = this.root.clientWidth, H = this.root.clientHeight;
    if (x < 0 || y < 0 || x + w > W || y + hgt > H) {
      this.pan.x += W / 2 - (x + w / 2);
      this.pan.y += H / 2 - (y + hgt / 2);
      this.apply();
    }
  }
  // the selected nodes, the one shown first
  selectedIds() { return [...this.selection]; }

  // ---- gestures ----
  bind() {
    const root = this.root;
    root.addEventListener('wheel', e => {
      // menus and cards over the graph scroll as usual
      if (e.target.closest('.palette, .setting-help, .graph-params, .node-doc')) return;
      e.preventDefault();
      // two fingers on a trackpad pan; a pinch, or a mouse wheel, zooms
      if (wheelIntent(e) === 'pan') {
        this.pan.x -= e.deltaX; this.pan.y -= e.deltaY;
        this.apply();
        return;
      }
      const r = root.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const z = Math.min(2, Math.max(0.2, this.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
      this.pan.x = mx - (mx - this.pan.x) * z / this.zoom;
      this.pan.y = my - (my - this.pan.y) * z / this.zoom;
      this.zoom = z;
      this.apply();
    }, { passive: false });

    root.addEventListener('pointerdown', e => {
      if (this.palette.open && !this.palette.el.contains(e.target)) { this.palette.hide(); this.paletteChose(null); }
      if (e.target.closest('select, .palette, button, [contenteditable=true], [contenteditable=plaintext-only]')) return;
      if (e.target.closest('input') && !e.target.matches('.head input.name')) return;
      const port = e.target.closest('.port');
      const nodeEl = e.target.closest('.node');
      // middle or right button, or Space held: pan; the left button on the canvas selects an area
      if (e.button === 1 || e.button === 2 || (this.space && e.button === 0)) { e.preventDefault(); return this.startPan(e); }
      if (e.button !== 0) return;
      if (e.target.classList.contains('wire-hit')) {
        this.selectedWire = { to: +e.target.dataset.to, slot: +e.target.dataset.slot };
        this.selected = -1;
        this.selection.clear();
        this.markSelected();
        this.wires();
        root.focus();
        return;
      }
      if (port) { e.preventDefault(); return this.startWire(e, port, nodeEl); }
      if (nodeEl) return this.startNodeDrag(e, nodeEl);
      e.preventDefault();
      this.startMarquee(e);
    });
    root.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, [contenteditable=true], [contenteditable=plaintext-only]')) e.preventDefault(); });
    root.addEventListener('keyup', e => { if (e.key === ' ') { this.space = false; root.classList.remove('space-pan'); } });
    root.addEventListener('blur', () => { this.space = false; root.classList.remove('space-pan'); });

    root.addEventListener('dblclick', e => {
      if (e.target.classList.contains('wire-hit')) {
        const to = +e.target.dataset.to, slot = +e.target.dataset.slot;
        this.edit(g => g.disconnect(to, slot), { rebuild: true });
        return;
      }
      const node = e.target.closest('.node');
      if (!node) { this.openPalette(e.clientX, e.clientY); return; }
      // a use node opens its file
      const n = this.doc.nodes.find(m => this.nodes.get(m.id) === node);
      if (n && n.type === 'use' && this.onOpenUsed && !e.target.closest('input, select, button')) this.onOpenUsed(n);
    });

    root.tabIndex = 0;
    root.addEventListener('keydown', e => {
      if (e.target.closest('input, select, [contenteditable=true], [contenteditable=plaintext-only]')) return;
      if (e.key === ' ') { e.preventDefault(); this.space = true; root.classList.add('space-pan'); return; }
      if (e.key === 'Escape' && this.selection.size) { this.select(-1); return; }
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.selection = new Set(this.nodes.keys());
        this.markSelected();
        return;
      }
      if (e.key === 'Tab') { e.preventDefault(); const r = root.getBoundingClientRect(); this.openPalette(this.mouse?.x ?? r.left + r.width / 2, this.mouse?.y ?? r.top + r.height / 2); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedWire) {
        const { to, slot } = this.selectedWire;
        this.selectedWire = null;
        this.edit(g => g.disconnect(to, slot), { rebuild: true });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.size) {
        const ids = this.selectedIds();
        this.selected = -1;
        this.selection.clear();
        this.edit(g => { for (const id of ids) g.remove(id); }, { rebuild: true });
        this.onSelect(-1);
      } else if (e.key === 'f') this.fit();
      else if (e.key === 'd' && (e.metaKey || e.ctrlKey) && this.selected >= 0) { e.preventDefault(); this.duplicate(this.selected); }
    });
    root.addEventListener('pointermove', e => { this.mouse = { x: e.clientX, y: e.clientY }; });
  }

  // the left button on empty canvas: a box that selects the nodes it touches (Shift adds)
  startMarquee(e) {
    const r0 = this.root.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, add = e.shiftKey || e.metaKey || e.ctrlKey;
    const before = add ? new Set(this.selection) : new Set();
    let box = null;
    this.root.setPointerCapture(e.pointerId);
    this.root.focus({ preventScroll: true });
    noTextSelect(true);
    const move = ev => {
      if (!box) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
        box = h('div', 'marquee');
        this.root.append(box);
      }
      const l = Math.min(x0, ev.clientX), t = Math.min(y0, ev.clientY), rr = Math.max(x0, ev.clientX), b = Math.max(y0, ev.clientY);
      Object.assign(box.style, { left: (l - r0.left) + 'px', top: (t - r0.top) + 'px', width: (rr - l) + 'px', height: (b - t) + 'px' });
      const next = new Set(before);
      for (const [id, el] of this.nodes) {
        const q = el.getBoundingClientRect();
        if (q.right > l && q.left < rr && q.bottom > t && q.top < b) next.add(id);
      }
      this.selection = next;
      for (const [id, el] of this.nodes) el.classList.toggle('selected', next.has(id));
    };
    const up = () => {
      this.root.removeEventListener('pointermove', move);
      this.root.removeEventListener('pointerup', up);
      this.root.removeEventListener('pointercancel', up);
      noTextSelect(false);
      if (!box) { if (!add) this.select(-1); return; }
      box.remove();
      const ids = [...this.selection];
      // one node: it is the one shown; several: the selection is for moving and deleting
      if (ids.length === 1) this.select(ids[0]);
      else { this.selected = -1; this.selectedWire = null; this.markSelected(); this.wires(); }
    };
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
  }

  startPan(e) {
    const x0 = e.clientX, y0 = e.clientY, p0 = { ...this.pan };
    let moved = false;
    this.root.setPointerCapture(e.pointerId);
    this.root.classList.add('panning');
    noTextSelect(true);
    const move = ev => {
      if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3) moved = true;
      this.pan = { x: p0.x + ev.clientX - x0, y: p0.y + ev.clientY - y0 };
      this.apply();
    };
    const up = () => {
      this.root.removeEventListener('pointermove', move);
      this.root.removeEventListener('pointerup', up);
      this.root.classList.remove('panning');
      noTextSelect(false);
      if (!moved && e.button === 0) { this.select(-1); this.root.focus(); }
    };
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', up);
  }

  startNodeDrag(e, el) {
    const id = +el.dataset.id;
    if (e.target.closest('.label.scrub')) return;
    const nameInput = e.target.matches('input.name') ? e.target : null;
    if (nameInput) {
      if (document.activeElement === nameInput) return;
      e.preventDefault();
    }
    const x0 = e.clientX, y0 = e.clientY;
    if (!nameInput) e.preventDefault();
    // Shift (or Cmd/Ctrl) adds a node to the selection, or takes it out
    if ((e.shiftKey || e.metaKey || e.ctrlKey) && !nameInput) {
      if (this.selection.has(id)) { this.selection.delete(id); if (this.selected === id) this.selected = -1; }
      else { this.selection.add(id); this.selected = id; this.onSelect(id); }
      this.markSelected();
      return;
    }
    if (!this.selection.has(id)) this.select(id);
    else if (this.selected !== id) { this.selected = id; this.markSelected(); this.onSelect(id); }
    // every selected node moves together
    const group = this.selectedIds().map(k => this.doc.nodes.find(m => m.id === k)).filter(Boolean)
      .map(m => ({ n: m, x: m.x, y: m.y, el: this.nodes.get(m.id) }));
    let moved = false;
    this.root.focus({ preventScroll: true });
    this.root.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    noTextSelect(true);
    const move = ev => {
      const dx = (ev.clientX - x0) / this.zoom, dy = (ev.clientY - y0) / this.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      for (const m of group) {
        m.n.x = Math.round(m.x + dx); m.n.y = Math.round(m.y + dy);
        m.el.style.left = m.n.x + 'px';
        m.el.style.top = m.n.y + 'px';
      }
      this.wires();
    };
    const up = () => {
      this.root.removeEventListener('pointermove', move);
      this.root.removeEventListener('pointerup', up);
      el.classList.remove('dragging');
      noTextSelect(false);
      if (moved) this.onChanged(g => { for (const m of group) g.move(m.n.id, m.n.x, m.n.y); });
      else if (nameInput) { nameInput.focus(); nameInput.select(); }
    };
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', up);
  }

  startWire(e, port, nodeEl) {
    e.stopPropagation();
    const id = +nodeEl.dataset.id;
    let from;
    if (port.dataset.port === 'out') from = id;
    else {
      // pick up an existing wire from an input, to move it elsewhere
      const slot = +port.dataset.slot;
      const n = this.doc.nodes.find(n => n.id === id);
      if (!(n.inputs[slot] >= 0)) {
        this.dragFromInput(e, id, slot);
        return;
      }
      from = n.inputs[slot];
      this.edit(g => g.disconnect(id, slot), { rebuild: true });
    }
    const a = this.portPos(from, 'out');
    this.dragKind = this.kindOf(from);
    this.dragEnd = 'in';
    this.dragWire = { a, b: this.toWorld(e.clientX, e.clientY) };
    this.root.setPointerCapture(e.pointerId);
    noTextSelect(true);
    const move = ev => { this.dragWire.b = this.toWorld(ev.clientX, ev.clientY); this.wires(); this.hoverPort(ev); };
    const up = ev => {
      this.root.removeEventListener('pointermove', move);
      this.root.removeEventListener('pointerup', up);
      noTextSelect(false);
      this.dragWire = null;
      const target = this.portUnder(ev);
      this.clearHover();
      if (target && target.dataset.slot != null) {
        const to = +target.closest('.node').dataset.id, slot = +target.dataset.slot;
        let res = 0;
        this.edit(g => { res = g.connect(from, to, slot); }, { rebuild: true });
        if (res < 0 && (target.dataset.kind || 'shapes') !== this.dragKind)
          this.toast(this.dragKind === 'image' ? 'An image plugs into an image input: a color node\'s texture, bump or mask, or another image node.' : 'This input takes an image, not shapes.');
      } else if (target === null) {
        this.pendingFrom = from;
        this.openPalette(ev.clientX, ev.clientY);
      }
      this.wires();
    };
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', up);
  }

  // dragging out of an empty input: connect to an output, or make a new node there
  dragFromInput(e, to, slot) {
    const b = this.portPos(to, slot);
    this.dragKind = e.target.dataset.kind || 'shapes';
    this.dragEnd = 'out';
    this.dragWire = { a: this.toWorld(e.clientX, e.clientY), b };
    this.root.setPointerCapture(e.pointerId);
    noTextSelect(true);
    const move = ev => { this.dragWire.a = this.toWorld(ev.clientX, ev.clientY); this.wires(); this.hoverPort(ev); };
    const up = ev => {
      this.root.removeEventListener('pointermove', move);
      this.root.removeEventListener('pointerup', up);
      noTextSelect(false);
      this.dragWire = null;
      const target = this.portUnder(ev);
      this.clearHover();
      if (target && target.dataset.port === 'out') {
        const from = +target.closest('.node').dataset.id;
        this.edit(g => g.connect(from, to, slot), { rebuild: true });
      } else if (target === null) {
        this.pendingTo = { to, slot };
        this.openPalette(ev.clientX, ev.clientY);
      }
      this.wires();
    };
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', up);
  }

  portUnder(ev) {
    // wires lie over ports at times: look through them
    const el = document.elementsFromPoint(ev.clientX, ev.clientY).find(e => !e.classList.contains('wire-hit') && !e.classList.contains('wire'));
    if (!el || !this.root.contains(el)) return null;
    const port = el.closest('.port');
    if (port) return port;
    const row = el.closest('.row.input');
    if (row) return row.querySelector('.port');
    const node = el.closest('.node');
    if (node) {
      // dropping on a node body connects to its first free input for this kind of wire
      const fits = [...node.querySelectorAll('.port.in')].filter(p => this.dragEnd !== 'in' || (p.dataset.kind || 'shapes') === this.dragKind);
      const free = fits.find(p => !p.classList.contains('on'));
      return free || fits[0] || false;
    }
    return null;
  }
  // the view a node is edited in, if it has one: the Image tab for a painted image or a
  // tileset, the Draw tab for a node that follows a point-list or curve param
  editorFor(n) {
    const t = this.octo.typeMap[n.type];
    if (n.type === 'paint') return { view: 'image', label: 'Paint', title: 'Paint it in the Image tab' };
    if (n.type === 'tileset') return { view: 'image', label: 'Pick tiles', title: 'See its tiles in the Image tab, and pick one for the stamp tool' };
    if (t.out === 'image') return { view: 'image', label: 'View', title: 'Show it large in the Image tab, repeated to check its seams' };
    const params = (this.doc.params || []).filter(p => p.kind === 'points' || p.kind === 'curve');
    for (const s of Object.values(n.settings || {})) {
      const text = s && s.text ? s.text : '';
      const p = params.find(p => p.kind === 'points' ? text === p.name : new RegExp(`\\b${p.name}\\s*\\(`).test(text));
      if (p) return { view: 'draw', param: p.name, label: 'Draw', title: `Edit ${p.name} in the Draw tab` };
    }
    return null;
  }

  // what a node sends out: 'shapes' or 'image'
  kindOf(id) {
    const n = this.doc.nodes.find(m => m.id === id);
    return n ? this.octo.typeMap[n.type].out : 'shapes';
  }
  hoverPort(ev) {
    this.clearHover();
    const p = this.portUnder(ev);
    if (p) { p.classList.add('hover'); this.hovered = p; }
  }
  clearHover() { if (this.hovered) this.hovered.classList.remove('hover'); this.hovered = null; }

  duplicate(id) {
    const n = this.doc.nodes.find(n => n.id === id);
    if (!n) return;
    this.edit(g => {
      const nid = g.add(n.type, n.x + 40, n.y + 40);
      for (const [k, v] of Object.entries(n.settings)) if (v.set) g.set(nid, k, v.text);
      n.inputs.forEach((src, k) => { if (src >= 0) g.connect(src, nid, k); });
      this.selected = nid;
    }, { rebuild: true });
  }

  openPalette(cx, cy) {
    const r = this.root.getBoundingClientRect();
    this.paletteAt = this.toWorld(cx, cy);
    // from a wire, only the nodes it can plug into: one with an input for a wire
    // out of a node, one that makes shapes (any but output) for a wire into an input
    const kind = this.dragKind || 'shapes';
    const filter = this.pendingFrom != null ? (t => (t.inputKinds || []).includes(kind))
      : this.pendingTo ? (t => t.name !== 'output' && t.out === kind) : null;
    this.palette.show(cx - r.left, cy - r.top, filter);
  }

  paletteChose(type) {
    const at = this.paletteAt || { x: 0, y: 0 };
    const from = this.pendingFrom, into = this.pendingTo;
    this.pendingFrom = undefined;
    this.pendingTo = undefined;
    if (!type) return;
    this.edit(g => {
      const id = g.add(type, Math.round(at.x), Math.round(at.y - 20));
      if (from != null) g.connect(from, id, Math.max(0, (this.octo.typeMap[type].inputKinds || []).indexOf(this.kindOf(from))));
      if (into) {
        g.move(id, Math.round(at.x - 230), Math.round(at.y - 20));
        g.connect(id, into.to, into.slot);
      }
      this.selected = id;
    }, { rebuild: true });
    this.onSelect(this.selected);
  }
}

// Wires as in OctoShaper's graphs: a short stub out of each port, a straight run between.
function curve(a, b) {
  return `M ${a.x} ${a.y} H ${a.x + 16} L ${b.x - 16} ${b.y} H ${b.x}`;
}

// The add-node menu: type to filter, arrows and Enter to choose.
class Palette {
  constructor(root, octo, chose) {
    this.octo = octo;
    this.chose = chose;
    this.el = h('div', 'palette');
    this.input = h('input');
    this.input.placeholder = 'Add a node…';
    this.list = h('div', 'palette-list');
    this.doc = h('div', 'palette-doc');
    this.el.append(this.input, this.list, this.doc);
    this.el.style.display = 'none';
    root.append(this.el);
    this.open = false;
    this.input.addEventListener('input', () => this.fill());
    this.input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { this.hide(); this.chose(null); }
      else if (e.key === 'ArrowDown') { this.active = Math.min(this.items.length - 1, this.active + 1); this.mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.active = Math.max(0, this.active - 1); this.mark(); e.preventDefault(); }
      else if (e.key === 'Enter' && this.items[this.active]) this.pick(this.items[this.active].dataset.type);
    });
  }
  show(x, y, filter = null) {
    this.open = true;
    this.filter = filter;
    this.input.placeholder = filter ? 'Add a node to connect…' : 'Add a node…';
    this.el.style.display = '';
    const r = this.el.parentElement.getBoundingClientRect();
    this.el.style.left = Math.min(x, r.width - 300) + 'px';
    this.el.style.top = Math.min(y, r.height - 380) + 'px';
    this.input.value = '';
    this.hovered = null;
    this.fill();
    this.input.focus();
  }
  hide() { this.open = false; this.el.style.display = 'none'; if (this.nodeDoc) this.nodeDoc.hide(); }
  pick(type) { this.hide(); this.chose(type); }
  fill() {
    const q = this.input.value.trim().toLowerCase();
    this.list.replaceChildren();
    const order = ['make', 'shape', 'move', 'grow', 'pick', 'look', 'image', 'combine'];
    const types = this.octo.types.filter(t => (!this.filter || this.filter(t)) && (!q || t.name.includes(q) || t.doc.toLowerCase().includes(q)))
      .sort((a, b) => (q && a.name.startsWith(q) ? -1 : 0) - (q && b.name.startsWith(q) ? -1 : 0) || order.indexOf(a.category) - order.indexOf(b.category));
    let cat = null;
    this.items = [];
    for (const t of types) {
      if (!q && t.category !== cat) { cat = t.category; this.list.append(h('div', 'palette-cat', cat)); }
      const it = h('div', `palette-item cat-${t.category}`);
      it.dataset.type = t.name;
      it.append(h('span', 'dot'), h('span', 'pname', t.name), h('span', 'pdoc', t.doc));
      it.addEventListener('pointerdown', e => { e.preventDefault(); this.pick(t.name); });
      // pointermove, not pointerenter: a menu opening under the pointer is not a hover
      it.addEventListener('pointermove', () => {
        if (this.items[this.active] !== it) { this.active = this.items.indexOf(it); this.mark(); }
        if (this.nodeDoc && this.open && this.hovered !== it) { this.hovered = it; this.nodeDoc.later(t.name, it, 350, { side: 'right' }); }
      });
      it.addEventListener('pointerleave', () => { this.hovered = null; if (this.nodeDoc) this.nodeDoc.cancel(); });
      this.list.append(it);
      this.items.push(it);
    }
    this.active = 0;
    this.mark();
  }
  mark() {
    this.items.forEach((it, k) => it.classList.toggle('active', k === this.active));
    const it = this.items[this.active];
    // scroll the list only (scrollIntoView would move the graph as well)
    if (it) {
      const l = this.list;
      if (it.offsetTop < l.scrollTop) l.scrollTop = it.offsetTop - 4;
      else if (it.offsetTop + it.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = it.offsetTop + it.offsetHeight - l.clientHeight + 4;
    }
    const t = it && this.octo.typeMap[it.dataset.type];
    this.doc.textContent = t ? `${t.name}(${[...t.inputs, ...t.settings.map(s => s.name + ': ' + s.default)].join(', ')})` : '';
  }
}

// a setting that holds an expression, not a number, is marked ƒ and says what it reads as
function markExpr(row, text) {
  const expr = !!text && !isPlainNumber(text) && !/^#/.test(text);
  row.classList.toggle('expr', expr);
  const input = row.querySelector('input.num');
  if (!input) return;
  const r = expr ? explain(text, new Set()) : null;
  input.title = r ? `${r.text}${r.perShape ? ', for each shape' : ''}` : '';
}

// The help card under a focused number field.
class Help {
  constructor(root, octo) {
    this.root = root;
    this.octo = octo;
    this.el = h('div', 'setting-help');
    this.el.style.display = 'none';
    // clicks inside keep the field focused
    this.el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
    root.append(this.el);
    this.params = [];
  }
  refresh(doc) {
    this.params = doc.params;
    this.doc = doc;
    if (this.input) this.update();
  }
  show(input, id, s) {
    this.input = input;
    this.id = id;
    this.s = s;
    this.el.style.display = '';
    this.update();
    this.place();
  }
  hide() { this.input = null; this.el.style.display = 'none'; }
  place() {
    if (!this.input) return;
    const r = this.root.getBoundingClientRect(), b = this.input.getBoundingClientRect();
    const w = 300, gap = 8, el = this.el;
    el.style.maxHeight = '';
    el.style.overflowY = '';
    let x = b.left - r.left - 40;
    x = Math.max(8, Math.min(x, r.width - w - 8));
    // never over the field: below it if it fits, else above, else on the roomier side and scrolled
    const below = r.bottom - b.bottom - gap - 8, above = b.top - r.top - gap - 8, hgt = el.offsetHeight;
    let y;
    if (hgt <= below) y = b.bottom - r.top + gap;
    else if (hgt <= above) y = b.top - r.top - gap - hgt;
    else if (below >= above) { el.style.maxHeight = Math.max(80, below) + 'px'; el.style.overflowY = 'auto'; y = b.bottom - r.top + gap; }
    else { const m = Math.max(80, above); el.style.maxHeight = m + 'px'; el.style.overflowY = 'auto'; y = b.top - r.top - gap - Math.min(hgt, m); }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }
  insert(text) {
    const inp = this.input;
    const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
    const plain = inp.dataset.fresh || (isPlainNumber(inp.value) && a === 0 && b === inp.value.length);
    inp.dataset.fresh = '';
    inp.setRangeText(text, plain ? 0 : a, plain ? inp.value.length : b, 'end');
    // a function's first argument is selected, ready to type over
    const open = text.indexOf('(');
    if (open > 0) {
      const end = inp.selectionEnd - text.length;
      const close = text.search(/[,)]/);
      inp.setSelectionRange(end + open + 1, end + close);
    }
    inp.dispatchEvent(new Event('input'));
  }
  update() {
    if (!this.input) return;
    const s = this.s, text = this.input.value.trim();
    const params = new Set(this.params.map(p => p.name));
    const node = this.doc?.nodes.find(n => n.id === this.id);
    const saved = node?.settings[s.name];
    // in an image node a formula runs for every pixel
    const pixel = this.octo && node && this.octo.typeMap[node.type]?.out === 'image';
    const vars = pixel ? PIXEL_VARS : VARS;
    const el = this.el;
    el.replaceChildren();
    const title = h('div', 'help-title');
    title.append(h('b', null, s.name), h('span', null, ` ${s.doc}`));
    el.append(title);
    const m = meaning(node?.type, s.name);
    if (m) el.append(h('div', 'help-meaning', m));
    const r = text ? explain(text, params) : null;
    const read = h('div', 'help-read');
    if (!text) read.textContent = `Empty uses the default, ${s.default}.`;
    else if (!r) read.append(h('span', 'bad', 'This does not read as an expression yet.'));
    else {
      read.append(h('span', 'k', 'Reads as '), h('span', 'v', r.text));
      if (!r.plain) read.append(h('span', 'tag', r.perShape ? (pixel ? 'per pixel' : 'per shape') : 'same for all'));
    }
    el.append(read);
    if (saved?.error && saved.text === text) el.append(h('div', 'help-err', saved.error));
    const unknown = r && [...collectNames(text)].filter(x => !params.has(x) && !VARS.some(v => v[0] === x) && !PIXEL_VARS.some(v => v[0] === x) && !FUNCS.some(f => f[0].startsWith(x + '(')));
    if (unknown && unknown.length) el.append(h('div', 'help-note', `${unknown.join(', ')} will become a param when you press Enter.`));
    const names = h('div', 'help-chips');
    names.append(h('div', 'help-k', pixel ? 'Each pixel has' : 'Each shape has'));
    for (const [v, d] of vars) if (v !== 'pi') names.append(this.chip(v, `${v}: ${d}`, v, 'var', LABEL[v]));
    if (this.params.length) {
      names.append(h('div', 'help-k', 'Params'));
      for (const p of this.params) {
        if (p.kind === 'points' || p.kind === 'cells') continue;
        if (p.kind === 'bounds') {
          // the size and the middle are what a setting usually wants; the sides are there too
          const v = p.value, parts = { w: ['its width', v[3] - v[0]], h: ['its height', v[4] - v[1]], d: ['its depth', v[5] - v[2]], x: ['the x of its middle', (v[0] + v[3]) / 2], y: ['the y of its middle', (v[1] + v[4]) / 2], z: ['the z of its middle', (v[2] + v[5]) / 2], x0: ['its low x side', v[0]], x1: ['its high x side', v[3]], y0: ['its bottom', v[1]], y1: ['its top', v[4]], z0: ['its low z side', v[2]], z1: ['its high z side', v[5]] };
          for (const [a, [d, n]] of Object.entries(parts)) names.append(this.chip(`${p.name}.${a}`, `bounds ${p.name}: ${d}, now ${Math.round(n * 1000) / 1000}`, `${p.name}.${a}`, 'param'));
          continue;
        }
        if (p.kind === 'curve') { names.append(this.chip(p.name, `curve: ${p.name}(t) is its height at t, from 0 to 1`, `${p.name}(t)`, 'param')); continue; }
        if (p.kind === 'vector') ['x', 'y', 'z'].forEach((a, k) => names.append(this.chip(`${p.name}.${a}`, `the ${a} of the position ${p.name}, now ${p.value[k]}`, `${p.name}.${a}`, 'param')));
        else names.append(this.chip(p.name, `param, now ${p.value}`, p.name, 'param'));
      }
    }
    names.append(h('div', 'help-k', 'Functions'));
    for (const [f, d] of FUNCS) names.append(this.chip(f.replace(/\(.*/, ''), `${f}: ${d}`, f.replace(/\((.*)\)/, (_, a) => `(${a})`), 'fn'));
    el.append(names);
    el.append(h('div', 'help-ops', `${OPS} Any new name becomes a param.`));
    this.place();
  }
  chip(label, title, text, cls, sub) {
    const c = h('button', 'hchip' + (cls ? ' ' + cls : ''), label);
    if (sub && sub !== label) c.append(h('small', null, sub));
    c.title = title;
    c.addEventListener('click', () => this.insert(text));
    return c;
  }
}

function collectNames(text) {
  const out = new Set();
  for (const m of text.matchAll(/([A-Za-z_]\w*)\s*(\()?/g)) if (!m[2]) out.add(m[1]);
  return out;
}
