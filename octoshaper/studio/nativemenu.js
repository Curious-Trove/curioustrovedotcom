// In the desktop app the menus live in the system's menu bar (the macOS bar at the top
// of the screen, the window's menu bar on Windows), built from the very same list as
// the web edition's in-page menus, with the same commands, labels and shortcuts. The
// page keeps the items' enabled, checked and label state in step.
import { mac } from './platform.js?v=e2bbaab254';

const label = c => typeof c.label === 'function' ? c.label() : c.label;
// 'Mod+Shift+S' -> 'CmdOrCtrl+Shift+S'
const accel = spec => spec.split('+').map(p => p === 'Mod' ? 'CmdOrCtrl' : p === 'Ctrl' ? 'Control' : p.length === 1 ? p.toUpperCase() : p).join('+');

export async function nativeMenu(commands, menus, { appItems = [], editItems = true } = {}) {
  const M = window.__TAURI__ && window.__TAURI__.menu;
  if (!M) return null;
  const { Menu, Submenu, MenuItem, CheckMenuItem, PredefinedMenuItem } = M;
  const tracked = [];   // { id, item, state }
  const dynamic = [];   // { sub, items: () => list, sig }
  const keys = new Set();
  const sep = () => PredefinedMenuItem.new({ item: 'Separator' });

  async function build(list) {
    const out = [];
    let lastSep = true;
    for (const it of list) {
      if (it === '-') { if (!lastSep) { out.push(await sep()); lastSep = true; } continue; }
      if (it && it.predefined) { out.push(await PredefinedMenuItem.new({ item: it.predefined, text: it.text })); lastSep = false; continue; }
      if (typeof it === 'string') {
        const c = commands.get(it);
        if (!c || !commands.visible(c)) continue;
        const key = c.key && [].concat(c.key)[0];
        const opts = { text: label(c), enabled: commands.enabled(c), action: () => commands.run(it) };
        if (key) { opts.accelerator = accel(key); keys.add(it); }
        const item = c.checked ? await CheckMenuItem.new({ ...opts, checked: !!c.checked() }) : await MenuItem.new(opts);
        tracked.push({ id: it, item, state: { text: opts.text, enabled: opts.enabled, checked: c.checked ? !!c.checked() : null } });
        out.push(item);
      } else if (it && it.items) {
        if (typeof it.items === 'function') {
          const sub = await Submenu.new({ text: it.label, items: await build(await it.items()) });
          dynamic.push({ sub, items: it.items, sig: null });
          out.push(sub);
        } else out.push(await Submenu.new({ text: it.label, items: await build(it.items) }));
      } else if (it && it.label) {
        out.push(await MenuItem.new({ text: it.label, enabled: it.enabled !== false, action: it.run || (() => {}) }));
      } else continue;
      lastSep = false;
    }
    while (out.length && lastSep) { out.pop(); lastSep = false; }
    return out;
  }

  const subs = [];
  // the macOS app menu: About, settings, Hide, Quit
  if (mac) {
    subs.push(await Submenu.new({ text: 'OctoShaper', items: await build([...appItems, '-', { predefined: 'Services' }, '-', { predefined: 'Hide' }, { predefined: 'HideOthers' }, { predefined: 'ShowAll' }, '-', { predefined: 'Quit' }]) }));
  }
  for (const m of menus) {
    if (m.hidden && m.hidden()) continue;
    let items = m.items;
    // text fields need the system's Cut, Copy, Paste and Select All (and their keys)
    if (m.label === 'Edit' && editItems) {
      const at = items.indexOf('-');
      items = [...items.slice(0, at), '-', { predefined: 'Cut' }, { predefined: 'Copy' }, { predefined: 'Paste' }, { predefined: 'SelectAll' }, ...items.slice(at)];
    }
    if (m.label === 'Help' && mac) items = items.filter(i => i !== 'about');
    subs.push(await Submenu.new({ text: m.label, items: await build(items) }));
  }
  if (mac) subs.splice(subs.length - 1, 0, await Submenu.new({ text: 'Window', items: await build([{ predefined: 'Minimize' }, { predefined: 'Maximize', text: 'Zoom' }, '-', { predefined: 'Fullscreen' }]) }));
  const menu = await Menu.new({ items: subs });
  await menu.setAsAppMenu();

  // labels, enabled and checked marks follow the studio; only what changed is sent
  let busy = false, again = false;
  async function refresh() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      for (const t of tracked) {
        const c = commands.get(t.id);
        const text = label(c), enabled = commands.enabled(c), checked = c.checked ? !!c.checked() : null;
        if (text !== t.state.text) { await t.item.setText(text); t.state.text = text; }
        if (enabled !== t.state.enabled) { await t.item.setEnabled(enabled); t.state.enabled = enabled; }
        if (checked !== null && checked !== t.state.checked) { await t.item.setChecked(checked); t.state.checked = checked; }
      }
      for (const d of dynamic) {
        const list = await d.items();
        const sig = JSON.stringify(list.map(i => typeof i === 'string' ? i : i.label + '|' + (i.enabled !== false)));
        if (sig === d.sig) continue;
        d.sig = sig;
        for (const old of await d.sub.items()) await d.sub.remove(old);
        for (const it of await build(list)) await d.sub.append(it);
      }
    } catch (e) { console.warn('menu', e); } finally {
      busy = false;
      if (again) { again = false; refresh(); }
    }
  }
  let timer = 0;
  return {
    keys,   // commands whose shortcut the menu bar handles
    refresh() { clearTimeout(timer); timer = setTimeout(refresh, 120); },
  };
}
