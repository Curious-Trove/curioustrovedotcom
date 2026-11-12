// The tools an AI agent gets for the studio. One list: the page runs them on its
// live graph and hands the list to the desktop app's agent server
// (desktop/src/agent.rs), which lists them over MCP and plain HTTP. `relay: true`
// marks the two the server answers itself.

const win = { type: 'string', description: 'Which studio window: its id or document name from list_windows. Leave out for the one the person used last.' };
const docArg = { type: 'string', description: 'Which open document (tab) in the window, by name; get_graph lists them. Leave out for the one the person is using.' };
const node = { type: 'string', description: 'A node name. Leave out for the output.' };
const view = { type: 'string', enum: ['iso', 'front', 'back', 'left', 'right', 'top', 'below', 'current'], description: 'A camera preset; current is what the person sees in their 3D view.' };

export const TOOLS = [
  {
    name: 'list_windows', relay: true,
    description: 'The studio windows open on this computer: id, the document in use and every open document, title, whether it has focus, its code version, and which one tools use when no window is given.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'catalogue',
    description: 'Everything you can write: every node type with its inputs and settings (kind, default, range, meaning), the names and functions a setting expression can use, and the rules of the language. Call it once before writing code. full: true adds the whole language guide.',
    inputSchema: { type: 'object', properties: { full: { type: 'boolean' } } },
  },
  {
    name: 'get_graph',
    description: 'The graph in a window: its code (the file, which is the whole truth), a version for base_version, the params, and each node with its type, inputs, the settings that are set, how many shapes it makes and any error. Also which node the person has selected, and whether the code they are typing has errors.',
    inputSchema: { type: 'object', properties: { layout: { type: 'boolean', description: 'Include the layout {} block of node positions (default false).' } } },
  },
  {
    name: 'set_code',
    description: 'Replace the code, or change parts of it with find and replace. The whole change is one undo step for the person. Nothing changes if the result has errors: you get the diagnostics instead. Pass base_version from get_graph so a change the person made in between is not lost. A layout {} block is optional; nodes without a place are laid out.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The whole new code.' },
        edits: { type: 'array', description: 'Instead of code: replacements applied in order; each find must occur exactly once.', items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] } },
        base_version: { type: 'string' },
        force: { type: 'boolean', description: 'Replace the code even while the person is typing code that has errors.' },
      },
    },
  },
  {
    name: 'edit',
    description: 'Change the graph with operations by node name, all as one undo step; if one fails nothing changes. Ops: {op:"add", name, type, inputs:[names], settings:{k:v}}, {op:"set", node, settings:{k:v or null to reset}}, {op:"connect", from, to, slot}, {op:"disconnect", to, slot}, {op:"rename", node, name}, {op:"remove", node}, {op:"comment", node, text}, {op:"add_param", name, value, lo, hi}, {op:"set_param", name, value}, {op:"param_range", name, lo, hi}, {op:"rename_param", name, to}, {op:"remove_param", name}. Settings are expressions as text, e.g. "rand(2, 5)" or "#c04a3a".',
    inputSchema: {
      type: 'object',
      properties: { ops: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'] } }, base_version: { type: 'string' }, force: { type: 'boolean' } },
      required: ['ops'],
    },
  },
  {
    name: 'render',
    description: 'Pictures of a node (the output by default), drawn in the window like the 3D view. Several views come back as one labelled sheet. Also says how many shapes, triangles, materials (draw calls) and images it has, and its bounds. An image node comes back as its picture.',
    inputSchema: {
      type: 'object',
      properties: {
        node,
        views: { type: 'array', items: view, maxItems: 6, description: 'Default ["iso"].' },
        yaw: { type: 'number', description: 'Degrees around the vertical axis, instead of a preset (0 looks along -z).' },
        pitch: { type: 'number', description: 'Degrees above the horizon, with yaw.' },
        zoom: { type: 'number', description: 'Above 1 comes closer. Default 1, which fits the whole thing.' },
        width: { type: 'integer', minimum: 64, maximum: 1600 },
        height: { type: 'integer', minimum: 64, maximum: 1600 },
        grid: { type: 'boolean', description: 'The ground grid, default true.' },
      },
    },
  },
  {
    name: 'variants',
    description: 'Try several versions without changing the graph: each variant sets params and/or settings ("node.setting": "expr"), and they come back as one labelled contact sheet with shape counts and errors. Apply the one you like with set_params or edit.',
    inputSchema: {
      type: 'object',
      properties: {
        variants: {
          type: 'array', minItems: 1, maxItems: 12,
          items: { type: 'object', properties: { label: { type: 'string' }, params: { type: 'object' }, settings: { type: 'object' } } },
        },
        node, view, yaw: { type: 'number' }, pitch: { type: 'number' },
        tile_width: { type: 'integer', minimum: 64, maximum: 800 }, tile_height: { type: 'integer', minimum: 64, maximum: 800 },
      },
      required: ['variants'],
    },
  },
  {
    name: 'set_params',
    description: 'Set param values, as one undo step. Values are kept in each param\'s range.',
    inputSchema: { type: 'object', properties: { values: { type: 'object', additionalProperties: { type: 'number' } } }, required: ['values'] },
  },
  {
    name: 'undo',
    description: 'Undo or redo the last steps in the window, the person\'s or yours (they share one history).',
    inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 50 }, redo: { type: 'boolean' } } },
  },
  {
    name: 'select',
    description: 'Show a node in the person\'s 3D view and select it in their graph, to point at something. Leave node out to show the output.',
    inputSchema: { type: 'object', properties: { node } },
  },
  {
    name: 'find_at',
    description: 'Which node made the shape at a place in a picture: x and y from 0 to 1 (0 0 is the top left), in the picture render gives for the same node, view, yaw, pitch, zoom, width and height. Answers with the node, its line in the code, the shape\'s id (what a tweak edit names), its position and size, and the point hit. The person gets the same by clicking a shape in their 3D view.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
        node, view, yaw: { type: 'number' }, pitch: { type: 'number' }, zoom: { type: 'number' },
        width: { type: 'integer', minimum: 64, maximum: 1600 }, height: { type: 'integer', minimum: 64, maximum: 1600 },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'stats',
    description: 'What a node costs (the output when node is left out): shapes, triangles, different meshes (equal shapes are one mesh, stored once and instanced), materials (one draw call each) and images; and for each deformer (displace, bend, smooth, chip, wear) in the graph how many different meshes it makes and why. Instancing matters most: when a deformer gives every shape its own mesh, say so and offer the fix it names.',
    inputSchema: { type: 'object', properties: { node } },
  },
  {
    name: 'new_document',
    description: 'Open a new document (a new set of tabs) in the window with this code, and make it the one in use. Use it to start a separate asset instead of replacing the person\'s work. It opens even if the code has errors; they come back as diagnostics.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'A short name for its tabs.' }, code: { type: 'string' } }, required: ['code'] },
  },
  {
    name: 'export',
    description: 'A file from the window, returned to you: octo (the code) or glb (binary glTF of a node, base64). This saves nothing; the person saves, or use save if they asked you to.',
    inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['octo', 'glb'] }, node }, required: ['format'] },
  },
  {
    name: 'save', relay: true,
    description: 'Write the window\'s code (.octo) or a glTF (.glb) into the folder OctoShaper was started with (--save-dir). Only when the person asked you to save; saving is theirs by default. Does not overwrite unless overwrite is true.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'File name without extension: letters, digits, - and _.' }, format: { type: 'string', enum: ['octo', 'glb'] }, node, overwrite: { type: 'boolean' } },
      required: ['name'],
    },
  },
];

for (const t of TOOLS) {
  if (t.name === 'list_windows') continue;
  t.inputSchema.properties.window = win;
  if (t.name !== 'new_document') t.inputSchema.properties.document = docArg;
}

export const INSTRUCTIONS = `You are working in an OctoShaper studio window that a person has open: a procedural 3D graph that is also OctoLang code, one line per node (name = type(inputs, setting: value)). The code is the file. A window can have several documents open as tabs; tools use the one the person is using unless you name another with document.
A good loop: catalogue once, get_graph, then change things with set_code (find and replace is cheapest) or edit, look with render, compare options with variants, ask find_at which node made something you see, check the cost with stats after adding detail, and repeat. Pass base_version so you never overwrite what the person just did. Every change you make is one step in the person's undo, and they see it live.
Keep the code readable for a person: short names, a comment over each group of lines, params for the numbers worth tuning.
Saving is the person's. Use save only when they ask.`;

export const toolByName = Object.fromEntries(TOOLS.map(t => [t.name, t]));
