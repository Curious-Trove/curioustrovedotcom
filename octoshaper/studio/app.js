// OctoShaper studio. Each open document (an asset) has three views, code, graph and
// 3D, shown as tabs the person can arrange; the code is the file, and the other views
// are other ways to show and edit it. The same page is the free web edition and the
// desktop app (Pro); platform.js is where they differ, and the AI menu is the
// desktop app's only addition.
import { loadOcto } from './octo.js?v=e2bbaab254';
import { Previewer } from './render.js?v=e2bbaab254';
import { NodeDoc } from './nodedoc.js?v=e2bbaab254';
import { markdown } from './markdown.js?v=e2bbaab254';
import { nativeMenu } from './nativemenu.js?v=e2bbaab254';
import { connectAgent } from './agent.js?v=e2bbaab254';
import { OctoDocument, KINDS, ALL_KINDS, KIND_LABEL } from './document.js?v=e2bbaab254';
import { Dock } from './dock.js?v=e2bbaab254';
import { Commands, MenuBar, popup, commandPalette, keyLabel } from './menu.js?v=e2bbaab254';
import { modal, confirmClose, askText, shortcutsDialog, h } from './dialogs.js?v=e2bbaab254';
import { exportDialog, runExport, lastExport } from './export.js?v=e2bbaab254';
import { aiSettingsDialog } from './ai.js?v=e2bbaab254';
import * as P from './platform.js?v=e2bbaab254';
import { KEYS } from './keys.js?v=e2bbaab254';
import { editEnvironment } from './envedit.js?v=e2bbaab254';
import { VERSION, RELEASED, CHANNEL, FEEDBACK } from './version.js?v=e2bbaab254';
import { track, trackOnce, trackError, tracking } from './analytics.js?v=e2bbaab254';

// web/boot.js found something missing and said so on the page: stop here
const boot = window.octoBoot || { ok: true, done() {}, fail() {} };
if (!boot.ok) { track('Studio Unsupported', { missing: boot.missing.join(', ') }); await new Promise(() => {}); }

const SAMPLES = [
  ['hello', 'Hello, box'],
  ['village', 'Village'],
  ['tower', 'Tower'],
  ['forest', 'Forest'],
  ['castle', 'Castle'],
  ['tree', 'Tree'],
  ['terrain', 'Terrain'],
  ['street', 'Street (tools)'],
  ['geometry', 'Square (custom geometry)'],
  ['keep', 'Keep (textures and materials)'],
  ['terrace', 'Terrace (reuse and hand edits)'],
  ['ruin', 'Ruin (chips, wear, bends)'],
  ['island', 'Island (images that shape, raster, palette)'],
  ['overgrown', 'Overgrown (ivy, moss, signs)'],
  ['diorama', 'Diorama (built and painted by hand)'],
];
const NEW_TEXT = `// A new shape. Double-click the graph to add a node, or write one line per node here.

param size = 4 in 1..10

block = box(w: size, h: size, d: size)
out = output(block)
`;

const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const octo = await loadOcto('octo.wasm?v=e2bbaab254');
const previewer = new Previewer();
const nodeDoc = new NodeDoc(octo, previewer);
document.body.classList.add('edition-' + P.EDITION);

const docs = new Map();   // id -> OctoDocument
let active = null;
let seq = 0;
let agentLink = null;
let studio = null;      // what an AI agent uses (the end of this file)
let native = null;      // the desktop app's menu bar, when it has one

const tabId = (doc, kind) => `${doc.id}/${kind}`;
const parseTab = t => { const k = t.lastIndexOf('/'); return [docs.get(t.slice(0, k)), t.slice(k + 1)]; };

// ---- messages ----

let toastTimer = 0;
function toast(text, { bad = false, ms = 3200 } = {}) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.toggle('bad', bad);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
const failed = (what, e) => {
  toast(`${what}: ${e && e.message || e}`, { bad: true, ms: 6000 });
  // the first words say what failed ("Could not save"); the rest can name a file
  trackError(String(what).split(' ').slice(0, 3).join(' '), e);
};

// ---- what each document can ask of the studio ----

const host = {
  octo, previewer, nodeDoc,
  changed(doc, what) {
    if (what === 'history' && doc === active) updateUndo();
    if (what !== 'typing') menusChanged();
    if (what === 'text' || what === 'typing') { dock.paintTabs(); if (doc === active) updateTitle(); saveSession(); if (!restoring && doc.dirty) trackOnce('Studio Edit'); }
    if (what === 'text' && docs.size > 1) usedChanged(doc);
    if (studio && studio.onChange) studio.onChange();
  },
  activate(doc, kind) {
    if (doc !== active) setActive(doc);
    const t = tabId(doc, kind);
    if (dock.focus !== t && dock.has(t)) dock.activate(t, { notify: false });
  },
  // bring one of a document's views to the front, placing its tab if it has none
  show(doc, kind) { if (doc !== active) setActive(doc); showView(kind)(); },
  command: id => commands.run(id),
  toast: (text, o) => toast(text, o),
  isActive: doc => doc === active,
  resolveFile: (doc, path) => resolveFile(doc, path),
  openUsed: (doc, path) => openUsed(doc, path),
  filesMissing(doc, paths) {
    // a file opened in a browser can't see its neighbours: say how to give them
    if (doc.ref && doc.ref.kind === 'path') return;
    if (doc.sample) return;
    toast(`${doc.name} uses ${paths.join(', ')}: open ${paths.length === 1 ? 'that file' : 'those files'} in a tab too${P.canPickFolder ? ', or pick the folder with File ▸ Use files from a folder' : ''}.`, { ms: 7000 });
  },
};

// ---- the workspace ----

