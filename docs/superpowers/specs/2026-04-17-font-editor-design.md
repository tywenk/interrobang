# Interrobang — Font Editor Design

**Date:** 2026-04-17
**Status:** Design
**Owner:** Tywen

## Overview

Interrobang is a browser-first font editor in the spirit of Glyphs, focused on outline editing of Latin + symbols with full OTF/TTF and UFO round-trip. It is local-first: the canonical state lives in an embedded SQLite database in the user's browser via OPFS, and an optional lightweight Bun server provides asynchronous backup and cross-device restore. The full client and server are TypeScript; runtime is Bun. The system is designed so that the same client bundle can later be wrapped in Electron without changes to the UI, editor, or domain code.

## Scope

**In scope (v1):**

- Outline editor for static glyphs: draw, edit, transform contours; on/off-curve points; bezier handles; component instances; anchors.
- Latin + symbols range; font metrics; glyph spacing; basic kerning pairs.
- Read OTF/TTF, edit, write OTF/TTF.
- Read UFO directories, edit, write UFO directories.
- Multi-document — open multiple projects simultaneously via in-app tabs.
- Undo/redo via command pattern.
- Local-first: app is fully usable without an account.
- Optional cloud backup via sign-in (magic link); async push of revisions to a Bun server.

**Explicit non-goals (v1):**

- Variable fonts / interpolation / multi-master.
- Color fonts (COLR/CPAL, sbix, SVG).
- OpenType layout features beyond simple kerning (no GSUB feature compilation, no contextual lookups).
- Complex scripts (Arabic, Indic, CJK).
- Real-time multi-user collaboration. Sync is single-writer per project; cross-device is last-writer-wins with explicit prompt.
- SSR. The client is a static SPA.
- Mobile / touch-first UX.

## High-level topology

```
┌─────────────────────────────────────────────────────────┐
│ Client (browser today, Electron later)                  │
│                                                         │
│  React UI (TanStack Router, SPA)                        │
│  ↕                                                      │
│  Editor surface (Canvas 2D, imperative leaf)            │
│  ↕                                                      │
│  Domain core (pure TS, no I/O)                          │
│  ↕──── Worker boundary ────────────────────────────     │
│  Font I/O   Local store          Sync engine            │
│  (worker)   (wa-sqlite, OPFS)    (worker)               │
└─────────────────────────────────────────────────────────┘
                          ↕  HTTPS · session cookie
                          ↕  (only when signed in)
┌─────────────────────────────────────────────────────────┐
│ Server                                                  │
│  Bun + Hono                                             │
│  better-auth (magic link)                               │
│  Drizzle + bun:sqlite                                   │
│  Litestream → S3/R2                                     │
└─────────────────────────────────────────────────────────┘
```

The portability boundary is two adapters: the **app shell** (entry point, eventual native menus/windows) and the **storage adapter** (browser SQLite-WASM today, native SQLite under Electron). Everything else — UI, editor, domain, font I/O, sync — is the same code in both.

## Repository layout

Bun workspace.

```
interrobang/
  apps/
    web/                # React SPA, TanStack Router, built with Bun,
                        # Tailwind CSS + shadcn/ui (Base UI primitives)
    server/             # Bun + Hono + Drizzle + better-auth
  packages/
    schema/             # Drizzle schema (server runtime), inferred TS types,
                        # drizzle-kit-generated DDL files (consumed by client)
    core/               # Domain model + outline ops (pure TS)
    font-io/            # opentype.js wrappers + UFO read/write (worker-friendly)
    editor/             # Canvas 2D React component
    storage/            # Storage adapter interface + browser impl
    sync/               # Client sync engine
  docs/
    superpowers/specs/  # This spec lives here
```

## Client architecture

### App shell

Static SPA served from any static host. Single entry point in `apps/web/src/main.tsx`. Bun-built bundle. PWA manifest so the user can "Install" — but no service-worker offline caching in v1 (the data path is OPFS, not network).

### Routing — TanStack Router

- `/` — Project Picker (lists local projects, recently opened first).
- `/project/:projectId` — Editor for one project; the URL encodes the *currently visible* project. Open projects (the tab bar) are app state, not URL state.
- `/account` — Sign-in / sign-out / sync status (only meaningful if signed in).

No SSR. No data loaders that fetch — the data source is local SQLite, accessed via the storage adapter.

### React UI chrome

Built with **shadcn/ui** on **Base UI** primitives (not Radix), styled with **Tailwind CSS**. Style preset `new-york`, default dark mode (this is a tools-and-dashboards-shaped product). Components are added directly to the codebase via the shadcn CLI:

