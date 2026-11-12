// Menus, keyboard shortcuts and the command palette, all from one list of commands.
// A command is { id, label, run, key?, enabled?(), checked?(), hidden?() }. A menu
// item is a command id, '-' for a separator, or { label, items: () => [...] } for a
// submenu whose items are { label, run, hint?, enabled? } or command ids.
import { mac } from './platform.js?v=e2bbaab254';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// 'Mod+Shift+S' -> ⇧⌘S on a Mac, Ctrl+Shift+S elsewhere
export function keyLabel(spec) {
  if (!spec) return '';
  const parts = spec.split('+');
  const key = parts.pop();
  const k = key.length === 1 ? key.toUpperCase() : key;
  if (mac) {
    const sym = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' };
    const order = ['Ctrl', 'Alt', 'Shift', 'Mod'];
    return parts.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(p => sym[p]).join('') + k;
  }
  return [...parts.map(p => p === 'Mod' ? 'Ctrl' : p), k].join('+');
}

function matches(spec, e) {
  const parts = spec.split('+');
  const key = parts.pop().toLowerCase();
  const want = new Set(parts);
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (want.has('Mod') !== mod) return false;
  if (want.has('Shift') !== e.shiftKey) return false;
  if (want.has('Alt') !== e.altKey) return false;
  if (mac && want.has('Ctrl') !== e.ctrlKey) return false;
  // e.code keeps Alt+letter working on Mac keyboards, where e.key is a symbol
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (k === key) return true;
  return key.length === 1 && /^[a-z0-9]$/.test(key) && (e.code === 'Key' + key.toUpperCase() || e.code === 'Digit' + key);
}

export class Commands {
  constructor() { this.list = new Map(); }
  add(...cmds) { for (const c of cmds) this.list.set(c.id, c); }
  get(id) { return this.list.get(id); }
  enabled(c) { return !c.enabled || c.enabled(); }
  visible(c) { return !c.hidden || !c.hidden(); }
  run(id, ...args) {
    const c = this.get(id);
    if (!c || !this.enabled(c) || !this.visible(c)) return false;
    Promise.resolve().then(() => c.run(...args)).catch(err => this.onError && this.onError(err, c));
    return true;
  }
  // global shortcuts; the small fields keep their own keys unless a shortcut has Mod
  bindKeys() {
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented || e.isComposing) return;
      const inField = e.target.closest && e.target.closest('input, select, textarea, [contenteditable=true], [contenteditable=plaintext-only]');
      for (const c of this.list.values()) {
        if (!c.key || c.keyHandled || (this.nativeKeys && this.nativeKeys.has(c.id))) continue;
        for (const spec of [].concat(c.key)) {
          if (!matches(spec, e)) continue;
          if (inField && !/Mod|Alt/.test(spec)) continue;
          if (!this.enabled(c) || !this.visible(c)) continue;
          e.preventDefault();
          e.stopPropagation();
          this.run(c.id);
          return;
        }
      }
    });
  }
}

// ---- the menu bar ----

