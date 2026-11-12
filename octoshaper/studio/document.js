// One open asset: its graph, its code (which is the file), its undo history, and its
// three views (code, graph, 3D), each a panel the workspace shows as a tab. Every edit,
// from any view or from an AI agent, goes through refresh(), which re-reads the graph
// and rewrites the code.
import { Viewport, cssColor, camera } from './render.js?v=e2bbaab254';
import { GraphView } from './graph.js?v=e2bbaab254';
import { CodeView } from './code.js?v=e2bbaab254';
import { ParamsCard } from './params.js?v=e2bbaab254';
import { History } from './history.js?v=e2bbaab254';
import { ToolOverlay } from './handles.js?v=e2bbaab254';
import { KEYS, keysButton, keysCard } from './keys.js?v=e2bbaab254';
import { ShapeTools } from './shapes.js?v=e2bbaab254';
import { ImagePanel } from './imagetab.js?v=e2bbaab254';
import { DrawPanel } from './drawtab.js?v=e2bbaab254';
import { environment, environments, setEnvironment, onEnvironment } from './environment.js?v=e2bbaab254';
import { editEnvironment } from './envedit.js?v=e2bbaab254';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// the three views every document opens with, and the two more it can show
export const KINDS = ['code', 'graph', 'view'];
export const ALL_KINDS = [...KINDS, 'image', 'draw'];
export const KIND_LABEL = { code: 'Code', graph: 'Graph', view: '3D', image: 'Image', draw: 'Draw' };

export class OctoDocument {
  // studio: { octo, previewer, changed(doc, what), activate(doc), toast(text) }
  constructor(studio, { id, name, text, savedText = null, sample = null, ref = null }) {
    this.studio = studio;
    this.octo = studio.octo;
    this.id = id;
    this.name = name;
    this.sample = sample;       // the sample it was opened from, if any
    this.ref = ref;             // where Save writes (see platform.js), or null
    this.savedText = savedText; // the text on disk (or the sample's), to tell if it changed
    this.graph = this.octo.graph();
    this.doc = null;
    this.selectedName = null;
    this.codeTimer = 0;
    this.previewQueue = [];
    this.files = new Map();     // the files its `use` nodes read: path -> text
    this.missing = new Set();   // the ones that could not be found
    this.history = new History(() => studio.changed(this, 'history'));
    this.build();
    this.load(text);
    // the file as the studio prints it is still the file: not a change
    if (savedText != null && savedText === text) this.savedText = this.code.value;
  }

  get dirty() { return this.savedText == null ? true : this.code.value !== this.savedText; }
  get text() { return this.code.value; }
  get diags() { return this.code.diags; }
  get output() { return this.doc.nodes.find(n => n.id === this.doc.output) || null; }

  // ---- the three panels ----

