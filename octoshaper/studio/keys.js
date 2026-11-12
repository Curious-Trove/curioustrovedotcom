// Shortcuts and gestures, written once and shown the same way everywhere: in a
// card from each window's Keys button, in the card the 3D view shows while
// drawing, and in Help ▸ Keyboard shortcuts.
import { keyLabel } from './menu.js?v=e2bbaab254';

export const KEYS = {
  code: ['Code', [
    ['Indent', 'Tab'], ['New line, same indent', 'Enter'], ['Show a node in the graph', 'click its line'],
    ['What a node does', 'rest on its type'], ['Pick a colour', 'click it'], ['Undo, redo', 'Mod+Z, Mod+Shift+Z'],
  ]],
  graph: ['Graph', [
    ['Add a node', 'Tab or double-click'], ['Wire', 'drag from a port'], ['Change a setting', "drag its name, or type"],
    ['Rename a node', 'click its name'], ['Select several', 'drag on the canvas'], ['Select all', 'Mod+A'],
    ['Delete the selection or wire', 'Delete'], ['Duplicate the selected node', 'Mod+D'], ['Fit the graph', 'F'],
    ['Pan', 'two fingers on a trackpad, right drag or Space+drag'], ['Zoom', 'pinch, or the wheel'],
  ]],
  view: ['3D view', [
    ['Orbit', 'drag'], ['Pan', 'right drag or Shift+drag'], ['Zoom', 'wheel'], ['Move a handle', 'drag it'],
    ['Find what made a shape', 'click it'], ['Edit that one shape', 'drag its arrows, or Move, Turn, Scale over it'],
    ['Delete that one shape', 'Delete'], ['Let go of it', 'Escape, or click the ground'],
  ]],
  brush: ['Brush', [
    ['Place points', 'click or drag on a surface'], ['Take points away', 'Shift+click or drag'], ['Orbit while painting', 'Alt+drag'],
    ['Pan, zoom', 'right drag, wheel'], ['Stop', 'Escape, or Paint again'],
  ]],
  stamp: ['Stamp', [
    ['Add a cell', 'click the ground, or a side of a cell'], ['Lay a row or a floor', 'drag'], ['Take cells away', 'Shift+click or drag'],
    ['Choose the value new cells get', '1 to 9'], ['Orbit while stamping', 'Alt+drag'], ['Stop', 'Escape, or Stamp again'],
  ]],
  lines: ['Lines (spline tools)', [
    ['Add a point', 'press on the line'], ['Keep a point on one axis', 'Shift+drag'], ['Remove a point', 'Delete or double-click'],
    ['Draw the points again', 'Draw on its row in Params'], ['Look straight at it', 'Flat on its row in Params'],
  ]],
  pen: ['Drawing', [
    ['Add a point', 'click'], ['Finish', 'Enter or double-click'], ['Close an outline', 'click the first point'],
    ['Take back a point', 'Backspace'], ['Stop', 'Escape'], ['Orbit while drawing', 'drag'],
  ]],
  image: ['Image', [
    ['Show an image node', 'select it in the graph, or pick it here'], ['Check its seams', 'Tiled'], ['Paint (a paint node)', 'click or drag with Pencil, Line, Fill or Eraser'],
    ['Take a colour', 'Picker, then click a pixel'], ['Pick a tile (a tileset)', 'click it'], ['Undo a stroke', 'Mod+Z'],
  ]],
  draw: ['Draw', [
    ['Move a point', 'drag it'], ['Place it off the grid', 'Alt+drag'], ['Add a point', 'press on the line, or double-click the canvas'],
    ['Remove a point', 'double-click it, or Delete'], ['Type its place', 'the fields above'], ['Pan, zoom', 'two fingers and pinch, or drag the canvas and wheel'],
  ]],
  tabs: ['Tabs', [['Move or split', 'drag a tab onto a strip or the edge of a view'], ['Close', 'middle click'], ['More', 'right click']]],
};

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// key combinations (Mod+Z) in the platform's spelling; words (drag, Shift+drag) as written
const keyText = key => key.split(', ').map(k => (/^((Mod|Shift|Alt|Ctrl)\+)+[^a-z\s][A-Za-z]*$/.test(k) || k.length === 1 ? keyLabel(k) : k)).join(', ');

// one group: its title and a row per shortcut
export function keyRows([title, rows], into = h('div', 'shortcuts')) {
  into.append(h('div', 'sc-title', title));
  for (const [label, key] of rows) {
    const r = h('div', 'sc-row');
    r.append(h('span', null, label), h('kbd', null, keyText(key)));
    into.append(r);
  }
  return into;
}

export function keysCard(groups, cls = '') {
  const card = h('div', 'keys-card ' + cls);
  for (const g of groups) keyRows(g, card);
  return card;
}

// a window's Keys button: its card opens under it, and closes on a click elsewhere
export function keysButton(groups) {
  const b = h('button', 'small keys-btn', 'Keys');
  b.type = 'button';
  b.title = 'Shortcuts and gestures for this window';
  let card = null;
  const close = () => { if (card) { card.remove(); card = null; b.classList.remove('on'); removeEventListener('pointerdown', outside, true); } };
  const outside = e => { if (card && !card.contains(e.target) && e.target !== b) close(); };
  b.addEventListener('click', () => {
    if (card) { close(); return; }
    card = keysCard(groups, 'pop');
    document.body.append(card);
    const r = b.getBoundingClientRect(), w = card.offsetWidth;
    Object.assign(card.style, { left: `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`, top: `${r.bottom + 6}px` });
    b.classList.add('on');
    addEventListener('pointerdown', outside, true);
  });
  return b;
}
