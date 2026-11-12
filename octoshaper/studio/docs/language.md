# octolang: the language

An octolang file is a graph written down. Every line makes one node.

```
name = node(inputs, setting: value, setting: value)
```

- **Positional arguments are wires.** They are the names of other nodes, and the node takes their shapes as input.
- **A few inputs have a name**, and are written like settings: `color(walls, texture: bricks)`. These take an image (see [Images](#images)).
- **Named arguments are settings.** Anything you leave out keeps its default.
- **Order does not matter.** A line can use a name defined further down. Loops are not allowed.
- `_` leaves an input empty: `copy(_, tree)`.

The graph editor and the code editor show the same graph. Editing one rewrites the other.

## What flows through the wires

There are two kinds of wire, and a wire of one kind cannot go into an input of the other.

A **shape wire** carries a set of shapes. A shape is an oriented box (a centre, three axes, a size), a colour, and what is drawn inside the box: `box`, `cylinder`, `sphere`, `cone`, `roof`, `wedge`, `pyramid`, `dome`, `tube`, `torus`, `arch`, `card` or `none`. Whatever it is, it is stretched to fill its box.

An **image wire** carries one image. The nodes of the Image category make and change images, and `color` lays them on shapes. The studio draws image wires and the nodes that make them in orange.

Inside a box, `x` is the width, `y` the height and `z` the depth. On a face taken with `face`, **`y` points out of the surface**, so `extrude` pushes a facade outward and `inset` shrinks it within its plane.

## Params

```
param floors = 12 in 3..40
```

A param is a knob for the whole graph: hosts show it as a slider, settings use it by name. The range is optional. In the studio's graph, typing a new name into any setting declares it as a param. A param cannot take one of the names below, since settings use them for the shape at hand.

### Point lists

```
param road = [-30 0 0, 0 0 8, 30 0 0]
```

A param can also hold a list of points, `x y z` each, separated by commas. Nodes that follow a path (`along`, `fill`) take it by name in their `path` setting, or a list written in place. A point list cannot be used in an expression. A node that follows a path has a `curve` setting for how the line goes through its points: `smooth` (a curve through them), `straight`, or `round` (straight lines with rounded corners, passing near the points rather than through them, like a road or a pipe).

### Positions

```
param spot = 4 0 -2 in -20..20
```

Three numbers make a position. Expressions read its parts as `spot.x`, `spot.y` and `spot.z`; the range, which is optional, holds for each axis. A position moves in the 3D view by itself, with an arrow per axis and its middle on the ground, without a tool line. In the studio it is one row of x, y and z fields: drag an axis letter to scrub it.

### Bounds

```
param plaza = bounds [-10 0 -8, 10 4 8] in -50..50
ground = box(w: plaza.w, d: plaza.d, x: plaza.x, z: plaza.z)
```

Bounds are a box, from its low corner `x0 y0 z0` to its high one `x1 y1 z1`, written in that order (the parser puts the corners in order if they are not). Expressions read its sides as `plaza.x0`, `plaza.x1`, `plaza.y0`, `plaza.y1`, `plaza.z0` and `plaza.z1`, its middle as `plaza.x`, `plaza.y` and `plaza.z`, and its size as `plaza.w`, `plaza.h` and `plaza.d`. The range, which is optional, holds for each side. Bounds move in the 3D view by themselves, with a handle on each side; bounds with no height (`y0` equal to `y1`) show only the top handle, and dragging it up makes them a box. A side stops at the other one, so the low corner stays low. In the studio, bounds are two rows of x, y and z fields, `min` and `max`.

A `bounds` tool can name them (`tool area = bounds(plaza)`), and a tool can sit on them: `at: plaza` is the middle of their top.

### Curves

```
param taper = curve [0 1, 0.6 0.7, 1 0]
tower = scale(levels, by: taper(t))
```

A curve is a list of `t value` points, with `t` going up from 0 to 1. A setting calls it like a function: `taper(t)` is its height at `t`, on a smooth line through the points that never overshoots them. Use it for a profile, a falloff, or the levels of an image (`pixels(in, value: taper(src))`). The studio shows a curve as a small graph in the params: drag a point, click to add one, double-click a point to remove it.

The Draw tab (View ▸ Draw) shows a curve large, on its 0 to 1 graph, with a snap grid and fields to type a point's `t` and value. See [Building by hand](#building-by-hand).

### Cells

```
param town = cells [0 0 0, 1 0 0, 1 1 0 : 2]
```

Cells are places on a grid of whole numbers, `x y z` each, built by hand with a `stamp` tool. A cell can carry a value after a colon, 1 when it is not written, to tell kinds of cell apart: a module, a material, a tile. A `cells` node makes a box for each. See [Building by hand](#building-by-hand).

## Tools

```
tool lift  = drag(height, axis: y, at: 0 0 0)
tool area  = radius(r, at: cx 0 cz)
tool plaza = bounds(area)
tool spot  = point(px, pz)
tool street = spline(road)
tool plant = brush(trees, spacing: 2)
```

A tool puts handles in the 3D view that edit params: dragging a handle changes the params it is bound to, and the code changes with it. Tools are bound to params only, never to a node's settings directly, and they make no shapes.

```
tool top = drag(tower, at: plaza)
tool pool = radius(r, at: fountain)
```

| tool | binds | settings (default) | handles |
|---|---|---|---|
| `drag` | one number | `axis` (y), `at` (0 0 0), `scale` (1) | One handle at `at`, moved along the axis; its distance from `at` is the param times `scale`. |
| `radius` | one number | `at` (0 0 0), `scale` (1) | A circle on the ground around `at`, with a handle on its edge; the radius is the param times `scale`. |
| `bounds` | a bounds param, or the number params `x0, x1, z0, z1`, then optionally `y0, y1` | `y` (0, with number params) | A box with a handle on each side, for the bottom and top too. With four number params, a rectangle at height `y`; with `y0, y1`, two more handles for the bottom and the top. Bounds params have one of their own without a tool line. |
| `point` | a position, or `x, z`, or `x, y, z` | `y` (0) | A handle in the middle, moved on the ground, and an arrow for each axis it can move along (no y arrow with `x, z`). A point tool on a position takes the place of the position's own handles. |
| `spline` | one point list | `curve` (smooth), `closed` (open), `plane` (ground / front / side; default ground), `snap` (0) | A handle on each point, moved on the ground (or upright with `plane: front`, in x and y, or `plane: side`, in z and y; with `snap` above 0, on a grid of that size), with an arrow out of its plane when you point at it, and a small one between two points that adds a point when dragged. Double-click a point (or point at it and press Delete) to remove it; press anywhere on the line to add a point there; hold Shift while dragging to keep a point on one axis. In the 3D view's Params, the tool's row has **Draw** (draw its points again, in its plane) and **Flat** (look straight at its plane). |
| `stamp` | one cells param | none | No handles. In the 3D view's Params, the tool's row has **Stamp**: while it is on, a click on the ground or on a side of a cell adds the cell on that side, a drag lays a row or a floor on the layer of the first one, and Shift takes cells away. The field beside the button (and the keys 1 to 9) is the value new cells get. Alt+drag orbits, Escape stops. |
| `brush` | one point list | `spacing` (1) | A handle on each point, moved at its own height; double-click one (or Delete) to remove it. In the 3D view's Params, the tool's row has **Paint**: while it is on, a click or a drag on any surface adds points, never closer together than `spacing`, and Shift takes away the points under the pointer. Alt+drag orbits, Escape stops. The points sit where the surface was when you painted; they do not follow it later. |

`at` is three expressions separated by spaces, which can use params: `at: area.x 0 area.z0`. It can also name a position param (`at: spot`), bounds (`at: area`) or another tool, to sit on it and follow it: `at: plaza` puts a drag on the middle of the top of a `bounds`. A tool sits on a `point`'s position, a `drag`'s handle, a `radius`'s centre, the top middle of `bounds` and a `spline`'s first point. Tools cannot sit on each other in a circle. A space separates two values unless an operator joins them, so `0 -cz` is two values and `0 - cz` is one.

Dragging keeps a param inside its range and rounds it to 1/1000. A tool whose params are missing, or of the wrong kind, is an error on its line.

In the studio, the tools are listed under the Params panel; clicking one selects it. Its handles show in the 3D view when it is selected, or for every tool when the view's **Tools** toggle is on. The core does all the handle maths (`octo_tool_handles`, `octo_handle_project`, `octo_handle_drag` in `octo.h`), so an engine integration can draw the same handles.

## Settings are expressions

A number setting can be a formula, worked out once for every shape that passes through the node:

```
houses = extrude(lots, height: rand(3, 9))
turned = rotate(levels, y: i * twist)
land   = grid(nx: 40, nz: 40, h: noise(x * 0.07, z * 0.07) * 10)
```

| name | meaning |
|---|---|
| `i`, `n` | index of this shape, number of shapes |
| `t` | `i / (n - 1)`: 0 for the first shape, 1 for the last |
| `w`, `h`, `d` | this shape's width, height, depth |
| `x`, `y`, `z` | this shape's centre |
| `up` | how much this shape faces up: 1 for a top, 0 for a wall, -1 for an underside |
| `side` | on a shape made by `face`: 0 top, 1 bottom, 2 front, 3 right, 4 back, 5 left |
| `level` | its generation: which piece of a `split` or copy of a `repeat` it is, how deep a `branch` |
| `u`, `v` | where on its face a point is, from 0 to 1 across and up: in `scatter`, `decal` and `displace` |
| `value` | on a shape made from cells: the value of its cell; 0 on any other shape |
| `pi` | 3.14159… |

Operators: `+ - * / %`, comparisons `< > <= >= == !=` (1 or 0). Functions: `rand()` (0 to 1), `rand(hi)`, `rand(lo, hi)`, `noise(x, y?, z?)` (smooth, 0 to 1), `sin`, `cos` (radians), `abs`, `floor`, `round`, `sqrt`, `min`, `max`, `clamp(v, lo, hi)`, `mix(a, b, t)`, `if(cond, a, b)`, `pick(k, a, b, c…)` (the k-th of the values after it, starting again past the last, so `pick(i, a, b)` alternates), `has(dx, dy, dz)` (on a shape made from cells: 1 when the cell that many steps away is filled). A curve param is called by its name: `taper(t)`.

`rand` is stable: a shape keeps its random values when you edit other parts of the graph. Nodes with a `seed` setting give another variation when you change it. The studio hides a seed until it is set and offers a ⚄ button to reroll it.

Choices are bare words (`axis: y`, `as: roof`); colours are `#rrggbb`.

A choice can also be picked for each shape, with a formula whose results are the option words:

```
roofs = shape(tops, as: if(w > 6, roof, pyramid))
cuts  = split(blocks, axis: pick(level, x, z))
```

Inside such a formula the option words come first: where `axis` has the options `x`, `y` and `z`, those letters mean the options, not the shape's position.

## Images

```
bricks = pattern(as: bricks, rows: 6, cols: 3, vary: 0.4)
stains = noise(scale: 3, detail: 4)
worn   = blend(bricks, stains, mode: multiply, amount: 0.5)
stone  = colorize(worn, ramp: [#3d3a40, #8b8580, #c9c0b0])
walls  = color(tower, texture: stone, bump: worn, scale: 3)
```

An image node makes one image. `noise`, `pattern`, `gradient` and `pixels` make one from nothing, at their `size` (128 pixels along each side unless set, from 4 to 1024); the others take the size of their first input. Patterns and noise are grey: `colorize` gives them colours. Everything they make repeats cleanly, so it can tile across a wall.

In an image node a formula is worked out for every pixel instead of every shape. `x` and `y` run from 0 to 1 across and up the image, `src` is the brightness of the input image at that pixel, `w` and `h` are the image's size in pixels. So `amount: y < 0.3` blends only the bottom, and `pixels(value: sin(x * 20) * 0.5 + 0.5)` draws stripes.

`color` lays images on shapes with no unwrapping. Its named inputs are `texture` (the picture, tinted by `color`; with no colour set the picture shows as it is), `bump` (a grey image read as heights, for dents and joints), `mask` (its brightness is how solid the surface is, for `alpha`), and three that say where the surface is rough, metal or glowing: `rough_map`, `metal_map` and `glow_map`. Each multiplies its setting (`rough`, `metal`, `emit`), pixel by pixel: light is fully rough, metal or glowing, black is not at all. With an image on `metal_map` or `glow_map` and the setting left alone, the setting counts as 1, so the image alone decides. `map` says how the image is laid on:

| map | what it does |
|---|---|
| `box` | on each side of the shape's own box, `scale` units to one image, from the bottom left. The default. |
| `world` | the same along the world's axes, so the image runs on from one shape to the next |
| `face` | one whole image on each face, whatever its size |
| `cylinder` | wrapped around the shape's up axis |
| `wrap` | once around the shape and once up it, whatever its size: a band of windows around a tower, a ring of teeth along the edge of an outline. `around` is how many times it goes around. On an outline it follows the edge. |
| `tile` | one tile of a `tileset` on each face. See [Building by hand](#building-by-hand). |

`stretch` lays the image taller than wide (`box`, `world` and `cylinder`): `stretch: 2` makes bricks twice as tall.

A colour can come from a list of colours instead of one: `ramp` is the list and `at` says where on it each shape is, from 0 to 1. `at` is a formula like any other, so `color(leaves, ramp: [#1d4a22, #6fae3c, #e8d44a], at: y / 12)` goes from dark at the foot of a tree to yellow at its top, `at: rand()` picks any, and `at: t` runs from the first shape to the last. The shapes still share one material: the colour is each shape's tint.

`material` picks how the surface is drawn: `standard`, `unlit`, `toon`, `foliage` (lit from both sides, sways), `water`, `glass` or `glow`. The studio draws each one, a glTF carries its name, and an engine can swap in its own. `emit` makes a shape glow in its own colour; it is a formula, so `emit: rand() > 0.7` lights some windows without a second material. `alpha: cut` cuts the see-through parts out, `blend` blends them. `shading: flat` gives every triangle its own flat light. `filter: pixel` keeps pixels sharp, for pixel art.

A `card` (a kind of `shape`) is a flat picture standing in its box, seen from both sides; `cross: 2` or more crosses several. With a texture that has clear parts, `map: face` and `alpha: cut`, it makes grass, leaves and signs.

### Filters, and pictures of shapes

```
plate  = box(w: 4, h: 1, d: 4)
rows   = split(plate, axis: z, count: 4)
stones = inset(rows, by: 0.08)
relief = raster(stones, view: top, as: height)
lit    = shade(relief, as: bevel, width: 0.04)
tinted = colorize(lit, ramp: [#3c4a2a, #6e9a48, #a9c46a])
paving = palette(tinted, count: 5, dither: ordered)
```

`raster` draws shapes into an image, from above or from the front, so every shape node is a texture tool too: `split` and `inset` make tiles, `scatter` makes speckles, an outline makes a sign. It gives the shapes' colours, their height in grey, or a white mask. The shapes fill the image (`fit: fill`) or keep their proportions (`fit: keep`), with a `margin` around them.

The filters each take an image and give one of the same size. `blur` softens or smears. `warp` distorts: pushed about by a second image (its named input `by`) or by noise, wrapped around the middle, wound up, mirrored, made of big pixels, turned or zoomed. `edges` works on the edge of what is drawn (the solid part of a cut-out image, or the light part of a grey one): a coloured outline, the edges alone, fatter, thinner, or the distance from the edge in grey. `shade` fakes light, reading brightness as height: a bevel, an emboss, plain light, a shadow, darker hollows. `tile` makes an image repeat: without a seam, several times, shuffled, or moved with wrap-around. `palette` cuts an image down to a few colours, listed or picked from the image, with a dither for the pixel art look.

Widths and radii in the filters are shares of the image (0.03 is 3% of its side), so a graph looks the same at any `size`. A filter's settings are one value for the whole image; only `warp`'s `amount` (and the formulas of `pixels` and `blend`) change from pixel to pixel. To move, turn or scale an image, use `tile(as: offset)` and `warp(as: turn)` or `warp(as: zoom)`: `move`, `rotate` and `scale` are for shapes.

### Images that drive shapes

```
blob    = gradient(as: round, ramp: [#ffffff, #000000])
rough   = noise(scale: 3)
heights = blend(blob, rough, mode: multiply, amount: 0.5)
slab    = box(w: 40, h: 0.4, d: 40)
land    = displace(slab, map: heights, by: 3 * max(up, 0), detail: 1)
woods   = pixels(heights, value: src > 0.5)
trees   = scatter(slab, map: woods, count: 300)
```

`displace`, `keep` and `scatter` have a named image input, `map`. The image is laid flat, seen from above: x across, z down the image. Its brightness multiplies the node's own setting, so white leaves it as it is and black turns it off:

| node | what the map does | where it is laid |
|---|---|---|
| `displace` | multiplies `by` at every point of the surface | across each shape (`space: local`), or across all the shapes together (`space: world`) |
| `keep` | multiplies `chance`, read at each shape's centre | across all the shapes together |
| `scatter` | keeps a point where it is light, drops it where it is dark, by chance in between | across each shape |

So one grey image can be a height map, and its thresholds (`pixels(heights, value: src > 0.5)`) the masks for where things stand. A `raster` of some shapes can be the map for others.

The studio shows what a model costs under the 3D view: triangles, different meshes (see [Shapes that share a mesh](#shapes-that-share-a-mesh)), materials (one draw call each), the images in use with their memory, and the time to generate.

## Using other files

```
windows = use(bays, "kit/window.octo", width: w - 0.5, lit: rand() < 0.4)
lamp = use("kit/lamp.octo")
```

`use` makes another `.octo` file a node. The file is written in quotes, and its path starts from the folder of the file that uses it. The used file's params are the node's settings: `width: 1.4` sets its `width` param, and params left out keep the file's own values. Only number params can be set this way.

With an input, the file's result is made once on each shape: it stands at the bottom centre of the shape, turned with it, at its own size (a shape's size reaches it only through a setting, as `width: w - 0.5` does). Settings are formulas for each shape, as everywhere. The file is worked out once for each different set of values, not once per shape: 400 windows with two different sets of values cost two evaluations. A node keeps at most 64 versions, so round a value that varies smoothly (`width: round(w)`).

With no input, the result is made once, where the file made it.

A used file can use other files, up to eight deep; a file that uses itself is an error. An error inside the used file shows on the `use` node, with the file's name. Materials, images and custom geometry come along.

The core never reads the disk. The host gives it files (`octo_file_provide`) and asks which ones are missing (`octo_file_wanted`); the command line tool and the studio do this for you. In the studio, double-click a `use` node to open its file in its own tabs; while it is open, the graph that uses it follows every change. The desktop app and the samples read used files from disk. A browser can only read the files it is given: open the used file in a tab too, or pick its folder with **File ▸ Use files from a folder** (Chrome and Edge).

## Editing single shapes

Click a shape in the 3D view to find what made it: its node is ringed in the graph, its line is marked in the code, and a small bar shows over the shape. From there the shape can be changed alone: drag an arrow to move it, press **Turn** or **Scale** for those handles, pick a colour, or press Delete. Each of these writes an edit into a `tweak` node placed after the node that made the shape (the studio adds the node the first time):

```
houses_edit = tweak(houses, edits: [@4f2a move 0 1 0, @4f2a turn 45, @91c0 scale 1.5, @91c0 color 0.9 0.4 0.3, @7b drop])
```

An edit names a shape by its id (`@` and hex digits), then says what happens to it:

| edit | numbers | what it does |
|---|---|---|
| `move` | `x y z` | Moves the shape, in world units. |
| `turn` | one angle, or `x y z` | Turns it around its own centre, in degrees; one number turns it around the up axis. |
| `scale` | one factor, or `w h d` | Scales it along its own axes, keeping its bottom in place. |
| `color` | `red green blue`, each 0 to 1 | Gives it this colour. |
| `drop` | none | Removes it. |
| `tile` | `tile`, then quarter turns, then a side (both optional) | With `map: tile`, shows this tile of the tileset on the shape. A side (1 top, 2 bottom, 3 front, 4 right, 5 back, 6 left) changes that side alone. Place the tweak after the `color` node. |

Edits are applied in the order written. Ids stay with their shapes when params change or nodes are added (V6), so a tweak survives most changes. When a shape is gone (its row got shorter, say), its edits do nothing and the tweak node shows a warning that names them; they are never applied to some other shape. Take them out by hand, or with the node's **clear** button.

An AI finds shapes the same way, with the `find_at` tool: a place in a picture gives the node, the line and the shape's id.

## Detail in the mesh

```
rock = displace(lump, by: noise(x * 2, y * 2, z * 2) * 0.3, detail: 0.6)
post = bend(pole, angle: 15, taper: 0.5)
pebble = smooth(lump, steps: 2)
block = chip(stone, amount: 0.5, size: 0.25, seed: i % 6)
old = wear(block, edges: 0.6, cavity: 0.7, grain: 0.8)
lit = tone(old, ramp: [#3a3448, #c9b79a, #fff3d6], by: up * 0.5 + 0.5)
red = touch(lit, at: dabs, size: 0.8, color: #c8402a)
```

Five nodes change the surface of each shape itself, and three paint on it. They can be used anywhere in a graph; what comes out of them are shapes like any other, which later nodes move, copy and paint.

- `displace` pushes each point of the surface in or out along its normal, by `by` units. `by` is worked out for every point: `x`, `y` and `z` are the point's place, measured from the middle of the shape's bottom, and `up` is 1 where the surface faces up and -1 where it faces down. `noise(x, y, z) * 0.4` gives rock; `noise(x * 0.3, 0, z * 0.3) * max(up, 0)` raises the top of a slab into rough ground and leaves its sides and bottom alone. `detail` says how finely the shape is divided first: 0 moves only its own corners. An outline stays an outline: its edge moves in its plane, which makes a wavy shore, and it can still be extruded.
- `bend` bends each shape along an axis by `angle` degrees in all, and can make the far end thinner (`taper`) and turn it (`twist`). Along `y` a standing shape bends over from its base. Along `x` or `z` a lying shape bends from its middle: its ends rise, or drop when the angle is below 0.
- `smooth` divides each shape and rounds it; each step makes four times the triangles. `sharp` keeps some of the original corners.
- `chip` knocks pieces off the edges that stick out. `amount` is how many of the places along the edges are chipped, `size` how big a chip is.
- `wear` paints, on the vertices, the edges that stick out in `edge_color` and the inside corners in `dirt_color`. `cavity` also puts dirt where one shape meets another (the foot of a wall on the ground), and `occlusion` darkens what is close to other shapes. `width` is how wide the worn band is, and `grain` breaks it up: 0 is a soft band, 1 a gritty, chipped line (the mesh is divided finer along the edges for it, with no need for `smooth` first).
- `tone` paints each shape with a ramp of colours that follows its form. `by` says where on the ramp each point of the surface is, as a formula of the point's `x y z`, `up`, `u` and `v`: `y / h` goes up the shape, `up * 0.5 + 0.5` lights what faces the sky. `bands` cuts the fade into flat bands, the hand-painted look. `amount` under 1 lets the shape's own colour show through.
- `touch` is paint dabbed on by hand: each point of `at` colours the surface within `size` units of it, hard-edged or fading out (`soft`). Give it a point-list param with a `brush` tool and you paint in the 3D view.

What `wear`, `tone` and `touch` paint is part of the surface, whatever its material: it lies over the texture too, so a wall can have a concrete image and worn edges at once. A vertex carries two colours for this, one that multiplies the material and one laid over it. In a glTF they are joined in `COLOR_0`, which a texture multiplies, so there the paint over a dark texture is darker than in the studio.

Place `wear` after the nodes that give the shapes their final form and place, since it looks at the mesh and at the neighbours it is given: merge the things that touch before it.

### Shapes that share a mesh

Shapes of the same kind, settings and size are one mesh, stored once and drawn many times (instancing). That is what keeps a model of thousands of shapes light, and these nodes protect it: equal shapes that go into one of them come out as one mesh again, worked out once. 400 equal blocks through `chip` are still one mesh.

Every shape gets a mesh of its own only when a setting makes each one different:

| what | why | what to do |
|---|---|---|
| `space: world` on `displace` | the pattern is laid across the scene, so no two places are alike | `space: local` (the default) |
| a formula with `i`, `t` or `rand()` | they differ for every shape | a formula of `w`, `h`, `d` or a param: equal shapes get equal values |
| `seed: i` on `chip` | every shape gets its own chips | `seed: i % 8`: eight meshes shared by all |
| `space: world` on `tone` | the same | `space: local` (the default) |
| `cavity` or `occlusion` on `wear` | shapes with different neighbours are painted differently | they are needed where shapes meet; set both to 0 for parts that stand alone |

Sometimes that is what you want: ground that runs on from one tile to the next needs `space: world`. The studio shows the cost on the node, as `1 mesh × 400` or `400 unique meshes, 310k triangles`, and when many shapes each have their own it offers the fix as a button. The readout under the 3D view counts the different meshes of what is shown, `octo run` prints them for every node, and an AI reads the same with the `stats` tool.

One shape can have 60,000 triangles at most, and one node's different meshes 2 million together; past that the node shows an error.

## Growth

```
block  = box(w: 18, h: 9, d: 9)
levels = split(block, axis: y, every: 3)
decks  = size(levels, h: 0.4)
pads   = scatter(decks, count: 16, size: rand(0.5, 1.1), gap: 1.2)
roots  = scatter(decks, count: 3, size: 0.2)
stems  = grow(decks, roots, length: 9, show: stems)
fronds = grow(decks, roots, length: 9, show: leaves)
signs  = decal(block, hazard, size: 1.3, turn: rand(-8, 8))
```

`scatter` puts points on any face of a shape: `side: top` (the default), `sides`, `bottom` or `all`, more of them on the bigger faces. A point stands on its face, its up the way the face looks (`align: surface`), or stays upright (`align: up`). `gap` is the least distance between two points of the same shape, which gives the even spacing of things placed by hand; a shape then gets fewer points than `count` when they no longer fit. On an outline, the sides are its edge. Each point knows its face as `side`, and `size` can read `u` and `v`, how far across and up the face the point is: `size: if(v > 0.5, 0.3, 0)` keeps the upper half.

`grow` is ivy. From each shape of `from` (usually points from a `scatter`) a stem sets off along the ground and creeps over the boxes of the shapes of `on`: `adhesion` holds it to the surfaces near it, `climb` sends it upwards, `gravity` makes it hang where it has nothing to hold, and `branches` gives it side stems. Stems are thin cylinders, `thick` where they start; leaves are cards, `leaves` of them for each unit of length and more towards the tips, so a `color` with a leaf image, `map: face` and `alpha: cut` makes them leaves. `show` gives all of it, only the stems, or only the leaves. The growth depends on the shapes, the settings and the seed, not on which node it is, so two `grow` nodes that differ only in `show` are the stems and the leaves of the same ivy, each with its own `color`. `level` is how deep a side stem is.

`cover` is foliage in a mass: it covers the faces of each shape with leaf cards, `density` of them for each square unit, so a box becomes a hedge, a wall gets a cloak of ivy and a roof its moss. `side` picks the faces, `hang` lets the leaves on walls hang down, `fluff` tilts and lifts them so the mass is not flat, and an image on `map` says where they grow (light is more). Like `grow`'s leaves they are cards: give them a leaf image with `color(..., map: face, alpha: cut, material: foliage)`. The shape under them is not drawn by `cover`; output it as well, in a dark green, to fill the gaps.

`decal` sticks an image onto faces as flat cards, a hair off the surface, with the image as their own material: hazard stripes, icons, cracks, signs. They land at random on the faces `side` names, the right way up, `gap` apart; `turn` turns them, and `size` and `turn` can read `u` and `v`. It gives only the stickers, so merge or output them with the shapes they are on. For stickers in exact places, give `at` a list of points, or a point-list param with a `brush` tool to place them in the 3D view: each sticker goes on the surface nearest its point, and `count`, `side` and `gap` no longer apply.

`text("EXIT 12")` is an image of a line of words in a small pixel font (capitals, digits and common signs), on a clear ground: with a decal it is a sign, a number on a hull, a marking on a road.

## Building by hand

```
param ground = cells [0 0 0, 1 0 0, 1 1 0 : 2]
tool build = stamp(ground)

sheet  = paint(palette: [#2a3b24, #4f7a3a, #84643f, #8b9198], size: 32)
tiles  = tileset(sheet, cell: 8)

blocks = cells(cells: ground, size: 1)
tops   = face(blocks, side: top, depth: 0.02)
open   = keep(tops, chance: 1 - has(0, 1, 0))
look   = color(open, texture: tiles, map: tile, tile: if(value == 2, 4, 0), filter: pixel)
```

`cells` makes one box for each cell of a cells param, `size` units a side, standing on its layer: the cell `0 0 0` sits on the ground at the origin. Every shape that comes from a cell remembers it, through `face`, `keep`, `color` and the rest, and two things can be asked of it. `value` is the cell's value. `has(dx, dy, dz)` is 1 when the cell that many steps away is filled: `has(0, 1, 0)` asks whether something is on top, `has(1, 0, 0) + has(-1, 0, 0)` counts the neighbours along x. So a roof goes where `has(0, 1, 0)` is 0, a hidden face is dropped where its neighbour is filled, and a wall shows another tile under an overhang. The steps are along the cells' own axes, whatever is done to the shapes afterwards.

The `stamp` tool builds the cells in the 3D view (see [Tools](#tools)). It works in the cells' own place: build first, then move or turn the result with later nodes if you must, and stamp with the `cells` node shown.

A `tileset` is an image cut into tiles of `cell` pixels, numbered from 0 at the top left, row after row. A `color` node with `map: tile` shows one tile on every face of each shape, and `tile` says which: a number, or a formula of `value`, `has()`, `side` or anything else. `side` is the face being painted (0 top, 1 bottom, 2 front, 3 right, 4 back, 5 left), so `tile: if(side == 0, 4, 1)` gives the tops one tile and the walls another on the same box. `tile_turn` turns the tile on its face by quarter turns and `tile_flip: 1` mirrors it; both can read `side` too. A single shape's tile is changed by hand with a `tile` edit in a `tweak` (see [Editing single shapes](#editing-single-shapes)). A tile on a standing face is the right way up. `filter: pixel` keeps painted pixels sharp.

A `paint` node is an image painted by hand. Its `palette` is the colours it is painted with, and its pixels are kept in the file, in a block after the nodes:

```
leaf = paint(palette: [#26241f, #f2c200, #d9482b], size: 8)

paint leaf {
  ..1111..
  .111111.
  11011011
  11111111
  11111111
  11022011
  .112211.
  ..1111..
}
```

Each character is a pixel: `.` is clear, `0` to `9` and then `a` to `z` are the colours of the palette, counted from 0. Every row is as long as the first, up to 256 pixels a side, and the block comes after the node it belongs to. The block is as large as it was painted; `size` is the image the node gives, and the pixels are stretched to it without smoothing. A paint node nothing was painted on is filled with its first colour. Painting can sit in the middle of a chain: a rough mask by hand, then `blur`, `edges` and `colorize`.

A paint block can also hold brushstrokes, soft lines of any colour drawn over its pixels. They are kept as the strokes themselves, a line each after the rows, so they stay small in the text and sharp at any `size` (up to 1024):

```
paint sky {
  ~ #2b1a6e 6 0.3 : 10 80, 30 60, 50 70 1.5, 80 30
  ~ #e2725b80 12 1 : 20 20, 60 25
  ~ . 8 0.5 : 50 50
}
```

A stroke is its colour (`#rrggbb`, `#rrggbbaa` to see through it, or `.` to rub out what is under it), its width, its softness (0 a hard edge, 1 soft all the way in), then its points: `x y` from 0 to 100 across the image from the top left, with an optional third number for the width there (a pen's pressure). The width is in the same hundredths of the image. Under strokes alone the ground is the first colour of the palette, as for a paint node nothing was painted on; a row of `.` gives a clear ground instead, for a decal. The kind of brush comes after the softness when it is not `round`: `taper` (thin at both ends, like ink), `flat` (a flat brush at 45 degrees), `dry` (streaks of bristles running dry) and `chalk` (grain, as on rough paper). The Image tab's default brushes (Round, Ink, Flat, Dry brush, Chalk, Glaze, Airbrush) are these with a width, softness and opacity to start from.

`picture("boat.png")` is an image from a PNG file, for pictures too big to paint this way. The path starts from the folder of the file that names it, like `use`. The PNG must be 8 bits a channel and not interlaced, 2048 pixels a side at most.

In the studio, the **Image** tab (View ▸ Image) shows the selected image node large; **Tiled** repeats it three times each way to check its seams. On a `paint` node it is a pixel editor: Pencil, Line, Fill, Eraser and Picker, the palette's colours, Mirror X and Mirror Y, and Wrap, which lets lines and fills go on across the edges for tiles with no seams. **Brush** paints brushstrokes over the pixels, in any colour (or a swatch of the palette), with a size, a softness and an opacity, and follows a pen's pressure; **Rub out** is the same brush clearing what is under it; **Clear strokes** removes the strokes and keeps the pixels. On a `tileset` it shows the numbered tiles, and a click picks one: the stamp tool then gives new cells that number as their value, so `tile: value` shows what was picked.

The **Draw** tab (View ▸ Draw) is a flat editor for a point-list param, seen from above, the front or the side, or for a curve param on its 0 to 1 graph. Drag a point (it lands on the snap grid; Alt places it freely), press on the line to add one, double-click a point to remove it, double-click the canvas to add a point at the end, and type a point's place in the fields. For a point list it draws the line as the nodes make it, smooth, straight or round, with the points joined faintly by a dashed line; the picker beside the snap sets `curve` (and **Closed** sets `closed`) on the spline tool and on every node that follows those points, so they all agree. **Mirror** makes the other half: what is right of the axis is mirrored to the left (for a curve, its first half onto its second), for a vase, a hull or a gable. The other point lists show faintly behind.

## The environment

The light, sky and fog the 3D view shows a model in belong to the studio, not to the file: no file holds them and no export carries them. The picker in the 3D view chooses one: `studio` (the default, a plain neutral light over the window's own colour), `day`, `overcast`, `sunset`, `dusk` and `night`. Its last entry, **Edit…** (also View ▸ Edit environment…), shows an environment's GLSL, five small functions, and saves a changed copy under a name of your own, kept in the browser or the desktop app:

```glsl
vec3 sunDir()                          // towards the sun
vec3 sunColor()
vec3 ambient(vec3 n)                   // light from all around on a surface facing n
vec4 background(vec3 d)                // behind the model, along d; alpha 0 shows the window
vec3 fog(vec3 col, vec3 d, float far)  // far: 0 at the eye, 1 far away
```

Directions are in the world, y up; `uTime` is seconds and `uWindow` the window's colour. The view tries the code as you type and keeps the last version that compiles. An older file's `scene dusk` line is read and left out.

## Comments and layout

`//` comments directly above a line belong to that node and show on it in the graph. A comment block at the top of the file, followed by a blank line, is the file's header.

Saved files end with a `layout` block holding where each node sits in the editor (after the `paint` blocks, if there are any). It is optional: nodes without a position are arranged automatically, which is what you want when writing by hand or with an AI.

```
layout {
  lots 0 0
  houses 300 0
}
```

## Outlines

An outline is a flat 2D shape. It travels through the wires like any shape, in a box
of no height, and the nodes that make solids or cut shapes read it:

```
param plan = [0 0 0, 16 0 0, 16 0 10, 6 0 10, 6 0 18, 0 0 18]
tool walls = spline(plan, curve: straight, closed: closed, snap: 0.5)

floor = outline(path: plan, round: 0.4)
court = outline(as: disc, w: 5, d: 5)
court_at = move(court, x: 3, z: 4)
plot = cut(floor, court_at)
house = extrude(plot, height: 4)
```

- **Make one** with `outline`: through a path's points (`as: path`), or as a `rect`, `disc`, `ngon` or `star`. Draw a path with a spline tool, or with **Add tool ▸ Draw an outline** (or Edit ▸ Draw an outline), which writes the param, the tool and the outline for you.
- **Combine** them with `cut`, `fuse` and `overlap`. Any shape counts as its outline: a box is a rectangle, a cylinder a circle.
- **Shape** them with `inset` (a margin, or a negative one to grow), `split` (strips), `morph` (a blend of two) and `face` (a slab per edge of the sides).
- **Make solids** with `extrude` (`top` tapers), `loft` (from one outline to another, with a twist), `sweep` (along a path) and `revolve` (a profile turned around the up axis).

Outlines are worked out on a fine grid (1/1024 of a unit) with exact arithmetic, so a
cut never leaves slivers and the same graph always gives the same shapes. Points drawn
upright (all with the same z, or the same x) make an upright outline, for a sweep's
section or a revolve's profile: draw them with `spline(..., plane: front)`.
There are no 3D booleans: cut outlines, then make the solid.

## Nodes

### Make

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `box` | none | `w` (4), `h` (4), `d` (4), `x` (0), `y` (0), `z` (0) | One box, standing on the ground. |
| `grid` | none | `nx` (4), `nz` (4), `cell` (4), `h` (0.2) | A flat grid of cells, centred on the origin. |
| `circle` | none | `count` (8), `radius` (10), `start` (0), `w` (2), `h` (2), `d` (2) | Boxes on a ring, each facing out. |
| `line` | none | `count` (5), `length` (20), `w` (2), `h` (2), `d` (2) | Boxes in a row along x. |
| `along` | none | `path`, `count` (10), `mode` (points), `w` (2), `h` (2), `d` (2), `curve` (smooth), `closed` (open) | Shapes spaced evenly along a path, each facing along it. `mode: segments` makes pieces that join up, for a road or a wall. `mode: each` makes one shape standing on each point of the path, for points placed by hand with a `brush`. |
| `fill` | none | `path`, `cell` (2), `h` (0.2), `curve` (straight) | Grid cells inside the area a path goes around. |
| `outline` | in (optional) | `as` (path / rect / disc / ngon / star; default path), and for some kinds: `w` (w), `d` (d), `sides` (6), `inner` (0.5), `round` (0), `path` (a 10 by 10 square), `curve` (straight) | A flat 2D shape, drawn as a prism through its box: extrude it to make a solid. With an input, one outline per shape, in its place: `path` takes the shape's own outline. See [Outlines](#outlines). |
| `use` | onto (optional) | a file in quotes, then that file's params as settings | Another file's result, as a node: `use("kit/window.octo", width: 1.4)`. See [Using other files](#using-other-files). |
| `cells` | none | `cells` (a cells param), `size` (1) | One box for each cell of a cells param, built by hand with a `stamp` tool. See [Building by hand](#building-by-hand). |
| `revolve` | none | `path` (a vase), `sides` (24), `angle` (360), `curve` (smooth), `as` (solid / blocks; default solid), and with blocks: `rows` (8), `thick` (0.5) | A solid turned around the up axis, like a vase or a column. The path is the profile: x is the radius, y the height. `as: blocks` builds it from courses of separate blocks instead, every other course shifted by half a block: a round stone tower that `chip` and `color` can work on block by block. `level` is a block's course. |
| `tube` | none | `path`, `radius` (0.4), `sides` (8), `curve` (smooth), `closed` (open), `sag` (0), `end` (1) | A round pipe along a path: a pipe, a rail, a ring, or a cable. `sag` lets each span between two points hang down that far at its middle, for wires between posts; `end` is the radius at the end relative to the start, for a horn or a tapering branch. |

### Shape

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `size` | in | `w` (w), `h` (h), `d` (d) | Sets the size of each shape, keeping its bottom in place. |
| `extrude` | in | `height` (3), `top` (1) | Pulls each shape up to a height. A flat outline becomes a solid; `top` under 1 tapers it. |
| `inset` | in | `by` (0.5) | Shrinks each shape inward, leaving a margin. An outline is offset along its edges, and a negative `by` grows it. |
| `split` | in | `axis` (x / y / z; default x), `count` (3), `every` (0), `pattern` ([]) | Cuts each shape into equal pieces. An outline is cut into strips that keep its shape. With a `pattern`, a list of relative widths, the pieces follow it, and the whole pattern repeats `count` times (or as often as `every` fits): `pattern: [1, 3, 1]` is a pier, a window and a pier. `level` says which part of the pattern a piece is, from 0, so `keep(bays, chance: level == 1)` keeps the windows. |
| `repeat` | in | `count` (3), `axis` (x / y / z; default y), `gap` (0) | Stacks copies of each shape next to it. |
| `face` | in | `side` (top / bottom / sides / front / back / left / right / all; default top), `depth` (0.1) | Takes the faces of each shape as thin slabs. On a face, y points out. An outline's top and bottom keep its outline, and its sides give a slab per edge. |
| `displace` | in, and the image `map` | `by` (0.2), `detail` (0.5), `space` (local / world; default local) | Pushes each point of the surface in or out along its normal, by a formula of the point's `x y z` and `up`. An image on `map` multiplies it, laid from above. An outline's edge moves in its plane. See [Detail in the mesh](#detail-in-the-mesh). |
| `bend` | in | `axis` (x / y / z; default y), `angle` (30), `taper` (1), `twist` (0) | Bends, tapers and twists each shape along an axis. |
| `smooth` | in | `steps` (1), `sharp` (0) | Divides and rounds each shape. |
| `chip` | in | `amount` (0.3), `size` (0.15), `seed` (1) | Knocks chips off the edges that stick out. |
| `sweep` | section | `path` (a curve), `curve` (smooth), `closed` (open), `twist` (0), `scale` (1) | Carries each outline along a path: x across it, and up as drawn upright, for a road, a kerb or a frame. |
| `morph` | from, to | `t` (0.5), `points` (64) | Blends each outline into one of the second input, as far as `t`. `t: t` makes a gradient along a row. |
| `loft` | bottom, top | `height` (4), `rings` (8), `twist` (0), `wall` (0) | A solid that morphs from each outline at the bottom to one of the second input at the top. With `wall` above 0 it is hollow and open at the top, its walls and floor that thick: a hull, a bowl, a trough. |

### Move

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `move` | in | `x` (0), `y` (0), `z` (0), `space` (world / local; default world) | Moves each shape. |
| `rotate` | in | `y` (0), `x` (0), `z` (0), `around` (each / all; default each) | Turns each shape around its own centre. With `around: all` they turn together as one thing, around the middle of them all: an oar with its blade, a whole house. |
| `scale` | in | `by` (1), `x` (1), `y` (1), `z` (1), `from` (bottom / center; default bottom), `around` (each / all; default each) | Grows or shrinks each shape. With `around: all` the whole assembly grows as one thing, the spaces between its shapes too. |
| `jitter` | in | `move` (0.5), `turn` (15), `scale` (0.1), `seed` (1) | Adds random variation to each shape. |
| `tweak` | in | `edits` ([]) | Changes single shapes by hand, each named by its id. The studio writes the edits when you edit a shape in the 3D view. See [Editing single shapes](#editing-single-shapes). |

### Grow

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `scatter` | on, and the image `map` | `count` (10), `size` (0.5), `side` (top / sides / bottom / all; default top), `align` (surface / up; default surface), `gap` (0), `seed` (1) | Random points on the faces of each shape. An image on `map`, laid across each face, keeps the points where it is light. See [Growth](#growth). |
| `branch` | from | `levels` (3), `count` (3), `angle` (35), `shrink` (0.7), `seed` (1) | Grows branches from the top of each shape. |
| `cover` | on, and the image `map` | `density` (3), `size` (0.6), `side` (top / sides / bottom / all; default all), `hang` (0.6), `fluff` (0.5), `cross` (2), `seed` (1) | Covers the faces of each shape with leaf cards: a hedge, a cloak of ivy, moss. An image on `map` says where. See [Growth](#growth). |
| `grow` | on, from | `length` (6), `adhesion` (0.8), `gravity` (0.3), `climb` (0.6), `branches` (0.3), `leaves` (8), `show` (all / stems / leaves; default all), `thick` (0.12), `leaf` (0.45), `seed` (1) | Ivy and vines: from each shape of `from`, a stem creeps over the shapes of `on`. See [Growth](#growth). |

### Pick

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `keep` | in, and the image `map` | `chance` (0.5), `seed` (1) | Keeps some of the shapes. An image on `map`, laid across all of them from above, multiplies the chance where each shape is. |

### Look

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `shape` | in | `as` (box / cylinder / sphere / cone / roof / wedge / pyramid / dome / tube / torus / arch / card / none; default cylinder), and for some kinds: `sides` (12), `rings` (7), `top` (1), `bevel` (0), `thickness` (0.2), `hip` (0), `opening` (0.6), `cross` (1), `slant` (0), `slant_z` (0), `flare` (0) | Changes what each shape is drawn as. See the table below for which setting goes with which kind. |
| `color` | in, and the images `texture`, `bump`, `mask`, `rough_map`, `metal_map`, `glow_map` | `color` (#d9d4c7), `rough` (0.85), `metal` (0), `vary` (0), `seed` (1), `material` (standard / unlit / toon / foliage / water / glass / glow), `emit` (0), `shading` (smooth / flat), `alpha` (none / cut / blend), `ramp` ([]) and `at` (t), and with an image: `map` (box / world / face / cylinder / tile / wrap), `scale` (1), `stretch` (1), `around` (1), `filter` (smooth / pixel), `tile` (0), `tile_turn` (0), `tile_flip` (0) | Paints each shape with a material: shapes painted with the same properties share it. `vary` and `emit` change each shape without making new materials. See [Images](#images). |
| `wear` | in | `edges` (0.5), `cavity` (0.5), `occlusion` (0), `edge_color` (#e8e2d6), `dirt_color` (#3d3a33), `width` (0.25), `grain` (0.5), `seed` (1) | Paints worn edges and dirt in the corners onto each shape, over its material and its texture. |
| `tone` | in | `ramp` (dusk to cream), `by` (y / h), `amount` (1), `bands` (0), `detail` (0.5), `space` (local / world; default local) | Paints each shape with a ramp of colours that follows its form. |
| `touch` | in | `at` (a point list), `size` (1), `color` (#ffffff), `soft` (0.5), `amount` (1) | Paint dabbed on the model at points placed by hand. |
| `decal` | on, image | `size` (1), `side` (top / sides / bottom / all; default sides), `count` (1), `gap` (0), `turn` (0), `alpha` (cut / blend / none; default cut), `filter` (smooth / pixel), `seed` (1), `at` (none) | Sticks an image flat onto faces of each shape, at random or at the points of `at`. It gives only the stickers: merge them with the shapes. |

Each kind of `shape` has its own settings; the others are ignored (the studio hides them). Like any number setting they can be formulas, so `sides: if(i < 3, 6, 12)` gives a different shape per element.

| kind | settings | what it looks like |
|---|---|---|
| `box` | `top`, `bevel`, `slant`, `slant_z` | A box. `top` under 1 tapers it towards the top (0 is a pyramid), over 1 widens the top. `bevel` cuts off the edges, as a share of each side (when `top` is 1). `slant` pushes the top along the width, as a share of it, and `slant_z` along the depth: a leaning slab, a slanted plate. |
| `cylinder` | `sides`, `top` | Round, with `sides` segments: 6 gives a hexagonal prism. `top` tapers it (0 is a cone). |
| `sphere` | `sides`, `rings` | A ball filling the box. |
| `dome` | `sides`, `rings` | Half a ball, standing on the bottom of the box. |
| `cone` | `sides`, `flare` | A point at the top; `sides: 4` is a square pyramid turned 45 degrees. `flare` curves the side in on its way up: 1 is a skirt that spreads at the bottom, the tier of a pine. |
| `pyramid` | none | Four sloping faces up to a point. |
| `roof` | `hip` | A gable roof, its ridge along x. `hip` slopes the ends in too: 1 is a pyramid roof. |
| `wedge` | none | A ramp: full height at the back (−z), down to nothing at the front. |
| `tube` | `sides`, `top`, `thickness` | A pipe, open through its height; `thickness` is the wall, as a share of the radius. |
| `torus` | `sides`, `rings`, `thickness` | A ring lying flat; `thickness` is the ring's, as a share of the radius (0.5 closes the hole). It is round when the box is a cube. |
| `arch` | `sides`, `opening` | A wall with a round-topped opening through its depth; `opening` is the width of the opening, as a share of the width. |
| `card` | `cross` | A flat picture across the box's width and height, seen from both sides. `cross` crosses several, turned around the up axis. |

### Image

These make and take images, not shapes. Every one that makes an image from nothing also has `size` (128).

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `noise` | none | `as` (smooth / cells / ridged / fibre / grain; default smooth), `scale` (4), `detail` (3), `seed` (1) | Organic variation, in grey: stains, clouds, stone, wood fibre. A whole `scale` repeats cleanly. |
| `pattern` | none | `as` (bricks / stripes / checker / grid / hex / dots / zigzag / weave; default bricks), `rows` (4), `cols` (4), `gap` (0.06), `vary` (0), `turn` (0), `seed` (1) | A regular pattern, in grey: cells are light and gaps dark. |
| `gradient` | none | `as` (line / round / angle; default line), `ramp` ([#000000, #ffffff]), `turn` (0) | Fades through a list of colours. |
| `pixels` | in (optional) | `value` (src), `alpha` (1), `color` (#ffffff) | An image from a formula worked out for every pixel. |
| `blend` | a, b, mask | `mode` (mix / multiply / add / screen / overlay / max / min; default mix), `amount` (0.5) | Lays the second image over the first. A mask image says where. |
| `colorize` | in | `ramp` ([#000000, #ffffff]) | Gives a grey image colours, from its darkest to its lightest. |
| `adjust` | in | `bright` (0), `contrast` (1), `hue` (0), `saturate` (1), `invert` (0) | Corrects an image's levels and colours. |
| `raster` | shapes | `view` (top / front; default top), `as` (color / height / mask; default color), `fit` (fill / keep; default fill), `margin` (0), `size` (128) | Draws shapes into an image: their colours, their height in grey, or white where there is a shape. |
| `blur` | in | `as` (soft / box / streak / spin / zoom; default soft), `radius` (0.03), and for a streak `angle` (0) | Softens or smears an image. It still repeats cleanly. |
| `warp` | in, and the image `by` | `as` (push / polar / twirl / mirror / pixelate / turn / zoom; default push), and for some kinds: `amount` (0.2), `scale` (4), `cells` (16), `angle` (45), `zoom` (2), `seed` (1) | Distorts an image. `by` is optional: its slopes push the image about; without it, noise does. |
| `edges` | in | `as` (outline / find / grow / shrink / distance; default outline), `width` (0.03), `color` (#000000) | Works on the edge of what is drawn: an outline, the edges alone, fatter, thinner, or the distance from the edge. |
| `shade` | in | `as` (bevel / emboss / light / shadow / occlusion; default light), `angle` (135), `depth` (1), and for some kinds `width` (0.05) | Fakes light on an image, reading its brightness as height. |
| `tile` | in | `as` (seamless / repeat / shuffle / offset; default seamless), and for some kinds: `blend` (0.25), `count` (2), `x` (0.5), `y` (0.5), `seed` (1) | Makes an image repeat: without a seam, several times, shuffled, or moved. |
| `palette` | in | `colors` ([]), `count` (8), `dither` (none / ordered / diffuse; default none) | Reduces an image to a few colours: the ones listed, or `count` colours picked from the image. |
| `tileset` | in | `cell` (16) | Cuts an image into numbered tiles of `cell` pixels, for `color(..., map: tile, tile: 3)`. |
| `paint` | none | `palette` (four greens and browns), `size` (16, up to 1024) | An image painted by hand in the Image tab, pixel by pixel or with brushstrokes; both are a `paint name { }` block in the file. |
| `picture` | none | a PNG file in quotes | An image from a file next to this one: `picture("boat.png")`. |
| `text` | none | the words in quotes, `color` (#ffffff) | An image of a line of text in a small pixel font, on a clear ground: `text("EXIT 12")`. For signs, with a `decal`. |

### Combine

| node | inputs | settings (default) | what it does |
|---|---|---|---|
| `copy` | onto, piece, more pieces | `fit` (uniform / stretch / none; default uniform), `pick` (i) | Puts a copy of a piece into each shape. With several pieces, `pick` chooses one for each shape: 0 is the first, and past the last it starts again, so the default `i` takes them in turn and `rand(0, 3)` picks one of three at random. `fit: none` keeps the piece at its own size, standing at the bottom of the shape. |
| `cut` | in, by | none | Cuts the outlines of the second input out of each shape of the first, where they lie in the same plane and overlap in height. |
| `fuse` | in, and | none | Fuses the outlines of both inputs into one: each piece that holds together becomes one shape. |
| `overlap` | in, with | none | Keeps only the part of each shape's outline that the second input covers. |
| `merge` | any number | none | Joins several sets of shapes into one. |
| `output` | any number | none | The result of the graph. |