  build() {
    const octo = this.octo;
    const code = h('section', 'panel code-panel', `
      <div class="panel-head"><span class="sub">one line per node · <code>name = node(inputs, setting: value)</code></span><span class="spacer"></span></div>
      <div class="code-view"></div>`);
    const graph = h('section', 'panel graph-panel', `
      <div class="panel-head">
        <span class="spacer"></span>
        <button class="small" data-act="arrange" title="Lay the nodes out again">Arrange</button>
        <button class="small" data-act="fit" title="Fit the graph in view (F)">Fit</button>
      </div>
      <div class="graph-view"></div>
      <div class="graph-params">
        <div class="params-title">Params <span class="hint">the <code>param</code> lines · type a new name in any setting to add one</span></div>
        <div class="graph-params-list"></div>
      </div>`);
    const view = h('section', 'panel view-panel', `
      <div class="panel-head"><span class="sub showing"></span><span class="spacer"></span>
        <select class="scene-pick" title="The light, sky and fog the 3D view shows the model in. It is the studio's: no file and no export holds it"></select>
        <button class="small toggle" data-act="unlit" title="Show the colours and textures alone, without light">Unlit</button>
        <button class="small toggle" data-act="tools" title="Show every tool's handles; off shows only the selected tool's">Tools</button>
        <button class="small" data-act="fit3d" title="Fit the model in view">Fit</button></div>
      <canvas class="view3d"></canvas>
      <div class="params-panel"><div class="params-title">Params</div><div class="view-params-list"></div></div>
      <div class="stats"></div>`);
    const image = h('section', 'panel image-panel', `
      <div class="panel-head"><select class="img-node" title="The image node shown"></select><select class="img-size" title="The size of the image, in pixels along each side: its size setting. Painted pixels are stretched to it, brushstrokes drawn at it" hidden></select><span class="sub img-info"></span><span class="spacer"></span>
        <button class="small toggle" data-act="tiled" title="Show it three times each way, to check its seams">Tiled</button></div>
      <div class="img-tools" hidden></div>
      <canvas class="img-canvas"></canvas>`);
    const draw = h('section', 'panel draw-panel', `
      <div class="panel-head"><select class="draw-param" title="The points or the curve being drawn"></select><select class="draw-plane draw-only" title="Which way the points are looked at"></select>
        <span class="sub draw-info"></span><span class="spacer"></span>
        <label class="draw-field draw-only" title="The selected point: type its place"><span>x</span><input class="pvalue draw-x" spellcheck="false"></label>
        <label class="draw-field draw-only"><span>y</span><input class="pvalue draw-y" spellcheck="false"></label>
        <label class="draw-field draw-only" title="Points land on a grid of this step; hold Alt to place one freely, 0 turns it off"><span>snap</span><input class="pvalue draw-snap" spellcheck="false"></label>
        <select class="draw-line draw-only draw-points" title="How the line goes through its points: a smooth curve through them, straight lines, or straight lines with rounded corners. It sets curve on the spline tool and on every node that follows these points"><option value="smooth">smooth</option><option value="straight">straight</option><option value="round">round</option></select>
        <button class="small toggle draw-only draw-points" data-act="drawclosed" title="Join the last point to the first: on the spline tool and on every node that follows these points">Closed</button>
        <button class="small draw-only" data-act="mirror" title="Make the other half: what is right of the axis (or the first half of a curve) is mirrored onto the other side">Mirror</button>
        <button class="small draw-only" data-act="drawfit" title="Fit the points in view">Fit</button></div>
      <canvas class="draw-canvas"></canvas>`);
    this.panels = { code, graph, view, image, draw };
    // each window's shortcuts, in the same card (web/keys.js)
    code.querySelector('.panel-head').append(keysButton([KEYS.code]));
    graph.querySelector('.panel-head').append(keysButton([KEYS.graph]));
    view.querySelector('.panel-head').append(keysButton([KEYS.view, KEYS.lines]));
    image.querySelector('.panel-head').append(keysButton([KEYS.image]));
    draw.querySelector('.panel-head').append(keysButton([KEYS.draw]));
    for (const [kind, p] of Object.entries(this.panels)) {
      p.dataset.doc = this.id;
      p.dataset.kind = kind;
      // using a view makes its document the active one
      p.addEventListener('pointerdown', () => this.studio.activate(this, kind), true);
      p.addEventListener('focusin', () => this.studio.activate(this, kind));
    }
    this.$ = sel => { for (const p of Object.values(this.panels)) { const e = p.querySelector(sel); if (e) return e; } return null; };

    this.viewport = new Viewport(this.$('.view3d'));
    // the params card floats over the bottom of the view: fitting frames the rest
    this.viewport.coverBottom = () => {
      const card = this.$('.params-panel'), c = this.viewport.canvas;
      if (!card || card.classList.contains('empty') || card.offsetParent === null) return 0;
      return Math.max(0, c.getBoundingClientRect().bottom - card.getBoundingClientRect().top);
    };
    const nodeDoc = this.studio.nodeDoc;
    this.code = new CodeView(this.$('.code-view'), octo, { changed: () => this.onCodeChanged(), select: name => this.selectByName(name), declare: name => this.declareInCode(name), nodeDoc });
    this.graphView = new GraphView(this.$('.graph-view'), octo, {
      edit: (fn, opts) => this.edit(fn, opts),
      select: id => this.selectNode(id),
      // a move needs no evaluation, only its line in the layout block
      changed: fn => {
        fn(this.graph);
        this.setDoc(this.graph.json());
        if (!this.code.diags.length) this.code.set(this.graph.text(true));
        this.history.record(this.code.value, 'move');
        this.studio.changed(this, 'text');
      },
      declare: (name, s) => this.declareParam(name, s),
      nodeDoc,
      openUsed: n => this.studio.openUsed(this, (n.settings.file ? n.settings.file.text : '').replace(/^"|"$/g, '')),
      openEditor: (n, editor) => this.openEditor(n, editor),
    });
    const paramEdit = fn => this.edit(fn, { rebuild: false });
    const paramLive = (name, v) => {
      if (v && v.curve) this.graph.setCurve(name, v.curve);
      else if (Array.isArray(v)) { if (v.length === 6) this.graph.setBounds(name, v); else this.graph.setVector(name, v); } else this.graph.setParam(name, v);
      this.refresh({ rebuild: false, kind: 'param:' + name });
    };
    // tools: handles in the 3D view (handles.js), rows in the params cards
    this.selectedTool = null;
    const tools = { selected: () => this.selectedTool, select: name => this.selectTool(name), draw: () => this.startDrawing() };
    this.graphParams = new ParamsCard(this.$('.graph-params-list'), { editable: true, edit: paramEdit, live: paramLive, toast: t => this.graphView.toast(t), tools });
    // a spline tool's row in the 3D view: draw its points again, or look straight at it
    const lines = {
      draw: name => this.redraw(name), drawing: () => this.drawingTool || null,
      flat: name => this.flatView(name), flatOn: () => this.flatTool || null,
      paint: name => this.paintWith(name), painting: () => this.paintingTool || null,
      stampValue: () => this.stampValue || 1, setStampValue: v => { this.stampValue = v; this.paramsChanged(); },
    };
    this.viewParams = new ParamsCard(this.$('.view-params-list'), { editable: false, edit: paramEdit, live: paramLive, tools, lines });
    this.overlay = new ToolOverlay(this.viewport, {
      graph: () => this.graph,
      get selected() { return tools.selected(); },
      select: name => this.selectTool(name),
      live: name => this.refresh({ rebuild: false, kind: 'tool:' + name }),
      commit: () => {},
      edit: fn => this.edit(fn, { rebuild: false }),
    });
    // single shapes: click to find, tweak, and the brush (shapes.js)
    this.shapes = new ShapeTools(this.viewport, this.overlay, {
      graph: () => this.graph,
      doc: () => this.doc,
      shown: () => { const n = this.shownNode(); return n && !this.isImage(n) ? n : null; },
      active: () => this.studio.isActive(this),
      edit: (fn, opts) => this.edit(fn, opts),
      live: (fn, kind) => { fn(this.graph); this.refresh({ rebuild: false, kind }); },
      found: sel => this.setFound(sel),
      select: name => this.selectByName(name),
      brush: () => this.brushNow(),
      painted: () => {},
      toast: t => this.studio.toast(t, { ms: 5000 }),
    });
    this.overlay.shapes = this.shapes;
    // the Image and Draw tabs (imagetab.js, drawtab.js)
    const flat = {
      doc: () => this.doc, graph: () => this.graph,
      live: (fn, kind) => { fn(this.graph); this.refresh({ rebuild: false, kind }); },
      edit: fn => this.edit(fn, { rebuild: false }),
      toast: t => this.studio.toast(t, { ms: 5000 }),
    };
    this.imagePanel = new ImagePanel(image, {
      ...flat, isImage: n => this.isImage(n), selected: () => this.selectedName, select: name => this.selectByName(name),
      tile: () => this.stampValue || 1, setTile: v => { this.stampValue = v; this.paramsChanged(); this.studio.toast(`Tile ${v} picked: the stamp tool gives new cells the value ${v}.`, { ms: 3500 }); },
    });
    this.drawPanel = new DrawPanel(draw, flat);
    const toolsBtn = this.$('[data-act=tools]');
    this.overlay.showAll = store.get('octo.tools') !== 'selected';
    toolsBtn.classList.toggle('on', this.overlay.showAll);
    toolsBtn.addEventListener('click', () => {
      this.overlay.showAll = !this.overlay.showAll;
      store.set('octo.tools', this.overlay.showAll ? 'all' : 'selected');
      toolsBtn.classList.toggle('on', this.overlay.showAll);
      this.viewport.dirty = true;
    });
    const unlitBtn = this.$('[data-act=unlit]');
    this.viewport.scene.unlit = store.get('octo.unlit') === 'on';
    unlitBtn.classList.toggle('on', this.viewport.scene.unlit);
    unlitBtn.addEventListener('click', () => {
      this.viewport.scene.unlit = !this.viewport.scene.unlit;
      store.set('octo.unlit', this.viewport.scene.unlit ? 'on' : 'off');
      unlitBtn.classList.toggle('on', this.viewport.scene.unlit);
      this.viewport.dirty = true;
    });
    // the environment: the studio's light, the same in every document (environment.js)
    this.scenePick = this.$('.scene-pick');
    this.scenePick.addEventListener('change', () => {
      const v = this.scenePick.value;
      if (v === '\0edit') { this.fillEnvironments(); editEnvironment(); } else setEnvironment(v);
    });
    this.viewport.scene.changed = () => { this.viewport.dirty = true; };
    this.offEnvironment = onEnvironment(() => { this.fillEnvironments(); this.repaint(); });
    this.fillEnvironments();
    const card = this.$('.graph-params');
    card.classList.toggle('collapsed', store.get('octo.params') === 'closed');
    card.querySelector('.params-title').addEventListener('click', () => {
      card.classList.toggle('collapsed');
      store.set('octo.params', card.classList.contains('collapsed') ? 'closed' : 'open');
    });
    const vcard = this.$('.params-panel');
    vcard.classList.toggle('collapsed', store.get('octo.viewParams') === 'closed');
    vcard.querySelector('.params-title').addEventListener('click', () => {
      vcard.classList.toggle('collapsed');
      store.set('octo.viewParams', vcard.classList.contains('collapsed') ? 'closed' : 'open');
      this.viewport.dirty = true;
    });
    this.$('[data-act=arrange]').addEventListener('click', () => this.arrange());
    this.$('[data-act=fit]').addEventListener('click', () => this.graphView.fit());
    this.$('[data-act=fit3d]').addEventListener('click', () => this.viewport.fit());
  }

