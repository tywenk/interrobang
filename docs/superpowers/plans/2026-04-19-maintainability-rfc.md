# Interrobang Maintainability RFC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use `- [ ]` checkboxes for tracking.

**Goal:** Move Interrobang from a Phase-1 MVP codebase to a maintainable, legible, component-ready architecture by resolving the 13 review items surfaced on 2026-04-19 — naming and layout consistency, DOM-event state bus removal, services DI, canvas split, incremental persistence driven by commands, schema polish, and forward-compat for reusable components.

**Architecture shift (one paragraph):** Commands become the currency. Today a command produces a new `Font` and storage re-writes the whole project. After this plan, each command declares the set of rows it touches, and storage applies a minimal SQL diff. DOM `CustomEvent` signaling is replaced by Zustand actions. Services (`storage`, `fontIo`, `saveLoop`) are constructed once at the app root and passed down via a small `AppContext`, which removes module-scope singletons and unblocks UI tests. The canvas is split into hooks so React owns state and the component is thin enough to test. All of the above is done with the future **components** feature (reusable sub-glyph assets — diacritics, terminals) in mind: data model and mutation targets include component identity where relevant, and TODO markers are dropped at each site where components will extend the work.

**Tech stack:** Bun workspaces, Vite 8, React 19, Zustand 5, TanStack Router, wa-sqlite + Drizzle schema, **oxlint + oxfmt (oxc toolchain — replaces Biome as part of this plan)**, Vitest + happy-dom, @testing-library/react (already installed).

---

## Context

A review of Interrobang on 2026-04-19 surfaced three classes of friction: (a) cosmetic inconsistencies (three file-naming conventions, `routes/` vs `pages/` split with no weight, shallow wrapper files), (b) architectural anti-patterns (full-font rewrites on every save, DOM `CustomEvent`s used as an inter-component state bus, a 254-line god-component canvas with imperative handles, untestable module-scope service singletons), and (c) forward-compat debt (JSON blobs in SQL with no version tag, a linear `MIGRATION_VERSION` integer, no `package.json#exports`). The user also flagged that reusable font **components** are the next roadmap feature and refactors should not box them out.

This plan resolves all 13 items, organized into 7 phases that each end in a green test suite and a commit. Phases are ordered for risk and dependency: cheap legibility wins first, then state and services, then the persistence rewrite, then surface polish. Each phase is independently shippable — you can stop after any phase and have working software.

Non-goals: implementing component editing UI, shipping multi-master editing, publishing packages to npm, SSR. Those surface in TODOs only.

---

## Decisions reserved for the user (resolve during review)

- **D1. Multi-master.** Plan assumes **single active master** for Phase 1, with a future-proof `activeMasterId` field already threaded through stores (defaults to `font.masters[0].id`). `Font.masters[]` and `Glyph.layers[]` stay — only the editor's assumption that it operates on `layers[0]` changes. If you want to commit to single-master hard, we can collapse `layers[]` too, but that's a one-way door. Assumption here: keep it soft.
- **D2. Drizzle.** Plan **keeps `@interrobang/schema` Drizzle tables** as the source of truth for DDL and types, and switches `BrowserStorageAdapter` to use Drizzle's query builder where it pays off (READ paths). INSERT/UPDATE/DELETE with `RETURNING` stays as hand SQL for now because Drizzle's browser story with wa-sqlite is thin. If you'd rather drop Drizzle entirely, swap Phase 5 accordingly.
- **D3. `package.json#exports` + build.** Plan **adds `exports` + `tsup` build emitting `dist/`** in Phase 6. Required before external consumers exist; adds ~10 min of cold cycle time. If shipping publicly is >6 months away, Phase 6 can be deferred.

Any of these can be redirected in the plan mode review.

---

## File-structure outcome

Shown as the end-state — the contract each phase must hit.

