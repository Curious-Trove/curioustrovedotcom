// The Image tab: an image node shown large, repeated to check its seams. A paint
// node is painted here, pixel by pixel, or with brushstrokes over the pixels (kept as
// strokes, see core/src/stroke.c); a tileset shows its numbered tiles, and a click
// picks the one the stamp tool gives new cells.

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const CLEAR = 255;
const TOOLS = [
  ['pencil', 'Pencil', 'Paint pixels: click or drag'],
  ['line', 'Line', 'A straight line: drag from one end to the other'],
  ['fill', 'Fill', 'Fill the area of one colour under the pointer'],
  ['eraser', 'Eraser', 'Make pixels clear'],
  ['picker', 'Picker', 'Take the colour under the pointer'],
  ['brush', 'Brush', 'Brushstrokes of any colour, soft or hard, over the pixels: kept as strokes in the file, so they stay sharp at any size. A pen\'s pressure sets the width'],
  ['rub', 'Rub out', 'Rub out with a brush: clears what is under it, pixels and strokes'],
];
const BRUSH = t => t === 'brush' || t === 'rub';
const hex2 = v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
const n2 = v => String(Math.round(v * 100) / 100);

// the default brushes, for a hand-painted look: a kind of brush (core/src/stroke.c) with its width,
// softness and opacity. Picking one keeps the colour
export const BRUSHES = [
  { name: 'Round', kind: 'round', width: 4, soft: 0.3, alpha: 1, title: 'An even line' },
  { name: 'Ink', kind: 'taper', width: 3, soft: 0.15, alpha: 1, title: 'Thin at both ends and full in the middle: outlines, grass, hair' },
  { name: 'Flat', kind: 'flat', width: 7, soft: 0.2, alpha: 1, title: 'A flat brush held at 45 degrees: wide one way, thin the other, for painterly blocks of colour' },
  { name: 'Dry brush', kind: 'dry', width: 9, soft: 0.3, alpha: 1, title: 'Streaks of bristles that run dry along the stroke: wood, stone, worn paint' },
  { name: 'Chalk', kind: 'chalk', width: 7, soft: 0.4, alpha: 0.9, title: 'Grain in the paint, as on rough paper' },
  { name: 'Glaze', kind: 'round', width: 12, soft: 0.7, alpha: 0.3, title: 'A soft, see-through layer to build up light and shade' },
  { name: 'Airbrush', kind: 'round', width: 18, soft: 1, alpha: 0.2, title: 'Very soft and faint: gradients and glows' },
];

// a brushstroke as a line of a paint block: colour (or . to rub out), width, softness, kind, points
export function strokeLine({ color, alpha = 1, width, soft, rub, kind = 'round' }, pts) {
  const col = rub ? '.' : color + (alpha < 0.999 ? hex2(alpha) : '');
  return `~ ${col} ${n2(width)} ${n2(soft)}${kind && kind !== 'round' ? ' ' + kind : ''} : ` + pts.map(p => `${n2(p[0])} ${n2(p[1])}` + (Math.abs((p[2] ?? 1) - 1) > 0.005 ? ` ${n2(p[2])}` : '')).join(', ');
}