const welcome = buildWelcome();
const dock = new Dock($('#dock'), {
  panel: t => { const [d, k] = parseTab(t); return d ? d.panels[k] : null; },
  label: t => {
    const [d, k] = parseTab(t);
    return { title: d.name, kind: k, kindLabel: KIND_LABEL[k], dirty: d.dirty, active: d === active, tip: `${d.name}: ${KIND_LABEL[k]}` + (d.ref ? `\n${P.refLabel(d.ref)}` : d.sample ? '\nsample' : '\nnot saved to a file yet') };
  },
  activated: t => { const [d] = parseTab(t); if (d) setActive(d); saveSession(); },
  close: t => closeTab(t),
  menu: (t, x, y) => tabMenu(t, x, y),
  changed: () => saveSession(),
  stripDblClick: () => commands.run('new'),
  empty: welcome.el,
});

// the default arrangement: code, graph and 3D side by side (one group on small screens)
function defaultLayout() {
  const all = [...docs.values()];
  const col = k => all.map(d => tabId(d, k));
  if (innerWidth < 900) dock.setColumns([[...col('graph'), ...col('view'), ...col('code')]]);
  else dock.setColumns([col('code'), col('graph'), col('view')], [28, 46, 26]);
  if (active) setActive(active, true);
}

// puts a view of a document where views of that kind already are
function placeTab(doc, kind, activate = true) {
  const t = tabId(doc, kind);
  if (dock.has(t)) { if (activate) dock.activate(t); return; }
  if (!dock.groups().length) {
    defaultLayout();
    if (!dock.has(t)) dock.add(t, null, -1, { activate });
    else if (activate) dock.activate(t);
    return;
  }
  // an Image or a Draw tab, the first time, opens beside the 3D view
  const g = (active && dock.groupOf(tabId(active, kind))) || dock.groups().find(g => g.tabs.some(x => x.endsWith('/' + kind))) ||
    (KINDS.includes(kind) ? null : dock.groupOf(tabId(doc, 'view')) || dock.groups().find(g => g.tabs.some(x => x.endsWith('/view'))));
  dock.add(t, g ? g.id : null, -1, { activate });
}

// the document in use: every group shows its tab, if it has one
function setActive(doc, force = false) {
  if (doc === active && !force) return;
  active = doc;
  // each group shows the document: a group already showing one of its tabs (the one
  // just clicked) keeps it; others show its tab of the same kind as now, or its first
  if (doc) for (const g of dock.groups()) {
    const cur = g.active ? parseTab(g.active) : [];
    if (cur[0] === doc) continue;
    const mine = g.tabs.filter(x => parseTab(x)[0] === doc);
    const t = mine.find(x => parseTab(x)[1] === cur[1]) || mine[0];
    if (t) dock.activate(t, { focus: false, notify: false });
  }
  dock.paintTabs();
  updateUndo();
  updateTitle();
  menusChanged();
  if (studio && studio.onChange) studio.onChange();
}

function updateTitle() {
  P.setWindowTitle(active ? `${active.dirty ? '• ' : ''}${active.name} — OctoShaper Studio` : 'OctoShaper Studio');
}
function updateUndo() {
  $('#undo').disabled = !(active && active.history.canUndo);
  $('#redo').disabled = !(active && active.history.canRedo);
}

// ---- documents ----

function uniqueName(name, self = null) {
  const taken = new Set([...docs.values()].filter(d => d !== self).map(d => d.name));
  if (!taken.has(name)) return name;
  let k = 2;
  while (taken.has(`${name} ${k}`)) k++;
  return `${name} ${k}`;
}

function openDocument({ name, text, ref = null, sample = null, savedText = text, focus = 'graph' }) {
  const doc = new OctoDocument(host, { id: 'd' + (++seq), name: uniqueName(name || 'untitled'), text, savedText, sample, ref });
  docs.set(doc.id, doc);
  if (ref) P.packRef(ref, doc.id).then(p => { doc.packed = p; saveSession(); });
  for (const k of KINDS) placeTab(doc, k, false);
  setActive(doc, true);
  if (dock.has(tabId(doc, focus))) dock.activate(tabId(doc, focus), { notify: false });
  saveSession();
  welcome.refresh();
  return doc;
}

// ---- the files `use` nodes read (paths are relative to the file that uses them) ----