  // the camera straight at a spline's plane, framing its points; for the same tool
  // again, the view from before
  flatView(name) {
    if (this.flatTool) {
      const same = this.flatTool === name;
      this.viewport.look(this.viewBefore);
      this.flatTool = null;
      this.viewBefore = null;
      this.paramsChanged();
      if (same || !name) return;
    }
    const t = this.overlay.tools.find(x => x.name === name && x.kind === 'spline' && !x.error);
    const pts = t ? t.handles.filter(x => x.role === 'move') : [];
    if (!pts.length) return;
    this.selectTool(t.name);
    const axis = this.planeAxis(t.name);
    const lo = [0, 1, 2].map(a => Math.min(...pts.map(p => p.pos[a]))), hi = [0, 1, 2].map(a => Math.max(...pts.map(p => p.pos[a])));
    const target = lo.map((v, a) => (v + hi[a]) / 2);
    const c = this.viewport.canvas, aspect = (c.clientWidth || 1) / (c.clientHeight || 1);
    // the screen's width is x (or z, from the side), its height the other in-plane axis
    const wide = axis === 0 ? hi[2] - lo[2] : hi[0] - lo[0], tall = axis === 1 ? hi[2] - lo[2] : hi[1] - lo[1];
    const half = Math.max(2, tall / 2, wide / 2 / aspect) * 1.35;
    const view = axis === 1 ? { yaw: 0, pitch: 1.5697 } : axis === 2 ? { yaw: 0, pitch: 0 } : { yaw: Math.PI / 2, pitch: 0 };
    this.viewBefore = { ...this.viewport.view, target: this.viewport.view.target.slice() };
    this.flatTool = t.name;
    this.viewport.look({ target, dist: half / Math.tan(0.375), ...view });
    this.paramsChanged();
  }