export class MenuBar {
  constructor(root, commands, menus) {
    this.root = root;
    this.commands = commands;
    this.menus = menus;
    this.open = null;
    root.setAttribute('role', 'menubar');
    this.buttons = menus.map((m, k) => {
      const b = h('button', 'menu-title', m.label);
      b.setAttribute('aria-haspopup', 'true');
      b.addEventListener('pointerdown', e => { e.preventDefault(); this.open === k ? this.close() : this.show(k); });
      b.addEventListener('pointerenter', () => { if (this.open != null && this.open !== k) this.show(k); });
      root.append(b);
      return b;
    });
    document.addEventListener('pointerdown', e => { if (this.open != null && !e.target.closest('.menu-pop, .menu-title')) this.close(); }, true);
    document.addEventListener('keydown', e => { if (this.open != null && this.key(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
    addEventListener('blur', () => this.close());
    addEventListener('resize', () => this.close());
  }

  refresh() {
    this.menus.forEach((m, k) => { this.buttons[k].hidden = !!(m.hidden && m.hidden()); });
  }

  async show(k) {
    this.close();
    this.open = k;
    const b = this.buttons[k];
    b.classList.add('on');
    const r = b.getBoundingClientRect();
    this.pop = await popup(this.menus[k].items, this.commands, { x: r.left, y: r.bottom + 6, done: () => this.close() });
    if (this.open !== k) { this.pop.remove(); return; }
  }

  close() {
    if (this.open == null) return;
    this.buttons[this.open].classList.remove('on');
    this.open = null;
    closePopups();
  }

  key(e) {
    const pops = [...document.querySelectorAll('.menu-pop')];
    const pop = pops[pops.length - 1];
    if (!pop) return false;
    const items = [...pop.querySelectorAll(':scope > .menu-item:not(.off)')];
    const at = items.indexOf(pop.querySelector(':scope > .menu-item.hot'));
    const hot = i => { items.forEach(x => x.classList.remove('hot')); if (items[i]) items[i].classList.add('hot'); };
    if (e.key === 'Escape') { if (pops.length > 1) pop.remove(); else this.close(); return true; }
    if (e.key === 'ArrowDown') { hot((at + 1) % items.length); return true; }
    if (e.key === 'ArrowUp') { hot((at - 1 + items.length) % items.length); return true; }
    if (e.key === 'ArrowRight') {
      if (items[at] && items[at].classList.contains('sub')) { items[at].dispatchEvent(new Event('pointerenter')); return true; }
      this.show((this.open + 1) % this.menus.length); return true;
    }
    if (e.key === 'ArrowLeft') {
      if (pops.length > 1) { pop.remove(); return true; }
      this.show((this.open - 1 + this.menus.length) % this.menus.length); return true;
    }
    if (e.key === 'Enter' || e.key === ' ') { if (items[at]) items[at].click(); return true; }
    return false;
  }
}

export function closePopups() { for (const p of document.querySelectorAll('.menu-pop')) p.remove(); }
// context menus close on a click elsewhere or Escape, like the menu bar's
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu-pop, .menu-title')) closePopups(); }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('.menu-title.on')) return;
  if (document.querySelector('.menu-pop')) { e.preventDefault(); closePopups(); }
}, true);

// a menu at (x, y): the menu bar's, a submenu, or a context menu
export async function popup(items, commands, { x, y, done = () => {}, parent = null } = {}) {
  if (!parent) closePopups();
  const list = typeof items === 'function' ? await items() : items;
  const pop = h('div', 'menu-pop');
  pop.setAttribute('role', 'menu');
  let lastSep = true;
  for (const it of list) {
    if (it === '-') { if (!lastSep) { pop.append(h('div', 'menu-sep')); lastSep = true; } continue; }
    let label, run, key, enabled = true, checked = null, hint = null, sub = null;
    if (typeof it === 'string') {
      const c = commands.get(it);
      if (!c || !commands.visible(c)) continue;
      label = typeof c.label === 'function' ? c.label() : c.label; run = () => commands.run(it); key = c.key && [].concat(c.key)[0];
      enabled = commands.enabled(c); checked = c.checked ? !!c.checked() : null;
    } else if (it.items) { label = it.label; sub = it.items; enabled = it.enabled !== false; }
    else if (it.label) { label = it.label; run = it.run; enabled = it.enabled !== false; hint = it.hint || null; checked = it.checked ?? null; }
    else continue;
    lastSep = false;
    const el = h('div', 'menu-item' + (enabled ? '' : ' off') + (sub ? ' sub' : ''));
    el.setAttribute('role', 'menuitem');
    el.append(h('span', 'check', checked ? '✓' : ''), h('span', 'mlabel', label));
    if (hint) el.append(h('span', 'mhint', hint));
    el.append(h('span', 'mkey', sub ? '▸' : keyLabel(key)));
    if (sub) {
      let child = null;
      const openSub = async () => {
        for (const p of [...document.querySelectorAll('.menu-pop')]) if (p.dataset.parent === pop.dataset.id && p !== child) p.remove();
        if (child && child.isConnected) return;
        const r = el.getBoundingClientRect();
        child = await popup(sub, commands, { x: r.right + 2, y: r.top - 6, done, parent: pop });
      };
      el.addEventListener('pointerenter', () => { el.parentElement.querySelectorAll('.hot').forEach(x => x.classList.remove('hot')); el.classList.add('hot'); if (enabled) openSub(); });
      el.addEventListener('click', () => { if (enabled) openSub(); });
    } else {
      el.addEventListener('pointerenter', () => {
        el.parentElement.querySelectorAll('.hot').forEach(x => x.classList.remove('hot'));
        el.classList.add('hot');
        for (const p of [...document.querySelectorAll('.menu-pop')]) if (p.dataset.parent === pop.dataset.id) p.remove();
      });
      el.addEventListener('click', () => { if (!enabled) return; done(); closePopups(); run(); });
    }
    pop.append(el);
  }
  if (pop.lastChild && pop.lastChild.classList.contains('menu-sep')) pop.lastChild.remove();
  if (!pop.childElementCount) pop.append(h('div', 'menu-item off', 'Nothing here yet'));
  pop.dataset.id = Math.random().toString(36).slice(2, 8);
  if (parent) pop.dataset.parent = parent.dataset.id;
  document.body.append(pop);
  // keep it on screen
  const r = pop.getBoundingClientRect();
  const left = Math.max(6, Math.min(x, innerWidth - r.width - 6));
  const top = Math.max(6, Math.min(y, innerHeight - r.height - 6));
  pop.style.left = (parent && x + r.width > innerWidth ? Math.max(6, x - r.width - parent.getBoundingClientRect().width - 4) : left) + 'px';
  pop.style.top = top + 'px';
  return pop;
}

// ---- the command palette (Mod+K): every command, by name ----

export function commandPalette(commands, menus) {
  closePopups();
  const where = new Map();
  const walk = (items, path) => {
    if (typeof items === 'function') return;
    for (const it of items) {
      if (typeof it === 'string' && it !== '-') where.set(it, path);
      else if (it && it.items && typeof it.items !== 'function') walk(it.items, path + ' ▸ ' + it.label);
    }
  };
  for (const m of menus) walk(m.items, m.label);
  const all = [...commands.list.values()].filter(c => commands.visible(c) && !c.noPalette);
  const back = h('div', 'palette-back');
  const box = h('div', 'cmd-palette');
  const input = h('input');
  input.placeholder = 'Type a command';
  input.spellcheck = false;
  const list = h('div', 'cmd-list');
  box.append(input, list);
  back.append(box);
  document.body.append(back);
  let shown = [], hot = 0;
  const label = c => typeof c.label === 'function' ? c.label() : c.label;
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    const score = c => {
      const t = (label(c) + ' ' + (where.get(c.id) || '')).toLowerCase();
      if (!q) return 1;
      if (t.startsWith(q)) return 3;
      if (t.includes(q)) return 2;
      let k = 0;
      for (const ch of t) if (ch === q[k]) k++;
      return k === q.length ? 1 : 0;
    };
    shown = all.map(c => [c, score(c)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    hot = Math.min(hot, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((c, k) => {
      const el = h('div', 'cmd-item' + (k === hot ? ' hot' : '') + (commands.enabled(c) ? '' : ' off'));
      el.append(h('span', 'mlabel', label(c)), h('span', 'mhint', where.get(c.id) || ''), h('span', 'mkey', keyLabel(c.key && [].concat(c.key)[0])));
      el.addEventListener('click', () => go(c));
      el.addEventListener('pointermove', () => { if (hot !== k) { hot = k; paint(); } });
      return el;
    }));
    if (!shown.length) list.append(h('div', 'cmd-item off', 'No command matches'));
  };
  const paint = () => [...list.children].forEach((el, k) => el.classList.toggle('hot', k === hot));
  const close = () => back.remove();
  const go = c => { if (!commands.enabled(c)) return; close(); commands.run(c.id); };
  input.addEventListener('input', () => { hot = 0; fill(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hot = Math.min(shown.length - 1, hot + 1); paint(); list.children[hot]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hot = Math.max(0, hot - 1); paint(); list.children[hot]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[hot]) go(shown[hot]); }
    e.stopPropagation();
  });
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  fill();
  input.focus();
}