const cleanPath = p => {
  const out = [];
  for (const part of String(p).replace(/\\/g, '/').split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return (/^\//.test(p) ? '/' : '') + out.join('/');
};
const beside = (file, path) => cleanPath(String(file).replace(/[^\\/]*$/, '') + path);
// the open document a used path means, if any: the same file on disk, else the same name
function openFor(doc, path) {
  const others = [...docs.values()].filter(d => d !== doc);
  if (doc.ref && doc.ref.kind === 'path') {
    const full = beside(doc.ref.path, path);
    const d = others.find(d => d.ref && d.ref.kind === 'path' && cleanPath(d.ref.path) === full);
    if (d) return d;
  }
  if (doc.sample) { const d = others.find(d => d.sample && `${d.sample}.octo` === cleanPath(path)); if (d) return d; }
  const name = P.baseName(path);
  return others.find(d => d.name === name && !(doc.ref && doc.ref.kind === 'path' && d.ref)) || null;
}
async function readUsed(doc, path) {
  // a picture's PNG comes as bytes, a used graph as text
  const bytes = /\.png$/i.test(path);
  if (doc.sample) { const r = await fetch(P.asset(`samples/${cleanPath(path)}`)); return !r.ok ? null : bytes ? new Uint8Array(await r.arrayBuffer()) : r.text(); }
  if (doc.ref && doc.ref.kind === 'path') return P.readRef({ kind: 'path', path: beside(doc.ref.path, path) }, bytes).catch(() => null);
  if (doc.folder) return P.readIn(doc.folder, cleanPath(path), bytes).catch(() => null);
  return null;
}
async function resolveFile(doc, path) {
  const d = /\.png$/i.test(path) ? null : openFor(doc, path);
  // an open file is used as it is now, unless what is being typed in it has errors
  if (d) return d.diags.length ? d.graph.text(false) : d.text;
  return readUsed(doc, path);
}
async function openUsed(doc, path) {
  if (!path) return;
  const d = openFor(doc, path);
  if (d) { focusDoc(d); return; }
  const text = await readUsed(doc, path);
  if (text == null) { toast(`Could not find ${path} next to ${doc.name}`, { bad: true }); return; }
  if (doc.sample) openDocument({ name: P.baseName(path), text, sample: cleanPath(path).replace(/\.octo$/, '') });
  else if (doc.ref && doc.ref.kind === 'path') openFile({ name: P.baseName(path), text, ref: { kind: 'path', path: beside(doc.ref.path, path) } });
  else openDocument({ name: P.baseName(path), text });
}
// a document changed: the ones that use it follow, and files that were missing may be there now
function usedChanged(doc) {
  for (const d of docs.values()) {
    if (d === doc || d.closed) continue;
    for (const path of [...d.files.keys(), ...d.missing]) {
      if (openFor(d, path) !== doc) continue;
      if (!doc.diags.length) d.fileChanged(path, doc.text);
    }
  }
}

async function sameFile(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'path') return a.path === b.path;
  try { return await a.handle.isSameEntry(b.handle); } catch { return false; }
}

// a file: shown again if it is open already
async function openFile(f) {
  for (const d of docs.values()) if (await sameFile(d.ref, f.ref)) { focusDoc(d); return d; }
  const d = openDocument({ name: f.name, text: f.text, ref: f.ref });
  if (f.ref) P.recent.add(d.name, f.ref).then(menusChanged);
  return d;
}

function focusDoc(doc) {
  setActive(doc);
  const t = ALL_KINDS.map(k => tabId(doc, k)).find(t => dock.has(t));
  if (t) dock.activate(t);
}

async function openSample(id) {
  const open = [...docs.values()].find(d => d.sample === id && !d.dirty);
  if (open) { focusDoc(open); return; }
  try {
    const res = await fetch(P.asset(`samples/${id}.octo`));
    if (!res.ok) throw new Error(`samples/${id}.octo is not there`);
    const text = await res.text();
    openDocument({ name: id, text, sample: id });
    track('Studio Sample', { sample: id });
  } catch (e) { failed('Could not open the sample', e); }
}

function newDocument(text = NEW_TEXT, name = 'untitled') {
  return openDocument({ name, text, savedText: text === NEW_TEXT ? text : null });
}

async function closeDoc(doc, { ask = true } = {}) {
  if (!doc) return false;
  if (ask && doc.dirty) {
    focusDoc(doc);
    const v = await confirmClose(doc.name);
    if (v === 'cancel') return false;
    if (v === 'save' && !(await save(doc))) return false;
  }
  for (const k of ALL_KINDS) dock.remove(tabId(doc, k), { render: false });
  docs.delete(doc.id);
  doc.dispose();
  P.dropRef(doc.id);
  dock.render();
  if (active === doc) {
    const t = dock.focusedGroup() && dock.focusedGroup().active;
    setActive(t ? parseTab(t)[0] : [...docs.values()].pop() || null, true);
  }
  saveSession();
  welcome.refresh();
  return true;
}

async function closeAll(except = null) {
  for (const d of [...docs.values()]) if (d !== except && !(await closeDoc(d))) return false;
  return true;
}

// closing a document's last open view closes the document
function closeTab(t) {
  const [doc] = parseTab(t);
  if (!doc) return;
  const open = ALL_KINDS.filter(k => dock.has(tabId(doc, k)));
  if (open.length <= 1) closeDoc(doc);
  else dock.remove(t);
}

async function save(doc = active, { as = false } = {}) {
  if (!doc) return false;
  doc.flush();
  const text = doc.text;
  try {
    let ref = doc.ref;
    if (as || !ref) {
      ref = await P.saveAs(doc.name, 'octo', text);
      if (!ref) return false;
      if (ref.kind !== 'download') {
        doc.ref = ref;
        doc.sample = null;
        doc.name = uniqueName(P.baseName(P.refLabel(ref)), doc);
        doc.packed = await P.packRef(ref, doc.id);
      }
    } else await P.writeRef(ref, text);
    doc.savedText = text;
    if (ref.kind !== 'download') P.recent.add(doc.name, ref).then(menusChanged);
    toast(ref.kind === 'download' ? `Downloaded ${doc.name}.octo` : `Saved ${P.refLabel(ref)}`);
    track('Studio Save', { how: ref.kind === 'download' ? 'download' : as ? 'save as' : 'save' });
    host.changed(doc, 'text');
    return true;
  } catch (e) { failed('Could not save', e); return false; }
}

async function revert(doc = active) {
  if (!doc) return;
  if (doc.dirty) {
    const ok = await modal({ title: 'Revert?', body: `Put ${doc.name} back as it was ${doc.ref ? 'last saved' : 'opened'}? Your changes since are dropped; undo can't bring them back.`, buttons: [{ label: 'Cancel', value: false }, { label: 'Revert', value: true, primary: true }] });
    if (!ok) return;
  }
  try {
    let text = doc.savedText;
    if (doc.ref) text = await P.readRef(doc.ref);
    else if (doc.sample) { const r = await fetch(P.asset(`samples/${doc.sample}.octo`)); if (r.ok) text = await r.text(); }
    if (text == null) { toast('There is no saved version to go back to.'); return; }
    doc.savedText = text;
    doc.load(text);
    toast(`Reverted ${doc.name}`);
  } catch (e) { failed('Could not revert', e); }
}

async function open() {
  try { for (const f of await P.openFiles()) { await openFile(f); track('Studio Open', { how: 'picker' }); } } catch (e) { failed('Could not open', e); }
}

async function openRecent(r) {
  try { await openFile({ name: r.name, text: await P.readRef(r.ref), ref: r.ref }); track('Studio Open', { how: 'recent' }); } catch (e) { failed(`Could not open ${r.label}`, e); }
}

async function pasteAsNew() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* blocked */ }
  if (!text.trim()) { toast('The clipboard has no text (or the browser did not allow reading it).'); return; }
  newDocument(text, 'pasted');
}

