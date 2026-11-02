# Changelog

## [1.3.0]

The Tools Update.

### Added

- Draw nodes without a material use a default lit material, and texture-sampling nodes without a texture use a default checker texture, so new graphs show a preview right away.
- Scene handles for numeric graph parameters: choose a **Scene handle** for a parameter (the move icon on its card in graph settings): a **Slider** along an axis, a **Box face** (parameters sharing an anchor form one box) or a **Radius** disc. Pick an anchor position parameter, axis, scale, range and whether it is centred, then drag it in the Scene view with the **OctoShaper Handles** tool. Handles follow their anchor parameter when it moves, and can be set through the automation CLI; a negative scale points a handle the other way along its axis.
- Spline drawing: with the **OctoShaper Spline** tool, the **OctoShaper Spline Drawing** overlay draws a spline parameter by clicking points or dragging a freehand stroke (simplified on release), onto scene geometry or the graph's ground plane, replacing or extending the current spline.
- **Extrude Spline Mesh** turns a closed spline into a capped solid (concave outlines included), with height, taper and smooth-shading angle; draw the outline with the Spline Drawing overlay to build custom platforms. **Offset Spline** grows or shrinks a spline outline in the XZ plane.
- Objects drawn with Draw Instanced can be selected by clicking them in the Scene view, which selects their Procedural Graph Executor.
- Optional result caching: enable **Use Caching** on a Procedural Graph Executor, or **Advanced > Use Caching** in the graph window, to rerun only the nodes affected by a change. Works with interpreted and generated execution after regenerating graph code, and costs memory only while enabled. Scene queries always rerun; custom nodes that read outside state can opt out with `[NodeVolatile]`.
- Animation curve parameters and constants can be edited in the graph settings panel.

### Changed

- OctoShaper now ships entirely as source, with no precompiled DLLs. Core has its own `CuriousTrove.OctoShaper.Core` assembly definition. Custom node assemblies with an `.asmdef` should reference `CuriousTrove.OctoShaper.Core` instead of listing `CuriousTrove.OctoShaper.Core.dll` under precompiled references. Upgrading over an older version replaces the old DLLs automatically and keeps OctoShaper project settings and procedural prefab imports.
- Scene gizmos use the OctoShaper theme colours and one shared style: splines and parameter handles (sliders, boxes, radius discs) draw subtly outlined lines with rimmed round points that highlight on hover and drag.
- Refreshed graph settings and inspector UI: compact parameter cards with full-width names and a hover-only remove button, Unity-style parameter rows in the Procedural Graph Executor inspector, a compact Settings/Attributes header, an attribute search that appears only for longer lists, smaller node previews, and an Undo/Redo panel that hides when history is empty.
- The Preview Stage shows the real generated hierarchy under a Procedural Graph Executor named after the graph. The graph window now evaluates through that executor, so the preview uses the same execution and instancing path as a scene, including colliders and spawn receivers.
- Spline points in the Scene view can be dragged directly; the full position handle appears only on the point being edited, reducing clutter on long splines.
- The editor finds node methods through Unity's TypeCache, making editor start-up and script reloads faster.

### Fixed

- The node selection rectangle no longer jitters when dragging up and to the left.
- Graph editor undo and redo now use Unity's Undo history: canvas edits appear in Edit > Undo, Ctrl+Z in the graph no longer undoes twice or out of sync with Unity, slider and handle drags undo in one step, history no longer carries over to another graph, and unrelated Unity undos no longer rebuild the graph view.
- Closing a graph window and discarding unsaved changes no longer crashes Unity or stalls while saving and regenerating code; discarded edits are restored in memory.
- Objects in the Preview Stage are read-only, so preview instances can no longer be edited by mistake.
- Cached nodes no longer flash as if they had just run.
- The Position tool is available for Vector3 parameters stored as `UnityEngine.Vector3`.

### Upgrading

See [Upgrading to 1.3](upgrading-to-1-3.html) for the full checklist.

- Back up your project, import the update, then run **Tools > OctoShaper > Generate Graph Code** and let Unity compile. Generated executors need regenerating to support **Use Caching**.
- Custom node assemblies that list `CuriousTrove.OctoShaper.Core.dll` under precompiled references must reference the `CuriousTrove.OctoShaper.Core` assembly definition instead.

## [1.2.0] - 2026-10-05

The Colorful Update.

### Added