```bash
# One-time, non-interactive
npx shadcn@latest init -d --base base-ui

# Add components as needed
npx shadcn@latest add button dialog dropdown-menu input label \
  separator sheet tabs tooltip command popover scroll-area
```

Standard React tree owns:

- Project Picker
- Tab bar across the top of the editor (one tab per open project; click to switch active project)
- Side panels (glyph list, layers, info, kerning)
- Toolbar
- Menus
- Modal dialogs (export, sign-in, settings)
- Sync-status indicator

State management: Zustand stores keyed per-project. React owns:

- Which project is active (URL-driven)
- Which projects are open (tab bar)
- Selection IDs (currently selected glyph, selected points by ID)
- Tool state (pen vs select vs zoom)
- Async UI state (sync status, dialog open/closed)

React does **not** own per-frame editor state.

### Editor surface — Canvas 2D

A single `<canvas>` React component (`<EditorCanvas project={...} glyphId={...} />`) owns:

- Render loop (`requestAnimationFrame`)
- Pan / zoom transform
- Hit testing
- Hover, drag, marquee, in-progress edit transient state
- Custom overlays (alignment guides, metric lines, neighbor glyphs)

The canvas exposes an imperative API via ref: `commitEdit()`, `cancelEdit()`, `setActiveGlyph()`, `setTool()`, etc. It subscribes to the active glyph from the project store; when committed edits land, the canvas calls back into the domain core's mutation functions, which write to the local store.

**Anti-pattern to avoid:** routing per-pixel mouse-move events through React state. The canvas is a leaf with imperative internals; React only sees committed changes.

### Canvas ↔ UI protocol — three channels

Three sources of state, three communication channels. The single rule that makes this work: **transient editor state never goes through Zustand and never goes through React state.** It lives in canvas-internal fields. Only *committed* edits cross into the model.

#### State ownership

- **UI / React** owns *intent*: which doc is active, which tool, selection IDs, async UI state. Lives in Zustand stores.
- **Canvas** owns *transient*: drag in progress, hover, marquee, pan/zoom, hit testing, in-progress previews. Lives in canvas-internal class state.
- **Domain model** owns *truth*: hydrated `Font` objects per open project, persisted to SQLite via the storage adapter.

#### Channel ① Domain channel — Model → UI / Canvas

"The model changed." Both React and the canvas subscribe to the project store. The canvas subscribes once at mount and triggers a redraw on next `requestAnimationFrame`; React selectors only fire for the components that read them.

```ts
// Canvas subscribes once at mount
projectStore.subscribe(
  state => state.font.glyphs[activeGlyphId],
  glyph => canvas.setGlyph(glyph)
)
```

#### Channel ② Intent channel — UI → Canvas

"User picked a tool / selected these points / changed grid settings." React-owned state in `editorStore`. The canvas subscribes at mount and updates its internal mode without re-rendering.

```ts
// React writes
editorStore.setState({ tool: 'pen' })

// Canvas reads via subscription
editorStore.subscribe(s => s.tool, tool => canvas.setTool(tool))
```

#### Channel ③ Live-edit channel — Canvas → UI

"User is mid-drag right now, here's the live position." A canvas-owned event emitter. Specific UI panels (e.g., the coordinates readout) subscribe and update their *local* component state. **Never written to the model** — committed only on mouse-up.

```ts
canvas.on('liveEdit', e => setLiveCoords(e.snapped))
```

#### EditorCanvas component contract

```ts
interface EditorCanvasProps {
  projectId: ProjectId;     // looks up the right stores
  glyphId: GlyphId;         // which glyph is active
  // no `glyph` prop — canvas pulls from the store on mount and via channel ①
  // no `selection` prop — canvas reads from editorStore via channel ②
}

interface EditorCanvasHandle {
  fitToView(): void;
  zoomTo(scale: number): void;
  centerOn(x: number, y: number): void;
  exportPNG(): Promise<Blob>;
  on(event: 'liveEdit', cb: (e: LiveEditEvent) => void): Unsubscribe;
}
```

The JSX is literally `<canvas ref={canvasRef} className="editor-canvas" />` — never re-renders unless `projectId`/`glyphId` change.

#### Lifecycles — what happens for each kind of interaction

**A. User drags a point on the canvas**

1. Canvas mousedown: hit-test, capture point ID, enter `dragging` mode (canvas-internal).
2. Each mousemove: canvas computes new position, redraws on next rAF, emits `liveEdit` on channel ③ (coordinates panel updates locally).
3. Mouseup: canvas builds a `MovePointsCommand`, calls `applyCommand(projectId, cmd)`.
4. Project store applies command to in-memory `Font`, queues SQLite write, pushes onto undo stack, notifies channel ①.
5. Channel ① fires: canvas's own subscriber receives the new glyph; UI components that show the glyph re-render.