// ---- the session: open documents and the layout come back on reload ----

let sessionTimer = 0, restoring = true;
function saveSession() {
  if (restoring) return; clearTimeout(sessionTimer); sessionTimer = setTimeout(writeSession, 400); }
function writeSession() {
  clearTimeout(sessionTimer);
  if (restoring) return;
  const list = [...docs.values()].map(d => ({ id: d.id, name: d.name, text: d.text, savedText: d.savedText, sample: d.sample, ref: d.ref ? d.packed || null : null }));
  store.set('octo.session', JSON.stringify({ v: 1, seq, docs: list, dock: dock.save(), active: active && active.id }));
}
addEventListener('pagehide', writeSession);

async function restoreSession() {
  let s = null;
  try { s = JSON.parse(store.get('octo.session') || 'null'); } catch { /* broken */ }
  if (!s || !Array.isArray(s.docs)) return false;
  seq = s.seq || 0;
  for (const e of s.docs) {
    if (typeof e.text !== 'string' || !e.id) continue;
    const ref = await P.unpackRef(e.ref).catch(() => null);
    const doc = new OctoDocument(host, { id: e.id, name: e.name || 'untitled', text: e.text, savedText: e.savedText ?? null, sample: e.sample || null, ref });
    if (ref) doc.packed = e.ref;
    docs.set(doc.id, doc);
    seq = Math.max(seq, parseInt(e.id.slice(1), 10) || 0);
  }
  dock.restore(s.dock, t => { if (typeof t !== 'string') return false; const [d, k] = parseTab(t); return !!d && ALL_KINDS.includes(k); });
  for (const d of docs.values()) if (!ALL_KINDS.some(k => dock.has(tabId(d, k)))) for (const k of KINDS) placeTab(d, k, false);
  setActive(docs.get(s.active) || [...docs.values()][0] || null, true);
  return true;
}

// the first visit (or a studio from before tabs): the last sample, with its draft
async function firstRun() {
  const id = store.get('octo.sample') || 'village';
  const draft = store.get('octo.draft.' + id);
  try {
    const r = await fetch(P.asset(`samples/${id}.octo`));
    const text = r.ok ? await r.text() : null;
    if (text == null) throw new Error('missing');
    openDocument({ name: id, text: draft || text, savedText: text, sample: id });
  } catch { newDocument(); }
}

// ---- the welcome page, when nothing is open ----

function buildWelcome() {
  const el = h('div', 'welcome');
  el.innerHTML = `
    <div class="welcome-card">
      <img class="welcome-logo" src="logo.svg" alt="">
      <h1>Octo<b>Shaper</b></h1>
      <p class="welcome-sub">Procedural 3D you can build as a graph and read as code.</p>
      <div class="welcome-actions">
        <button class="primary" data-w="new">New document</button>
        <button data-w="open">Open…</button>
      </div>
      <div class="welcome-cols">
        <div><div class="welcome-k">Start from a sample</div><div class="welcome-samples"></div></div>
        <div><div class="welcome-k">Recent files</div><div class="welcome-recent"></div></div>
      </div>
      <p class="welcome-hint">Tip: drop .octo files anywhere to open them · <span class="kbd-palette"></span> finds any command</p>
    </div>`;
  el.querySelector('[data-w=new]').addEventListener('click', () => commands.run('new'));
  el.querySelector('[data-w=open]').addEventListener('click', () => commands.run('open'));
  const samples = el.querySelector('.welcome-samples');
  for (const [id, label] of SAMPLES) {
    const b = h('button', 'welcome-sample', label);
    b.addEventListener('click', () => openSample(id));
    samples.append(b);
  }
  const recentEl = el.querySelector('.welcome-recent');
  return {
    el,
    async refresh() {
      if (docs.size) return;
      const list = await P.recent.list();
      recentEl.replaceChildren();
      if (!list.length) recentEl.append(h('div', 'welcome-none', P.savesInPlace ? 'Files you open or save show up here.' : 'This browser can only download files; open them again with Open….'));
      for (const r of list.slice(0, 6)) {
        const b = h('button', 'welcome-file');
        b.append(h('span', null, r.name), h('small', null, r.label));
        b.addEventListener('click', () => openRecent(r));
        recentEl.append(b);
      }
      el.querySelector('.kbd-palette').textContent = keyLabel('Mod+K');
    },
  };
}

// ---- commands, menus and shortcuts ----

const commands = new Commands();
commands.onError = (e, c) => failed(typeof c.label === 'function' ? c.label() : c.label, e);
const has = () => !!active;
// browsers keep Ctrl+N and Ctrl+W for themselves, so the web edition uses Alt
const appKey = k => P.desktop ? 'Mod+' + k : 'Alt+' + k;
const exportQuick = format => async () => {
  const last = lastExport() || {};
  const msg = await runExport(active, { ...last, format, what: 'output', name: null });
  if (msg) toast(msg);
};
const showView = kind => () => { placeTab(active, kind); dock.activate(tabId(active, kind)); };