```
apps/web/src/
├── main.tsx
├── router.tsx                        # owns the router, wraps <AppProvider>
├── app-provider.tsx                  # NEW: constructs storage, fontIo, saveLoop
├── app-context.ts                    # NEW: React context + hooks
├── pages/                            # routes/ folder deleted; routes inline here
│   ├── editor-page.tsx               # renamed from EditorPage.tsx, slimmed
│   └── project-picker-page.tsx       # renamed
├── components/
│   ├── editor-shell.tsx              # renamed, uses controlled EditorCanvas
│   ├── glyph-list.tsx                # renamed, dispatches store action not DOM event
│   ├── tab-bar.tsx                   # renamed
│   ├── coordinates-panel.tsx         # renamed
│   ├── export-button.tsx             # renamed
│   ├── import-button.tsx             # renamed
│   └── ui/                           # shadcn — left as-is (kebab already)
├── hooks/
│   ├── use-keyboard-shortcuts.ts     # renamed from useKeyboardShortcuts.ts
│   ├── use-mobile.ts                 # unchanged (shadcn)
│   └── use-auto-save.ts              # NEW: wraps scheduleSave lifecycle to component
├── stores/
│   ├── project-store.ts              # adds addGlyph, mutate(cmd), activeMasterId
│   └── editor-store.ts               # unchanged
└── services/
    ├── create-storage.ts             # renamed from storage.ts, now a factory (no singleton)
    ├── create-font-io.ts             # renamed from font-io.ts, factory
    └── save-loop.ts                  # now a class: SaveLoop{schedule,cancel,flush}

packages/core/src/
├── contour.ts
├── glyph.ts
├── font.ts
├── ops/contour-ops.ts
├── ops/glyph-ops.ts                  # emptyFont, createGlyph (NEW), updateGlyph, replaceLayer
├── commands/command.ts               # Command gains affects: MutationTarget[]
├── commands/font-commands.ts         # each command declares its affects
├── commands/mutation-target.ts       # NEW: { kind: 'glyph'|'layer'|'meta'|'kerning'|'component', id }
└── index.ts                          # id.ts deleted, newId inlined here

packages/editor/src/
├── editor-canvas.tsx                 # renamed, controlled props, ~120 LOC
├── use-canvas-size.ts                # NEW: ResizeObserver + DPR
├── use-canvas-input.ts               # NEW: mouse → hit test → drag state
├── render.ts
├── viewport.ts
├── hit-test.ts
└── index.ts

packages/storage/src/
├── adapter.ts                        # StorageAdapter.applyMutation NEW; saveFont kept
├── browser/
│   ├── browser-adapter.ts            # uses Drizzle for reads, hand-SQL for writes
│   ├── apply-mutation.ts             # NEW: command → SQL plan
│   ├── serialize.ts                  # JSON blobs now wrapped as { v: 1, data }
│   └── component-refs.ts             # NEW (scaffold + TODOs, not wired yet)
├── migrations.ts                     # uses schema_versions table
├── single-tab-guard.ts
└── worker/...                        # unchanged

packages/schema/src/
├── tables.ts                         # adds schema_versions table; adds components, component_refs tables (empty for now, TODO)
├── index.ts                          # exports schema-version helpers
└── client-ddl.ts                     # unchanged
```

---

## Test strategy

