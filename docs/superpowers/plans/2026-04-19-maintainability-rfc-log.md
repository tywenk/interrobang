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
| 8 | Post-RFC cleanup | 90 → 95 | Selection set-equality guard, reverse-affects for undo/redo, `INCREMENTAL_SAVE` and `MIGRATION_VERSION` removed |

## Decisions made

- **D1 Multi-master:** kept soft. `Glyph.layers[]` stays; editor still operates on `layers[0]`. `activeMasterId` not yet threaded — deferred to whenever multi-master UI lands.
- **D2 Drizzle:** kept as source of truth for DDL and for Drizzle-inferred types exported from `@interrobang/schema`. Drizzle's sqlite-proxy query builder was tried for reads (Phase 5.4) but reverted — it threw against wa-sqlite at runtime despite passing under node:sqlite in tests. Adapter uses hand SQL with local snake_case row types in both directions.
- **D3 Exports + build:** landed in Phase 6. `tsup` per package; Vite resolves workspace packages via explicit aliases to `src/` (the `source` export condition wasn't honored reliably by Vite's dep optimizer).

## Phase 8 — post-RFC follow-ups

All four items from the original "Follow-ups noted but deferred" list landed on the same branch:

- **Reverse-affects for undo/redo.** `UndoRedoStack.{undo,redo}` now return `{ state, command }`; `project-store` unions the reverted command's `affects` into `pendingMutations`. `Command.affects` is required (no longer optional) — every command declares its storage footprint at the type level.
- **`INCREMENTAL_SAVE` flag removed.** With reverse-affects in place, there is no path that flushes with empty targets for interactive edits. `SaveLoop` applies mutations only; empty `scheduleMutations` is a no-op. `saveFont` kept on the adapter purely for import.
- **`MIGRATION_VERSION` export removed.** No runtime readers — the schema-version source of truth is the `schema_versions` table.
- **Selection `Set` identity.** `useCanvasInput.onSelectionChange` now fires only when the computed set actually differs from the current one.

## Remaining follow-ups

None currently tracked.