commands.add(
  // File
  { id: 'new', label: 'New document', key: appKey('N'), run: () => { newDocument(); track('Studio New'); } },
  { id: 'open', label: 'Open…', key: 'Mod+O', run: open },
  { id: 'save', label: 'Save', key: 'Mod+S', enabled: has, run: () => save() },
  { id: 'saveAs', label: P.savesInPlace ? 'Save as…' : 'Download a copy…', key: 'Mod+Shift+S', enabled: has, run: () => save(active, { as: true }) },
  { id: 'saveAll', label: 'Save all', key: 'Mod+Alt+S', enabled: () => [...docs.values()].some(d => d.dirty), run: async () => { for (const d of docs.values()) if (d.dirty && !(await save(d))) return; } },
  { id: 'revert', label: () => active && active.ref ? 'Revert to saved' : 'Revert to original', enabled: () => !!active && (!!active.ref || !!active.sample), run: () => revert() },
  { id: 'useFolder', label: 'Use files from a folder…', enabled: () => !!active && P.canPickFolder, run: async () => {
    // a browser only sees the files it is given: this gives it the folder a document's `use` paths start from
    const d = active, dir = await P.pickFolder();
    if (!dir) return;
    d.folder = dir;
    d.retryFiles();
    toast(`${d.name} now reads the files it uses from ${dir.name}`);
  } },
  { id: 'rename', label: 'Rename…', enabled: () => !!active && !active.ref, run: async () => {
    const d = active;
    const v = await askText({ title: 'Rename', label: 'Name', value: d.name, okLabel: 'Rename', check: v => !!v });
    if (v) { d.name = uniqueName(v, d); host.changed(d, 'text'); }
  } },
  { id: 'duplicate', label: 'Duplicate', enabled: has, run: () => { active.flush(); newDocument(active.text, `${active.name} copy`); } },
  { id: 'close', label: 'Close document', key: appKey('W'), enabled: has, run: () => closeDoc(active) },
  { id: 'closeOthers', label: 'Close other documents', enabled: () => docs.size > 1, run: () => closeAll(active) },
  { id: 'closeAll', label: 'Close all', enabled: () => docs.size > 0, run: () => closeAll() },
  // Edit
  { id: 'undo', label: 'Undo', key: 'Mod+Z', keyHandled: true, enabled: () => !!native || (!!active && active.history.canUndo), run: () => undoOrField(false) },
  { id: 'redo', label: 'Redo', key: 'Mod+Shift+Z', keyHandled: true, enabled: () => !!native || (!!active && active.history.canRedo), run: () => undoOrField(true) },
  { id: 'copyCode', label: 'Copy code', enabled: has, run: async () => {
    try { active.flush(); await navigator.clipboard.writeText(active.text); toast('Copied the code'); } catch { toast('The browser did not allow copying.', { bad: true }); }
  } },
  { id: 'pasteNew', label: 'New document from clipboard', run: pasteAsNew },
  { id: 'addNode', label: 'Add node…', enabled: has, run: () => {
    const d = active;
    showView('graph')();
    requestAnimationFrame(() => { const r = d.graphView.root.getBoundingClientRect(); d.graphView.root.focus(); d.graphView.openPalette(r.left + r.width / 2 - 150, r.top + 60); });
  } },
  { id: 'draw', label: 'Draw an outline', enabled: has, run: () => { showView('view')(); active.startDrawing(); } },
  { id: 'arrange', label: 'Arrange graph', enabled: has, run: () => active.arrange() },
  { id: 'showOutput', label: 'Show the output in 3D', enabled: () => !!active && !!active.selectedName, run: () => active.selectNode(-1) },
  { id: 'palette', label: 'Command palette…', key: ['Mod+K', 'Mod+Shift+P'], noPalette: true, run: () => commandPalette(commands, MENUS) },
  // View
  { id: 'viewGraph', label: 'Graph', key: 'Alt+1', enabled: has, run: showView('graph') },
  { id: 'viewCode', label: 'Code', key: 'Alt+2', enabled: has, run: showView('code') },
  { id: 'view3d', label: '3D', key: 'Alt+3', enabled: has, run: showView('view') },
  { id: 'viewImage', label: 'Image', key: 'Alt+4', enabled: has, run: showView('image') },
  { id: 'viewDraw', label: 'Draw', key: 'Alt+5', enabled: has, run: showView('draw') },
  { id: 'environment', label: 'Edit environment…', run: () => editEnvironment() },
  { id: 'nextDoc', label: 'Next document', key: 'Mod+Alt+ArrowRight', enabled: () => docs.size > 1, run: () => cycleDoc(1) },
  { id: 'prevDoc', label: 'Previous document', key: 'Mod+Alt+ArrowLeft', enabled: () => docs.size > 1, run: () => cycleDoc(-1) },
  { id: 'fitGraph', label: 'Fit graph', enabled: has, run: () => active.graphView.fit() },
  { id: 'fit3d', label: 'Fit 3D view', enabled: has, run: () => active.viewport.fit() },
  { id: 'resetLayout', label: 'Reset layout', enabled: () => docs.size > 0, run: () => { defaultLayout(); saveSession(); } },
  { id: 'theme', label: 'Dark mode', checked: () => document.documentElement.dataset.theme === 'dark', run: toggleTheme },
  // Export
  { id: 'export', label: 'Export…', key: 'Mod+E', enabled: has, run: async () => { const m = await exportDialog(active); if (m) toast(m); } },
  { id: 'exportGlb', label: 'glTF binary (.glb)…', enabled: has, run: exportQuick('glb') },
  { id: 'exportGltf', label: 'glTF JSON (.gltf)…', enabled: has, run: exportQuick('gltf') },
  { id: 'exportPng', label: 'Picture (.png)…', enabled: has, run: exportQuick('png') },
  { id: 'exportOcto', label: 'Copy of the code (.octo)…', enabled: has, run: exportQuick('octo') },
  { id: 'exportSelected', label: 'Selected node as glTF…', enabled: () => !!active && !!active.selectedName, run: async () => { const m = await exportDialog(active, 'glb', 'selected'); if (m) toast(m); } },
  { id: 'exportAgain', label: () => { const l = lastExport(); return l ? `Export again as .${l.format}` : 'Export again'; }, key: 'Mod+Shift+E', enabled: () => has() && !!lastExport(), run: async () => {
    const m = await runExport(active, { ...lastExport(), name: null });
    if (m) toast(m);
  } },
  // AI (desktop only)
  { id: 'aiSettings', label: 'Connection settings…', hidden: () => !P.desktop, run: () => aiSettingsDialog(agentLink) },
  { id: 'aiPause', label: 'Pause agents in this window', hidden: () => !P.desktop, enabled: () => !!agentLink, checked: () => !!(agentLink && agentLink.paused), run: () => agentLink.setPaused(!agentLink.paused) },
  { id: 'aiCopy', label: 'Copy MCP address', hidden: () => !P.desktop, enabled: () => !!(agentLink && agentLink.connected), run: async () => {
    try { await navigator.clipboard.writeText(agentLink.mcp); toast(`Copied ${agentLink.mcp}`); } catch { toast(agentLink.mcp); }
  } },
  // Help
  { id: 'shortcuts', label: 'Keyboard shortcuts', key: 'Mod+/', run: showShortcuts },
  { id: 'guide', label: 'OctoLang guide', run: () => { track('Studio Guide'); return showGuide(); } },
  { id: 'whatsNew', label: "What's new", run: showChanges },
  { id: 'experimental', label: 'About this early version', run: () => showNotice() },
  { id: 'feedback', label: 'Send feedback…', run: showFeedback },
  { id: 'about', label: 'About OctoShaper Studio', run: showAbout },
);

