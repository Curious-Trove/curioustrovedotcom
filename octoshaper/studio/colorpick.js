// A small colour picker that opens beside what was clicked: a saturation and
// brightness square, a hue bar and the hex code. The same picker everywhere (the
// code, the graph), and the same in the web edition and the desktop app, where
// the system picker would open in a window of its own.

const h = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hu = 0;
  if (d) hu = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hu * 60, mx ? d / mx : 0, mx];
}
function hsvToHex([hu, s, v]) {
  const f = k => { const x = (k + hu / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return '#' + [f(5), f(3), f(1)].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

let open = null;

export function closeColorPicker() { if (open) open(); }

// anchor: a DOMRect (or {left, right, top, bottom}); onInput(hex) while picking;
// onDone(hex) when it closes (Enter, Escape keeps the start colour, a click outside)
export function colorPicker(anchor, value, { onInput = () => {}, onDone = () => {} } = {}) {
  closeColorPicker();
  const start = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#888888';
  let hsv = hexToHsv(start);
  const card = h('div', 'cpick');
  const sv = h('div', 'cpick-sv'), svDot = h('i');
  const hue = h('div', 'cpick-hue'), hueDot = h('i');
  const row = h('div', 'cpick-row'), was = h('button', 'cpick-was'), now = h('span', 'cpick-now'), hex = h('input', 'cpick-hex');
  sv.append(svDot); hue.append(hueDot);
  was.type = 'button'; was.title = 'Back to the colour it was'; was.style.background = start;
  hex.spellcheck = false; hex.maxLength = 7;
  row.append(was, now, hex);
  card.append(sv, hue, row);
  document.body.append(card);

  const paint = (fromHex = false) => {
    const c = hsvToHex(hsv);
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex([hsv[0], 1, 1])})`;
    svDot.style.left = `${hsv[1] * 100}%`; svDot.style.top = `${(1 - hsv[2]) * 100}%`;
    hueDot.style.left = `${hsv[0] / 360 * 100}%`;
    now.style.background = c;
    if (!fromHex) hex.value = c;
    return c;
  };
  const changed = (fromHex) => onInput(paint(fromHex));
  const drag = (el, fn) => el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const at = ev => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); changed(); };
    at(e);
    const up = () => { el.removeEventListener('pointermove', at); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerup', up);
  });
  drag(sv, (x, y) => { hsv = [hsv[0], x, 1 - y]; });
  drag(hue, x => { hsv = [x * 360, hsv[1], hsv[2]]; });
  hex.addEventListener('input', () => {
    const v = hex.value.trim().replace(/^([0-9a-f]{6})$/i, '#$1');
    if (/^#[0-9a-f]{6}$/i.test(v)) { hsv = hexToHsv(v.toLowerCase()); changed(true); }
  });
  was.addEventListener('click', () => { hsv = hexToHsv(start); changed(); });

  // beside the anchor: to its right, or below it when there is no room
  const W = 196, H = 206;
  let x = anchor.right + 8, y = anchor.top - 8;
  if (x + W > innerWidth - 8) { x = clamp(anchor.left, 8, innerWidth - W - 8); y = anchor.bottom + 6; }
  if (y + H > innerHeight - 8) y = Math.max(8, anchor.top - H - 6);
  Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
  paint();

  const close = (keep = true) => {
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', key, true);
    card.remove();
    open = null;
    if (!keep) { hsv = hexToHsv(start); onInput(start); }
    onDone(keep ? hsvToHex(hsv) : start);
  };
  const outside = e => { if (!card.contains(e.target)) close(true); };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
  };
  setTimeout(() => { addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true); });
  open = () => close(true);
  return card;
}
