// What a node does, as a card: its line of documentation, a picture of a small
// example (what goes in, and what comes out), its inputs and its settings. Shown when
// the pointer rests on a node's type in the graph, on a type name in the code, or on
// an entry of the add-node menu. The pictures are drawn by the studio's renderer from
// real OctoLang, so they always match what the node does.
import { camera, cssColor } from './render.js?v=e2bbaab254';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// for each type: the code of a small example. `src` is what goes in (left picture),
// `n` the node itself, and `show` (if there is one) what is drawn for it on the right.
const BASE = 'src = box(w: 6, h: 6, d: 6)\n';
const ROW = 'src = line(count: 4, length: 14, w: 2.5, h: 2.5, d: 2.5)\n';
const LOTS = 'src = grid(nx: 4, nz: 4, cell: 4, h: 0.4)\n';
const EXAMPLES = {
  box: 'n = box(w: 4, h: 6, d: 4)',
  grid: 'n = grid(nx: 5, nz: 5, cell: 3)\nshow = inset(n, by: 0.3)',
  circle: 'n = circle(count: 10, radius: 10)',
  line: 'n = line(count: 6, length: 20)',
  along: 'n = along(path: [-12 0 0, -4 0 8, 4 0 -6, 12 0 2], count: 12, w: 1.5, h: 3, d: 1.5)',
  fill: 'n = fill(path: [-10 0 -8, 10 0 -10, 6 0 10, -8 0 6], cell: 2, h: 0.6)\nshow = inset(n, by: 0.15)',
  scatter: 'src = box(w: 10, h: 6, d: 10)\nn = scatter(src, side: all, count: 60, size: 0.7, gap: 1.5)\nshow = merge(src, n)',
  grow: 'wall = box(w: 10, h: 7, d: 1)\nfloor = box(w: 14, h: 0.4, d: 8, y: -0.4)\nsrc = merge(wall, floor)\nroots = scatter(floor, count: 4, size: 0.2)\nn = grow(src, roots, length: 10)\ngreen = color(n, color: #5b8a3c, vary: 0.3)\nshow = merge(src, green)',
  cells: 'param blocks = cells [0 0 0, 1 0 0, 2 0 0, 0 1 0, 0 0 1 : 2]\nn = cells(cells: blocks, size: 2)\nroofs = keep(n, chance: 1 - has(0, 1, 0))\ntops = face(roofs, side: top, depth: 0.3)\nwalls = color(n, color: #cfc8b8, vary: 0.2)\nred = color(tops, color: #c0553a)\nshow = merge(walls, red)',
  tileset: 'src = paint(palette: [#3d5a2a, #7fa35a, #84643f, #b08d57], size: 8)\nn = tileset(src, cell: 4)\npaint src {\n  00112233\n  01012323\n  00112233\n  01012323\n  11003322\n  10103232\n  11003322\n  10103232\n}',
  paint: 'n = paint(palette: [#26241f, #f2c200, #d9482b], size: 8)\npaint n {\n  ..1111..\n  .111111.\n  11011011\n  11111111\n  11111111\n  11022011\n  .112211.\n  ..1111..\n}',
  cover: 'src = box(w: 8, h: 5, d: 3)\nn = cover(src, density: 5, size: 0.8)\ngreen = color(n, color: #4f8a32, vary: 0.4, material: foliage)\ndark = color(src, color: #2c4a22)\nshow = merge(dark, green)',
  tone: 'unit = box(w: 6, h: 7, d: 6)\nsrc = shape(unit, as: cone, flare: 0.8)\nn = tone(src, ramp: [#1d4a22, #6fae3c, #e8d44a], by: y / h, bands: 4)',
  touch: 'base = box(w: 8, h: 5, d: 8)\nsrc = color(base, color: #cfc8b8)\nn = touch(src, at: [4 3 1, 4 2 -1.5, 1 5 2], size: 1.4, color: #c8402a, soft: 0.3)',
  text: 'n = text("EXIT 12", color: #f2c200)',
  decal: 'src = box(w: 8, h: 5, d: 8)\nbars = pattern(as: stripes, rows: 4, turn: 45)\nsign = colorize(bars, ramp: [#26241f, #f2c200])\nn = decal(src, sign, size: 2, count: 2, gap: 3)\nshow = merge(src, n)',
  move: ROW + 'n = move(src, y: i * 2)',
  rotate: ROW + 'n = rotate(src, y: i * 25)',
  scale: ROW + 'n = scale(src, by: 0.5 + i * 0.4)',
  size: ROW + 'n = size(src, h: 2 + i * 3)',
  extrude: LOTS + 'n = extrude(src, height: rand(2, 8))',
  inset: LOTS + 'n = inset(src, by: 0.8)',
  split: 'src = box(w: 12, h: 6, d: 4)\nn = split(src, axis: x, count: 3, pattern: [1, 3, 1])\nshow = inset(n, by: 0.2)',
  repeat: 'src = box(w: 3, h: 2, d: 3)\nn = repeat(src, count: 4, axis: y, gap: 0.6)',
  face: BASE + 'n = face(src, side: top, depth: 0.8)\nshow = color(n, color: #8a74d8)\nshow2 = merge(src, show)',
  branch: 'src = box(w: 1, h: 6, d: 1)\nn = branch(src, levels: 3, count: 3)',
  keep: 'src = grid(nx: 6, nz: 6, cell: 2.5, h: 1)\nn = keep(src, chance: 0.5)\nshow = inset(n, by: 0.2)',
  jitter: LOTS + 'e = extrude(src, height: 3)\nn = jitter(e, move: 0.6, turn: 20, scale: 0.15)',
  copy: 'src = circle(count: 6, radius: 8, w: 2, h: 4, d: 2)\nunit = box(w: 1, h: 1, d: 1)\npiece = shape(unit, as: cone)\nball = shape(unit, as: sphere)\nn = copy(src, piece, ball)',
  shape: ROW + 'n = shape(src, as: cylinder)',
  tweak: ROW + 'n = tweak(src, edits: [@c28fef65 move 0 3 0, @b179f6f6 turn 35, @b179f6f6 color 0.89 0.45 0.36, @27c01cdb drop])',
  displace: 'src = box(w: 8, h: 5, d: 8)\nn = displace(src, by: noise(x * 0.6, y * 0.6, z * 0.6) * 1.6 - 0.5, detail: 1)',
  bend: 'src = line(count: 4, length: 16, w: 1, h: 8, d: 1)\nn = bend(src, angle: 20 + i * 30, taper: 0.4)',
  smooth: ROW + 'n = smooth(src, steps: 2, sharp: i * 0.3)',
  chip: 'src = line(count: 3, length: 12, w: 3.5, h: 3, d: 3)\nn = chip(src, amount: 0.7, size: 0.7, seed: i)',
  wear: 'floor = box(w: 14, h: 0.4, d: 8, y: -0.4)\nblocks = line(count: 3, length: 10, w: 2.6, h: 3, d: 2.6)\nboth = merge(floor, blocks)\nsrc = color(both, color: #b5553c)\nn = wear(src, edges: 0.7, cavity: 0.8, width: 0.5)',
  color: ROW + 'wall = pattern(as: bricks, rows: 6, cols: 3)\nn = color(src, texture: wall, color: #e2725b, vary: 0.4, scale: 2.5)',
  merge: 'src = box(w: 4, h: 4, d: 4)\nb = box(w: 4, h: 6, d: 4, x: 7)\nc = shape(b, as: cylinder)\nn = merge(src, c)',
  output: 'src = box(w: 4, h: 4, d: 4)\nn = output(src)',
  outline: 'n = outline(as: star, sides: 5, w: 12, d: 12, round: 0.3)\nshow = extrude(n, height: 0.6)',
  cut: 'src = outline(as: rect, w: 12, d: 12, round: 1)\nhole = outline(as: disc, w: 6, d: 6)\nn = cut(src, hole)\nshow = extrude(n, height: 1)',
  fuse: 'src = outline(as: disc, w: 8, d: 8)\nbar = outline(as: rect, w: 10, d: 4)\nbar_at = move(bar, x: 5)\nn = fuse(src, bar_at)\nshow = extrude(n, height: 1)',
  overlap: 'src = outline(as: disc, w: 10, d: 10)\nbar = outline(as: rect, w: 14, d: 4)\nbar_at = move(bar, x: 4)\nn = overlap(src, bar_at)\nshow = extrude(n, height: 1)',
  revolve: 'n = revolve(path: [3 0 0, 3.5 1 0, 2 3 0, 1.2 4.5 0, 2 6 0], sides: 32)',
  tube: 'n = tube(path: [-12 4 0, -4 4 0, 4 4 0, 12 4 0], radius: 0.15, curve: straight, sag: 1.5)',
  sweep: 'src = outline(path: [-1 0 0, 1 0 0, 1 0.8 0, -1 0.8 0])\nn = sweep(src, path: [-12 0 0, -4 0 6, 4 0 -6, 12 0 0])',
  morph: 'src = outline(as: rect, w: 8, d: 8)\nstar = outline(as: star, sides: 5, w: 10, d: 10)\nn = morph(src, star, t: 0.5)\nshow = extrude(n, height: 1)',
  noise: 'n = noise(as: smooth, scale: 4, detail: 4)',
  pattern: 'n = pattern(as: bricks, rows: 6, cols: 3, vary: 0.4)',
  gradient: 'n = gradient(as: line, ramp: [#2b1a6e, #e2725b, #ffd27a], turn: 90)',
  pixels: 'n = pixels(value: sin(x * 20) * 0.5 + 0.5, size: 64)',
  blend: 'src = pattern(as: bricks, rows: 6, cols: 3)\nstains = noise(scale: 3)\nn = blend(src, stains, mode: multiply, amount: 0.7)',
  colorize: 'src = noise(as: cells, scale: 5)\nn = colorize(src, ramp: [#3a2a20, #b5653a, #e8c9a0])',
  adjust: 'src = gradient(ramp: [#2b1a6e, #e2725b, #ffd27a])\nn = adjust(src, hue: 120)',
  raster: 'a = box(w: 6, h: 2, d: 6)\nb = box(w: 3, h: 3, d: 3, y: 2)\nc = shape(b, as: cone)\nboth = merge(a, c)\nsrc = color(both, color: #e2725b, vary: 0.5)\nn = raster(src, view: top, as: height)',
  blur: 'src = pattern(as: checker, rows: 4, cols: 4)\nn = blur(src, radius: 0.04)',
  warp: 'src = pattern(as: bricks, rows: 6, cols: 3)\nwaves = noise(scale: 3)\nn = warp(src, by: waves, amount: 0.6)',
  edges: 'src = pattern(as: dots, rows: 3, cols: 3)\nn = edges(src, as: outline, width: 0.03, color: #e2725b)',
  shade: 'src = noise(as: cells, scale: 5)\nn = shade(src, as: light, depth: 2)',
  tile: 'src = gradient(as: round, ramp: [#ffd27a, #e2725b, #2b1a6e])\nn = tile(src, as: repeat, count: 3)',
  palette: 'src = gradient(as: round, ramp: [#ffd27a, #e2725b, #2b1a6e])\nn = palette(src, count: 4, dither: ordered)',
  loft: 'src = outline(as: ngon, sides: 4, w: 8, d: 8)\ncrown = outline(as: disc, w: 4, d: 4)\nn = loft(src, crown, height: 10, twist: 90)',
};