const MENUS = [
  { label: 'File', items: [
    'new', 'open',
    { label: 'Open sample', items: SAMPLES.map(([id, label]) => ({ label, run: () => openSample(id) })) },
    { label: 'Open recent', items: async () => {
      const list = await P.recent.list();
      if (!list.length) return [{ label: 'No recent files', enabled: false }];
      return [...list.map(r => ({ label: r.name, hint: r.label, run: () => openRecent(r) })), '-', { label: 'Clear recent files', run: () => { P.recent.clear(); welcome.refresh(); menusChanged(); } }];
    } },
    '-', 'save', 'saveAs', 'saveAll', 'revert', 'useFolder', '-', 'rename', 'duplicate', '-', 'close', 'closeOthers', 'closeAll',
  ] },
  { label: 'Edit', items: ['undo', 'redo', '-', 'copyCode', 'pasteNew', '-', 'addNode', 'draw', 'arrange', 'showOutput', '-', 'palette'] },
  { label: 'View', items: ['viewGraph', 'viewCode', 'view3d', 'viewImage', 'viewDraw', '-', 'nextDoc', 'prevDoc', '-', 'fitGraph', 'fit3d', 'resetLayout', '-', 'environment', 'theme'] },
  { label: 'Export', items: ['export', '-', 'exportGlb', 'exportGltf', 'exportPng', 'exportOcto', '-', 'exportSelected', 'exportAgain'] },
  { label: 'AI', hidden: () => !P.desktop, items: ['aiSettings', 'aiPause', 'aiCopy'] },
  { label: 'Help', items: ['shortcuts', 'guide', '-', 'palette', '-', 'whatsNew', 'experimental', 'feedback', '-', 'about'] },
];
const menubar = new MenuBar($('#menubar'), commands, MENUS);
menubar.refresh();
commands.bindKeys();

function menusChanged() {
  menubar.refresh();
  if (native) native.refresh();
}

// the small fields keep their own undo; everywhere else (the code included) it is the document's
function undoOrField(redo) {
  const f = document.activeElement;
  if (f && f.closest && f.closest('input, select, [contenteditable=true], [contenteditable=plaintext-only]')) { document.execCommand(redo ? 'redo' : 'undo'); return; }
  if (active) active.undo(redo);
}

function cycleDoc(step) {
  const list = [...docs.values()];
  const k = list.indexOf(active);
  focusDoc(list[(k + step + list.length) % list.length]);
}

function tabMenu(t, x, y) {
  const [doc, kind] = parseTab(t);
  const g = dock.groupOf(t);
  setActive(doc);
  popup([
    { label: `Close ${KIND_LABEL[kind]}`, run: () => closeTab(t) },
    { label: `Close ${doc.name}`, run: () => closeDoc(doc) },
    { label: 'Close other documents', enabled: docs.size > 1, run: () => closeAll(doc) },
    '-',
    { label: 'Split right', enabled: g.tabs.length > 1, run: () => dock.split(t, g.id, 'right') },
    { label: 'Split down', enabled: g.tabs.length > 1, run: () => dock.split(t, g.id, 'bottom') },
    ...ALL_KINDS.filter(k => k !== kind && !dock.has(tabId(doc, k))).map(k => ({ label: `Show ${KIND_LABEL[k]}`, run: () => showView(k)() })),
    '-',
    { label: 'Save', run: () => save(doc) },
    { label: 'Rename…', enabled: !doc.ref, run: () => commands.run('rename') },
    { label: doc.ref ? P.refLabel(doc.ref) : 'Not saved to a file yet', enabled: false },
  ], commands, { x, y });
}

// ---- header ----

$('#undo').addEventListener('click', () => active && active.undo());
$('#redo').addEventListener('click', () => active && active.undo(true));
$('#export-btn').addEventListener('click', () => commands.run('export'));
$('#theme').addEventListener('click', toggleTheme);

// Cmd/Ctrl+Z everywhere but the small fields, which keep their own undo while you type
document.addEventListener('keydown', e => {
  if (native && native.keys.has('undo')) return;   // the menu bar has Cmd+Z
  if (!(e.metaKey || e.ctrlKey) || e.altKey || !active) return;
  const k = e.key.toLowerCase();
  if (k !== 'z' && k !== 'y') return;
  if (e.target.closest && e.target.closest('input, select, [contenteditable=true], [contenteditable=plaintext-only]')) return;
  if (document.querySelector('.modal-back, .palette-back')) return;
  e.preventDefault();
  active.undo(k === 'y' || e.shiftKey);
}, true);

// light or dark, like the site
function toggleTheme() {
  setTimeout(menusChanged, 0);
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  store.set('octo.theme', dark ? 'dark' : 'light');
  for (const d of docs.values()) d.repaint();
}

// ---- dropping files ----

