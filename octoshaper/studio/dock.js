// The workspace: tabs in groups, groups in rows and columns. Every tab shows one
// panel. A tab can be dragged along its strip, onto another group's strip or body,
// or onto the edge of a group to split it; the dividers between groups resize them.
//
// The layout is a tree:
//   { t: 'g', id, tabs: [tabId], active: tabId }                a group of tabs
//   { t: 's', dir: 'row' | 'col', kids: [node], sizes: [n] }    a split
// It is plain data, so the studio saves it with the session.

// no page text gets selected while a tab is dragged (as in graph.js)
const noTextSelect = on => {
  document.body.classList.toggle('no-select', on);
  if (on) getSelection()?.removeAllRanges();
};

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const MIN_PX = 160;

export class Dock {
  // host: {
  //   panel(tabId) -> element    the panel a tab shows
  //   label(tabId) -> { title, kind, dirty, tip }
  //   activated(tabId)           the person picked a tab
  //   close(tabId)               the person asked to close a tab
  //   menu(tabId, x, y)          right click on a tab
  //   changed()                  the layout changed (to save it)
  //   empty                      what to show when no tab is open
  // }
  constructor(root, host) {
    this.root = root;
    this.host = host;
    this.layout = null;
    this.focus = null;    // the tab used last
    this.seq = 0;
    this.tabEls = new Map();
  }

  // ---- queries ----

  groups(n = this.layout, out = []) {
    if (!n) return out;
    if (n.t === 'g') out.push(n);
    else n.kids.forEach(k => this.groups(k, out));
    return out;
  }
  tabs() { return this.groups().flatMap(g => g.tabs); }
  groupOf(tab) { return this.groups().find(g => g.tabs.includes(tab)) || null; }
  groupById(id) { return this.groups().find(g => g.id === id) || null; }
  has(tab) { return !!this.groupOf(tab); }
  focusedGroup() { return this.groupOf(this.focus) || this.groups()[0] || null; }
  parentOf(node, cur = this.layout, parent = null) {
    if (cur === node) return parent;
    if (cur && cur.t === 's') for (const k of cur.kids) { const p = this.parentOf(node, k, cur); if (p !== undefined) return p; }
    return undefined;
  }
  group(tabs = []) { return { t: 'g', id: 'g' + (++this.seq), tabs: [...tabs], active: tabs[0] || null }; }

  // ---- changes ----

  // groups side by side: [[tabs...], ...] with relative widths
  setColumns(columns, sizes) {
    const kids = columns.filter(c => c.length).map(c => this.group(c));
    this.layout = kids.length === 1 ? kids[0] : kids.length ? { t: 's', dir: 'row', kids, sizes: sizes || kids.map(() => 1) } : null;
    this.render();
  }

  add(tab, groupId = null, index = -1, { activate = true } = {}) {
    if (this.has(tab)) { if (activate) this.activate(tab); return; }
    let g = groupId ? this.groupById(groupId) : this.focusedGroup();
    if (!g) { g = this.group(); this.layout = g; }
    if (index < 0 || index > g.tabs.length) index = g.tabs.length;
    g.tabs.splice(index, 0, tab);
    if (activate || !g.active) g.active = tab;
    this.render();
    if (activate) this.activate(tab);
  }

  remove(tab, { render = true } = {}) {
    const g = this.groupOf(tab);
    if (!g) return;
    const k = g.tabs.indexOf(tab);
    g.tabs.splice(k, 1);
    if (g.active === tab) g.active = g.tabs[Math.min(k, g.tabs.length - 1)] || null;
    if (!g.tabs.length) this.removeNode(g);
    if (this.focus === tab) this.focus = g.tabs.length ? g.active : null;
    this.tabEls.delete(tab);
    if (render) { this.render(); this.host.changed(); }
  }

  removeNode(n) {
    const p = this.parentOf(n);
    if (p === undefined) return;
    if (p === null) { this.layout = null; return; }
    const i = p.kids.indexOf(n);
    p.kids.splice(i, 1);
    const [s] = p.sizes.splice(i, 1);
    p.sizes[Math.max(0, i - 1)] += s;
    if (p.kids.length === 1) this.replace(p, p.kids[0]);
  }