  // ---- the brush: a tool that adds points to a list on the surfaces under the pointer ----

  paintWith(name) {
    if (this.overlay.pen) this.overlay.stopPen();
    this.paintingTool = this.paintingTool === name || !name ? null : name;
    if (this.paintingTool) { this.studio.activate(this, 'view'); this.selectTool(name); this.shapes.clear(); }
    this.viewport.canvas.classList.toggle('pen', !!this.paintingTool);
    if (this.paintCard) { this.paintCard.remove(); this.paintCard = null; }
    if (this.paintingTool) {
      const stamping = this.doc.tools.some(x => x.name === name && x.kind === 'stamp');
      this.paintCard = keysCard([stamping ? KEYS.stamp : KEYS.brush], 'pinned');
      this.viewport.canvas.parentElement.append(this.paintCard);
      this.paintKey = this.paintKey || (e => {
        if (e.key === 'Escape' && this.paintingTool) { e.preventDefault(); this.paintWith(null); }
        // 1 to 9: the value the next stamped cells get
        else if (/^[1-9]$/.test(e.key) && this.paintingTool && !e.metaKey && !e.ctrlKey && !e.target.closest('input, textarea, [contenteditable]') && this.brushNow() && this.brushNow().stamp) {
          e.preventDefault();
          this.stampValue = +e.key;
          this.paramsChanged();
        }
      });
      window.addEventListener('keydown', this.paintKey, true);
    } else if (this.paintKey) window.removeEventListener('keydown', this.paintKey, true);
    this.shapes.ring = null;
    this.paramsChanged();
    this.viewport.dirty = true;
  }
  // the brush that is painting now: { tool, param, points, spacing }, or null
  brushNow() {
    if (!this.paintingTool) return null;
    const t = this.doc.tools.find(x => x.name === this.paintingTool && (x.kind === 'brush' || x.kind === 'stamp'));
    const p = t && this.doc.params.find(q => q.name === t.binds[0]);
    if (t && t.kind === 'stamp') {
      if (!p || p.kind !== 'cells') return null;
      // the cells node that builds them says how large a cell is
      const node = this.doc.nodes.find(n => n.type === 'cells' && n.settings.cells && n.settings.cells.text === p.name);
      const size = node ? parseFloat(node.settings.size.text) : 1;
      return { tool: t.name, param: p.name, stamp: true, cells: p.cells || [], size: size > 0 ? size : 1, value: this.stampValue || 1 };
    }
    if (!t || !p || p.kind !== 'points') return null;
    const spacing = parseFloat(t.settings && t.settings.spacing && t.settings.spacing.text);
    return { tool: t.name, param: p.name, points: p.points || [], spacing: Number.isFinite(spacing) ? spacing : 1 };
  }

  // ---- a shape found in the 3D view: its node and its line are marked ----

  setFound(sel) {
    const n = sel ? this.doc.nodes.find(m => m.name === sel.name) : null;
    this.foundName = n ? n.name : null;
    this.graphView.markFound(n ? n.id : -1);
    this.code.markFound(this.foundName);
    this.studio.changed(this, 'selection');
  }

  // ---- the files `use` nodes read: asked of the studio, kept, and given to each new graph ----

