// The code editor: a textarea over a highlighted copy of its text, a gutter
// with line numbers and error marks, and the list of errors under it. Clicking a
// colour (#rrggbb) opens a colour picker beside it, which writes into the code.

import { colorPicker } from './colorpick.js?v=e2bbaab254';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FUNCS = new Set(['rand', 'noise', 'sin', 'cos', 'abs', 'floor', 'round', 'min', 'max', 'clamp', 'mix', 'if', 'sqrt', 'pick', 'has']);
const VARS = new Set(['i', 'n', 't', 'w', 'h', 'd', 'x', 'y', 'z', 'pi', 'up', 'side', 'level', 'src', 'u', 'v', 'value']);

export class CodeView {
  constructor(root, octo, { changed, select, declare, nodeDoc }) {
    this.octo = octo;
    this.onChanged = changed;
    this.onSelect = select;
    this.onDeclare = declare;
    this.root = root;
    root.classList.add('code');
    root.innerHTML = `<div class="code-scroll"><div class="gutter"></div><div class="code-area"><pre class="hl" aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div></div><div class="diags"></div>`;
    this.scroll = root.querySelector('.code-scroll');
    this.gutter = root.querySelector('.gutter');
    this.pre = root.querySelector('.hl');
    this.ta = root.querySelector('textarea');
    this.diagEl = root.querySelector('.diags');
    this.diags = [];
    this.names = new Set();
    this.params = new Set();
    this.selectedLine = -1;
    this.ta.addEventListener('input', () => { this.paint(); this.onChanged(this.ta.value); });
    this.ta.addEventListener('keydown', e => this.key(e));
    this.ta.addEventListener('click', () => {
      this.caretMoved();
      const span = this.ta.selectionStart === this.ta.selectionEnd && this.caretColor();
      if (span) this.pickColor(span);
    });
    // a colour shows a hand: it opens the picker
    this.ta.addEventListener('pointermove', e => {
      const on = document.elementsFromPoint(e.clientX, e.clientY).some(x => x.classList && x.classList.contains('t-col'));
      this.ta.classList.toggle('on-color', on);
    });
    this.ta.addEventListener('keyup', e => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') this.caretMoved(); });
    // resting the pointer on a node type shows what it does; the text lies under the
    // textarea, so the word is found by position
    if (nodeDoc) {
      let last = null;
      this.ta.addEventListener('pointermove', e => {
        const span = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.classList && x.classList.contains('t-type'));
        if (span === last) return;
        last = span;
        if (span) nodeDoc.later(span.textContent, span);
        else nodeDoc.cancel();
      });
      this.ta.addEventListener('pointerleave', () => { last = null; nodeDoc.cancel(); });
    }
  }

  get value() { return this.ta.value; }

  // ---- colours: clicking one opens the picker beside it ----

  pickColor(span) {
    const line = +span.closest('.ln').dataset.line, lines = this.ta.value.split('\n');
    let at = +span.dataset.at;
    for (let k = 0; k < line; k++) at += lines[k].length + 1;
    const ta = this.ta;
    const write = v => {
      if (ta.value.slice(at, at + 7).toLowerCase() === v || !/^#[0-9a-fA-F]{6}$/.test(ta.value.slice(at, at + 7))) return;
      const sel = [ta.selectionStart, ta.selectionEnd];
      ta.setRangeText(v, at, at + 7);
      ta.setSelectionRange(...sel);
      this.paint();
      this.onChanged(ta.value);
    };
    colorPicker(span.getBoundingClientRect(), ta.value.slice(at, at + 7), { onInput: write });
  }

  // the colour token the caret is in, as its span, or null
  caretColor() {
    const pos = this.ta.selectionStart, text = this.ta.value;
    const ls = text.lastIndexOf('\n', pos - 1) + 1, line = text.slice(0, ls).split('\n').length - 1;
    const row = this.pre.querySelector(`.ln[data-line="${line}"]`);
    if (!row || document.activeElement !== this.ta) return null;
    return [...row.querySelectorAll('.t-col')].find(s => pos - ls >= +s.dataset.at && pos - ls <= +s.dataset.at + 7) || null;
  }

  // replaces the text (from a graph edit), keeping the caret on the same line if it can
  set(text) {
    if (text === this.ta.value) return;
    const focused = document.activeElement === this.ta;
    const pos = this.ta.selectionStart;
    this.ta.value = text;
    if (focused) this.ta.setSelectionRange(Math.min(pos, text.length), Math.min(pos, text.length));
    this.paint();
  }

  setDiags(diags) { this.diags = diags; this.paint(); }

  setDoc(doc) {
    this.names = new Set(doc.nodes.map(n => n.name));
    this.params = new Set(doc.params.map(p => p.name));
  }

  // highlights the line that defines a node
  selectNode(name) {
    const lines = this.ta.value.split('\n');
    this.selectedLine = name ? lines.findIndex(l => l.match(/^\s*([A-Za-z_]\w*)\s*=/)?.[1] === name) : -1;
    this.paint();
  }

  // marks the line of the node that made the shape found in the 3D view, and brings it into view
  markFound(name) {
    const lines = this.ta.value.split('\n');
    this.foundLine = name ? lines.findIndex(l => l.match(/^\s*([A-Za-z_]\w*)\s*=/)?.[1] === name) : -1;
    this.paint();
    const el = this.foundLine >= 0 ? this.pre.querySelector(`[data-line="${this.foundLine}"]`) : null;
    if (!el || !el.scrollIntoView) return;
    // only up or down: the code keeps its place sideways
    const kept = [];
    for (let p = el.parentElement; p; p = p.parentElement) kept.push([p, p.scrollLeft]);
    el.scrollIntoView({ block: 'nearest' });
    for (const [p, x] of kept) p.scrollLeft = x;
  }

  key(e) {
    const ta = this.ta;
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    } else if (e.key === 'Enter') {
      const before = ta.value.slice(0, ta.selectionStart);
      const indent = before.slice(before.lastIndexOf('\n') + 1).match(/^\s*/)[0];
      if (indent) { e.preventDefault(); document.execCommand('insertText', false, '\n' + indent); }
    }
  }