**B. User clicks "Convert to corner" in a sidebar panel**

1. React onClick handler reads selected point IDs from `editorStore`.
2. Builds `ConvertCurveTypeCommand`, calls `applyCommand(projectId, cmd)`.
3. Same path as A from step 4.

**C. User picks the Pen tool**

1. React onClick → `editorStore.setState({ tool: 'pen' })`.
2. Canvas's intent-channel subscriber fires, sets `this.activeTool = 'pen'`.
3. No redraw needed unless cursor or guides change.

**D. Sync worker pulls remote changes**

1. Sync worker writes rows to SQLite, returns a "changed rows" summary.
2. Project store re-hydrates affected glyphs from SQLite, replacing entries in the in-memory `Font`.
3. Channel ① fires — UI and canvas redraw.

#### Why three channels and not one big store

Putting transient state into the project store would make every mouse-move event a Zustand update — fine in isolation, but accumulating many subscribers means React panels re-rendering 60 times a second during a drag. The live-edit channel is a direct emitter, so only the panels that *want* live updates pay for them, and they pay via local component state, not store updates. The intent channel stays in Zustand because it changes rarely and React panels legitimately need to re-render when it changes.

### Domain core (`packages/core`)

Pure TypeScript, zero I/O dependencies. Types:

- `Font` — top-level container (metadata, masters, kerning, features, glyph map).
- `Master` — one set of designs (single master in v1; future variable-font extension point).
- `Glyph` — a named glyph (`A`, `period`); contains layers (one per master), advance width, anchors, components.
- `Layer` — outlines for one (glyph, master) pair.
- `Contour` — closed/open path; ordered list of `Point`.
- `Point` — `{x, y, type: 'on' | 'off', smooth: boolean}`.
- `Component` — instance of another glyph with a transform.
- `Anchor` — named point used for diacritic positioning.
- `KerningPair` — `(left, right) → adjustment`.

Operations are pure functions: `insertPoint(contour, index, point) → contour`, `convertCurveType(contour, pointIndex, type)`, `transformPoints(layer, ids, matrix)`, `unionContours(a, b)`, etc. No mutation in place; new objects returned.

Domain core is the most-tested module in the codebase.

### Font I/O (`packages/font-io`)

Runs in a dedicated Web Worker. The main thread asks the worker to parse or compile; the worker returns plain serializable objects.

- **OTF/TTF**: `opentype.js` for both read and write. Pure JS. Limits acknowledged: no variable fonts, no advanced OpenType — fine for v1 scope.
- **UFO**: hand-rolled parser/emitter. UFO is a directory of XML plists with a documented spec (UFO v3). Estimated ~300 LOC. Uses a DOM-style XML parser available in workers.
- **Glyph image rendering for tile previews**: a small utility renders a glyph outline to an `OffscreenCanvas` for the font-window grid.

### Local store — wa-sqlite + OPFSCoopSyncVFS (`packages/storage`)