// the pixels a line from a to b crosses
export function linePixels(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

// fills the area of one value around x y; with wrap, areas join across the edges
export function floodFill(data, w, hh, x, y, v, wrap) {
  const from = data[y * w + x];
  if (from === v) return false;
  const todo = [[x, y]];
  while (todo.length) {
    let [px, py] = todo.pop();
    if (wrap) { px = ((px % w) + w) % w; py = ((py % hh) + hh) % hh; }
    else if (px < 0 || py < 0 || px >= w || py >= hh) continue;
    if (data[py * w + px] !== from) continue;
    data[py * w + px] = v;
    todo.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return true;
}

// painted pixels at another size: the nearest of the old ones
export function resample(p, w, hh) {
  const out = new Uint8Array(w * hh);
  if (!p) return out;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) out[y * w + x] = p.data[Math.floor(y * p.height / hh) * p.width + Math.floor(x * p.width / w)];
  return out;
}

export class ImagePanel {
  // host: { doc(), graph(), isImage(node), selected(), select(name), live(fn, kind), toast(text), tile(), setTile(n) }
  constructor(root, host) {
    this.root = root;
    this.host = host;
    this.name = null;      // the node shown
    this.tool = 'pencil';
    this.color = 1;
    this.tiled = false;
    this.mirrorX = false; this.mirrorY = false; this.wrap = false;
    // the brush: any colour, a width in hundredths of the image, its softness and how see-through
    this.brush = { color: '#3d5a2a', width: 4, soft: 0.3, alpha: 1, kind: 'round', name: 'Round' };
    this.stroke = 0;
    this.pick = root.querySelector('.img-node');
    this.info = root.querySelector('.img-info');
    this.bar = root.querySelector('.img-tools');
    this.canvas = root.querySelector('.img-canvas');
    this.scratch = document.createElement('canvas');
    this.pick.addEventListener('change', () => this.host.select(this.pick.value));
    // the texture's size: the node's size setting, a power of two
    this.sizePick = root.querySelector('.img-size');
    for (let s = 4; s <= 1024; s *= 2) { const o = h('option', null, `${s} px`); o.value = String(s); this.sizePick.append(o); }
    this.sizePick.addEventListener('change', () => {
      const n = this.node();
      if (n && n.settings.size) { const id = n.id, v = this.sizePick.value; this.host.edit(g => g.set(id, 'size', v)); }
    });
    const tiled = root.querySelector('[data-act=tiled]');
    tiled.addEventListener('click', () => { this.tiled = !this.tiled; tiled.classList.toggle('on', this.tiled); this.draw(); });
    this.canvas.addEventListener('pointerdown', e => this.down(e));
    this.canvas.addEventListener('pointermove', e => { if (!this.dragging) this.hover(e); });
    this.canvas.addEventListener('pointerleave', () => { this.over = null; this.overAt = null; this.draw(); });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  node() { return this.host.doc().nodes.find(n => n.name === this.name) || null; }

  // after every change: which node to show, its picture, and the tools that fit it
  update() {
    const doc = this.host.doc();
    const images = doc.nodes.filter(n => this.host.isImage(n));
    const sel = images.find(n => n.name === this.host.selected());
    if (sel) this.name = sel.name;
    else if (!images.some(n => n.name === this.name)) this.name = images.length ? images[images.length - 1].name : null;
    const key = images.map(n => n.name).join('|');
    if (key !== this.pickKey) {
      this.pickKey = key;
      this.pick.replaceChildren(...images.map(n => { const o = h('option', null, n.name); o.value = n.name; return o; }));
    }
    this.pick.value = this.name || '';
    this.pick.hidden = !images.length;
    const n = this.node();
    this.im = n ? this.host.graph().nodeImage(n.id) : null;
    this.cell = n && n.type === 'tileset' ? Math.max(1, Math.round(parseFloat(n.settings.cell.text) || 16)) : 0;
    this.palette = n && n.type === 'paint' ? (n.settings.palette.text.match(/#[0-9a-fA-F]{3,8}/g) || []) : null;
    if (this.palette && this.color >= this.palette.length) this.color = Math.max(0, this.palette.length - 1);
    this.info.textContent = !n ? 'no image nodes yet: add a noise, a pattern or a paint node' : n.error ? n.error : this.im ? `${n.type} · ${this.im.width} × ${this.im.height}` + (this.cell ? ` · tile ${this.host.tile()} picked` : '') : n.type;
    // a size picker for a node whose size is a plain number of pixels (a formula is left to the code)
    const sz = n && n.settings.size && /^\d+$/.test(n.settings.size.text.trim()) && this.host.isImage(n) ? n.settings.size.text.trim() : null;
    this.sizePick.hidden = !sz;
    if (sz) {
      if (![...this.sizePick.options].some(o => o.value === sz)) { const o = h('option', null, `${sz} px`); o.value = sz; this.sizePick.append(o); }
      this.sizePick.value = sz;
    }
    this.buildBar(n);
    this.draw();
  }

  buildBar(n) {
    const key = !n ? '' : n.type === 'paint' ? `paint:${this.palette.join()}:${this.tool}:${this.color}:${this.mirrorX}:${this.mirrorY}:${this.wrap}:${BRUSH(this.tool) ? JSON.stringify(this.brush) : ''}` : n.type === 'tileset' ? 'tileset' : '';
    if (key === this.barKey) return;
    this.barKey = key;
    this.bar.replaceChildren();
    this.bar.hidden = !key;
    if (!key) return;
    if (n.type === 'tileset') {
      this.bar.append(h('span', 'hint', 'Click a tile to pick it: the stamp tool gives its number to new cells, and a color node shows it with map: tile, tile: value.'));
      return;
    }
    for (const [id, label, title] of TOOLS) {
      const b = h('button', 'small toggle' + (this.tool === id ? ' on' : ''), label);
      b.title = title;
      b.dataset.tool = id;
      b.addEventListener('click', () => { this.tool = id; this.buildBar(this.node()); });
      this.bar.append(b);
    }
    const sw = h('div', 'img-palette');
    this.palette.forEach((c, k) => {
      const b = h('button', 'img-swatch' + (k === this.color ? ' on' : ''));
      b.style.background = c;
      b.title = `Colour ${k}: ${c}. The palette is the paint node's own setting`;
      b.dataset.color = k;
      b.addEventListener('click', () => {
        // with the brush, a swatch gives it that colour; otherwise it picks the colour pixels are painted with
        if (this.tool === 'brush') { this.brush.color = c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c.slice(0, 7); this.buildBar(this.node()); return; }
        this.color = k; if (this.tool === 'eraser' || this.tool === 'picker' || this.tool === 'rub') this.tool = 'pencil'; this.buildBar(this.node());
      });
      sw.append(b);
    });
    this.bar.append(sw);
    const toggle = (label, prop, title) => {
      const b = h('button', 'small toggle' + (this[prop] ? ' on' : ''), label);
      b.title = title;
      b.dataset.opt = prop;
      b.addEventListener('click', () => { this[prop] = !this[prop]; this.buildBar(this.node()); });
      return b;
    };
    if (BRUSH(this.tool)) this.bar.append(this.brushBar(n));
    this.bar.append(
      toggle('Mirror X', 'mirrorX', 'Paint the same on the left and the right'),
      toggle('Mirror Y', 'mirrorY', 'Paint the same on the top and the bottom'),
      toggle('Wrap', 'wrap', 'Lines and fills go on across the edges, for tiles with no seams; turn Tiled on to see them'));
  }

  // the brush's colour, width, softness and opacity, and a button that clears the strokes
  brushBar(n) {
    const box = h('div', 'img-brush');
    // the default brushes
    const presets = h('div', 'img-presets');
    for (const b of BRUSHES) {
      const btn = h('button', 'small toggle' + (this.brush.name === b.name ? ' on' : ''), b.name);
      btn.title = b.title;
      btn.addEventListener('click', () => { Object.assign(this.brush, { kind: b.kind, width: b.width, soft: b.soft, alpha: b.alpha, name: b.name }); this.barKey = null; this.buildBar(this.node()); });
      presets.append(btn);
    }
    box.append(presets);
    const slider = (label, prop, lo, hi, step, title) => {
      const l = h('label', 'img-slider');
      l.title = title;
      const r = h('input'); r.type = 'range'; r.min = lo; r.max = hi; r.step = step; r.value = this.brush[prop];
      const v = h('span', 'img-val', n2(this.brush[prop]));
      r.addEventListener('input', () => { this.brush[prop] = parseFloat(r.value); v.textContent = n2(this.brush[prop]); this.barKey = null; this.draw(); });
      l.append(h('span', null, label), r, v);
      return l;
    };
    if (this.tool === 'brush') {
      const col = h('input', 'img-color');
      col.type = 'color'; col.value = this.brush.color; col.title = 'The brush\'s colour: any colour, or a swatch of the palette';
      col.addEventListener('input', () => { this.brush.color = col.value; this.barKey = null; });
      box.append(col);
    }
    box.append(slider('size', 'width', 0.3, 30, 0.1, 'Width of the brush, in hundredths of the image across'),
      slider('soft', 'soft', 0, 1, 0.05, '0 a hard edge, 1 soft all the way in'));
    if (this.tool === 'brush') box.append(slider('opacity', 'alpha', 0.05, 1, 0.05, 'How much it covers what is under it'));
    const clear = h('button', 'small', 'Clear strokes');
    clear.title = 'Remove every brushstroke of this node, keeping its pixels';
    clear.addEventListener('click', () => { const id = n.id; this.host.edit(g => g.setStrokes(id, '')); });
    box.append(clear);
    return box;
  }

  // where the image is drawn: one pixel of it is s canvas pixels, its top left at ox oy
  place() {
    const c = this.canvas, im = this.im;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr) || 400, hh = Math.round(c.clientHeight * dpr) || 300;
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    if (!im) return null;
    const reps = this.tiled ? 3 : 1;
    let s = Math.min(w / (im.width * reps), hh / (im.height * reps)) * 0.94;
    if (s > 1) s = Math.floor(s);
    return { s, ox: Math.round((w - im.width * s) / 2), oy: Math.round((hh - im.height * s) / 2), dpr, w, h: hh };
  }

  draw() {
    const c = this.canvas, ctx = c.getContext('2d'), im = this.im, p = this.place();
    ctx.clearRect(0, 0, c.width, c.height);
    if (!im || !p) return;
    const css = getComputedStyle(this.root);
    const ink = css.getPropertyValue('--ct-heading').trim() || '#2b1a6e', line = css.getPropertyValue('--ct-line-strong').trim() || '#d6ccf3';
    this.scratch.width = im.width; this.scratch.height = im.height;
    this.scratch.getContext('2d').putImageData(new ImageData(im.data, im.width, im.height), 0, 0);
    const W = im.width * p.s, H = im.height * p.s;
    ctx.imageSmoothingEnabled = p.s < 1;
    const reps = this.tiled ? [-1, 0, 1] : [0];
    for (const ty of reps) for (const tx of reps) {
      const x = p.ox + tx * W, y = p.oy + ty * H;
      // a chequered ground shows what is clear
      const q = Math.max(4, Math.round(8 * p.dpr));
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
      for (let j = 0; j * q < H; j++) for (let i = 0; i * q < W; i++) {
        ctx.fillStyle = (i + j) % 2 ? '#d9d4e6' : '#f4f2f9';
        ctx.fillRect(x + i * q, y + j * q, q, q);
      }
      ctx.drawImage(this.scratch, x, y, W, H);
      ctx.restore();
    }
    ctx.lineWidth = Math.max(1, p.dpr);
    // the pixel grid of a painted image, once pixels are large enough
    if (this.palette && p.s >= 6 * p.dpr) {
      ctx.strokeStyle = line; ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let i = 1; i < im.width; i++) { ctx.moveTo(p.ox + i * p.s + 0.5, p.oy); ctx.lineTo(p.ox + i * p.s + 0.5, p.oy + H); }
      for (let j = 1; j < im.height; j++) { ctx.moveTo(p.ox, p.oy + j * p.s + 0.5); ctx.lineTo(p.ox + W, p.oy + j * p.s + 0.5); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.cell) {
      const cs = this.cell * p.s, cols = Math.floor(im.width / this.cell), rows = Math.floor(im.height / this.cell);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) { ctx.moveTo(p.ox + i * cs + 0.5, p.oy); ctx.lineTo(p.ox + i * cs + 0.5, p.oy + rows * cs); }
      for (let j = 0; j <= rows; j++) { ctx.moveTo(p.ox, p.oy + j * cs + 0.5); ctx.lineTo(p.ox + cols * cs, p.oy + j * cs + 0.5); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (cs >= 22 * p.dpr) {
        ctx.font = `700 ${Math.round(10 * p.dpr)}px sans-serif`;
        ctx.textBaseline = 'top';
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const t = String(j * cols + i), tw = ctx.measureText(t).width;
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(p.ox + i * cs + 2, p.oy + j * cs + 2, tw + 4 * p.dpr, 12 * p.dpr);
          ctx.fillStyle = ink; ctx.fillText(t, p.ox + i * cs + 2 + 2 * p.dpr, p.oy + j * cs + 2 + p.dpr);
        }
      }
      const t = this.host.tile();
      if (cols && t >= 0 && t < cols * rows) {
        ctx.strokeStyle = '#14bfa0'; ctx.lineWidth = 3 * p.dpr;
        ctx.strokeRect(p.ox + (t % cols) * cs, p.oy + Math.floor(t / cols) * cs, cs, cs);
      }
    }
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, p.dpr); ctx.globalAlpha = this.tiled ? 0.9 : 0.35;
    ctx.strokeRect(p.ox - 0.5, p.oy - 0.5, W + 1, H + 1);
    ctx.globalAlpha = 1;
    if (this.overAt && BRUSH(this.tool) && this.palette) {
      // the brush, its size on the image
      const r = this.brush.width / 100 * (im.width + im.height) / 2 * p.s / 2;
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, p.dpr); ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(p.ox + this.overAt[0] / 100 * W, p.oy + this.overAt[1] / 100 * H, Math.max(2, r), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (this.over && this.palette && p.s >= 3) {
      ctx.strokeStyle = '#14bfa0'; ctx.lineWidth = 2 * p.dpr;
      ctx.strokeRect(p.ox + this.over[0] * p.s, p.oy + this.over[1] * p.s, p.s, p.s);
    }
  }

  // the pixel under the pointer; outside the image it is null, unless painting wraps
  pixel(e) {
    const p = this.place(), im = this.im;
    if (!p || !im) return null;
    const r = this.canvas.getBoundingClientRect();
    let x = Math.floor(((e.clientX - r.left) * p.dpr - p.ox) / p.s), y = Math.floor(((e.clientY - r.top) * p.dpr - p.oy) / p.s);
    if (this.wrap && this.tiled) { x = ((x % im.width) + im.width) % im.width; y = ((y % im.height) + im.height) % im.height; }
    if (x < 0 || y < 0 || x >= im.width || y >= im.height) return null;
    return [x, y];
  }
  // where the pointer is on the image, from 0 to 100 each way (what a brushstroke's points are in)
  spot(e) {
    const p = this.place(), im = this.im;
    if (!p || !im) return null;
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * p.dpr - p.ox) / (im.width * p.s) * 100, ((e.clientY - r.top) * p.dpr - p.oy) / (im.height * p.s) * 100];
  }
  hover(e) {
    if (BRUSH(this.tool) && this.palette) { this.overAt = this.spot(e); this.draw(); return; }
    this.overAt = null;
    const at = this.palette ? this.pixel(e) : null;
    if ((at && this.over && at[0] === this.over[0] && at[1] === this.over[1]) || (!at && !this.over)) return;
    this.over = at;
    this.draw();
  }

  down(e) {
    if (e.button !== 0) return;
    const n = this.node(), im = this.im, at = this.pixel(e);
    if (!n || !im || !at) return;
    if (this.cell) {
      const cols = Math.floor(im.width / this.cell), rows = Math.floor(im.height / this.cell);
      const cx = Math.floor(at[0] / this.cell), cy = Math.floor(at[1] / this.cell);
      if (cx < cols && cy < rows) { this.host.setTile(cy * cols + cx); this.update(); }
      return;
    }
    if (n.type !== 'paint') return;
    e.preventDefault();
    if (BRUSH(this.tool)) { this.brushDown(e, n); return; }
    const w = im.width, hh = im.height, g = this.host.graph();
    const stored = g.paint(n.id);
    const base = stored && stored.width === w && stored.height === hh ? stored.data : resample(stored, w, hh);
    if (this.tool === 'picker') {
      const v = base[at[1] * w + at[0]];
      if (v === CLEAR) this.tool = 'eraser'; else { this.color = v; this.tool = 'pencil'; }
      this.buildBar(n);
      return;
    }
    const v = this.tool === 'eraser' ? CLEAR : this.color;
    const kind = `paint:${n.name}:${++this.stroke}`;
    let data = base.slice(), last = at, changed = false;
    // one pixel, and its mirror images
    const put = (buf, x, y) => {
      if (this.wrap) { x = ((x % w) + w) % w; y = ((y % hh) + hh) % hh; }
      const xs = this.mirrorX ? [x, w - 1 - x] : [x], ys = this.mirrorY ? [y, hh - 1 - y] : [y];
      for (const py of ys) for (const px of xs) if (px >= 0 && py >= 0 && px < w && py < hh && buf[py * w + px] !== v) { buf[py * w + px] = v; changed = true; }
    };
    const send = buf => { const id = n.id; this.host.live(gr => gr.setPaint(id, buf, w, hh), kind); };
    if (this.tool === 'fill') {
      const xs = this.mirrorX ? [at[0], w - 1 - at[0]] : [at[0]], ys = this.mirrorY ? [at[1], hh - 1 - at[1]] : [at[1]];
      for (const y of ys) for (const x of xs) if (floodFill(data, w, hh, x, y, v, this.wrap)) changed = true;
      if (changed) send(data);
      return;
    }
    const line = this.tool === 'line';
    put(data, at[0], at[1]);
    if (changed) send(data);
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    const move = ev => {
      const q = this.pixel(ev);
      if (!q || (q[0] === last[0] && q[1] === last[1])) return;
      const before = changed;
      changed = false;
      if (line) { data = base.slice(); for (const [x, y] of linePixels(at[0], at[1], q[0], q[1])) put(data, x, y); changed = true; }
      else for (const [x, y] of linePixels(last[0], last[1], q[0], q[1])) put(data, x, y);
      last = q;
      this.over = q;
      if (changed) send(data);
      changed = changed || before;
    };
    const up = () => {
      this.dragging = false;
      this.canvas.removeEventListener('pointermove', move);
      this.canvas.removeEventListener('pointerup', up);
      this.canvas.removeEventListener('pointercancel', up);
    };
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  // a brushstroke: its points as the pointer moves, sent as the node's strokes while it is drawn
  brushDown(e, n) {
    const g = this.host.graph(), before = g.strokes(n.id).trim(), id = n.id;
    const kind = `strokes:${n.name}:${++this.stroke}`;
    const style = { ...this.brush, rub: this.tool === 'rub' };
    const pressure = ev => (ev.pointerType === 'pen' && ev.pressure > 0 ? Math.min(2, ev.pressure * 2) : 1);
    const pts = [];
    const add = ev => {
      const q = this.spot(ev);
      if (!q) return false;
      const last = pts[pts.length - 1];
      // a point when the pointer has moved a little, so long strokes stay short in the text
      if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < Math.max(0.3, style.width * 0.15)) return false;
      pts.push([q[0], q[1], pressure(ev)]);
      return true;
    };
    // the stroke, and its mirror images
    const lines = () => {
      const sets = [pts];
      if (this.mirrorX) sets.push(...sets.map(s => s.map(p => [100 - p[0], p[1], p[2]])));
      if (this.mirrorY) sets.push(...sets.map(s => s.map(p => [p[0], 100 - p[1], p[2]])));
      return sets.map(s => strokeLine(style, s)).join('\n');
    };
    const send = () => { const text = (before ? before + '\n' : '') + lines(); this.host.live(gr => gr.setStrokes(id, text), kind); };
    if (add(e)) send();
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    const move = ev => { this.overAt = this.spot(ev); if (add(ev)) send(); else this.draw(); };
    const up = () => {
      this.dragging = false;
      this.canvas.removeEventListener('pointermove', move);
      this.canvas.removeEventListener('pointerup', up);
      this.canvas.removeEventListener('pointercancel', up);
    };
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }
}
