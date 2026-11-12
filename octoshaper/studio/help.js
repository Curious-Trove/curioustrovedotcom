// Explains a setting while you edit it: what the setting does, what the
// expression in it says in plain words, and which names and functions it can use.

export const VARS = [
  ['i', 'its index: 0, 1, 2…'],
  ['n', 'how many shapes come in'],
  ['t', 'how far along it is: 0 for the first, 1 for the last'],
  ['w', 'its width'],
  ['h', 'its height'],
  ['d', 'its depth'],
  ['x', 'its x position'],
  ['y', 'its y position (its height above the ground)'],
  ['z', 'its z position'],
  ['up', 'how much it faces up: 1 for a top, 0 for a wall, -1 for an underside'],
  ['side', 'on a face: 0 top, 1 bottom, 2 front, 3 right, 4 back, 5 left'],
  ['level', 'its generation: how deep a branch is, which piece of a split'],
  ['u', 'in scatter, decal and displace: how far across its face it is, from 0 to 1'],
  ['v', 'the same, up the face'],
  ['value', 'on shapes made from cells: the value of its cell (1 unless the stamp gave another), to tell kinds of cell apart'],
  ['pi', '3.14159…'],
];
// in an image node the same formulas run for every pixel
export const PIXEL_VARS = [
  ['x', 'across the image, from 0 on the left to 1 on the right'],
  ['y', 'up the image, from 0 at the bottom to 1 at the top'],
  ['src', 'the brightness of the input image here, from 0 to 1'],
  ['i', 'the number of the pixel'],
  ['w', 'the width of the image, in pixels'],
  ['h', 'its height, in pixels'],
  ['pi', '3.14159…'],
];
const SHORT = { i: 'its index', n: 'the number of shapes', t: 'its place from 0 to 1', w: 'its width', h: 'its height', d: 'its depth', x: 'its x', y: 'its y', z: 'its z', pi: 'π', up: 'how much it faces up', side: 'the face it came from', level: 'its generation', src: 'the input image here', u: 'how far across its face', v: 'how far up its face', value: "its cell's value" };

export const FUNCS = [
  ['rand(lo, hi)', 'a random number between lo and hi, fixed for each shape'],
  ['noise(x, z)', 'smooth noise from 0 to 1, for hills and patches'],
  ['if(test, a, b)', 'a when the test holds, else b'],
  ['has(dx, dy, dz)', 'on shapes made from cells: 1 when the cell that many steps away is filled, else 0. has(0, 1, 0) asks about the cell above'],
  ['pick(k, a, b, c)', 'the k-th of the values after it, starting again past the last: pick(i, a, b) alternates'],
  ['mix(a, b, t)', 'from a (t = 0) to b (t = 1)'],
  ['clamp(v, lo, hi)', 'v, kept between lo and hi'],
  ['min(a, b)', 'the smaller one'],
  ['max(a, b)', 'the larger one'],
  ['round(v)', 'the nearest whole number'],
  ['floor(v)', 'the whole number below'],
  ['abs(v)', 'without its sign'],
  ['sqrt(v)', 'the square root'],
  ['sin(v)', 'a wave, v in radians'],
  ['cos(v)', 'a wave, v in radians'],
];
export const OPS = 'Maths with + - * /, % for the remainder, and tests < > <= >= == != that give 1 (yes) or 0 (no).';
export const LABEL = { i: 'index', n: 'count', t: '0 → 1', w: 'width', h: 'height', d: 'depth', x: 'x', y: 'y', z: 'z', pi: 'π', up: 'faces up', side: 'face', level: 'level', src: 'input' };

// ---- a small parser, the same grammar as the core's ----

function tokens(s) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_]\w*(?:\.[xyz](?!\w))?)|(<=|>=|==|!=|[-+*/%<>(),]))/y;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < s.length) {
    const at = re.lastIndex;
    if (!(m = re.exec(s))) { if (/^\s*$/.test(s.slice(at))) break; return null; }
    out.push(m[1] ? { k: 'num', v: m[1] } : m[2] ? { k: 'id', v: m[2] } : { k: 'op', v: m[3] });
  }
  return out;
}

