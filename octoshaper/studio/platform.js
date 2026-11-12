// Where files come from and go to. The same studio runs in a browser (the free web
// edition) and in the OctoShaper desktop app (Pro, Tauri); this file is where the two
// differ, so the rest of the studio never asks which one it is in.
//
// A file reference ("ref") is what Save writes back to:
//   { kind: 'path', path }       the desktop app: a path on disk
//   { kind: 'handle', handle }   a browser with the File System Access API (Chrome, Edge)
// Other browsers have no refs: opening reads a file, saving downloads one.

const tauri = window.__TAURI__;
export const desktop = !!(tauri && tauri.core);
export const invoke = desktop ? tauri.core.invoke : () => Promise.reject(new Error('desktop only'));
export const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const fsAccess = !desktop && typeof window.showOpenFilePicker === 'function';
// whether Save can write back to the file it opened
export const savesInPlace = desktop || fsAccess;

export const FORMATS = {
  octo: { ext: 'octo', mime: 'text/plain', label: 'OctoLang file' },
  glb: { ext: 'glb', mime: 'model/gltf-binary', label: 'glTF binary' },
  gltf: { ext: 'gltf', mime: 'model/gltf+json', label: 'glTF (JSON)' },
  png: { ext: 'png', mime: 'image/png', label: 'PNG image' },
};

export const baseName = file => String(file).split(/[\\/]/).pop().replace(/\.[^.]*$/, '') || 'untitled';
export const fileName = file => String(file).split(/[\\/]/).pop();
export const refLabel = ref => !ref ? '' : ref.kind === 'path' ? ref.path : ref.handle.name;

const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
export { b64 };
const isAbort = e => e && (e.name === 'AbortError' || /abort|cancel/i.test(String(e.message || e)));

// ---- a small key/value store in IndexedDB, for file handles (they can't go in localStorage) ----

const idb = (() => {
  let db = null;
  const open = () => db || (db = new Promise((res, rej) => {
    const r = indexedDB.open('octoshaper', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => undefined),
    set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}),
    del: k => tx('readwrite', s => s.delete(k)).catch(() => {}),
  };
})();

// refs in the saved session: paths as they are, handles by a key into IndexedDB
export async function packRef(ref, key) {
  if (!ref) return null;
  if (ref.kind === 'path') return { kind: 'path', path: ref.path };
  await idb.set('ref:' + key, ref.handle);
  return { kind: 'handle', key: 'ref:' + key };
}
export async function unpackRef(p) {
  if (!p) return null;
  if (p.kind === 'path') return desktop ? { kind: 'path', path: p.path } : null;
  const handle = fsAccess ? await idb.get(p.key) : null;
  return handle ? { kind: 'handle', handle } : null;
}
export const dropRef = key => idb.del('ref:' + key);

// ---- reading ----

async function handleText(handle) { return (await handle.getFile()).text(); }

// asks for one or more .octo files: [{ name, text, ref }]
export async function openFiles() {
  if (desktop) {
    const list = await invoke('file_open');
    return list.map(f => ({ name: baseName(f.path), text: f.text, ref: { kind: 'path', path: f.path } }));
  }
  if (fsAccess) {
    let handles;
    try {
      handles = await window.showOpenFilePicker({ multiple: true, id: 'octo', types: [{ description: 'OctoLang files', accept: { 'text/plain': ['.octo'] } }], excludeAcceptAllOption: false });
    } catch (e) { if (isAbort(e)) return []; throw e; }
    return Promise.all(handles.map(async h => ({ name: baseName(h.name), text: await handleText(h), ref: { kind: 'handle', handle: h } })));
  }
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.octo,text/plain';
    input.multiple = true;
    input.addEventListener('change', async () => res(await Promise.all([...input.files].map(fromFile))));
    input.addEventListener('cancel', () => res([]));
    input.click();
  });
}

// a dropped or picked File object
export async function fromFile(file, handle = null) {
  return { name: baseName(file.name), text: await file.text(), ref: handle ? { kind: 'handle', handle } : null };
}

// reads a ref again (recent files); asks the browser for permission if it needs to
export async function readRef(ref, bytes = false) {
  if (ref.kind === 'path') return bytes ? new Uint8Array(await invoke('file_read_bytes', { path: ref.path })) : invoke('file_read', { path: ref.path });
  if (!(await permitted(ref.handle, 'read'))) throw new Error('the browser did not allow reading it');
  if (bytes) return new Uint8Array(await (await ref.handle.getFile()).arrayBuffer());
  return handleText(ref.handle);
}