  // puts `by` where `node` is; a split inside a split of the same direction is flattened
  replace(node, by) {
    const p = this.parentOf(node);
    if (p === null) { this.layout = by; return; }
    const i = p.kids.indexOf(node);
    if (by.t === 's' && by.dir === p.dir) {
      const total = by.sizes.reduce((a, b) => a + b, 0) || 1;
      p.kids.splice(i, 1, ...by.kids);
      p.sizes.splice(i, 1, ...by.sizes.map(s => s / total * p.sizes[i]));
    } else p.kids[i] = by;
  }

  move(tab, groupId, index) {
    const from = this.groupOf(tab), to = this.groupById(groupId);
    if (!from || !to) return;
    if (from === to) {
      const k = from.tabs.indexOf(tab);
      if (index > k) index--;
      from.tabs.splice(k, 1);
      from.tabs.splice(Math.max(0, Math.min(index, from.tabs.length)), 0, tab);
    } else {
      this.remove(tab, { render: false });
      to.tabs.splice(Math.max(0, Math.min(index < 0 ? to.tabs.length : index, to.tabs.length)), 0, tab);
    }
    to.active = tab;
    this.render();
    this.activate(tab);
    this.host.changed();
  }

  // side: left, right, top or bottom of a group
  split(tab, groupId, side) {
    const from = this.groupOf(tab), target = this.groupById(groupId);
    if (!from || !target) return;
    if (from === target && from.tabs.length === 1) return;
    this.remove(tab, { render: false });
    const ng = this.group([tab]);
    const dir = side === 'left' || side === 'right' ? 'row' : 'col';
    const before = side === 'left' || side === 'top';
    const p = this.parentOf(target);
    if (p && p.dir === dir) {
      const i = p.kids.indexOf(target), half = p.sizes[i] / 2;
      p.sizes[i] = half;
      p.kids.splice(before ? i : i + 1, 0, ng);
      p.sizes.splice(before ? i : i + 1, 0, half);
    } else {
      this.replace(target, { t: 's', dir, kids: before ? [ng, target] : [target, ng], sizes: [1, 1] });
    }
    this.render();
    this.activate(tab);
    this.host.changed();
  }

  // shows a tab in its group; focus: it becomes the tab in use
  activate(tab, { focus = true, notify = true } = {}) {
    const g = this.groupOf(tab);
    if (!g) return;
    g.active = tab;
    for (const t of g.tabs) {
      const p = this.host.panel(t);
      if (p) p.hidden = t !== tab;
      this.tabEls.get(t)?.classList.toggle('on', t === tab);
    }
    if (focus) {
      this.focus = tab;
      for (const el of this.root.querySelectorAll('.dock-group')) el.classList.toggle('focused', el.dataset.group === g.id);
    }
    const el = this.tabEls.get(tab);
    // keep the tab in sight in its strip (scrollIntoView would also scroll the views)
    if (el && el.parentElement) {
      const strip = el.parentElement;
      if (el.offsetLeft < strip.scrollLeft) strip.scrollLeft = el.offsetLeft;
      else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth;
    }
    if (notify) this.host.activated(tab);
  }

  // ---- saving ----

  save() {
    const strip = n => n.t === 'g' ? { t: 'g', tabs: n.tabs, active: n.active } : { t: 's', dir: n.dir, kids: n.kids.map(strip), sizes: n.sizes };
    return { layout: this.layout && strip(this.layout), focus: this.focus };
  }
  // keeps only the tabs that still exist
  restore(saved, exists) {
    const fix = n => {
      if (!n) return null;
      if (n.t === 'g') {
        const tabs = (n.tabs || []).filter(exists);
        if (!tabs.length) return null;
        const g = this.group(tabs);
        if (tabs.includes(n.active)) g.active = n.active;
        return g;
      }
      const kids = [], sizes = [];
      (n.kids || []).forEach((k, i) => { const f = fix(k); if (f) { kids.push(f); sizes.push(+(n.sizes || [])[i] || 1); } });
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      return { t: 's', dir: n.dir === 'col' ? 'col' : 'row', kids, sizes };
    };
    this.layout = fix(saved && saved.layout);
    this.focus = saved && exists(saved.focus) ? saved.focus : null;
    this.render();
  }