- **Unit tests stay colocated** (`*.test.ts` next to source).
- **Integration tests** for storage live in `packages/storage/src/browser/browser-adapter.test.ts` using the existing `node:sqlite` shim. The existing test stays green throughout.
- **UI tests** land under `apps/web/src/**/*.test.tsx` using `@testing-library/react` + `happy-dom` (both already in devDependencies). First UI tests appear in Phase 2; the canvas split in Phase 3 adds more.
- **Every phase ends with `bun test` passing** on `packages/*` and `apps/web`. `bun lint`, `bun typecheck` also green.
- **Golden paths verified manually per phase** (listed in each phase's Verification block).

---

## Phase 0 — Baseline

**Goal:** freeze the starting state on a branch; pin test suite passes before any change.

- [ ] **Step 0.1: Create branch and verify clean slate.**
  ```
  git checkout -b refactor/maintainability-rfc
  bun install
  bun test
  bun lint
  bun --filter '*' typecheck
  ```
  Expected: all green. Stop if anything fails — the plan assumes the current `main` is green.

- [ ] **Step 0.2: Commit an empty-state marker.**
  ```
  git commit --allow-empty -m "chore: start maintainability refactor"
  ```

---

## Phase 1 — Cosmetic cleanup (A1, A2, A3, A4, A6) + Biome → oxc migration

**Goal:** swap Biome for oxlint + oxfmt; one naming convention; delete shallow files; collapse redundant folders; run the new formatter once to normalize shadcn imports.

**Risk:** low; purely mechanical.

- [ ] **Step 1.0: Migrate from Biome to oxc (oxlint + oxfmt).**
  - Remove `@biomejs/biome` from root `package.json` devDependencies.
  - Add `oxlint` and `oxfmt` as devDependencies (latest). Pin versions once installed.
  - Delete `biome.json`.
  - Add `.oxlintrc.json` at repo root with rules matching the current Biome config intent (recommended set + `noNonNullAssertion` disabled). Minimum starter:
    ```json
    {
      "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
      "plugins": ["typescript", "react", "react-hooks"],
      "categories": { "correctness": "error", "suspicious": "warn", "style": "off" },
      "rules": { "typescript/no-non-null-assertion": "off" }
    }
    ```
  - Add oxfmt config file per the current oxfmt docs (as of the time this lands — check `oxfmt --help` for the config filename; `.oxfmtrc.toml` is the expected format). Target: 2-space indent, width 100, single quotes, always semicolons — same intent as current Biome.
  - Update root `package.json` scripts:
    ```json
    "scripts": {
      "test": "vitest run",
      "test:watch": "vitest",
      "lint": "oxlint",
      "format": "oxfmt",
      "format:check": "oxfmt --check",
      "typecheck": "bun --filter '*' typecheck"
    }
    ```
  - If `.github/` workflows or pre-commit hooks reference `biome`, update them (search repo for any stragglers).
  - Verify: `bun install`, `bun lint` exits 0 (or with reviewable warnings), `bun format:check` exits 0 after a manual `bun format` pass.
  - Commit: `build: switch lint/format from Biome to oxc (oxlint + oxfmt)`.

- [ ] **Step 1.1: Run oxfmt across the repo once to absorb shadcn's double quotes / missing semicolons.**
  ```
  bun format
  git add -u && git commit -m "style: normalize with oxfmt"
  ```

- [ ] **Step 1.2: Delete `packages/core/src/id.ts` and inline `newId` in `packages/core/src/index.ts`.**
  Replace the `export { newId } from './id.js'` line with an inline `nanoid` re-export. Update all internal imports across `packages/` and `apps/web` to still pull `newId` from `@interrobang/core`. Drop `nanoid` from root `bun.lock` only if no other package still uses it.
  - Touch: `packages/core/src/id.ts` (delete), `packages/core/src/id.test.ts` (delete), `packages/core/src/index.ts` (edit).
  - Verify: `bun test` green.
  - Commit: `refactor(core): inline newId, drop id.ts shim`.

- [ ] **Step 1.3: Delete `apps/web/src/services/font-io.ts` as a separate concept; it will be replaced by a factory in Phase 2. For now, inline `createFontIoWorker()` at its two callers (`ImportButton`, `ExportButton`).**
  This is a transitional step — the factory form arrives in Phase 2.
  - Touch: `apps/web/src/services/font-io.ts` (delete), `apps/web/src/components/ImportButton.tsx`, `apps/web/src/components/ExportButton.tsx`.
  - Verify: dev server loads, import/export still works.
  - Commit: `refactor(web): remove font-io singleton wrapper`.

- [ ] **Step 1.4: Flatten `apps/web/src/routes/` into `apps/web/src/pages/` + `apps/web/src/router.tsx`.**
  - `routes/root.tsx` contents move into `router.tsx`.
  - `routes/index.tsx` and `routes/project.tsx` (each ~10 LOC) delete; their `createRoute` calls move into `router.tsx`.
  - The existing `apps/web/src/router.tsx` gains `rootRoute`, `indexRoute`, `projectRoute` definitions.
  - Update `pages/EditorPage.tsx` to import `projectRoute` from `../router.ts`.
  - Touch: `apps/web/src/routes/` (delete dir), `apps/web/src/router.tsx` (rewrite), `apps/web/src/pages/EditorPage.tsx`.
  - Verify: both routes load.
  - Commit: `refactor(web): flatten routes into router + pages`.

- [ ] **Step 1.5: Rename files to kebab-case for `.ts` / `.tsx` non-component modules and PascalCase-file / kebab-identifier for component `.tsx` only when the file exports a single default component. Chosen rule: **all files kebab-case**, regardless of extension.**
  This is a sweeping rename. Use `git mv` for each to preserve history.
  Targets:
  - `apps/web/src/hooks/useKeyboardShortcuts.ts` → `use-keyboard-shortcuts.ts`
  - `apps/web/src/pages/EditorPage.tsx` → `editor-page.tsx`
  - `apps/web/src/pages/ProjectPickerPage.tsx` → `project-picker-page.tsx`
  - `apps/web/src/components/EditorShell.tsx` → `editor-shell.tsx`
  - `apps/web/src/components/GlyphList.tsx` → `glyph-list.tsx`
  - `apps/web/src/components/TabBar.tsx` → `tab-bar.tsx`
  - `apps/web/src/components/ExportButton.tsx` → `export-button.tsx`
  - `apps/web/src/components/ImportButton.tsx` → `import-button.tsx`
  - `apps/web/src/components/CoordinatesPanel.tsx` → `coordinates-panel.tsx`
  - `packages/editor/src/EditorCanvas.tsx` → `editor-canvas.tsx`
  Identifiers (`EditorPage`, `EditorCanvas`, …) stay PascalCase as before — it's the filename only.
  After renames, update all import paths with a find-and-replace pass.
  - Verify: `bun typecheck` green, `bun test` green, dev server loads.
  - Commit: `refactor: standardize filenames to kebab-case`.

**Phase 1 verification:** `bun test && bun lint && bun --filter '*' typecheck`. Manual: open dev server, list projects, open a project, undo/redo, export OTF — each should behave exactly as before.

---

## Phase 2 — Remove DOM-event state bus, lift services into context (A5, B2, B3, B5)

**Goal:** Delete the `document.dispatchEvent('interrobang:*')` pattern. Promote the starter-glyph factory to `@interrobang/core`. Wrap services in `AppContext`. Move auto-save off module-scope timers and into a proper subscriber owned by `EditorPage`.

**Risk:** medium; touches state management seams.

- [ ] **Step 2.1: Add `createGlyph` to `@interrobang/core`.**
  In `packages/core/src/ops/glyph-ops.ts`, add:
  ```ts
  export interface CreateGlyphInput {
    name: string;
    codepoint: number | null;
    masterId: string;
    /** TODO(components): accept componentRefs here once component editing lands. */
    starter?: 'triangle' | 'empty';
  }

  export function createGlyph(input: CreateGlyphInput): Glyph { /* port from EditorPage.tsx:58–93 */ }
  ```
  Export from `packages/core/src/index.ts`. Add `createGlyph.test.ts` covering the triangle starter and the empty starter.
  - Verify: `bun test --filter @interrobang/core`.
  - Commit: `feat(core): add createGlyph factory`.

- [ ] **Step 2.2: Add `addGlyph` action to `project-store.ts` that uses `createGlyph` + goes through a new command.**
  First, add an `AddGlyphCommand` in `packages/core/src/commands/font-commands.ts` whose `apply` inserts the glyph and `revert` removes it. Declare `affects: [{ kind: 'glyph', id }]` (placeholder — wired fully in Phase 4).
  Then in `stores/project-store.ts`:
  ```ts
  addGlyph(projectId: string, char: string): void { /* use createGlyph, applyCommand(addGlyphCommand) */ }
  ```
  - Touch: `packages/core/src/commands/font-commands.ts`, `apps/web/src/stores/project-store.ts`, add tests.
  - Verify: `bun test`.
  - Commit: `feat(core,web): addGlyph via command`.

- [ ] **Step 2.3: Delete all `CustomEvent` plumbing; call store action directly.**
  - `components/glyph-list.tsx`: `requestNewGlyph` → `useProjectStore.getState().addGlyph(projectId, char)`.
  - `components/editor-shell.tsx`: `requestStarterGlyph` → same, with `char: 'A'`.
  - `pages/editor-page.tsx`: delete the entire `useEffect` that listens for `interrobang:add-*` (`EditorPage.tsx:34–112` today). Page drops to ~55 LOC.
  - Verify: manual — "+ Add glyph" from sidebar and "Add a glyph \"A\"" button from empty state both work.
  - Commit: `refactor(web): remove CustomEvent state bus`.

- [ ] **Step 2.4: Introduce `AppContext` and factory-based services.**
  - Create `apps/web/src/services/create-storage.ts` exporting `createStorage(): Promise<BrowserStorageAdapter>`. Same body as today's `bootstrap()` — no module-scope cache.
  - Create `apps/web/src/services/create-font-io.ts` exporting `createFontIo(): FontIoClient` — thin wrapper around `createFontIoWorker()`.
  - Create `apps/web/src/services/save-loop.ts` exporting a `SaveLoop` class with `schedule(projectId)`, `cancel(projectId)`, `flush()`. Holds its own `Map<string, Timer>` instance-private.
  - Create `apps/web/src/app-context.ts`:
    ```ts
    export interface AppServices {
      storage: Promise<BrowserStorageAdapter>;
      fontIo: FontIoClient;
      saveLoop: SaveLoop;
    }
    export const AppContext = createContext<AppServices | null>(null);
    export function useAppServices(): AppServices { /* throws if null */ }
    ```
  - Create `apps/web/src/app-provider.tsx` that constructs services once and renders `<AppContext.Provider>`.
  - Edit `main.tsx` to wrap `<RouterProvider>` in `<AppProvider>`.
  - Edit callers (`project-picker-page.tsx`, `editor-page.tsx`, `import-button.tsx`, `export-button.tsx`) to `useAppServices()` instead of calling module singletons.
  - Delete `apps/web/src/services/storage.ts` (old singleton). Keep in git history for reference.
  - Verify: `bun test`. Manual: project picker lists projects, new project navigates, editor loads.
  - Commit: `refactor(web): inject services via AppContext`.

- [ ] **Step 2.5: Replace module-scope `scheduleSave` with `use-auto-save.ts` hook.**
  ```ts
  export function useAutoSave(projectId: string): void { /* subscribe to project-store, call saveLoop.schedule on dirty, flush+cancel on unmount */ }
  ```
  In `editor-page.tsx`, replace the `useProjectStore.subscribe` block with `useAutoSave(projectId)`. The lifecycle now matches the component.
  - Touch: `apps/web/src/hooks/use-auto-save.ts` (NEW), `apps/web/src/pages/editor-page.tsx`.
  - Verify: edit a glyph, wait 800ms, confirm DB row updated (watch network panel or re-load). Close tab mid-save — `flush()` triggers on unmount.
  - Commit: `refactor(web): move auto-save into hook`.

- [ ] **Step 2.6: First UI test to prove services are injectable.**
  Create `apps/web/src/pages/project-picker-page.test.tsx` using `@testing-library/react` + a fake `AppServices` where `storage` resolves to a stub `StorageAdapter`. Verify projects render and "New project" navigates.
  - Verify: `bun test` green; the test proves the DI refactor paid off.
  - Commit: `test(web): project-picker smoke test via injected services`.

**Phase 2 verification:** Full app exercised: pick → create → add glyph from sidebar → add glyph from empty state → drag point → undo/redo → export. No `CustomEvent` remains (grep: `document.dispatchEvent` returns zero hits in `apps/web/src/`).

---

## Phase 3 — Editor canvas refactor (B4, A7 partial)

**Goal:** Split `editor-canvas.tsx` into controlled component + hooks. Remove `useImperativeHandle`. Make hit-test, drag, and rendering individually testable.

**Risk:** medium; canvas input is subtle; regression risk on interaction.

- [ ] **Step 3.1: Introduce controlled props on `EditorCanvas`.**
  New props: `glyph: Glyph`, `selection: ReadonlySet<string>`, `tool: Tool`. Keep `onCommitMove`, `onSelectionChange`, `onPenClick`. Delete `initialGlyph`, `EditorCanvasHandle.setGlyph/setSelection/setTool` — parent controls directly.
  `fitToView()` stays as imperative handle (zoom/pan is legitimate ref API).
  `on('liveEdit', cb)` stays — canvas-local event stream that the parent doesn't drive.
  - Touch: `packages/editor/src/editor-canvas.tsx`, `apps/web/src/components/editor-shell.tsx` (becomes the controller), `apps/web/src/components/coordinates-panel.tsx` (handle still used for `on('liveEdit')`).
  - Verify: existing canvas tests pass; manual drag still works.
  - Commit: `refactor(editor): controlled props on EditorCanvas`.

- [ ] **Step 3.2: Extract `use-canvas-size.ts` hook.**
  Owns the ResizeObserver + DPR scaling + `applySize` logic currently in `editor-canvas.tsx:76–119`. Returns `{ ref, size, dpr, viewport }`. Viewport creation moves into the hook.
  - Touch: `packages/editor/src/use-canvas-size.ts` (NEW), `packages/editor/src/editor-canvas.tsx` (consume).
  - Test: `use-canvas-size.test.tsx` using `@testing-library/react` with mocked ResizeObserver.
  - Commit: `refactor(editor): extract use-canvas-size hook`.

- [ ] **Step 3.3: Extract `use-canvas-input.ts` hook.**
  Owns the mouse → hit test → drag-state reducer currently in `editor-canvas.tsx:157–217`. Input:
  ```ts
  useCanvasInput({ canvasRef, viewport, layer, tool, selection, onSelectionChange, onCommitMove, onPenClick, emitLive })
  ```
  Internally uses `useReducer` for drag state instead of ref mutation.
  - Touch: `packages/editor/src/use-canvas-input.ts` (NEW), `editor-canvas.tsx` (consume).
  - Test: `use-canvas-input.test.tsx` — simulate `pointerdown` → `pointermove` → `pointerup` with fake timers, assert `onCommitMove` called with expected dx/dy.
  - Commit: `refactor(editor): extract use-canvas-input hook`.

- [ ] **Step 3.4: Verify `editor-canvas.tsx` is under 120 LOC and contains only layout + wiring.**
  If it isn't, push more into hooks. No logic in the component body beyond refs, memoized selectors, and JSX.
  - Commit: `refactor(editor): thin canvas component`.

**Phase 3 verification:** `bun test` green. Manual: drag points, pen-click to add, undo, zoom-fit on glyph switch, window resize, DPR change (System Settings → Displays). `grep useImperativeHandle packages/editor/src/` returns exactly one hit (`fitToView`).

---

## Phase 4 — Incremental persistence via command → SQL diff (B1)

**Goal:** Each command declares what it mutates; storage applies the minimal SQL. Full `saveFont` stays as an import fallback only.

**Risk:** highest in the plan. The debounced full-rewrite works today; we must not regress correctness. Roll out behind a feature flag in `project-store.ts` so we can flip between diff-mode and rewrite-mode during bake.

**Forward-compat note (components):** `MutationTarget.kind` includes `'component'` from day one, even though no code writes component mutations yet. `apply-mutation.ts` switches on `kind` with a `'component'` branch that throws `Error('NotImplemented: component mutations')`. That way adding component editing later does not require touching the mutation pipeline.

- [ ] **Step 4.1: Add `MutationTarget` type to `@interrobang/core`.**
  ```ts
  // packages/core/src/commands/mutation-target.ts
  export type MutationTarget =
    | { kind: 'meta'; projectId: string }
    | { kind: 'glyph'; glyphId: string }
    | { kind: 'layer'; glyphId: string; layerId: string }
    | { kind: 'kerning'; leftGlyph: string; rightGlyph: string }
    // TODO(components): component mutations land here.
    | { kind: 'component'; componentId: string };
  ```
  Export from `packages/core/src/index.ts`.
  - Commit: `feat(core): MutationTarget type`.

- [ ] **Step 4.2: Extend `Command<T>` with an `affects: readonly MutationTarget[]` field.**
  In `packages/core/src/commands/command.ts`. Default `[]` for back-compat. Update `UndoRedoStack.apply` to propagate unchanged.
  - Commit: `feat(core): commands carry affects[]`.

- [ ] **Step 4.3: Fill in `affects` for each existing command in `font-commands.ts`.**
  - `movePointsCommand` → `[{ kind: 'layer', glyphId, layerId }]`.
  - `insertPointCommand`, `removePointCommand`, `convertPointTypeCommand` → same.
  - `addGlyphCommand` (from Phase 2) → `[{ kind: 'glyph', glyphId }]` + a `[{ kind: 'layer', ... }]` for each layer.
  - Tests: extend `font-commands.test.ts` to assert `affects` is populated correctly.
  - Commit: `feat(core): commands declare affected rows`.

- [ ] **Step 4.4: Add `StorageAdapter.applyMutation(projectId, target, font)` to `adapter.ts`.**
  ```ts
  interface StorageAdapter {
    applyMutation(projectId: string, target: MutationTarget, font: Font): Promise<void>;
    /* saveFont retained — used by import + component-change fan-out later */
  }
  ```
  - Commit: `feat(storage): applyMutation on adapter`.

- [ ] **Step 4.5: Implement `apply-mutation.ts` for `BrowserStorageAdapter`.**
  File: `packages/storage/src/browser/apply-mutation.ts`. Exports `applyMutation(db, projectId, target, font)`. Switch on `target.kind`:
  - `'meta'` → single `UPDATE font_meta`.
  - `'glyph'` → `INSERT ... ON CONFLICT DO UPDATE` into `glyphs` + replace that glyph's layers only.
  - `'layer'` → `INSERT ... ON CONFLICT DO UPDATE` into `layers` for one row.
  - `'kerning'` → upsert the single pair.
  - `'component'` → `throw new Error('NotImplemented: component mutations — tracked for future components feature')`.
  All wrapped in a single `BEGIN/COMMIT`.
  - Tests: extend `browser-adapter.test.ts` to call `applyMutation` for each kind, then `loadFont` and assert the resulting font equals the expected.
  - Commit: `feat(storage): applyMutation SQL plan`.

- [ ] **Step 4.6: Rewire `project-store.applyCommand` to use `applyMutation` + a feature flag.**
  Flag: `const INCREMENTAL_SAVE = true;` constant at top of `project-store.ts`.
  When `true`: after `applyCommand` mutates state, call `saveLoop.scheduleMutations(projectId, cmd.affects)`. The save-loop change:
  - Accumulates `Set<MutationTarget>` per project over the debounce window.
  - On flush: for each unique target, calls `storage.applyMutation(projectId, target, currentFont)`.
  - `markClean(projectId)` only after all mutations succeed.
  When `false`: fall back to the current `saveFont` path.
  - Touch: `apps/web/src/stores/project-store.ts`, `apps/web/src/services/save-loop.ts`.
  - Tests: extend `project-picker-page.test.tsx` or add a new `save-loop.test.ts` with a fake `StorageAdapter` that records calls; assert that after a drag-commit only `layer` mutations are scheduled, not a full rewrite.
  - Commit: `feat(web): drive auto-save with command diffs`.

- [ ] **Step 4.7: Keep `saveFont` for import.**
  `ImportButton` already calls `storage.saveFont` after parsing — leave that path unchanged. Annotate `saveFont` as "whole-font upsert; prefer `applyMutation`".
  - Commit: `docs(storage): document saveFont as import path`.

**Phase 4 verification:**
- `bun test` green (unit + integration).
- Manual: drag a point → observe only UPDATE on `layers` (enable SQLite trace in `sqlite-worker.ts` temporarily if needed). Drag 10 points across 2 layers within debounce window → two UPDATEs, no DELETE/INSERT storm. Close + re-open browser → font round-trips.
- Flag flip: set `INCREMENTAL_SAVE = false`, repeat — same manual test passes with old path, confirming fallback is healthy.

---

## Phase 5 — Storage polish (B7, B8, B9)

**Goal:** Version the JSON blobs, lean on Drizzle for READ paths, replace linear `MIGRATION_VERSION` with a `schema_versions` table. Scaffold `components` and `component_refs` tables without wiring them yet.

- [ ] **Step 5.1: Version layer JSON blobs.**
  Update `serialize.ts`:
  ```ts
  const BLOB_VERSION = 1;
  export function serializeLayer(l: Layer): LayerRowBlobs {
    return {
      contoursJson: JSON.stringify({ v: BLOB_VERSION, data: l.contours }),
      componentsJson: JSON.stringify({ v: BLOB_VERSION, data: l.components }),
      anchorsJson: JSON.stringify({ v: BLOB_VERSION, data: l.anchors }),
    };
  }
  export function deserializeLayer(row: LayerRow): Layer {
    /* parse; if parsed has no 'v' key, treat as v0 and read root as data */
  }
  ```
  Tests: round-trip a v0 blob through deserialize → serialize and confirm it comes out v1.
  - Commit: `feat(storage): version layer JSON blobs`.

- [ ] **Step 5.2: Introduce `schema_versions` table via migration 0001.**
  `packages/schema/migrations/0001_schema_versions.sql`:
  ```sql
  CREATE TABLE schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
  INSERT INTO schema_versions(version, applied_at) VALUES (0, 0);
  ```
  Add table def in `tables.ts`. Update `packages/storage/src/migrations.ts` to drive from `schema_versions` rows, applying each missing migration file in order instead of checking a single `MIGRATION_VERSION`.
  Mark `MIGRATION_VERSION` as deprecated (still exported) for one cycle.
  - Commit: `feat(schema): per-migration schema_versions table`.

- [ ] **Step 5.3: Scaffold `components` + `component_refs` tables in migration 0002.**
  Content:
  ```sql
  CREATE TABLE components (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    layer_json TEXT NOT NULL -- { v:1, data: Layer }
  );
  CREATE TABLE component_refs (
    glyph_id TEXT NOT NULL REFERENCES glyphs(id) ON DELETE CASCADE,
    layer_id TEXT NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
    component_id TEXT NOT NULL REFERENCES components(id) ON DELETE RESTRICT,
    PRIMARY KEY (glyph_id, layer_id, component_id)
  );
  CREATE INDEX component_refs_by_component ON component_refs(component_id);
  ```
  Add Drizzle table defs but **do not** wire reads/writes yet. Add file `packages/storage/src/browser/component-refs.ts` with a TODO skeleton only.
  This is the forward-compat down-payment the user asked for.
  - Commit: `feat(schema): scaffold components tables (not yet wired)`.

- [ ] **Step 5.4: Switch adapter READ paths to Drizzle query builder (D2 accepted).**
  `BrowserStorageAdapter.loadFont` and `listProjects` rewritten using Drizzle select. The wa-sqlite driver already satisfies Drizzle's `BaseSQLiteDatabase` shape — wire via `drizzle-orm/sqlite-proxy` pointing at `db.query`.
  Writes stay as hand SQL.
  - Tests: existing `browser-adapter.test.ts` covers both — no new tests needed, the old ones must still pass.
  - Commit: `refactor(storage): typed reads via Drizzle`.

**Phase 5 verification:** `bun test`. Manual: create a new project (hits migrations 0000–0002), open and edit. Old project opened from before migration 0002 — should migrate forward without re-creating.

---

## Phase 6 — Package surface (B10, B11)

**Goal:** `exports` + `dist/` per workspace package; metrics bag on `FontMeta`. These are safety moves for the first external integration or publish.

- [ ] **Step 6.1: Add `tsup` as a dev-dep at the root, emit `dist/{index.js,index.d.ts}` for each package.**
  Each package gains:
  ```json
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": { "build": "tsup src/index.ts --dts --format esm" }
  ```
  Root `turbo.json` or a top-level `bun --filter '*' build` before lint in CI.
  - Verify: `bun --filter '*' build` produces `dist/`. A manual `node -e "import('@interrobang/core').then(console.log)"` resolves the new path.
  - Commit: `build: emit dist/ + package.json#exports per package`.

- [ ] **Step 6.2: Refactor `FontMeta` to include a metrics bag.**
  In `packages/core/src/font.ts`:
  ```ts
  export interface FontMeta {
    familyName: string;
    styleName: string;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    capHeight: number;
    xHeight: number;
    /** Additional script-specific metrics (e.g. ideographicTop, hangingBaseline). */
    extraMetrics?: Record<string, number>;
  }
  ```
  `font-io` reads/writes `extraMetrics` opaquely (opentype.js exposes them on OS/2 and hhea). `schema/tables.ts` adds `extra_metrics_json TEXT` to `font_meta`. Migration 0003 adds the column with `DEFAULT NULL`.
  - Tests: round-trip a font with extra metrics.
  - Commit: `feat(core,storage): extensible font metrics`.

**Phase 6 verification:** `bun --filter '*' build` green. Round-trip import/export of the existing OTF fixture still produces byte-equivalent output modulo metric fields.

---

## Phase 7 — Documentation + TODO seeding

- [ ] **Step 7.1: Update `README.md` with new architecture summary** — commands drive persistence, services via context, upcoming components feature.

- [ ] **Step 7.2: Drop TODO markers** at the sites where the components feature will extend:
  - `apps/web/src/stores/project-store.ts` — near `addGlyph`, `// TODO(components): addComponent(projectId, name, layer) parallel to addGlyph`.
  - `packages/core/src/commands/font-commands.ts` — `// TODO(components): editComponentCommand, referenceComponentCommand`.
  - `packages/storage/src/browser/apply-mutation.ts` — the `'component'` branch already throws with a TODO message.
  - `packages/storage/src/browser/component-refs.ts` — file-level TODO.
  These are the breadcrumbs for whoever picks components up next.

- [ ] **Step 7.3: Add a migration log.** `docs/superpowers/plans/2026-04-19-maintainability-rfc.md` — a short post-mortem table of what shipped per phase, referenced from `README.md`.

- [ ] **Step 7.4: Final grep for debt.**
  ```
  grep -r "document.dispatchEvent\|interrobang:add-\|useImperativeHandle\|MIGRATION_VERSION\b" apps/web packages
  ```
  Expected: zero hits except the deprecated `MIGRATION_VERSION` export (with a deprecation comment) and the `fitToView` useImperativeHandle in `editor-canvas.tsx`.

- [ ] **Step 7.5: Final commit.** `chore: close maintainability RFC — phase 7`.

---

## Global verification

Run before opening a PR:

```
bun install
bun format
bun lint
bun --filter '*' typecheck
bun --filter '*' build
bun test
```

All green.

Manual golden path, end-to-end:

1. Fresh browser profile → `/` shows empty project list.
2. "New project" → editor opens with empty state + "Add a glyph \"A\"".
3. Add glyph → triangle renders, GlyphList updates.
4. Drag a point → canvas updates live, coordinates panel shows Δx/Δy.
5. Release → 800ms later SQLite shows one UPDATE on `layers` (trace via dev tools).
6. ⌘Z → undo works. ⌘⇧Z → redo works.
7. Open a second glyph from sidebar → canvas fits to it.
8. Close tab, reopen → font loads from SQLite, no data loss.
9. Second tab on `/` → shows "Already open in another tab".
10. Export OTF → downloads; re-import in a new project → same glyphs.

---

## Risks & rollback

- **Phase 4 (incremental save) is the highest-risk commit.** The feature flag in Step 4.6 lets you flip back to `saveFont`-rewrite mode without a revert. Keep the flag in place for one release cycle.
- **Phase 5.4 (Drizzle reads) could regress type inference.** If the wa-sqlite proxy shape mismatch bites, revert that step only — the migration_versions + component scaffolding in 5.2/5.3 stand alone.
- **Phase 6 adds `dist/` artifacts.** If Bun's workspace resolver misbehaves with `exports`, remove the `exports` field and keep `main: src/index.ts`. Keep the build script — it's cheap insurance.
- **Renaming files in Phase 1.5 touches ~15 files.** Use `git mv` per file to preserve history; do not bulk-copy.
- **Cumulative risk is bounded because every phase ends in a commit with a green suite.** At any phase boundary you can ship what's there.

---

## Estimated effort

Rough worker-hours; skilled dev with AI assistance:

| Phase | Hours | Cumulative |
|---|---|---|
| 0 | 0.25 | 0.25 |
| 1 | 2.5 (incl. oxc migration) | 2.75 |
| 2 | 4 | 6.75 |
| 3 | 4 | 10.75 |
| 4 | 6 | 16.75 |
| 5 | 4 | 20.75 |
| 6 | 2 | 22.75 |
| 7 | 1 | 23.75 |

About three focused days end-to-end. You could reasonably ship after Phase 2 and resume later — phases 1-2 alone deliver most of the legibility win.