  provideFiles(g) { for (const [p, t] of this.files) g.provide(p, t); }
  fetchWanted() {
    const want = (this.doc.wanted || []).filter(p => !this.missing.has(p) && !this.files.has(p));
    if (!want.length || this.fetching) return;
    this.fetching = true;
    Promise.all(want.map(p => this.studio.resolveFile(this, p).catch(() => null))).then(texts => {
      this.fetching = false;
      if (this.closed) return;
      let got = false;
      texts.forEach((t, k) => {
        if (t == null) { this.missing.add(want[k]); return; }
        this.files.set(want[k], t);
        this.graph.provide(want[k], t);
        got = true;
      });
      if (got) this.history.quiet(() => this.refresh({ rebuild: true, codeText: false }));
      else this.studio.filesMissing(this, [...this.missing]);
    });
  }
  // a used file changed (it is open in another tab), or may be there now
  fileChanged(path, text) {
    if (this.files.get(path) === text) return;
    this.files.set(path, text);
    this.missing.delete(path);
    this.graph.provide(path, text);
    this.history.quiet(() => this.refresh({ rebuild: true, codeText: false }));
  }
  retryFiles() {
    if (!this.missing.size) return;
    this.missing.clear();
    this.fetchWanted();
  }

  // the axis out of a spline tool's plane: 1 on the ground, 2 facing the front, 0 the side
  planeAxis(name) {
    const t = this.doc.tools.find(x => x.name === name);
    const plane = t && t.settings && t.settings.plane ? t.settings.plane.text : 'ground';
    return plane === 'front' ? 2 : plane === 'side' ? 0 : 1;
  }
  paramsChanged() { this.graphParams.render(this.doc); this.viewParams.render(this.doc); }

  // the pen in the 3D view; a new drawing becomes a point-list param, a spline tool
  // to edit it, and an outline node wired into the output
  startDrawing() {
    if (this.overlay.pen) { this.overlay.stopPen(); return; }
    this.studio.activate(this, 'view');
    this.overlay.startPen(pts => this.addDrawing(pts));
  }

  // the pen for a spline tool: its points drawn again, in its plane
  redraw(name) {
    if (this.overlay.pen) { const was = this.drawingTool; this.overlay.stopPen(); if (was === name) return; }
    const t = this.doc.tools.find(x => x.name === name), param = t && this.doc.params.find(p => p.name === t.binds[0]);
    if (!t || !param || param.kind !== 'points') return;
    const axis = this.planeAxis(name), pts = param.points || [];
    const offset = pts.length ? pts.reduce((a, p) => a + p[axis], 0) / pts.length : 0;
    const snap = parseFloat(t.settings.snap && t.settings.snap.text) || 0.5;
    const closed = t.settings.closed && t.settings.closed.text === 'closed';
    this.studio.activate(this, 'view');
    // upright lines are easier to draw facing them
    if (axis !== 1 && this.flatTool !== name) this.flatView(name);
    this.drawingTool = name;
    this.overlay.startPen(list => this.edit(g => g.setPoints(param.name, list)), { axis, offset, snap, closed, onEnd: () => { this.drawingTool = null; this.paramsChanged(); } });
    this.paramsChanged();
  }

  addDrawing(pts) {
    const taken = new Set([...this.doc.params.map(p => p.name), ...(this.doc.tools || []).map(t => t.name), ...this.doc.nodes.map(n => n.name)]);
    const fresh = base => { let k = 1, n = base; while (taken.has(n)) n = `${base}${++k}`; taken.add(n); return n; };
    const param = fresh('drawing'), tool = fresh('pen'), node = fresh('shape');
    const out = this.doc.nodes.find(n => n.type === 'output');
    this.edit(g => {
      g.addPoints(param, pts);
      g.addTool(tool, 'spline', [param]);
      g.setTool(tool, 'curve', 'straight');
      g.setTool(tool, 'closed', 'closed');
      g.setTool(tool, 'snap', '0.5');
      const ys = this.doc.nodes.map(n => n.y || 0), xs = this.doc.nodes.map(n => n.x || 0);
      const id = g.add('outline', xs.length ? Math.min(...xs) : 0, ys.length ? Math.max(...ys) + 300 : 0);
      if (id < 0) return;
      g.rename(id, node);
      g.set(id, 'path', param);
      if (out) g.connect(id, out.id, out.inputs.length);
    });
    this.selectTool(tool);
    this.studio.toast(`New outline ${node}, drawn as ${param}: drag its points with the ${tool} tool, or wire it into extrude, cut or fuse.`);
  }

  // ---- the one refresh path ----

  // the graph as data
  setDoc(doc) {
    this.doc = doc;
    this.viewport.dirty = true;
  }
  // the environments in the 3D view's picker, and Edit… at the end
  fillEnvironments() {
    const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
    const list = environments();
    this.scenePick.replaceChildren(...list.map(e => opt(e.name, e.name)), opt('\0edit', 'Edit…'));
    this.scenePick.value = environment().name;
  }