async function permitted(handle, mode) {
  if (!handle.queryPermission) return true;
  const opts = { mode: mode === 'write' ? 'readwrite' : 'read' };
  if (await handle.queryPermission(opts) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

// ---- a folder of files to use (browsers; the desktop app reads paths) ----

export const canPickFolder = !desktop && typeof window.showDirectoryPicker === 'function';
export async function pickFolder() {
  try { return await window.showDirectoryPicker({ id: 'octo-kit', mode: 'read' }); } catch (e) { if (isAbort(e)) return null; throw e; }
}
// the text of a file in a folder, by its path from there
export async function readIn(dir, path, bytes = false) {
  const parts = path.split('/').filter(Boolean);
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  const f = await d.getFileHandle(parts[parts.length - 1]);
  return bytes ? new Uint8Array(await (await f.getFile()).arrayBuffer()) : handleText(f);
}

// ---- writing ----

// data is a string or a Uint8Array
export async function writeRef(ref, data) {
  if (ref.kind === 'path') {
    const args = typeof data === 'string' ? { path: ref.path, text: data, base64: null } : { path: ref.path, text: null, base64: b64(data) };
    return invoke('file_write', args);
  }
  if (!(await permitted(ref.handle, 'write'))) throw new Error('the browser did not allow writing it');
  const w = await ref.handle.createWritable();
  await w.write(data);
  await w.close();
}

// asks where to save: the new ref, { kind: 'download' } when the browser can only
// download, or null when the person cancelled
export async function saveAs(name, format, data) {
  const f = FORMATS[format];
  if (desktop) {
    const path = await invoke('file_save_dialog', { name, ext: f.ext, label: f.label });
    if (!path) return null;
    const ref = { kind: 'path', path };
    await writeRef(ref, data);
    return ref;
  }
  if (fsAccess && window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: `${name}.${f.ext}`, id: format === 'octo' ? 'octo' : 'export', types: [{ description: f.label, accept: { [f.mime]: ['.' + f.ext] } }] });
    } catch (e) { if (isAbort(e)) return null; throw e; }
    const ref = { kind: 'handle', handle };
    await writeRef(ref, data);
    return ref;
  }
  download(`${name}.${f.ext}`, data, f.mime);
  return { kind: 'download' };
}

export function download(file, data, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- recent files ----

const RECENT = 'octo.recent', MAX_RECENT = 10;
const readList = () => { try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch { return []; } };
const writeList = l => { try { localStorage.setItem(RECENT, JSON.stringify(l)); } catch { /* storage off */ } };

export const recent = {
  // [{ name, label, ref }] with the most recent first; refs that are gone are left out
  async list() {
    const out = [];
    for (const e of readList()) {
      const ref = await unpackRef(e.ref);
      if (ref) out.push({ name: e.name, label: e.label, ref });
    }
    return out;
  },
  async add(name, ref) {
    if (!ref || (ref.kind !== 'path' && ref.kind !== 'handle')) return;
    const label = refLabel(ref);
    let list = readList();
    // the same file again moves to the top (handles are compared by name, which is all a page can see)
    const same = [];
    for (const e of list) {
      if (e.label !== label) continue;
      if (e.ref.kind === 'path' || ref.kind !== 'handle') { same.push(e); continue; }
      const h = await idb.get(e.ref.key);
      if (h && await h.isSameEntry(ref.handle)) same.push(e);
    }
    list = list.filter(e => !same.includes(e));
    const key = 'recent:' + Math.random().toString(36).slice(2, 10);
    list.unshift({ name, label, ref: await packRef(ref, key) });
    for (const gone of list.splice(MAX_RECENT)) if (gone.ref.kind === 'handle') idb.del(gone.ref.key);
    for (const e of same) if (e.ref.kind === 'handle') idb.del(e.ref.key);
    writeList(list);
  },
  clear() {
    for (const e of readList()) if (e.ref.kind === 'handle') idb.del(e.ref.key);
    writeList([]);
  },
};

// ---- the desktop window ----

export function setWindowTitle(title) {
  document.title = title;
  if (desktop && tauri.window && tauri.window.getCurrentWindow) tauri.window.getCurrentWindow().setTitle(title).catch(() => {});
}

// .octo files the desktop app was started with (octoshaper castle.octo)
export async function startupFiles() {
  if (!desktop) return [];
  try {
    return (await invoke('startup_files')).map(f => ({ name: baseName(f.path), text: f.text, ref: { kind: 'path', path: f.path } }));
  } catch { return []; }
}

export const EDITION = desktop ? 'desktop' : 'web';

// Where the samples, the guide and the changelog are, from the page. From web/ (make
// serve, the desktop app) they are one folder up, in the repository; a web release
// (tools/release-web.sh) puts them beside the page and says so with <meta name="octo-root">.
const rootMeta = document.querySelector('meta[name="octo-root"]');
export const asset = path => new URL((rootMeta ? rootMeta.content : '../') + path, location.href).href;