  // ---- drawing ----

  render() {
    this.tabEls.clear();
    this.root.replaceChildren(this.layout ? this.node(this.layout) : this.host.empty);
    const f = this.groupOf(this.focus);
    for (const el of this.root.querySelectorAll('.dock-group')) el.classList.toggle('focused', !!f && el.dataset.group === f.id);
  }

  node(n) {
    if (n.t === 'g') return this.groupEl(n);
    const el = h('div', `dock-split split-${n.dir}`);
    n.kids.forEach((k, i) => {
      if (i) el.append(this.divider(n, i, el));
      const c = this.node(k);
      c.style.flex = `${n.sizes[i]} 1 0`;
      el.append(c);
    });
    return el;
  }

  groupEl(g) {
    const el = h('div', 'dock-group');
    el.dataset.group = g.id;
    const strip = h('div', 'tabs');
    strip.setAttribute('role', 'tablist');
    for (const t of g.tabs) strip.append(this.tabEl(g, t));
    // a double click on the empty part of a strip: the host decides (a new document)
    strip.addEventListener('dblclick', e => { if (e.target === strip && this.host.stripDblClick) this.host.stripDblClick(g.id); });
    const body = h('div', 'dock-body');
    for (const t of g.tabs) {
      const p = this.host.panel(t);
      if (!p) continue;
      p.hidden = t !== g.active;
      body.append(p);
    }
    el.append(strip, body);
    return el;
  }