  // every change lands here; kind says which changes may merge into one undo step
  // (typing, dragging one param), null keeps each change its own step
  refresh({ rebuild = true, codeText = true, refit = false, kind = null } = {}) {
    const t0 = performance.now();
    this.graph.eval();
    this.evalMs = performance.now() - t0;
    this.setDoc(this.graph.json());
    if (this.selectedTool && !this.doc.tools.some(t => t.name === this.selectedTool)) this.selectedTool = null;
    this.overlay.set(this.graph.tools());
    this.$('[data-act=tools]').hidden = !this.doc.tools.length;
    if (codeText) this.code.set(this.graph.text(true));
    this.code.setDoc(this.doc);
    this.code.setDiags([]);
    this.graphView.setDoc(this.doc, rebuild);
    this.showResult(refit);
    this.queuePreviews();
    this.graphParams.render(this.doc);
    this.viewParams.render(this.doc);
    this.imagePanel.update();
    this.drawPanel.update();
    this.history.record(this.code.value, kind);
    this.studio.changed(this, 'text');
    if (this.doc.wanted && this.doc.wanted.length) this.fetchWanted();
  }

  edit(fn, opts = {}) {
    fn(this.graph);
    this.graph.autolayout(false);
    this.refresh({ rebuild: opts.rebuild !== false, kind: opts.kind || null });
    if (opts.rebuild !== false && this.graphView.selected >= 0) this.selectNode(this.graphView.selected, true);
  }

  arrange() {
    this.graph.autolayout(true);
    this.refresh({ rebuild: true });
    this.graphView.fit();
  }

  shownNode() {
    const sel = this.doc.nodes.find(n => n.name === this.selectedName);
    return sel || this.output;
  }

  isImage(n) { return !!n && this.octo.typeMap[n.type].out === 'image'; }

  showResult(refit) {
    const n = this.shownNode(), image = this.isImage(n);
    const m = !n ? { data: new Float32Array(0), count: 0, bounds: [0, 0, 0, 0, 0, 0] } : image ? imageMesh(this.graph.nodeImage(n.id)) : this.graph.mesh(n.id);
    // an image is looked at from the front, a model from where the camera was
    const turned = image !== !!this.shownImage;
    if (turned && image) this.viewBefore3d = { ...this.viewport.view, target: this.viewport.view.target.slice() };
    this.shownImage = image;
    this.viewport.setMesh(m, refit && !image);
    if (image && (turned || refit)) { this.viewport.view = { ...this.viewport.view, yaw: 0, pitch: 0 }; this.viewport.fit(); }
    else if (turned && this.viewBefore3d) { this.viewport.view = this.viewBefore3d; this.viewport.dirty = true; }
    this.shown = { meshes: image || !n ? 0 : this.graph.meshCount(n.id), triangles: image ? 0 : m.count / 3, runs: image ? 0 : m.groups ? m.groups.length : 0, images: m.look ? m.look.images.length : 0, picture: image ? m.picture : null };
    const showing = this.$('.showing');
    showing.innerHTML = n ? `<span class="tag cat-${this.octo.typeMap[n.type].category}">${n.type}</span> ${n.name}` + (image && m.picture ? ` <span class="hint" title="Shown twice each way, so its seams show">${m.picture.width} × ${m.picture.height}</span>` : '') + (this.selectedName ? ' <button class="link show-out">show output</button>' : '') : 'empty graph';
    const b = showing.querySelector('.show-out');
    if (b) b.onclick = () => this.selectNode(-1);
    this.stats();
    if (this.shapes) this.shapes.sync();
  }

  // previews render a few per frame so big graphs stay responsive
  queuePreviews() {
    this.previewQueue = this.doc.nodes.map(n => n.id);
    if (this.previewsRunning) return;
    this.previewsRunning = true;
    const drain = () => {
      if (this.closed) return;
      const t0 = performance.now();
      while (this.previewQueue.length && performance.now() - t0 < 12) {
        const id = this.previewQueue.shift();
        const c = this.graphView.previewCanvas(id);
        if (!c) continue;
        const n = this.doc.nodes.find(x => x.id === id);
        if (this.isImage(n)) drawImage(c, this.graph.nodeImage(id));
        else this.studio.previewer.render(c, this.graph.mesh(id));
      }
      if (this.previewQueue.length) requestAnimationFrame(drain);
      else this.previewsRunning = false;
    };
    requestAnimationFrame(drain);
  }