- Asset Store imports automatically install missing Burst, Collections and Mathematics packages at the versions Unity recommends for your Editor, through an independent editor installer. Already-installed packages are never changed; if one is older than OctoShaper supports, the Console names it and the version to update to. Retry failed setup from Tools > OctoShaper > Repair Dependencies.
- Sample import and the sample browser warn that the supplied materials require Universal Render Pipeline (URP).
- AI Integration: a bundled agent skill and optional Unity 6 CLI with focused node discovery, persistent node keys, named ports, material creation and compile-free edit/render iteration. Custom cameras and isolated branch previews speed up visual checks; structured failures retain input values, saved edits and completed captures. Install the project skill from Tools > OctoShaper > AI Integration.
- Colors and Textures nodes for color ramps, blending, UVs, texture sampling, height-map displacement and vertex colors, with HDR color, texture and gradient controls.
- Per-instance material color, texture and float overrides for direct/indirect instancing and procedural prefabs, without changing the source materials.
- Editable procedural meshes: primitives, convex hulls, triangulation, bevels, booleans, surface sampling, profile revolution and spline-driven geometry. Realize Meshes turns point-based geometry into shared Unity meshes.
- Box, sphere, capsule and mesh collider nodes, including compound colliders and fitting a box collider to a mesh.
- Seven samples: Structural Tower, Spline Viaduct, Oak Barrel, Chromatic Grove, Golden Arena, Stone Assemblies and Solar Lance.
- An isolated Scene view Preview Stage, Frame Preview, and position/spline tools for graph parameters.
- Cancellable async editor previews, manual evaluation, optional node thumbnails and automatic node organisation in the Advanced menu.
- Per-graph Local assembly mode for authoring around the origin and placing results at incoming transforms.
- Attribute requirements in port tooltips, explanations for rejected connections and expanded node help.
- Editor scripting APIs for read-only graph presentation and experimental JSON graph automation.

### Changed

- Faster graph saving, preview updates and repeated mesh generation, with less allocation during runtime regeneration.
- A compact graph toolbar and collapsed spline/weighted-list controls make large graphs easier to work with.
- Rendering nodes have their own category; transform and jitter nodes are grouped under Spatial. Legacy nodes stay available to existing graphs and are hidden from creation search.
- Draw Instanced and Draw Instanced Indirect now use an explicit Mesh Constant/Attribute selector. For realized geometry, choose Attribute and use `mesh`.
- Procedural prefabs are created and named directly in the selected Project folder.
- Heavy geometry and distribution C# node methods now return `ValueTask`; await direct calls and regenerate graph code after upgrading. Graph-level synchronous execution remains available.

### Fixed

- Precompiled editor tools detect visibility support in the running Unity Editor and share the OctoShaper tools overlay across supported versions, avoiding behavior frozen to the release builder's Unity version.
- Unity 6000.6 import compatibility: declare Mathematics explicitly, repair stylesheet importer metadata, remove unused legacy UXML factories that prevent editor types from loading, and use supported assembly discovery to avoid UAC0005 warnings.
- AI preview captures respect parent placement transforms for GPU instances, and interpreted subgraphs preserve explicitly empty inputs.
- Assign Mesh validates selector attributes on target elements without requiring them on the source mesh bank.
- Graph automation revisions ignore transient managed-reference IDs and serialization order, preventing read-only inspection from invalidating generated readiness.
- Procedural prefabs preserve instanced meshes, material overrides, transforms, submeshes and shadow settings in Edit Mode and Play Mode.
- Nested subgraphs retain unconnected parameter defaults and propagate output attributes correctly.
- Edit Mode prefab generation preserves source prefab connections and removes replaced instances instead of leaving disabled pooled objects.
- Preview cleanup and cancelled execution release resources safely, and failed previews leave the graph editable.
- Position and spline handles follow graph authoring space and retain their icons after script reloads.
- Texture parameters, identity quaternion defaults, empty geometry inputs and degenerate meshes are handled reliably.
- Restore legacy Triangulate Points and surface-sampling nodes for existing graphs, and correct primitive winding and UVs.
- Generate In Edit Mode keeps Generate On Enable enabled; physics materials and editor resources remain compatible with Unity 2022.3 and Unity 6.

### Upgrading

See [Upgrading to 1.2](upgrading-to-1-2.html) for the full checklist.

- Back up your project, import the update, then run **Tools > OctoShaper > Generate Graph Code** and let Unity compile.
- Replace any experimental Draw Meshes nodes with Draw Instanced using Mesh Attribute mode before regenerating. Experimental mesh graphs authored during development may need their affected nodes recreated.
- The minimum supported Unity version remains **2022.3**. The seven new mesh samples include URP materials; other pipelines need suitable replacement materials.

## [1.1.0] - 2026-08-27

### Added

- Add `Create Assembly Roots`, `Assign Parents`, and `Place Local Assembly` nodes for authoring reusable element hierarchies in local subgraph space and placing them as compound objects.
- Add local XZ rectangle and circle shape values with generic perimeter distribution and uniform interior sampling nodes.

### Changed

- Mark the existing `Create Parent Element` and `Assign Parent Element` nodes as legacy while preserving their node IDs and serialized graph compatibility.
- Instantiate parented elements using their local transforms so locally authored assemblies retain their relative placement.

### Fixed

- Stabilize the graph save state, including across domain reloads, by updating it from authoring events instead of polling every editor frame, and notify open parent graphs directly after saving a subgraph instead of reacting to every asset import.
- Preserve fallback graph type IDs as aliases when canonical registrations replace them, preventing intermittent missing `ElementSet` type errors while restoring graph and subgraph editor windows.
- Remap `parentRowIndex` values when appending or merging element sets so each appended hierarchy continues to reference rows within its own merged range.
- Request a follow-up Unity script compilation after the initial import so the Getting Started window opens only after the source assemblies are available to AssemblyUpdater.

## [1.0.0]

- Initial release.