  tabEl(g, tab) {
    const el = h('div', 'tab');
    el.setAttribute('role', 'tab');
    el.dataset.tab = tab;
    el.append(h('span', 'tname'), h('span', 'tkind'));
    const close = h('button', 'tclose', '×');
    close.title = 'Close';
    close.addEventListener('pointerdown', e => e.stopPropagation());
    close.addEventListener('click', e => { e.stopPropagation(); this.host.close(tab); });
    el.append(close);
    el.classList.toggle('on', g.active === tab);
    this.tabEls.set(tab, el);
    this.paintTab(tab);
    el.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); this.drag(e, tab, el); } });
    el.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); this.host.close(tab); } });
    el.addEventListener('contextmenu', e => { e.preventDefault(); this.host.menu(tab, e.clientX, e.clientY); });
    return el;
  }

  // titles and unsaved marks change without rebuilding anything
  paintTab(tab) {
    const el = this.tabEls.get(tab);
    if (!el) return;
    const l = this.host.label(tab);
    el.querySelector('.tname').textContent = l.title;
    el.querySelector('.tkind').textContent = l.kindLabel;
    el.className = `tab kind-${l.kind}` + (el.classList.contains('on') ? ' on' : '') + (l.dirty ? ' dirty' : '') + (l.active ? ' current' : '');
    el.title = l.tip || l.title;
  }
  paintTabs() { for (const t of this.tabEls.keys()) this.paintTab(t); }

  // the divider between two kids of a split
  divider(split, i, splitEl) {
    const d = h('div', 'dock-divider');
    d.addEventListener('pointerdown', e => {
      e.preventDefault();
      const row = split.dir === 'row';
      const a = d.previousElementSibling, b = d.nextElementSibling;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const pa = row ? ra.width : ra.height, pb = row ? rb.width : rb.height;
      const sa = split.sizes[i - 1], sb = split.sizes[i];
      const p0 = row ? e.clientX : e.clientY;
      d.setPointerCapture(e.pointerId);
      d.classList.add('dragging');
      const move = ev => {
        const dx = (row ? ev.clientX : ev.clientY) - p0;
        const na = Math.max(MIN_PX, Math.min(pa + pb - MIN_PX, pa + dx));
        split.sizes[i - 1] = (sa + sb) * na / (pa + pb);
        split.sizes[i] = (sa + sb) - split.sizes[i - 1];
        a.style.flex = `${split.sizes[i - 1]} 1 0`;
        b.style.flex = `${split.sizes[i]} 1 0`;
      };
      const up = () => {
        d.removeEventListener('pointermove', move);
        d.removeEventListener('pointerup', up);
        d.classList.remove('dragging');
        this.host.changed();
      };
      d.addEventListener('pointermove', move);
      d.addEventListener('pointerup', up);
    });
    // a double click shares the space evenly
    d.addEventListener('dblclick', () => { split.sizes = split.sizes.map(() => 1); this.render(); this.host.changed(); });
    void splitEl;
    return d;
  }

  // ---- dragging a tab ----

  drag(e, tab, el) {
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, mark = null, target = null;
    el.setPointerCapture(e.pointerId);
    const start = () => {
      ghost = h('div', 'tab-ghost', el.querySelector('.tname').textContent + ' · ' + el.querySelector('.tkind').textContent);
      ghost.classList.add(...[...el.classList].filter(c => c.startsWith('kind-')));
      mark = h('div', 'dock-drop');
      document.body.append(ghost, mark);
      document.body.classList.add('dragging-tab');
      noTextSelect(true);
    };
    const move = ev => {
      if (!ghost) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6) return;
        start();
      }
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 10}px)`;
      target = this.dropTarget(ev.clientX, ev.clientY, tab);
      if (!target) { mark.style.display = 'none'; return; }
      const r = target.rect;
      Object.assign(mark.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      mark.classList.toggle('bar', target.kind === 'strip');
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (!ghost) { this.activate(tab); return; }
      ghost.remove(); mark.remove();
      document.body.classList.remove('dragging-tab');
      noTextSelect(false);
      if (!target) return;
      if (target.kind === 'strip') this.move(tab, target.group, target.index);
      else if (target.side === 'center') { if (this.groupOf(tab).id !== target.group) this.move(tab, target.group, -1); }
      else this.split(tab, target.group, target.side);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // where a tab dragged to (x, y) would go
  dropTarget(x, y, tab) {
    const under = document.elementFromPoint(x, y);
    if (!under || !this.root.contains(under)) return null;
    const groupEl = under.closest('.dock-group');
    if (!groupEl) return null;
    const gid = groupEl.dataset.group;
    const strip = under.closest('.tabs');
    if (strip) {
      const tabs = [...strip.querySelectorAll('.tab')];
      let index = tabs.length;
      for (let k = 0; k < tabs.length; k++) {
        const r = tabs[k].getBoundingClientRect();
        if (x < r.left + r.width / 2) { index = k; break; }
      }
      const sr = strip.getBoundingClientRect();
      const ref = tabs[index] ? tabs[index].getBoundingClientRect().left : (tabs.length ? tabs[tabs.length - 1].getBoundingClientRect().right : sr.left + 4);
      return { kind: 'strip', group: gid, index, rect: { left: ref - 2, top: sr.top + 4, width: 4, height: sr.height - 8 } };
    }
    const body = groupEl.querySelector('.dock-body').getBoundingClientRect();
    const fx = (x - body.left) / body.width, fy = (y - body.top) / body.height;
    const g = this.groupById(gid);
    const alone = g.tabs.length === 1 && g.tabs[0] === tab;
    let side = 'center';
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    if (edge < 0.25 && !alone) side = edge === fx ? 'left' : edge === 1 - fx ? 'right' : edge === fy ? 'top' : 'bottom';
    if (side === 'center' && g.tabs.includes(tab)) return null;
    const r = { left: body.left, top: body.top, width: body.width, height: body.height };
    if (side === 'left') r.width /= 2;
    if (side === 'right') { r.left += r.width / 2; r.width /= 2; }
    if (side === 'top') r.height /= 2;
    if (side === 'bottom') { r.top += r.height / 2; r.height /= 2; }
    return { kind: 'body', group: gid, side, rect: r };
  }
}
