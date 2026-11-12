// Exports: glTF (binary or JSON), a picture of the model, or a copy of the code.
// The dialog remembers the last choices; "Export again" repeats them without asking.
import { modal, h } from './dialogs.js?v=e2bbaab254';
import { FORMATS, b64, saveAs } from './platform.js?v=e2bbaab254';
import { track } from './analytics.js?v=e2bbaab254';

const KEY = 'octo.export';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const keep = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage off */ } };

export const EXPORTS = [
  { format: 'glb', title: 'glTF binary', ext: '.glb', note: 'One file for Blender, Unity, Godot and the web. The usual choice.' },
  { format: 'gltf', title: 'glTF', ext: '.gltf', note: 'The same model as readable JSON, with its data inside.' },
  { format: 'png', title: 'Picture', ext: '.png', note: 'An image of the model, from the 3D view’s camera or a preset.' },
  { format: 'octo', title: 'OctoLang', ext: '.octo', note: 'A copy of the code. The document keeps its own file.' },
];
const SIZES = [[1280, 720], [1920, 1080], [3840, 2160], [1024, 1024], [2048, 2048]];
const VIEWS = [['current', 'As in the 3D view'], ['iso', 'Three-quarter'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']];

// a .glb as a .gltf: the JSON chunk, with the binary chunk inlined as a data URI
export function glbToGltf(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12, json = null, bin = null;
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const chunk = bytes.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json) throw new Error('not a glTF binary');
  if (bin && json.buffers && json.buffers[0]) {
    const n = json.buffers[0].byteLength ?? bin.length;
    json.buffers[0].uri = 'data:application/octet-stream;base64,' + b64(bin.subarray(0, n));
  }
  json.asset = { ...(json.asset || {}), generator: (json.asset && json.asset.generator) || 'OctoShaper' };
  return JSON.stringify(json, null, 1);
}

const dataUrlBytes = url => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0));

// the bytes (or text) of one export; throws a plain message when there is nothing to export
export function exportData(doc, opts) {
  doc.flush();
  if (opts.format === 'octo') return doc.text;
  const n = opts.what === 'selected' && doc.selectedNode ? doc.selectedNode : doc.output;
  if (!n) throw new Error('The graph has no output yet, so there is nothing to export.');
  const image = doc.isImage(n);
  // an image node exports as its own picture
  if (image && opts.format === 'png') {
    const bytes = doc.graph.png(n.id);
    if (!bytes) throw new Error(`${n.name} makes no image${n.error ? `: ${n.error}` : ''}.`);
    return bytes;
  }
  if (image) throw new Error(`${n.name} is an image: export it as a picture, or export the output for the model.`);
  if (opts.format === 'png') {
    const mesh = doc.graph.mesh(n.id);
    if (!mesh.count) throw new Error(`${n.name} makes nothing to draw.`);
    const [w, ht] = opts.size || [1920, 1080];
    return dataUrlBytes(doc.capture(mesh, { width: w, height: ht, view: opts.view || 'current', grid: opts.grid !== false }));
  }
  const bytes = doc.graph.glb(n.id);
  if (!bytes) throw new Error(`${n.name} has nothing to export${n.error ? `: ${n.error}` : ''}.`);
  return opts.format === 'gltf' ? glbToGltf(bytes) : bytes;
}

export function defaultName(doc, opts) {
  const n = opts.what === 'selected' && doc.selectedNode ? doc.selectedNode : null;
  return n && opts.format !== 'octo' ? `${doc.name}-${n.name}` : doc.name;
}