  // what the model costs: shapes, triangles, draw calls (one per material), texture memory
  stats() {
    const out = this.output, sh = this.shown || { triangles: 0, runs: 0, images: 0 };
    const failed = this.doc.nodes.filter(n => n.error).length;
    const chip = (text, cls, title) => `<span class="chip${cls ? ' ' + cls : ''}"${title ? ` title="${title}"` : ''}>${text}</span>`;
    const num = v => Math.round(v).toLocaleString();
    const bytes = this.viewport.scene.bytes;
    const mem = bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    let html = chip(`${this.doc.nodes.length} nodes`) + chip(`${out ? out.count.toLocaleString() : 0} shapes`);
    // one quiet chip for the cost, so the row stays short
    const cost = [];
    if (sh.triangles) cost.push(`${num(sh.triangles)} triangles`, `${num(sh.meshes)} mesh${sh.meshes === 1 ? '' : 'es'}`, `${sh.runs} material${sh.runs === 1 ? '' : 's'}`);
    if (sh.images) cost.push(`${sh.images} image${sh.images === 1 ? '' : 's'}, ${mem}`);
    if (this.evalMs != null) cost.push(`${this.evalMs < 10 ? this.evalMs.toFixed(1) : Math.round(this.evalMs)} ms`);
    if (cost.length) html += chip(cost.join(' · '), 'quiet' + (sh.runs > 24 || this.evalMs > 50 ? ' warn' : ''), 'What the 3D view shows costs: triangles, different meshes (shapes that share one are stored once and instanced; the deformers say when each shape gets its own), materials (each is one draw call), texture memory with mipmaps, and the time to generate everything again');
    if (failed) html += chip(`${failed} with errors`, 'bad');
    this.$('.stats').innerHTML = html;
  }

  // a name typed into a setting becomes a param, in the setting's range
  declareParam(name, s) {
    const lo = s.lo, hi = s.hi > s.lo ? s.hi : s.lo + 10;
    let v = parseFloat(s.default);
    if (!Number.isFinite(v) || v < lo || v > hi) v = lo;
    let res = -1;
    this.edit(g => { res = g.addParam(name, v, lo, hi); }, { rebuild: false });
    return res >= 0;
  }

