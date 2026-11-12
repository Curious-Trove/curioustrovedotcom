// The studio's side of the AI link. The tools in tools.js run here, on the live
// graph, through the same paths as the person's own edits, so each change is a
// step in their undo and shows at once. Pictures are drawn here, by the same
// renderer as the 3D view.
//
// In the OctoShaper desktop app, the page offers these tools to the app's local
// agent server (desktop/src/agent.rs) over Tauri: calls come in on a channel and
// the answers go back as commands. In a browser (the web edition) there is no
// agent server and nothing happens.

import { TOOLS, INSTRUCTIONS, toolByName } from './tools.js?v=e2bbaab254';
import { VARS, PIXEL_VARS, FUNCS, OPS } from './help.js?v=e2bbaab254';
import { imageMesh } from './document.js?v=e2bbaab254';
import { camera, viewRay } from './render.js?v=e2bbaab254';

const MAX_CELLS = 12;

export function version(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const fail = msg => { throw new Error(msg); };
const png = url => ({ mimeType: 'image/png', data: url.slice(url.indexOf(',') + 1) });
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

// ---- the tools ----

export function makeTools(studio) {
  const { octo } = studio;
  const g = () => studio.graph;
  const current = () => version(g().text(false));
  const nodeByName = (name) => {
    const d = studio.doc;
    if (name == null) return d.nodes.find(n => n.id === d.output) || fail('the graph has no output node yet');
    return d.nodes.find(n => n.name === name) || fail(`there is no node called ${name}; nodes: ${d.nodes.map(n => n.name).join(', ')}`);
  };
  const checkBase = (a) => {
    if (a.base_version && a.base_version !== current()) fail(`the graph changed since base_version ${a.base_version} (now ${current()}); call get_graph and try again`);
    const d = studio.codeDiags;
    if (d.length && !a.force) fail(`the person is in the middle of typing code that has errors (line ${d[0].line}: ${d[0].msg}); ask them first, or pass force: true to replace it`);
  };
  // takes a new text in, as one undo step, or says why not
  const take = (text) => {
    const old = new Map(studio.doc.nodes.map(n => [n.name, JSON.stringify([n.type, n.inputs.map(i => studio.doc.nodes.find(m => m.id === i)?.name), n.settings, n.comment])]));
    const diags = studio.swapIn(text, { canonical: true });
    if (diags) return { ok: false, diagnostics: diags.map(d => ({ line: d.line, col: d.col, message: d.msg, text: text.split('\n')[d.line - 1] })) };
    const d = studio.doc;
    const changed = d.nodes.filter(n => old.get(n.name) !== JSON.stringify([n.type, n.inputs.map(i => d.nodes.find(m => m.id === i)?.name), n.settings, n.comment])).map(n => n.name);
    studio.markTouched(changed);
    return { ok: true, version: current(), changed, errors: nodeErrors(d), output_shapes: d.nodes.find(n => n.id === d.output)?.count ?? 0 };
  };
  const nodeErrors = d => d.nodes.filter(n => n.error || Object.values(n.settings).some(s => s.error))
    .map(n => ({ node: n.name, error: n.error || Object.entries(n.settings).filter(([, s]) => s.error).map(([k, s]) => `${k}: ${s.error}`).join('; ') }));

  const summary = (d) => {
    const names = new Map(d.nodes.map(n => [n.id, n.name]));
    return d.nodes.map(n => {
      const o = { name: n.name, type: n.type, inputs: n.inputs.map(i => names.get(i) ?? null), shapes: n.count };
      const set = Object.fromEntries(Object.entries(n.settings).filter(([, s]) => s.set).map(([k, s]) => [k, s.text]));
      if (Object.keys(set).length) o.settings = set;
      if (n.comment) o.comment = n.comment;
      if (n.error) o.error = n.error;
      return o;
    });
  };

  // a graph like the live one, to try things on without touching it
  const scratch = () => {
    const s = octo.graph();
    s.parse(g().text(false));
    return s;
  };

  const setting = (s, id, k, v, where) => {
    if (s.set(id, k, v == null ? null : String(v)) < 0) {
      const t = octo.typeMap[s.json().nodes.find(n => n.id === id).type];
      if (!t.settings.some(x => x.name === k)) fail(`${where}: a ${t.name} has no setting ${k}; it has ${t.settings.map(x => x.name).join(', ')}`);
      fail(`${where}: ${k}: ${v} is not a valid value (a typo, or a name that is not a param)`);
    }
  };

  const ops = {
    add(s, o) {
      if (!octo.typeMap[o.type]) fail(`there is no node type ${o.type}`);
      const id = s.add(o.type, 0, 0);
      if (o.name && s.rename(id, o.name) < 0) fail(`can't name it ${o.name} (taken, or not letters, digits and _)`);
      (o.inputs || []).forEach((name, k) => { if (name != null && s.connect(find(s, name), id, k) < 0) fail(`can't wire ${name} into input ${k}`); });
      for (const [k, v] of Object.entries(o.settings || {})) setting(s, id, k, v, o.name || o.type);
    },
    set(s, o) { const id = find(s, o.node); for (const [k, v] of Object.entries(o.settings || {})) setting(s, id, k, v, o.node); },
    connect(s, o) { if (s.connect(find(s, o.from), find(s, o.to), o.slot ?? 0) < 0) fail(`can't wire ${o.from} into ${o.to} input ${o.slot ?? 0}`); },
    disconnect(s, o) { if (s.disconnect(find(s, o.to), o.slot ?? 0) < 0) fail(`${o.to} has nothing in input ${o.slot ?? 0}`); },
    rename(s, o) { if (s.rename(find(s, o.node), o.name) < 0) fail(`can't rename ${o.node} to ${o.name} (taken, or not letters, digits and _)`); },
    remove(s, o) { s.remove(find(s, o.node)); },
    comment(s, o) { s.comment(find(s, o.node), o.text || ''); },
    add_param(s, o) { if (s.addParam(o.name, o.value ?? 1, o.lo ?? 0, o.hi ?? 10) < 0) fail(`can't add param ${o.name} (taken, or a bad name)`); },
    set_param(s, o) { if (s.setParam(o.name, o.value) < 0) fail(`there is no param ${o.name}`); },
    param_range(s, o) { if (s.paramRange(o.name, o.lo, o.hi) < 0) fail(`there is no param ${o.name}, or the range is empty`); },
    rename_param(s, o) { if (s.renameParam(o.name, o.to) < 0) fail(`can't rename param ${o.name} to ${o.to}`); },
    remove_param(s, o) { if (s.removeParam(o.name) < 0) fail(`can't remove param ${o.name} (is it still used?)`); },
  };
  const find = (s, name) => { const id = s.find(String(name)); if (id < 0) fail(`there is no node called ${name}`); return id; };

  const meshOf = (s, name) => {
    const d = s === g() ? studio.doc : s.json();
    const n = name == null ? d.nodes.find(x => x.id === d.output) : d.nodes.find(x => x.name === name);
    if (!n) fail(name == null ? 'the graph has no output node yet' : `there is no node called ${name}`);
    // an image node is shown as its picture, flat, twice each way
    const image = octo.typeMap[n.type].out === 'image';
    return { n, image, mesh: image ? imageMesh(s.nodeImage(n.id)) : s.mesh(n.id) };
  };

  // labelled tiles in one picture
  const sheet = (cells, tw, th) => {
    const cols = cells.length <= 1 ? 1 : cells.length <= 4 ? 2 : cells.length <= 9 ? 3 : 4;
    const rows = Math.ceil(cells.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * tw; c.height = rows * th;
    const x = c.getContext('2d');
    x.font = '600 13px Nunito, system-ui, sans-serif';
    cells.forEach((cell, k) => {
      const cx = (k % cols) * tw, cy = Math.floor(k / cols) * th;
      if (cell.canvas) x.drawImage(cell.canvas, cx, cy, tw, th);
      x.fillStyle = 'rgba(30, 24, 60, 0.78)';
      const w = x.measureText(cell.label).width + 14;
      x.fillRect(cx + 6, cy + 6, w, 20);
      x.fillStyle = '#fff';
      x.fillText(cell.label, cx + 13, cy + 21);
      x.strokeStyle = 'rgba(30, 24, 60, 0.25)';
      x.strokeRect(cx + 0.5, cy + 0.5, tw - 1, th - 1);
    });
    return c.toDataURL('image/png');
  };
  const cellCanvas = (mesh, w, h, opts) => {
    const src = studio.shot(mesh, w, h, opts);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };

  const tools = {
    catalogue: async (a) => {
      const out = {
        rules: 'One line per node: name = type(inputs, setting: value). Positional arguments are wires from other nodes, named ones are settings. A setting is an expression evaluated for each shape. There are two kinds of node: most make shapes, the ones in the image category make an image (in them a formula is evaluated for each pixel, see pixel_names). An image goes into a named input of a shape node: color(walls, texture: bricks, bump: bricks). color also takes rough_map, metal_map and glow_map; displace, keep and scatter take map: image, laid from above, which multiplies by, chance, or the chance a point stays. raster(shapes) draws shapes into an image. scatter takes side: top / sides / bottom / all and gap (least distance); grow(on, from) is ivy from the from shapes over the on shapes, with show: stems or leaves to colour each with its own grow node; decal(on, image) sticks an image on faces and gives only the stickers. decal also takes at: [x y z, ...] for exact places, and text("EXIT 12") makes an image of words. cover(on) is foliage in a mass: leaf cards over the faces by density. color takes ramp: [colours] with at: formula (0 to 1) for a colour per shape, map: wrap (once around, around: n times) and, with map: tile, tile, tile_turn and tile_flip formulas that can read side (0 top, 1 bottom, 2 front, 3 right, 4 back, 5 left). wear, tone (a ramp by a formula of x y z up u v, with bands) and touch (dabs at points) paint over the material and its texture. rotate and scale take around: all to move an assembly as one. tube(path: [x y z, ...], radius: 0.4) is a round pipe along a path, sag: 2 makes each span hang like a cable between posts; loft takes wall for a hollow shell; revolve(as: blocks) makes a tower of separate blocks; shape takes slant and slant_z on a box and flare on a cone. A choice setting also takes an expression that picks one for each shape: as: if(up > 0.5, roof, box). param name = value in lo..hi declares a tunable number; param name = curve [0 1, 0.5 0.8, 1 0] declares a curve of t value points, called as name(t); param name = [x y z, x y z] declares a point list, which path settings take; param name = x y z declares a position, read as name.x, name.y, name.z, which moves with arrows in the 3D view. param name = bounds [x0 y0 z0, x1 y1 z1] declares bounds, a box from its low corner to its high one, read as name.x0 to name.z1, its middle name.x, name.y, name.z and its size name.w, name.h, name.d; its sides move with handles in the 3D view (tool name = bounds(param) to name the tool). tool name = kind(params, setting: value) declares a handle in the 3D view that edits params (see tools); at: takes x y z, a position param or the name of another tool. // comments. The output node lists what is shown. use("kit/window.octo", width: w) is another file as a node: the path is relative to this file, and the file\'s params are the settings. Hand building: param town = cells [0 0 0, 1 0 0, 0 1 0 : 2] is whole-number cells x y z, each with a value after a colon (1 unless written); tool build = stamp(town) lets the person add and remove them by clicking; cells(cells: town, size: 1) makes a box for each; on those shapes value is the cell\'s value and has(dx, dy, dz) is 1 when the cell that far away is filled (has(0, 1, 0): something is on top). Tiles: tileset(image, cell: 16) numbers the tiles of an image from the top left, and color(shapes, texture: tiles, map: tile, tile: value, filter: pixel) shows one tile on every face of each shape; take faces with face(blocks, side: top) or side: sides to give tops and walls different tiles. paint(palette: [#.., #..], size: 16) is an image painted by hand; its pixels are in a block after the nodes, paint name { rows of characters }, one character a pixel: . is clear, 0 to 9 then a to z the colours of the palette, every row as long as the first; you can write small tiles this way. A paint block can also hold brushstrokes after its rows, a line each: ~ #3d5a2a 4 0.6 : 12 40, 30 41 2 (colour #rrggbb or #rrggbbaa, or . to rub out; width; softness 0 to 1; then points x y from 0 to 100 across the image from the top left, each with an optional width factor); strokes are drawn at the node\'s size over its pixels (with no rows the ground is the first palette colour; a single row . makes it clear); after the softness a brush kind may follow: taper, flat, dry or chalk, for a hand-painted look. picture("file.png") is a PNG next to the file. tweak(node, edits: [@id move 0 1 0, @id drop]) changes single shapes by id (find_at gives ids); leave the edits a person made in place. displace, bend, smooth, chip and wear change the mesh of each shape; equal shapes stay one mesh (instancing) unless a setting differs for every shape (space: world, i, t, rand(), seed: i), so prefer seed: i % 8 and local space, and check with stats.',
        expressions: { names: Object.fromEntries(VARS), pixel_names: Object.fromEntries(PIXEL_VARS), functions: Object.fromEntries(FUNCS), operators: OPS, colours: '#rrggbb' },
        types: octo.types.map(t => ({
          name: t.name, category: t.category, makes: t.out, doc: t.doc, inputs: t.inputs, input_kinds: t.inputKinds, variadic: t.variadic || undefined,
          settings: t.settings.map(s => ({ name: s.name, kind: s.kind, default: s.default, range: s.kind === 'number' ? [s.lo, s.hi] : undefined, options: s.options || undefined, doc: s.doc, only_for: s.when ? s.when.split('|') : undefined })),
        })),
        tools: octo.toolKinds,
      };
      if (a.full) {
        const r = await fetch(new URL('../docs/language.md', import.meta.url));
        out.language_guide = r.ok ? await r.text() : 'docs/language.md is not served here';
      }
      return { data: out };
    },

    get_graph: (a) => {
      const d = studio.doc;
      const data = {
        version: current(),
        document: studio.name,
        documents: studio.documents,
        code: g().text(!!a.layout),
        params: d.params,
        output: d.nodes.find(n => n.id === d.output)?.name ?? null,
        selected: studio.selected,
        nodes: summary(d),
      };
      const e = nodeErrors(d);
      if (e.length) data.errors = e;
      if (studio.codeDiags.length) data.person_typing_errors = studio.codeDiags.map(x => ({ line: x.line, message: x.msg }));
      return { data };
    },

    set_code: (a) => {
      checkBase(a);
      let text;
      if (typeof a.code === 'string') text = a.code;
      else if (Array.isArray(a.edits)) {
        text = g().text(false);
        a.edits.forEach((e, k) => {
          const at = text.indexOf(e.find);
          if (at < 0) fail(`edit ${k + 1}: find text not in the code: ${JSON.stringify(e.find.slice(0, 80))}`);
          if (text.indexOf(e.find, at + 1) >= 0) fail(`edit ${k + 1}: find text occurs more than once; include more of the line`);
          text = text.slice(0, at) + e.replace + text.slice(at + e.find.length);
        });
      } else fail('give code, or edits');
      return { data: take(text) };
    },

    edit: (a) => {
      checkBase(a);
      if (!Array.isArray(a.ops) || !a.ops.length) fail('ops is a list of operations');
      const s = scratch();
      try {
        a.ops.forEach((o, k) => {
          const f = ops[o.op] || fail(`op ${k + 1}: no op ${o.op}; ops are ${Object.keys(ops).join(', ')}`);
          try { f(s, o); } catch (e) { fail(`op ${k + 1} (${o.op}): ${e.message}; nothing was changed`); }
        });
        return { data: take(s.text(false)) };
      } finally { s.free(); }
    },

    render: (a) => {
      const { n, mesh, image } = meshOf(g(), a.node);
      if (image) {
        const im = mesh.picture;
        if (!im) return { data: { node: n.name, note: n.error ? `it has an error: ${n.error}` : 'it makes no image' } };
        const side = Math.round(Math.min(a.width || 512, a.height || 512));
        return { data: { node: n.name, image: { width: im.width, height: im.height }, note: 'the image, repeated twice each way so its seams show' }, images: [{ ...png(studio.capture(mesh, { width: side, height: side, view: 'front', zoom: 1.3, grid: false })), label: n.name }] };
      }
      const views = a.yaw != null || a.pitch != null ? ['custom'] : (a.views && a.views.length ? a.views.slice(0, 6) : ['iso']);
      const many = views.length > 1;
      const w = Math.round(a.width || (many ? 480 : 640)), h = Math.round(a.height || (many ? 360 : 480));
      const opt = v => ({ view: v === 'custom' ? 'iso' : v, yaw: a.yaw, pitch: a.pitch, zoom: a.zoom || 1, grid: a.grid !== false });
      const b = mesh.bounds.map(v => Math.round(v * 100) / 100);
      const data = { node: n.name, shapes: n.count, triangles: mesh.count / 3, materials: mesh.groups.length, images: mesh.look.images.filter(Boolean).map(i => `${i.name} ${i.width}x${i.height}`), bounds: { min: b.slice(0, 3), max: b.slice(3) }, views };
      if (!mesh.count) return { data: { ...data, note: n.error ? `it has an error: ${n.error}` : 'it makes nothing to draw' } };
      const url = many ? sheet(views.map(v => ({ label: v, canvas: cellCanvas(mesh, w, h, opt(v)) })), w, h) : studio.capture(mesh, { width: w, height: h, ...opt(views[0]) });
      return { data, images: [{ ...png(url), label: `${n.name}, ${views.join(', ')}` }] };
    },

    variants: (a) => {
      const list = (a.variants || []).slice(0, MAX_CELLS);
      if (!list.length) fail('variants is a list of {label, params, settings}');
      const tw = a.tile_width || 320, th = a.tile_height || 240;
      const results = [], cells = [];
      for (const [k, v] of list.entries()) {
        const s = scratch();
        const label = v.label || [...Object.entries(v.params || {}), ...Object.entries(v.settings || {})].map(([x, y]) => `${x}=${y}`).join(' ') || `#${k + 1}`;
        try {
          for (const [p, val] of Object.entries(v.params || {})) if (s.setParam(p, +val) < 0) fail(`no param ${p}`);
          for (const [key, val] of Object.entries(v.settings || {})) {
            const dot = key.lastIndexOf('.');
            if (dot < 0) fail(`settings keys are node.setting, got ${key}`);
            setting(s, find(s, key.slice(0, dot)), key.slice(dot + 1), val, key.slice(0, dot));
          }
          s.eval();
          const { n, mesh } = meshOf(s, a.node);
          results.push({ label, shapes: n.count, ...(n.error ? { error: n.error } : {}) });
          cells.push({ label, canvas: mesh.count ? cellCanvas(mesh, tw, th, { view: a.view || 'iso', yaw: a.yaw, pitch: a.pitch }) : null });
        } catch (e) {
          results.push({ label, error: e.message });
          cells.push({ label: label + ' (error)', canvas: null });
        } finally { s.free(); }
      }
      return { data: { variants: results, note: 'nothing was changed' }, images: [{ ...png(sheet(cells, tw, th)), label: 'variants' }] };
    },

    set_params: (a) => {
      const vals = a.values || {};
      const ps = new Map(studio.doc.params.map(p => [p.name, p]));
      const out = {};
      for (const [k, v] of Object.entries(vals)) {
        const p = ps.get(k) || fail(`there is no param ${k}; params: ${[...ps.keys()].join(', ') || 'none'}`);
        if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${k} needs a number`);
        out[k] = Math.max(p.lo, Math.min(p.hi, v));
      }
      studio.setParams(out);
      return { data: { ok: true, version: current(), params: studio.doc.params } };
    },

    undo: (a) => {
      let n = 0;
      for (let k = 0; k < (a.steps || 1); k++) if (a.redo ? studio.redo() : studio.undo()) n++;
      return { data: { [a.redo ? 'redone' : 'undone']: n, version: current() } };
    },

    find_at: (a) => {
      if (!(a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1)) fail('x and y are places in the picture, from 0 to 1: 0 0 is its top left corner');
      const { n, mesh, image } = meshOf(g(), a.node);
      if (image) fail(`${n.name} makes an image, not shapes`);
      const w = Math.round(a.width || 640), h = Math.round(a.height || 480);
      const cam = camera(mesh.bounds, w / h, { view: a.view || 'iso', yaw: a.yaw, pitch: a.pitch, zoom: a.zoom || 1, current: studio.view });
      const ray = viewRay(cam, w / h, a.x, a.y);
      const hit = g().pick(n.id, ray.origin, ray.dir);
      if (!hit) return { data: { found: null, note: 'nothing is there: the ray hits no shape' } };
      const m = studio.shapes.maker(n.id, hit.id), by = m ? m.node : n;
      const line = g().text(false).split('\n').findIndex(l => l.match(/^\s*([A-Za-z_]\w*)\s*=/)?.[1] === by.name);
      const r = v => Math.round(v * 1000) / 1000;
      return { data: { found: {
        node: by.name, type: by.type, line: line + 1, shape: '@' + hit.id.toString(16), index: hit.index,
        position: hit.box.pos.map(r), size: hit.box.size.map(r), point: hit.point.map(r), normal: hit.normal.map(r),
        tweak: m && m.tweak ? m.tweak.name : null,
      }, note: 'To change this one shape, add an edit for its id to a tweak node after the node that made it: tweak(node, edits: [@id move 0 1 0]).' } };
    },

    stats: (a) => {
      const { n, mesh, image } = meshOf(g(), a.node);
      if (image) fail(`${n.name} makes an image, not shapes`);
      const fixes = {
        space: 'space: world gives every shape its own mesh; space: local keeps equal shapes one mesh',
        formula: 'a setting uses i, t or rand(), so every shape differs; a formula of w, h, d or a param keeps equal shapes one mesh',
        seed: 'the seed differs for every shape; seed: i % 8 gives eight meshes shared by all',
        near: 'cavity and occlusion paint where shapes meet, so shapes with different neighbours differ; cavity: 0 and occlusion: 0 keep equal shapes one mesh',
      };
      const deformers = studio.doc.nodes.filter(x => x.meshes).map(x => ({
        node: x.name, type: x.type, shapes: x.meshes.shapes, meshes: x.meshes.unique, triangles_stored: x.meshes.triangles,
        ...(x.meshes.reason && x.meshes.unique > 1 ? { why: fixes[x.meshes.reason] } : {}),
      }));
      const meshes = g().meshCount(n.id);
      return { data: {
        node: n.name, shapes: n.count, meshes, triangles: mesh.count / 3, materials: mesh.groups.length,
        images: mesh.look.images.filter(Boolean).map(i => `${i.name} ${i.width}x${i.height}`),
        deformers,
        note: meshes > 64 && meshes > n.count / 4 ? 'many of the shapes have a mesh of their own, which costs memory and draw time: see deformers for why' : 'shapes that share a mesh are stored once and instanced',
      } };
    },

    select: (a) => {
      if (a.node != null) nodeByName(a.node);
      studio.select(a.node ?? null);
      return { data: { showing: a.node ?? 'output' } };
    },

    new_document: (a) => {
      if (typeof a.code !== 'string') fail('code is the new document\'s whole code');
      const d = studio.newDocument(a.name, a.code);
      const out = { document: d.name, version: version(d.graph.text(false)) };
      if (d.diags.length) out.diagnostics = d.diags.map(x => ({ line: x.line, col: x.col, message: x.msg }));
      return { data: out };
    },

    export: (a) => {
      if (a.format === 'octo') return { data: { format: 'octo', text: g().text(true) } };
      if (a.format !== 'glb') fail('format is octo or glb');
      const n = nodeByName(a.node);
      const bytes = g().glb(n.id) || fail(`${n.name} has nothing to export`);
      return { data: { format: 'glb', node: n.name, bytes: bytes.length, base64: b64(bytes) } };
    },
  };
  return tools;
}

// ---- the link to the desktop app ----

export async function connectAgent(studio, chip) {
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core) return null;   // the web edition: agents connect through the desktop app

  let id;
  try { id = sessionStorage.getItem('octo.window'); } catch { /* storage off */ }
  if (!id) {
    id = Math.random().toString(36).slice(2, 7);
    try { sessionStorage.setItem('octo.window', id); } catch { /* storage off */ }
  }
  let paused = false, busy = 0, lastTool = '', focusedAt = document.hasFocus() ? Date.now() : 0, hello = {};

  const paint = () => {
    chip.hidden = false;
    chip.classList.toggle('paused', paused || !hello.relay);
    chip.classList.toggle('busy', busy > 0);
    chip.querySelector('span').textContent = !hello.relay ? 'AI off' : paused ? 'AI paused' : busy ? `AI: ${lastTool}` : 'AI on';
    chip.title = !hello.relay ? `AI agents can't connect: ${hello.error || 'the agent server is not running'}`
      : (paused ? 'AI agents can not use this window. Click to let them.' : `An AI agent on this computer can read and edit this window (window ${id}). Click to pause.`) + `\nMCP: ${hello.mcp}`;
  };
  // the chip opens the AI settings when agents can't connect, and pauses them when they can
  chip.addEventListener('click', () => { if (hello.relay) { paused = !paused; paint(); state(); } else if (studio.openAISettings) studio.openAISettings(); });

  const state = () => {
    // a window with nothing open is still a window an agent can open documents in
    let doc = null;
    try { doc = { name: studio.name, version: version(studio.graph.text(false)), nodes: studio.doc.nodes.length }; } catch { /* nothing open */ }
    return core.invoke('agent_state', { window: id, info: {
      sample: doc && doc.name, title: document.title, documents: studio.documents, focused_at: focusedAt,
      has_focus: document.hasFocus(), paused, version: doc && doc.version, nodes: doc ? doc.nodes : 0,
    } }).catch(() => {});
  };
  addEventListener('focus', () => { focusedAt = Date.now(); state(); });
  addEventListener('blur', () => state());
  let stateTimer = 0;
  studio.onChange = () => { clearTimeout(stateTimer); stateTimer = setTimeout(state, 300); };

  const run = async (name, args) => {
    if (paused) throw new Error('the person paused AI access in this window (the AI button at the top); ask them to turn it back on');
    const t = toolByName[name];
    if (!t || t.relay) throw new Error(`no tool ${name}`);
    // a tool works on the document it names, or on the one the person uses
    const { document: which, ...rest } = args || {};
    const target = which != null && which !== '' ? studio.pick(String(which)) : studio;
    const tools = makeTools(target);
    if (!tools[name]) throw new Error(`no tool ${name}`);
    lastTool = name; busy++; paint();
    try { return await tools[name](rest); } finally { busy--; setTimeout(paint, 400); }
  };

  const channel = new core.Channel();
  channel.onmessage = async (m) => {
    let reply;
    try { reply = { call: m.call, result: await run(m.tool, m.args), error: null }; } catch (err) { reply = { call: m.call, result: null, error: String(err && err.message || err) }; }
    core.invoke('agent_reply', { window: id, ...reply }).catch(() => {});
  };
  try { hello = await core.invoke('agent_hello', { window: id, tools: TOOLS, instructions: INSTRUCTIONS, channel }); } catch (err) { hello = { relay: false, error: String(err) }; }
  paint();
  state();
  // for the AI menu and the settings dialog
  return {
    id,
    get paused() { return paused; },
    get connected() { return !!hello.relay; },
    get mcp() { return hello.mcp; },
    setPaused(p) { paused = !!p; paint(); state(); },
    // the settings changed: the server may have moved or stopped
    update(s) { hello = { ...hello, relay: s.listening, error: s.error, mcp: s.mcp, save_dir: s.save_dir }; paint(); },
  };
}