export class NodeDoc {
  constructor(octo, previewer) {
    this.octo = octo;
    this.previewer = previewer;
    this.cache = new Map();
    this.card = h('div', 'node-doc');
    this.card.hidden = true;
    document.body.append(this.card);
    this.timer = 0;
    addEventListener('pointerdown', () => this.hide(), true);
    addEventListener('keydown', () => this.hide(), true);
    addEventListener('wheel', () => this.hide(), { capture: true, passive: true });
  }

  // rests on el: the card for type, after a moment
  attach(el, type) {
    el.classList.add('has-doc');
    el.addEventListener('pointerenter', () => this.later(type, el));
    el.addEventListener('pointerleave', () => this.cancel());
  }
  later(type, anchor, delay = 450, opts) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.show(type, anchor, opts), this.card.hidden ? delay : 60);
  }
  cancel() { clearTimeout(this.timer); this.timer = setTimeout(() => this.hide(), 120); }
  hide() { clearTimeout(this.timer); this.card.hidden = true; this.type = null; }

  // anchor: an element, or a rect; the card goes beside it, wherever there is room
  show(type, anchor, { side = 'below' } = {}) {
    const t = this.octo.typeMap[type];
    if (!t) return;
    if (this.type !== type) { this.fill(t); this.type = type; }
    this.card.hidden = false;
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const c = this.card.getBoundingClientRect();
    let x, y;
    if (side === 'right') { x = r.right + 10; y = r.top; if (x + c.width > innerWidth - 8) x = r.left - c.width - 10; }
    else { x = r.left; y = r.bottom + 8; if (y + c.height > innerHeight - 8) y = r.top - c.height - 8; }
    this.card.style.left = Math.max(8, Math.min(x, innerWidth - c.width - 8)) + 'px';
    this.card.style.top = Math.max(8, Math.min(y, innerHeight - c.height - 8)) + 'px';
  }

  fill(t) {
    const card = this.card;
    card.replaceChildren();
    card.className = `node-doc cat-${t.category}`;
    const head = h('div', 'nd-head');
    head.append(h('span', 'nd-name', t.name), h('span', 'tag', t.category));
    card.append(head, h('div', 'nd-doc', t.doc));
    const pics = this.pictures(t.name);
    if (pics) {
      const row = h('div', 'nd-pics');
      if (pics.before) {
        const a = h('figure');
        a.append(img(pics.before), h('figcaption', null, 'in'));
        row.append(a, h('span', 'nd-arrow', '→'));
      }
      const b = h('figure');
      b.append(img(pics.after), h('figcaption', null, pics.before ? 'out' : 'makes'));
      row.append(b);
      card.append(row);
    }
    const ex = EXAMPLES[t.name];
    if (ex) {
      const line = ex.split('\n').find(l => l.startsWith('n = '));
      if (line) card.append(h('code', 'nd-example', line.replace(/^n = /, `${t.name === 'output' ? 'out' : t.out === 'image' ? 'image' : 'shapes'} = `)));
    }
    if (t.name === 'shape') {
      const kinds = this.gallery();
      if (kinds.length) {
        card.append(h('div', 'nd-k', 'Kinds'));
        const grid = h('div', 'nd-gallery');
        for (const k of kinds) {
          const f = h('figure');
          f.append(img(k.url), h('figcaption', null, k.name));
          grid.append(f);
        }
        card.append(grid);
      }
    }
    if (t.inputs.length || t.variadic) {
      const ins = h('div', 'nd-k', 'Inputs');
      card.append(ins, h('div', 'nd-inputs', t.variadic ? 'any number of wires' : t.inputs.join(', ')));
    }
    if (t.settings.length) {
      card.append(h('div', 'nd-k', 'Settings'));
      const list = h('div', 'nd-settings');
      for (const s of t.settings) {
        const r = h('div', 'nd-setting');
        const name = h('code', null, s.name);
        const def = h('span', 'nd-def', s.kind === 'choice' ? s.options.split('|').join(' · ') : `${s.default}`);
        const doc = h('span', 'nd-sdoc', s.doc);
        if (s.when) doc.append(h('span', 'nd-when', ' · ' + s.when.split('|').join(', ')));
        r.append(name, doc, def);
        list.append(r);
      }
      card.append(list);
    }
  }

  // a small picture of every kind a shape node can draw, once per theme
  gallery() {
    const theme = document.documentElement.dataset.theme || 'light';
    const key = 'gallery:' + theme;
    if (this.cache.has(key)) return this.cache.get(key);
    const out = [];
    const t = this.octo.typeMap.shape;
    const kinds = t ? t.settings[0].options.split('|').filter(k => k !== 'none') : [];
    const bg = cssColor('--ct-surface-2', [0.97, 0.96, 0.99]);
    const g = this.octo.graph();
    try {
      for (const k of kinds) {
        if (g.parse(`a = box(w: 4, h: 4, d: 4)\nn = shape(a, as: ${k})\nout = output(n)`)) continue;
        g.eval();
        const n = g.json().nodes.find(m => m.name === 'n');
        const m = n && g.mesh(n.id);
        if (!m || !m.count) continue;
        out.push({ name: k, url: this.previewer.shot(m, 150, 120, camera(m.bounds, 150 / 120, { view: 'iso' }), { grid: false, bg }).toDataURL('image/png') });
      }
    } catch { /* no pictures */ } finally { g.free(); }
    this.cache.set(key, out);
    return out;
  }

  // two small pictures of the example, drawn once per type and theme
  pictures(type) {
    const theme = document.documentElement.dataset.theme || 'light';
    const key = type + ':' + theme;
    if (this.cache.has(key)) return this.cache.get(key);
    const src = EXAMPLES[type];
    let out = null;
    if (src) {
      const g = this.octo.graph();
      try {
        if (!g.parse(src)) {
          g.eval();
          const d = g.json();
          const by = name => d.nodes.find(n => n.name === name);
          const before = by('src'), after = by('show2') || by('show') || by('n');
          const bg = cssColor('--ct-surface-2', [0.97, 0.96, 0.99]);
          const pic = node => {
            if (!node) return null;
            if (this.octo.typeMap[node.type].out === 'image') return picture(g.nodeImage(node.id));
            const m = g.mesh(node.id);
            if (!m.count) return null;
            return this.previewer.shot(m, 300, 210, camera(m.bounds, 300 / 210, { view: 'iso' }), { grid: false, bg }).toDataURL('image/png');
          };
          const a = pic(after);
          if (a) out = { before: type === 'output' ? null : pic(before), after: a };
        }
      } catch { out = null; } finally { g.free(); }
    }
    this.cache.set(key, out);
    return out;
  }
}

// an image node's picture, as a data URL
function picture(im) {
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  c.getContext('2d').putImageData(new ImageData(im.data, im.width, im.height), 0, 0);
  return c.toDataURL('image/png');
}

function img(url) {
  const i = new Image();
  i.src = url;
  i.alt = '';
  return i;
}