  // the same from the code: a quick fix that writes the param line
  declareInCode(name) {
    const lines = this.code.value.split('\n');
    let at = -1;
    lines.forEach((l, k) => { if (/^\s*param\s/.test(l)) at = k; });
    if (at < 0 && /^\s*\/\//.test(lines[0] || '')) {
      // after the header comment, if there is one
      const blank = lines.findIndex(l => !l.trim());
      if (blank > 0 && lines.slice(0, blank).every(l => /^\s*\/\//.test(l))) at = blank;
    }
    lines.splice(at + 1, 0, `param ${name} = 1 in 0..10`);
    this.code.set(lines.join('\n'));
    this.applyCode();
  }

  // ---- selection, shared by both editors ----

  selectTool(name) {
    this.selectedTool = name || null;
    this.graphParams.render(this.doc);
    this.viewParams.render(this.doc);
    this.viewport.dirty = true;
  }

  selectNode(id, quiet) {
    const n = this.doc.nodes.find(n => n.id === id);
    this.selectedName = n ? n.name : null;
    if (this.graphView.selected !== (n ? n.id : -1)) { this.graphView.selected = n ? n.id : -1; this.graphView.markSelected(); }
    this.code.selectNode(this.selectedName);
    if (!quiet) this.showResult(false);
    if (this.imagePanel) this.imagePanel.update();
    this.studio.changed(this, 'selection');
  }
  // a node's own editing view, opened from the button on the node
  openEditor(n, editor) {
    if (editor.view === 'image') this.selectNode(n.id, true);
    if (editor.view === 'draw') this.drawPanel.choose(editor.param);
    this.studio.show(this, editor.view);
  }
  selectByName(name) {
    const n = this.doc.nodes.find(n => n.name === name);
    if (n) this.selectNode(n.id);
  }
  get selectedNode() { return this.doc.nodes.find(n => n.name === this.selectedName) || null; }

  // ---- code edits ----

  onCodeChanged() {
    clearTimeout(this.codeTimer);
    this.codeTimer = setTimeout(() => { this.codeTimer = 0; this.applyCode(); }, 180);
    this.studio.changed(this, 'typing');
  }
  // what is being typed goes in now (before undo, save or export)
  flush() { if (this.codeTimer) { clearTimeout(this.codeTimer); this.codeTimer = 0; this.applyCode(); } }
  applyCode() {
    const d = this.swapIn(this.code.value, { kind: 'code', codeText: false });
    if (d) {
      this.code.setDiags(d);
      this.$('.stats').innerHTML = `<span class="chip bad">${d.length} error${d.length === 1 ? '' : 's'} in the code</span><span class="chip">showing the last good graph</span>`;
      this.studio.changed(this, 'text');
    }
  }

  // replaces the graph with the one a text describes; returns its errors, or null
  // when it took the text. Typing, undo and the AI all come through here.
  swapIn(text, { kind = null, codeText = true, canonical = false } = {}) {
    const next = this.octo.graph();
    if (next.parse(text)) {
      const d = next.json().diags;
      next.free();
      return d;
    }
    // nodes keep their place on the canvas when their name survives the edit
    const old = new Map(this.doc.nodes.map(n => [n.name, n]));
    const nodes = next.json().nodes;
    for (const n of nodes) {
      const o = old.get(n.name);
      if (o && !n.placed) next.move(n.id, o.x, o.y);
    }
    next.autolayout(false);
    // a mostly new graph from the AI gets fresh views (typing never moves the camera)
    this.provideFiles(next);
    const fresh = nodes.filter(n => !old.has(n.name)).length > nodes.length / 2;
    const size = b => Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const before = size(this.viewport.scene.bounds);
    this.graph.free();
    this.graph = next;
    // canonical: the code is printed from the graph, with every node's place
    if (codeText && !canonical) this.code.set(text);
    this.refresh({ rebuild: true, codeText: canonical, kind });
    if (this.selectedName) this.selectByName(this.selectedName);
    const after = size(this.viewport.scene.bounds);
    if (canonical && (fresh || after > before * 1.6 || after < before * 0.5)) { this.viewport.fit(); requestAnimationFrame(() => this.graphView.fit()); }
    return null;
  }

  // a whole new text, as a fresh start (open, revert): no undo across it
  load(text) {
    const next = this.octo.graph();
    const errors = next.parse(text);
    next.autolayout(false);
    this.provideFiles(next);
    this.missing.clear();
    this.graph.free();
    this.graph = next;
    this.selectedName = null;
    this.graphView.selected = -1;
    // a text with errors comes back as written
    if (errors) this.code.set(text);
    this.history.reset();
    this.refresh({ rebuild: true, refit: true, codeText: !errors });
    this.code.setDiags(next.json().diags);
    requestAnimationFrame(() => this.graphView.fit());
  }

  // ---- undo ----

  undo(redo = false) {
    this.flush();
    const text = redo ? this.history.redo() : this.history.undo();
    if (text == null) return false;
    this.history.quiet(() => this.swapIn(text));
    return true;
  }

  setParams(values) {
    this.history.group(() => {
      for (const [k, v] of Object.entries(values)) if (this.graph.setParam(k, v) < 0) throw new Error(`there is no param called ${k}`);
      this.refresh({ rebuild: false });
    });
  }

  // ---- pictures and files ----

  // a PNG data URL of a mesh from a camera (the current one by default), drawn off screen
  capture(mesh, opts) {
    return this.studio.previewer.image(mesh, { current: this.viewport.view, ...opts, bg: cssColor('--bg', [0.95, 0.95, 0.93]) });
  }
  shot(mesh, w, h, opts = {}) {
    return this.studio.previewer.shot(mesh, w, h, camera(mesh.bounds, w / h, { current: this.viewport.view, ...opts }), { grid: opts.grid !== false, bg: cssColor('--bg', [0.95, 0.95, 0.93]) });
  }

  // the theme changed: draw again in the new colours
  repaint() { this.viewport.dirty = true; this.queuePreviews(); }

  dispose() {
    this.closed = true;
    this.offEnvironment();
    clearTimeout(this.codeTimer);
    if (this.paintKey) window.removeEventListener('keydown', this.paintKey, true);
    this.shapes.dispose();
    this.viewport.dispose();
    this.graph.free();
    for (const p of Object.values(this.panels)) p.remove();
  }
}

// an image node in the 3D view: a square panel facing the front, the image repeated
// twice each way so its seams show
export function imageMesh(im) {
  if (!im) return { data: new Float32Array(0), count: 0, bounds: [0, 0, 0, 0, 0, 0] };
  const v = (x, y) => [x, y, 0, 0, 0, 1, 1, 1, 1, x + 1, 2 - y, 0]; // rows run from the top
  const data = new Float32Array([v(-1, 0), v(1, 0), v(1, 2), v(-1, 0), v(1, 2), v(-1, 2)].flat());
  const smooth = im.width * im.height > 64 * 64;
  const look = {
    materials: [{ name: 'image', color: [1, 1, 1], rough: 1, metal: 0, material: 'unlit', texture: 0, bump: -1, mask: -1, rough_map: -1, metal_map: -1, glow_map: -1, map: 'box', scale: 1, alpha: 'blend', shading: 'smooth', filter: smooth ? 'smooth' : 'pixel' }],
    images: [{ name: 'image', width: im.width, height: im.height, hash: 'node:' + im.hash }],
    image: () => im,
  };
  return { data, count: 6, bounds: [-1, 0, 0, 1, 2, 0], groups: [{ material: 0, first: 0, count: 6 }], look, picture: im };
}

// an image node's thumbnail: the picture itself, sharp when it is small
let scratch = null;
function drawImage(target, im) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(target.clientWidth * dpr) || 400, hh = Math.round(target.clientHeight * dpr) || 220;
  if (target.width !== w || target.height !== hh) { target.width = w; target.height = hh; }
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, w, hh);
  if (!im) return;
  scratch = scratch || document.createElement('canvas');
  scratch.width = im.width; scratch.height = im.height;
  scratch.getContext('2d').putImageData(new ImageData(im.data, im.width, im.height), 0, 0);
  const s = Math.min(w / im.width, hh / im.height);
  ctx.imageSmoothingEnabled = s < 1.5;
  ctx.drawImage(scratch, (w - im.width * s) / 2, (hh - im.height * s) / 2, im.width * s, im.height * s);
}
