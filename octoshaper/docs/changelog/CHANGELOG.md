# Changelog

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