// writes one export through the platform's save dialog; returns a line for a toast, or null if cancelled
export async function runExport(doc, opts) {
  const data = exportData(doc, opts);
  const name = (opts.name || defaultName(doc, opts)).replace(/[\\/:*?"<>|]+/g, '-');
  const ref = await saveAs(name, opts.format, data);
  if (!ref) return null;
  keep({ ...opts, name: undefined, last: true });
  track('Studio Export', { format: opts.format, what: opts.what || 'output' });
  const where = ref.kind === 'path' ? ref.path : ref.kind === 'handle' ? ref.handle.name : `${name}.${FORMATS[opts.format].ext}`;
  return `Exported ${where}`;
}

export const lastExport = () => { const o = load(); return o.last ? o : null; };

// the Export dialog; start: a format to preselect
export async function exportDialog(doc, start = null, startWhat = null) {
  const prev = load();
  const st = {
    format: start || prev.format || 'glb',
    what: (startWhat || prev.what) === 'selected' && doc.selectedNode ? 'selected' : 'output',
    size: prev.size || [1920, 1080],
    view: prev.view || 'current',
    grid: prev.grid !== false,
  };
  const body = h('div', 'export');
  const formats = h('div', 'export-formats');
  for (const f of EXPORTS) {
    const b = h('button', 'export-format');
    b.type = 'button';
    b.dataset.format = f.format;
    const t = h('span', 'ef-title', f.title);
    t.append(h('small', null, f.ext));
    b.append(t, h('span', 'ef-note', f.note));
    b.addEventListener('click', () => { st.format = f.format; paint(); });
    formats.append(b);
  }

  const what = h('div', 'export-row');
  what.append(h('span', 'er-label', 'Export'));
  const whatSel = h('select');
  const out = doc.output, sel = doc.selectedNode;
  whatSel.append(new Option(out ? `the output (${out.name})` : 'the output (none yet)', 'output'));
  if (sel && sel !== out) whatSel.append(new Option(`the selected node (${sel.name})`, 'selected'));
  whatSel.value = st.what;
  whatSel.addEventListener('change', () => { st.what = whatSel.value; nameIn.value = defaultName(doc, st); });
  what.append(whatSel);

  const pic = h('div', 'export-row');
  pic.append(h('span', 'er-label', 'Picture'));
  const sizeSel = h('select');
  for (const [w, ht] of SIZES) sizeSel.append(new Option(`${w} × ${ht}`, `${w}x${ht}`));
  sizeSel.value = `${st.size[0]}x${st.size[1]}`;
  if (!sizeSel.value) sizeSel.value = '1920x1080';
  sizeSel.addEventListener('change', () => { st.size = sizeSel.value.split('x').map(Number); });
  const viewSel = h('select');
  for (const [v, l] of VIEWS) viewSel.append(new Option(l, v));
  viewSel.value = st.view;
  viewSel.addEventListener('change', () => { st.view = viewSel.value; });
  const grid = h('label', 'check-label');
  const gridIn = h('input');
  gridIn.type = 'checkbox';
  gridIn.checked = st.grid;
  gridIn.addEventListener('change', () => { st.grid = gridIn.checked; });
  grid.append(gridIn, document.createTextNode(' ground grid'));
  pic.append(sizeSel, viewSel, grid);

  const nameRow = h('label', 'export-row');
  nameRow.append(h('span', 'er-label', 'File name'));
  const nameIn = h('input', 'er-name');
  nameIn.spellcheck = false;
  nameIn.value = defaultName(doc, st);
  const ext = h('span', 'er-ext');
  nameRow.append(nameIn, ext);
  const err = h('div', 'export-err');

  body.append(formats, what, pic, nameRow, err);
  const paint = () => {
    for (const b of formats.children) b.classList.toggle('on', b.dataset.format === st.format);
    what.hidden = st.format === 'octo';
    pic.hidden = st.format !== 'png';
    ext.textContent = '.' + FORMATS[st.format].ext;
    err.textContent = '';
  };
  paint();

  const go = await modal({
    title: `Export ${doc.name}`, body, wide: true,
    buttons: [{ label: 'Cancel', value: null }, {
      label: 'Export…', primary: true, value: true,
      check: () => {
        try { exportData(doc, st); return true; } catch (e) { err.textContent = e.message; return false; }
      },
    }],
  });
  if (!go) return null;
  return runExport(doc, { ...st, name: nameIn.value.trim() || defaultName(doc, st) });
}
