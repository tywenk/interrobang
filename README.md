# Interrobang

Browser-first font editor. A Vite + React 19 SPA backed by wa-sqlite; fonts live
in the browser's Origin Private File System.

## Architecture

- **`packages/core`** — immutable font model + command pattern with row-level
  `affects` metadata driving incremental persistence.
- **`packages/schema`** — Drizzle ORM tables + versioned migrations, shared
  between server DDL and browser SQLite client DDL.
- **`packages/storage`** — wa-sqlite adapter. `applyMutation(target, font)`
  writes the minimal SQL diff per command; `saveFont` is retained for import
  and undo/redo.
- **`packages/font-io`** — OTF/TTF via opentype.js, UFO via plist + GLIF, in a
  Web Worker.
- **`packages/editor`** — controlled-prop canvas component + focused hooks
  (`use-canvas-size`, `use-canvas-input`).
- **`apps/web`** — Vite + React 19 + TanStack Router + Zustand. Services are
  injected through `AppContext`; auto-save runs through `useAutoSave`.

## Roadmap

Reusable glyph components (diacritics, terminals) are the next major feature.
The `components` and `component_refs` tables (migration 0002) and the
`MutationTarget.kind === 'component'` variant are scaffolded for this work;
search `TODO(components)` to see the sites that will extend.

## Develop

    bun install
    bun run build    # emit dist/ for each package
    bun run test
    bun --filter @interrobang/web dev

## Design docs

- `docs/superpowers/specs/` — design spec
- `docs/superpowers/plans/` — implementation plans
  - `2026-04-17-phase-1-local-editor.md` — Phase 1 MVP
  - `2026-04-19-maintainability-rfc.md` — this refactor

## Tooling

- Bun workspaces, Vite 8, React 19.
- Vitest + happy-dom + @testing-library/react.
- oxlint + oxfmt (oxc) for lint/format.