Runs in its own Web Worker (separate from font I/O so heavy parses don't queue up behind reads).

- Library: **`wa-sqlite`** (third-party SQLite-WASM build).
- VFS: **`OPFSCoopSyncVFS`** — OPFS-backed, synchronous access handles, no SharedArrayBuffer requirement, no COOP/COEP headers needed.
- Fallback: **`IDBBatchAtomicVFS`** automatically used when OPFS is unavailable (Safari incognito mode primarily).

Schema is near-identical to the server (see Schema section below) — the only difference is that server tables carry a `user_id` column that the client schema omits. DDL is generated by `drizzle-kit` in `packages/schema` and bundled as static SQL files. At init, the worker runs `PRAGMA user_version`-driven migrations, applying any DDL files newer than the stored version.

The worker exposes a small RPC surface (postMessage with comlink-style wrapping) that returns rows. Main-thread code uses raw prepared SQL with parameter binding. Type safety comes from `InferSelectModel<typeof schema.glyphs>` etc., re-exported from `packages/schema`.

#### Storage adapter interface (`packages/storage`)

```typescript
interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<ProjectId>;
  openProject(id: ProjectId): Promise<ProjectHandle>;
  deleteProject(id: ProjectId): Promise<void>;

  // Inside a ProjectHandle:
  loadGlyphs(): Promise<Glyph[]>;
  saveGlyph(glyph: Glyph): Promise<Revision>;
  loadFontMeta(): Promise<FontMeta>;
  saveFontMeta(meta: FontMeta): Promise<Revision>;
  loadKerning(): Promise<KerningPair[]>;
  saveKerningPair(pair: KerningPair): Promise<Revision>;

  // Binary blobs (e.g., embedded original TTF for re-export):
  readBlob(key: string): Promise<Uint8Array | null>;
  writeBlob(key: string, bytes: Uint8Array): Promise<void>;

  // Used by the sync engine:
  changesSince(revision: Revision): AsyncIterable<ChangeRow>;
  applyRemoteChanges(rows: ChangeRow[]): Promise<void>;
}
```

The browser implementation lives in `packages/storage/browser`. A future Electron implementation in `packages/storage/electron` will use `bun:sqlite` (or `better-sqlite3`) over node:fs and present the same interface.

### Multi-document

- Multiple projects can be open at once via an in-app tab bar.
- Each open project = an in-memory `ProjectHandle` plus its hydrated `Font` object. Glyphs are loaded lazily as the user navigates.
- Active project = whichever project's `id` is in the URL.
- Closing a tab discards the in-memory state; the SQLite copy stays untouched.
- Memory budget: 5–10 open projects per browser tab is comfortable. Each project ~100KB–2MB in memory at scope A.
- **Single-tab DB lock**: OPFSCoopSyncVFS is one writer per database per tab. Within one tab, multiple open projects share one SQLite connection in one worker — no problem. Across tabs, opening the app in two tabs would race for the lock; we use a `BroadcastChannel` to detect this and show a "this app is already open in another tab — switch back" message in the second tab. (Becomes a non-issue under Electron with one process owning the DB.)

### Undo/redo — command pattern

- Each user-visible edit produces a `Command` with `apply()` and `revert()` methods.
- Commands compose: a multi-point drag is one command; rapid repeated commands of the same type within a short window collapse (e.g., continuous drag emits one command on mouse-up).
- One history stack per project (not per glyph). Stack scope rationale: cross-glyph operations like "shift sidebearings of all selected glyphs" must be a single undo step.
- Stack capped at 200 commands per project; older commands dropped.
- History is **in-memory only**, not persisted to SQLite. Closing a project clears its history.

## Server architecture (`apps/server`)

Optional infrastructure. App is fully usable offline; signing in only enables backup.

### Stack

- **Bun** runtime.
- **Hono** for HTTP. Tiny surface: see endpoints below.
- **bun:sqlite** for storage (Bun-native, no FFI).
- **Drizzle** for schema and queries (server-side runtime, no client runtime).
- **better-auth** for authentication (magic link only).

### Endpoints

```
POST  /auth/sign-in/magic-link    — better-auth
GET   /auth/verify                — better-auth (link target)
POST  /auth/sign-out              — better-auth
GET   /auth/session               — better-auth (returns current user or 401)

GET   /projects                   — list user's server-known projects
POST  /sync/push                  — body: { projectId, since: revision, changes: ChangeRow[] }
GET   /sync/pull?projectId=&since=  — returns server changes since a revision
DELETE /projects/:id              — delete server-side copy (local copy untouched)
```

All sync routes require an authenticated session.

### Hosting

- **Fly.io** or a small VPS for the server (one process; embedded SQLite needs a long-lived host).
- **Litestream** streams the SQLite WAL to S3/R2 for off-host durability.
- Static SPA bundle served from anywhere — Vercel/Cloudflare Pages/GH Pages all fine.
- Skip Vercel Functions for the API tier (stateless serverless fights embedded SQLite).

## Schema (shared)

Defined once in `packages/schema/index.ts` using Drizzle. Used:

- At server runtime via Drizzle.
- As inferred TS types via `InferSelectModel` / `InferInsertModel` on both sides.
- Compiled to SQL DDL via `drizzle-kit generate`; the DDL files ship to the client and run at SQLite-WASM init.

Top-level tables (single-tenant on the client; multi-tenant via `user_id` column on the server):

```
users               (server only — id, email, created_at, …)
projects            (id, owner_id?, name, created_at, updated_at, revision)
font_meta           (project_id, family_name, style_name, units_per_em, ascender, descender, …)
masters             (id, project_id, name, weight, width, …)         -- one row in v1
glyphs              (id, project_id, name, advance_width, unicode_codepoint?, revision)
layers              (id, glyph_id, master_id, contours_json, components_json, anchors_json)
kerning_pairs       (project_id, left, right, value, revision)
features            (project_id, tag, source)                         -- bare for v1
project_blobs       (project_id, key, bytes BLOB)                     -- e.g. original TTF
sync_log            (project_id, table_name, row_id, revision, op, payload)  -- client-only
```

`revision` is a per-project monotonic integer maintained client-side. Every committed mutation increments it and writes a `sync_log` row.

`contours`, `components`, and `anchors` for a layer are stored as JSON columns rather than nested tables. Trade-off: simpler reads/writes (one row per layer) and the editor always operates on a whole layer at a time anyway. We can normalize later if a query need appears.

## Sync engine (`packages/sync`)

Runs in its own worker. Activates only when a user is signed in.

### Model — revision-based, single-writer

- Each project has a local `revision` counter.
- Every write increments `revision` and inserts a `sync_log` row recording the changed row.
- The sync engine reads `sync_log` rows past `last_synced_revision`, batches them, and pushes via `POST /sync/push`.
- Server returns its new `revision` for that project; client records `last_synced_revision`.
- For cross-device restore: client calls `GET /sync/pull` and applies returned rows into local SQLite, replacing the project's tables.

### Conflict policy — last-writer-wins with explicit prompt

When a client opens a project that has unsynced local changes AND the server has a higher revision (i.e. another device synced more recently):

- Show modal: "This project was edited on another device on YYYY-MM-DD. Keep your local changes, or load the latest from the server (your local changes will be discarded)?"
- No automatic merge in v1. Add CRDT/operational-merge later if multi-device editing becomes common.

### Sync triggers

- On idle: 5 seconds after the last write, if there are unsynced rows.
- On window blur / tab hidden.
- On manual "Sync now" button in the sync-status indicator.
- Backoff on failure: 1s, 5s, 30s, 5min — then wait for next trigger.

## Error handling

Errors are not silently swallowed. The sync indicator surfaces sync failures with a clickable "details" link. Editor errors (invalid SQL, OPFS quota exceeded, font compilation failure) bubble to a top-level error toast and are logged to the console with full context.

Specific cases:

- **OPFS quota exceeded**: surface a modal explaining browser storage limits; offer "free up space" by pointing to the Project Picker delete UI.
- **Single-tab lock collision**: detect at startup via BroadcastChannel; show a blocking screen in the second tab.
- **Safari incognito (no OPFS)**: the storage worker auto-falls back to IDBBatchAtomicVFS. Show a one-time banner: "Storage is reduced in private browsing — your work won't persist after closing this window."
- **Network failure during sync**: backoff retry; never lose local data.
- **Magic-link verification failure**: standard better-auth handling; user can request a new link.
- **Schema migration failure on the client**: refuse to open the project; show technical details and a "report issue" link. (This is unlikely to recover automatically.)

## Testing

- **Unit tests** (Bun test runner): domain core operations, font I/O parsers, sync engine state machine, undo/redo command composition.
- **Integration tests**: storage adapter against a real wa-sqlite instance in a Node/Bun environment using the `node` VFS variant; sync engine against a real server instance.
- **End-to-end tests** (Playwright): editor flows — create project, draw a glyph, export OTF, re-import OTF, undo/redo, multi-document tab switching.
- **Round-trip tests**: take a corpus of public-domain UFO and OTF/TTF files; import → save → re-export → diff. Tolerated diffs are documented; unexpected diffs fail.

## Bundle size budget

- Initial client bundle (HTML, CSS, JS): **<400KB gzipped** for first paint of the Project Picker.
- wa-sqlite WASM: **~1.5MB**, lazy-loaded when the user opens a project.
- opentype.js: **~120KB**, lazy-loaded inside the font-io worker, only when a project's first import/export happens.

## Performance targets

- Project Picker → editor open in <1s on a mid-2020 laptop.
- Pan/zoom/drag at 60fps on a glyph with up to 500 points.
- Font window grid (200 glyph tiles) renders in <200ms.
- OTF/TTF parse for a 1MB font in <500ms (worker, off main thread).

## Open questions / explicit deferrals

- **Telemetry / crash reporting**: out of v1 scope. Decision deferred.
- **Public sharing of fonts** (e.g., a "share this glyph as a link"): not v1.
- **Server multi-region**: single-region for v1.
- **Drizzle migrations vs hand-written DDL files for the client**: spec says we use `drizzle-kit`-generated files. If `drizzle-kit` output proves awkward to ship to the browser, fallback is hand-written `migrations/NNNN_description.sql` files maintained alongside the schema.
- **Authentication providers beyond magic link**: deferred. Magic link covers v1.
- **Custom font preview text in the editor**: yes, planned, but the input UI is a v1 polish task — see implementation plan.