export function parseExpr(s) {
  const ts = tokens(s);
  if (!ts || !ts.length) return null;
  let p = 0;
  const peek = () => ts[p] && ts[p].k === 'op' ? ts[p].v : null;
  const cmp = () => {
    let a = add();
    while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) { const op = ts[p++].v; a = { op, a, b: add() }; }
    return a;
  };
  const add = () => {
    let a = mul();
    while (peek() === '+' || peek() === '-') { const op = ts[p++].v; a = { op, a, b: mul() }; }
    return a;
  };
  const mul = () => {
    let a = un();
    while (['*', '/', '%'].includes(peek())) { const op = ts[p++].v; a = { op, a, b: un() }; }
    return a;
  };
  const un = () => {
    if (peek() === '-') { p++; return { op: 'neg', a: un() }; }
    const t = ts[p++];
    if (!t) throw 0;
    if (t.k === 'num') return { num: t.v };
    if (t.k === 'op' && t.v === '(') { const e = cmp(); if (peek() !== ')') throw 0; p++; return { paren: e }; }
    if (t.k === 'id') {
      if (peek() === '(') {
        p++;
        const args = [];
        if (peek() !== ')') { args.push(cmp()); while (peek() === ',') { p++; args.push(cmp()); } }
        if (peek() !== ')') throw 0;
        p++;
        return { call: t.v, args };
      }
      return { name: t.v };
    }
    throw 0;
  };
  try {
    const e = cmp();
    return p === ts.length ? e : null;
  } catch { return null; }
}

const TESTS = { '<': 'is below', '>': 'is above', '<=': 'is at most', '>=': 'is at least', '==': 'is', '!=': 'is not' };
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// plain words for an expression tree
function say(e, params) {
  if (e.num != null) return e.num;
  if (e.paren) return say(e.paren, params);
  if (e.name && e.name.includes('.')) { const [b, a] = e.name.split('.'); return `the ${a} of ${b}`; }
  if (e.name) return SHORT[e.name] || (params.has(e.name) ? `the param ${e.name}` : e.name);
  if (e.op === 'neg') return '−' + say(e.a, params);
  if (TESTS[e.op]) return `${say(e.a, params)} ${TESTS[e.op]} ${say(e.b, params)}`;
  if (e.op === '%') return `the remainder of ${say(e.a, params)} ÷ ${say(e.b, params)}`;
  if (e.op) return `${say(e.a, params)} ${SYM[e.op]} ${say(e.b, params)}`;
  const a = e.args.map(x => say(x, params));
  switch (e.call) {
    case 'rand': return a.length === 0 ? 'a random number from 0 to 1' : a.length === 1 ? `a random number up to ${a[0]}` : `a random number from ${a[0]} to ${a[1]}`;
    case 'noise': return `smooth noise at (${a.join(', ')})`;
    case 'if': return `${a[1]} when ${a[0]}, else ${a[2]}`;
    case 'mix': return `from ${a[0]} to ${a[1]} by ${a[2]}`;
    case 'clamp': return `${a[0]} kept between ${a[1]} and ${a[2]}`;
    case 'min': return `the smaller of ${a.join(' and ')}`;
    case 'max': return `the larger of ${a.join(' and ')}`;
    case 'round': return `${a[0]}, rounded`;
    case 'floor': return `${a[0]}, rounded down`;
    case 'abs': return `${a[0]} without its sign`;
    case 'sqrt': return `the square root of ${a[0]}`;
    case 'pick': return `the ${a[0]}-th of ${a.slice(1).join(', ')}`;
    case 'sin': case 'cos': return `a wave of ${a[0]}`;
    default: return params.has(e.call) ? `the curve ${e.call} at ${a[0]}` : `${e.call}(${a.join(', ')})`;
  }
}

function uses(e, f) {
  if (!e) return false;
  if (f(e)) return true;
  return [e.a, e.b, e.paren, ...(e.args || [])].some(x => x && uses(x, f));
}

// { text, perShape } or null when the text does not parse
export function explain(text, params) {
  const e = parseExpr(text);
  if (!e) return null;
  if (e.num != null) return { text: `always ${e.num}`, perShape: false, plain: true };
  let words = say(e, params);
  if (TESTS[e.op]) words = `1 when ${words}, else 0`;
  const perShape = uses(e, x => (x.name && SHORT[x.name] && x.name !== 'pi') || x.call === 'rand' || x.call === 'noise');
  return { text: words, perShape, plain: false };
}

// what a setting's value means, for the ones where the number alone says little
export function meaning(type, setting) {
  if (setting === 'chance') return '1 keeps the shape, 0 drops it, 0.3 keeps about 30%. A test such as h > 3 keeps only the shapes that pass.';
  if (setting === 'seed') return 'Any other number gives another random variation.';
  return null;
}
