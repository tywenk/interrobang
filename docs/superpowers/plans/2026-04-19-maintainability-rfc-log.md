# Maintainability RFC — Execution Log

Executed on branch `refactor/maintainability-rfc`. Plan: `./2026-04-19-maintainability-rfc.md`.

## Phases and outcomes

| Phase | Title | Tests after | Notes |
|---|---|---|---|
| 0 | Baseline | 46 → 46 | Branch cut; test/lint baseline confirmed |
| 1 | oxc migration + cosmetic cleanup | 46 → 46 | Biome removed; files kebab-cased; routes flattened |
| 2 | Delete CustomEvent bus, AppContext | 46 → 52 | First UI test landed; auto-save hook owns lifecycle |
| 3 | Canvas refactor | 52 → 58 | editor-canvas.tsx ≤ 120 LOC; `useImperativeHandle` only for `fitToView` |
| 4a | Command affects plumbing | 58 → 65 | `MutationTarget` + `affects` on every command; `'component'` variant stubbed |
| 4b | applyMutation + incremental save | 65 → 77 | Behind `INCREMENTAL_SAVE = true` flag; `saveFont` retained |
| 5 | Storage polish | 77 → 85 | Versioned blobs, schema_versions table, components tables scaffold, Drizzle reads |
| 6 | Package surface | 85 → 90 | tsup builds per package, `source` export condition, `extraMetrics` on FontMeta |
| 7 | Docs + TODO seeds | 90 → 90 | README, `TODO(components)` markers, this log |

## Decisions made

- **D1 Multi-master:** kept soft. `Glyph.layers[]` stays; editor still operates on `layers[0]`. `activeMasterId` not yet threaded — deferred to whenever multi-master UI lands.
- **D2 Drizzle:** kept as source of truth for DDL. READ paths in `BrowserStorageAdapter` now use `drizzle-orm/sqlite-proxy`; writes stayed hand-SQL.
- **D3 Exports + build:** landed in Phase 6. `tsup` per package; the Vite-consumer + worker URL path preserved via a `source` export condition + `resolve.conditions`.

## Follow-ups noted but deferred

- Drop `MIGRATION_VERSION` export from `@interrobang/schema` after one release cycle (currently `@deprecated`, value `1`).
- Remove the `INCREMENTAL_SAVE` feature flag after a release cycle of production bake.
- Compute reverse-`affects` for undo/redo so those paths stop routing through `saveFont`. Tracked by `TODO(incremental-undo)` in `project-store.ts`.
- Selection `Set` identity: `useCanvasInput` emits a fresh set on every mouse-down. Harmless today, but if consumers diff on identity this will cause noise.