let dragDepth = 0;
const isFileDrag = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', e => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth++; document.body.classList.add('drop-files'); });
addEventListener('dragleave', e => { if (!isFileDrag(e)) return; if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop-files'); } });
addEventListener('dragover', e => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
addEventListener('drop', async e => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('drop-files');
  // handles (where the browser has them) let Save write back to the dropped file
  const items = [...e.dataTransfer.items].filter(i => i.kind === 'file');
  const handles = items.map(i => i.getAsFileSystemHandle ? i.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null));
  const files = items.map(i => i.getAsFile());
  let opened = 0;
  for (let k = 0; k < files.length; k++) {
    const f = files[k];
    if (!f || !/\.(octo|txt)$/i.test(f.name)) continue;
    const hd = await handles[k];
    try { await openFile(await P.fromFile(f, hd && hd.kind === 'file' ? hd : null)); opened++; track('Studio Open', { how: 'drop' }); } catch (err) { failed(`Could not open ${f.name}`, err); }
  }
  if (!opened) toast('Drop .octo files to open them.');
});

// ---- help ----

function showShortcuts() {
  const keyed = ids => ids.map(id => commands.get(id)).filter(c => c && commands.visible(c)).map(c => [typeof c.label === 'function' ? c.label() : c.label, [].concat(c.key)[0]]);
  return shortcutsDialog([
    ['Files', keyed(['new', 'open', 'save', 'saveAs', 'saveAll', 'close'])],
    ['Edit and view', keyed(['undo', 'redo', 'palette', 'viewGraph', 'viewCode', 'view3d', 'viewImage', 'viewDraw', 'nextDoc', 'prevDoc', 'export', 'exportAgain', 'shortcuts'])],
    KEYS.code, KEYS.graph, KEYS.view, KEYS.lines, KEYS.pen, KEYS.tabs,
  ]);
}

async function showGuide() {
  let text = '# The guide is not available here';
  try { const r = await fetch(P.asset('docs/language.md')); if (r.ok) text = await r.text(); } catch { /* not served */ }
  const { html, toc } = markdown(text, octo);
  const body = h('div', 'guide');
  const nav = h('nav', 'guide-toc');
  const page = h('article', 'guide-page');
  page.innerHTML = html;
  for (const t of toc.filter(t => t.level <= 2)) {
    const a = h('button', 'guide-link' + (t.level === 1 ? ' top' : ''), t.text);
    a.addEventListener('click', () => { const el = page.querySelector('#' + CSS.escape(t.id)); if (el) page.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' }); });
    nav.append(a);
  }
  // a node name in the guide shows what it does, like in the graph
  for (const c of page.querySelectorAll('code, .t-type')) if (octo.typeMap[c.textContent.trim()]) nodeDoc.attach(c, c.textContent.trim());
  body.append(nav, page);
  return modal({ title: 'OctoLang guide', body, wide: true, buttons: [] });
}

async function showAbout() {
  let version = VERSION;
  try { if (P.desktop && window.__TAURI__.app) version = await window.__TAURI__.app.getVersion(); } catch { /* not allowed */ }
  const build = document.querySelector('meta[name="octo-build"]');
  const body = h('div', 'about');
  body.innerHTML = `
    <img class="about-logo" src="logo.svg" alt="">
    <div class="about-name">Octo<b>Shaper</b> <span>${version}</span></div>
    ${CHANNEL ? `<button class="channel about-channel" type="button">${CHANNEL}</button>` : ''}
    <p>${P.desktop ? 'Desktop app. AI agents on this computer can use the studio through the AI menu.' : 'Web edition: free, nothing to install, no account. Files stay on your computer.'}</p>
    <p>Every file is OctoLang code: the graph, the code and the 3D view are three views of the same text. What you export is yours to use for anything.</p>
    <p class="about-links"><a href="#" data-a="changes">What's new</a> · <a href="https://curioustrove.com/octoshaper/" target="_blank" rel="noopener">Website</a> · <a href="${FEEDBACK.forum}" target="_blank" rel="noopener">Forum</a> · <a href="${FEEDBACK.email}">Email</a></p>
    <p class="about-build">Released ${RELEASED}${build && build.content ? ` · build ${build.content}` : ''}</p>`;
  const wait = modal({ title: 'About', body, buttons: [{ label: 'Close', value: true, primary: true }] });
  // links to the other dialogs close this one first
  const then = fn => e => { e.preventDefault(); body.closest('.modal-back').querySelector('.modal-x').click(); fn(); };
  const ch = body.querySelector('.about-channel');
  if (ch) ch.addEventListener('click', then(() => showNotice()));
  body.querySelector('[data-a=changes]').addEventListener('click', then(showChanges));
  return wait;
}

// ---- an early version: what to expect, what changed, where to say what you think ----

const channelBtn = $('#channel');
if (CHANNEL) {
  channelBtn.hidden = false;
  channelBtn.textContent = CHANNEL;
  channelBtn.addEventListener('click', () => showNotice());
}

function showNotice(first = false) {
  const body = h('div', 'notice');
  body.innerHTML = `
    <p><b>OctoShaper Studio ${VERSION}</b> is an early, experimental version of OctoShaper Studio, a complete redesign of OctoShaper. It is free to use, and we are opening it up early to hear what you think.</p>
    <ul>
      <li><b>Things will change.</b> Nodes, the studio and the OctoLang file format may change between versions, and a file made now may need small fixes later.</li>
      <li><b>Expect rough edges.</b> Some things are slow or unfinished, and you may find bugs.</li>
      <li><b>Your files stay with you.</b> Nothing is uploaded. Open documents are kept in this browser between visits, so save the ones you care about to a file.</li>
      <li><b>What you export is yours</b>, to use for anything, commercially included.</li>
    </ul>
    <p>Found a bug, or made something? Tell us on the <a href="${FEEDBACK.forum}" target="_blank" rel="noopener">forum</a> or by <a href="${FEEDBACK.email}">email</a>.</p>
    <p class="notice-small">We count visits and which features are used (with umami: no cookies, nothing personal, never your files) to see what to work on next.</p>`;
  if (!tracking) body.querySelector('.notice-small').remove();
  return modal({ title: first ? 'Welcome to OctoShaper Studio' : 'About this early version', body, buttons: [
    { label: "What's new", value: 'changes' }, { spacer: true }, { label: first ? 'Start' : 'Close', value: true, primary: true },
  ] }).then(v => {
    store.set('octo.notice', VERSION);
    if (v === 'changes') showChanges();
  });
}

async function showChanges() {
  track('Studio Whats New');
  channelBtn.classList.remove('fresh');
  store.set('octo.seen', VERSION);
  let text = `# What's new\n\nThe changelog is not available here.`;
  try { const r = await fetch(P.asset('CHANGELOG.md')); if (r.ok) text = await r.text(); } catch { /* not served */ }
  const body = h('div', 'guide changes');
  const page = h('article', 'guide-page');
  page.innerHTML = markdown(text, octo).html;
  for (const a of page.querySelectorAll('a[href^="http"]')) { a.target = '_blank'; a.rel = 'noopener'; }
  body.append(page);
  return modal({ title: `What's new in ${VERSION}`, body, wide: true, buttons: [] });
}

function showFeedback() {
  track('Studio Feedback');
  const body = h('div', 'notice');
  body.innerHTML = `
    <p>Thank you for trying OctoShaper Studio. Every bug report, question and idea helps while it is this early.</p>
    <ul>
      <li>Post on the <a href="${FEEDBACK.forum}" target="_blank" rel="noopener">community forum</a>, where others can chime in.</li>
      <li>Or <a href="${FEEDBACK.email}">email us</a>.</li>
    </ul>
    <p class="notice-small">For a bug, say what you did, what you expected, and which browser you use. The .octo file helps too (File ▸ Save, or Edit ▸ Copy code).</p>`;
  return modal({ title: 'Send feedback', body, buttons: [{ label: 'Close', value: true, primary: true }] });
}

// once the studio is running, an error nobody caught is a bug: say so, and count it
function onBug(e) {
  if (!e) return;
  console.error(e);
  trackError('uncaught', e, { bug: true });
  toast(`Something went wrong: ${e.message || e}. If it keeps happening, please tell us (Help ▸ Send feedback).`, { bad: true, ms: 8000 });
}

// ---- start ----

const returning = !!store.get('octo.session');
if (!(await restoreSession())) { restoring = false; await firstRun(); }
restoring = false;
saveSession();
for (const f of await P.startupFiles()) await openFile(f);
welcome.refresh();
updateTitle();

// ---- what an AI agent (or a test) can use: the studio's own edit paths ----

function docApi(get) {
  const need = () => get() || (() => { throw new Error('no document is open in this window; open one, or use new_document'); })();
  return {
    octo,
    get name() { return need().name; },
    get documents() { return [...docs.values()].map(d => d.name); },
    get graph() { return need().graph; },
    get doc() { return need().doc; },
    get code() { return need().text; },
    get codeDiags() { return need().diags; },
    get sample() { return need().name; },
    get selected() { return need().selectedName; },
    get view() { return need().viewport.view; },
    get history() { return need().history; },
    swapIn: (text, opts) => need().swapIn(text, opts),
    undo: () => need().undo(),
    redo: () => need().undo(true),
    // one undo step for everything fn does
    group: fn => need().history.group(fn),
    setParams: values => need().setParams(values),
    capture: (mesh, opts) => need().capture(mesh, opts),
    shot: (mesh, w, ht, opts) => need().shot(mesh, w, ht, opts),
    select: name => { const d = need(); if (name == null) d.selectNode(-1); else d.selectByName(name); },
    markTouched: names => need().graphView.markTouched(names),
    get shapes() { return need().shapes; },
    newDocument: (name, code) => newDocument(code, name || 'untitled'),
    pick(name) {
      const d = [...docs.values()].find(x => x.name === name);
      if (!d) throw new Error(`no open document called ${name}; open: ${[...docs.values()].map(x => x.name).join(', ') || 'none'}`);
      return docApi(() => (docs.has(d.id) ? d : null));
    },
    openAISettings: () => commands.run('aiSettings'),
    saveDraft: saveSession,
    // more of the studio, for tests
    openSample, open: openFile, close: closeDoc, docs, dock, commands,
  };
}
studio = docApi(() => active);
studio.onChange = null;
window.octoStudio = studio;
agentLink = await connectAgent(studio, $('#agent'));
if (P.desktop) {
  try {
    native = await nativeMenu(commands, MENUS, { appItems: [{ label: 'About OctoShaper', run: showAbout }, '-', { label: 'AI Connection Settings…', run: () => commands.run('aiSettings') }] });
  } catch (e) { console.warn('the system menu bar is not available', e); native = null; }
  if (native) {
    commands.nativeKeys = native.keys;
    document.body.classList.add('native-menu');
  }
}
menusChanged();

// running: the loading screen goes, and errors from here on are the studio's to report
boot.done();
addEventListener('error', e => onBug(e.error || e.message));
addEventListener('unhandledrejection', e => onBug(e.reason));
track('Studio Start', { edition: P.EDITION, returning: returning ? 'yes' : 'no', small: matchMedia('(max-width: 900px)').matches ? 'yes' : 'no', touch: matchMedia('(pointer: coarse)').matches ? 'yes' : 'no' });
{
  // a first visit gets the notice; a new version since the last visit gets a dot on the badge
  const seen = store.get('octo.seen');
  if (!store.get('octo.notice') && !P.desktop) showNotice(true);
  else if (seen && seen !== VERSION) { channelBtn.classList.add('fresh'); toast(`OctoShaper Studio was updated to ${VERSION}. Help ▸ What's new says what changed.`, { ms: 6000 }); }
  if (!seen) store.set('octo.seen', VERSION);
}
