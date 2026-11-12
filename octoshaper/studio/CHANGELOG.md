# Changelog

What changed in OctoShaper Studio, newest first. The studio shows this page under Help ▸ What's new.

Versions follow [semantic versioning](https://semver.org). While the studio is experimental its versions end in `-experimental.N`: anything may still change, the OctoLang file format included, so keep your `.octo` files and re-export when a new version comes out.

## 2.0.0-experimental.1 (2026-11-12)

The first public version of OctoShaper Studio, a complete redesign of OctoShaper that runs in the browser: free, with nothing to install and no account.

- **Three views of one file.** Every document is OctoLang code, shown as a node graph, as text and in 3D. Edit any of them and the others follow.
- **Procedural shapes.** Boxes and other shapes; outlines cut, fused, revolved, swept and lofted into solids; lines, grids, scatter, splits and repeats; bends, chips, wear and smoothing.
- **Textures and materials.** Image nodes that work out every pixel from a formula, filters (blur, warp, edges, shade, tile, palette), painted images and brushstrokes, and preset materials.
- **Growth.** Ivy and moss that grow over other shapes.
- **Building and painting by hand.** Pick a shape in the 3D view to move, turn or scale it; place cells with the stamp; paint straight onto images.
- **Params you can grab.** Numbers, positions, bounds (a box with a handle on each side), point lists, curves and cells, each with its own view in Params and its handles in the 3D view.
- **Reuse.** A file can use other files as nodes.
- **Export.** glTF (`.glb` and `.gltf`), pictures (`.png`) and the code itself. What you export is yours to use for anything, commercially included.
- **Samples.** Fifteen samples under File ▸ Open sample, from a single box to a hand-painted diorama.

Known limits of this version:

- Needs a recent desktop browser with WebGL 2 (Chrome, Edge, Firefox or Safari 16.4 and later). Phones and tablets can open it, but it is made for a mouse and keyboard.
- Saving back to the same file works in Chrome and Edge. Other browsers download a copy instead.
- Files you open stay on your computer. The studio keeps your open documents in the browser between visits, so clearing the site's data closes them: save what you want to keep.