  caretMoved() {    const line = this.ta.value.slice(0, this.ta.selectionStart).split('\n').length - 1;
    const m = this.ta.value.split('\n')[line]?.match(/^\s*([A-Za-z_]\w*)\s*=/);
    if (m && this.names.has(m[1])) this.onSelect(m[1]);
  }

  highlightLine(line) {
    let out = '';
    const re = /(\/\/.*$)|(#[0-9a-fA-F]{6})|("[^"]*"?|@[0-9a-fA-F]+)|(-?\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(\s+)|(.)/g;
    let m, prevWord = '', afterEq = false, first = true;
    while ((m = re.exec(line))) {
      const [tok, com, col, str, num, id, sp] = m;
      if (com) out += `<span class="t-com">${esc(com)}</span>`;
      else if (str) { out += `<span class="${str[0] === '@' ? 't-num' : 't-str'}">${esc(str)}</span>`; first = false; }
      else if (col) out += `<span class="t-col" data-at="${m.index}" style="--c:${col}">${col}</span>`;
      else if (num) out += `<span class="t-num">${num}</span>`;
      else if (id) {
        const rest = line.slice(re.lastIndex);
        let cls = 't-id';
        if (/^(param|tool|layout|in)$/.test(id) && (first || id === 'in')) cls = 't-kw';
        else if (first && /^\s*=/.test(rest)) cls = 't-def';
        else if (prevWord === 'tool' && /^\s*=/.test(rest)) cls = 't-def';
        else if (afterEq && /^\s*\(/.test(rest) && this.octo.toolKindMap && this.octo.toolKindMap[id] && /^\s*tool\b/.test(line)) cls = 't-tool';
        else if (afterEq && /^\s*\(/.test(rest) && this.octo.typeMap[id]) cls = `t-type cat-${this.octo.typeMap[id].category}`;
        else if (/^\s*:/.test(rest)) cls = 't-key';
        else if (FUNCS.has(id) && /^\s*\(/.test(rest)) cls = 't-fn';
        else if (this.names.has(id)) cls = 't-ref';
        else if (this.params.has(id) || prevWord === 'param') cls = 't-param';
        else if (VARS.has(id)) cls = 't-var';
        out += `<span class="${cls}">${id}</span>`;
        prevWord = id;
        first = false;
        afterEq = false;
      } else if (sp) out += sp;
      else {
        if (tok === '=') afterEq = true;
        out += `<span class="t-p">${esc(tok)}</span>`;
        first = false;
      }
    }
    return out;
  }

  paint() {
    const lines = this.ta.value.split('\n');
    const bad = new Map();
    for (const d of this.diags) if (!bad.has(d.line - 1)) bad.set(d.line - 1, d);
    let html = '', gut = '', layout = false;
    lines.forEach((l, k) => {
      const cls = ['ln'];
      // the layout block is node positions for the graph view: kept, but quiet
      if (/^\s*layout\s*\{/.test(l)) layout = true;
      if (layout) cls.push('lay');
      if (layout && l.includes('}')) layout = false;
      if (bad.has(k)) cls.push('bad');
      if (k === this.selectedLine) cls.push('sel');
      if (k === this.foundLine) cls.push('found');
      html += `<div class="${cls.join(' ')}" data-line="${k}">${this.highlightLine(l) || ' '}</div>`;
      gut += `<div class="${cls.join(' ')}" ${bad.has(k) ? `title="${esc(bad.get(k).msg)}"` : ''}>${k + 1}</div>`;
    });
    this.pre.innerHTML = html;
    this.gutter.innerHTML = gut;
    this.diagEl.replaceChildren();
    for (const d of this.diags) {
      const e = document.createElement('div');
      e.className = 'diag';
      e.innerHTML = `<span class="where">${d.line}:${d.col}</span> ${esc(d.msg)}`;
      e.addEventListener('click', () => this.goto(d.line, d.col));
      const m = d.msg.match(/^unknown name '([A-Za-z_]\w*)'/);
      if (m && this.onDeclare) {
        const b = document.createElement('button');
        b.className = 'small';
        b.textContent = `Make ${m[1]} a param`;
        b.addEventListener('click', ev => { ev.stopPropagation(); this.onDeclare(m[1]); });
        e.append(b);
      }
      this.diagEl.append(e);
    }
    this.root.classList.toggle('has-errors', this.diags.length > 0);
  }

  goto(line, col) {
    const lines = this.ta.value.split('\n');
    let pos = 0;
    for (let k = 0; k < line - 1 && k < lines.length; k++) pos += lines[k].length + 1;
    pos += col - 1;
    this.ta.focus();
    this.ta.setSelectionRange(pos, pos);
  }
}
