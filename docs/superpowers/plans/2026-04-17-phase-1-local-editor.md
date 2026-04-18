# Interrobang Phase 1 — Local-Only Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working browser-based font editor — no server, no auth, no sync — that lets a user create a project, draw a glyph, save locally to OPFS-backed SQLite, and round-trip OTF/TTF/UFO.

**Architecture:** Bun workspace. Five packages (`schema`, `core`, `font-io`, `storage`, `editor`) and one app (`apps/web`). Local-first: canonical state in browser SQLite (wa-sqlite OPFSCoopSyncVFS, in a worker). React SPA with TanStack Router. Canvas 2D editor as a React leaf with imperative internals communicating with React via three channels (domain, intent, live-edit).

**Tech Stack:** TypeScript 5.6+, Bun 1.1+, React 19, TanStack Router, shadcn/ui (Base UI primitives), Tailwind CSS v4, Zustand, Canvas 2D, opentype.js, wa-sqlite, Drizzle ORM, Biome.

---

## Plan scope and staging

This plan covers **Phase 1 only** — a working local-only editor.

Phases 2 and 3 will become their own plans once Phase 1 ships:
- **Phase 2 plan:** server tier (Bun + Hono + Drizzle + bun:sqlite), better-auth (magic link), client sync engine (`packages/sync`), Fly.io + Litestream deployment.
- **Phase 3 plan:** round-trip test corpus, performance budget enforcement, Playwright E2E for golden paths, Electron shell.

Phase 1 alone is demoable: open the app, create a project, draw a glyph, save, export OTF, re-import. That's the deliverable.

The spec at `docs/superpowers/specs/2026-04-17-font-editor-design.md` is the source of truth — refer to it for context, types, and rationale that this plan does not repeat.

## Conventions

- **Tests:** `bun test` for everything. Pure-TS modules use plain assertions. Components use `happy-dom` (preloaded via `bunfig.toml`) + `@testing-library/react`.
- **Lint/format:** Biome. One config at the workspace root.
- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`. Module resolution `Bundler`. JSX `react-jsx`.
- **Commits:** conventional commits (`feat:`, `chore:`, `test:`, `fix:`, `refactor:`). One commit per task. Tasks land in plan order on `main` directly (greenfield, no branch protection yet — Phase 3 will add CI).
- **Files:** kebab-case filenames. One responsibility per file. No barrel files (`index.ts` re-exports) inside `src/` — explicit imports only. Workspace package `index.ts` files are the public surface.
- **Naming:** types in PascalCase, values in camelCase. Domain types live in `core`. UI types live in their consuming package.

---

## Phase 0 — Foundations

### Task 0.1: Initialize Bun workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `biome.json`

- [ ] **Step 1: Init root package.json**

```json
{
  "name": "interrobang",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "bun test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "bun --filter '*' typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Root tsconfig.json (base for packages to extend)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowJs": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": true
  },
  "exclude": ["**/node_modules", "**/dist"]
}
```

- [ ] **Step 3: bunfig.toml**

```toml
[install]
exact = true

[test]
preload = ["./test-setup/happy-dom.ts"]
```

- [ ] **Step 4: biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "off" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

- [ ] **Step 5: Install root dev deps**

Run: `bun install`
Expected: lockfile created, `node_modules/` populated.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json bunfig.toml biome.json bun.lockb
git commit -m "chore: scaffold bun workspace + tooling"
```

### Task 0.2: Set up happy-dom test preload

**Files:**
- Create: `test-setup/happy-dom.ts`

- [ ] **Step 1: Install happy-dom + RTL**

Run: `bun add -d happy-dom @testing-library/react @testing-library/jest-dom`

- [ ] **Step 2: Write preload**

```ts
// test-setup/happy-dom.ts
import { GlobalRegistrator } from 'happy-dom/lib/GlobalRegistrator.js';

if (!globalThis.document) {
  GlobalRegistrator.register();
}
```

- [ ] **Step 3: Smoke test**

```ts
// test-setup/happy-dom.test.ts
import { test, expect } from 'bun:test';

test('happy-dom is registered', () => {
  expect(typeof document).toBe('object');
  const div = document.createElement('div');
  expect(div.tagName).toBe('DIV');
});
```

- [ ] **Step 4: Run test**

Run: `bun test test-setup/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test-setup/ package.json bun.lockb
git commit -m "chore: configure happy-dom test environment"
```

### Task 0.3: Create empty workspace folders + README

**Files:**
- Create: `packages/{schema,core,font-io,storage,editor}/package.json`
- Create: `apps/web/package.json`
- Create: `README.md`

- [ ] **Step 1: Create per-package skeletons**

For each of `packages/schema`, `packages/core`, `packages/font-io`, `packages/storage`, `packages/editor`, create `package.json`:

```json
{
  "name": "@interrobang/<name>",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

And `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*"]
}
```

And empty `src/index.ts`:

```ts
export {};
```

For `apps/web`, same shape with `"name": "@interrobang/web"`.

- [ ] **Step 2: README**

```markdown
# Interrobang

Browser-first font editor. See `docs/superpowers/specs/` for the design spec
and `docs/superpowers/plans/` for the implementation plan.

## Develop

    bun install
    bun test
    bun --filter @interrobang/web dev   # once Phase 1 module F lands
```

- [ ] **Step 3: Verify workspace resolution**

Run: `bun install`
Expected: workspace packages linked; no errors.

- [ ] **Step 4: Commit**

```bash
git add packages apps README.md bun.lockb
git commit -m "chore: scaffold workspace package skeletons"
```

---

## Phase 1, Module A — `packages/schema`

The schema package defines all tables once via Drizzle, generates SQL DDL files for the client to execute at SQLite-WASM init, and exports inferred TypeScript row types. Drizzle runtime is consumed only by the server (Phase 2); Phase 1 uses the generated DDL and the inferred types.

### Task A.1: Install Drizzle + define schema

**Files:**
- Create: `packages/schema/src/tables.ts`
- Create: `packages/schema/src/index.ts`
- Create: `packages/schema/drizzle.config.ts`
- Modify: `packages/schema/package.json`

- [ ] **Step 1: Install**

Run: `cd packages/schema && bun add drizzle-orm && bun add -d drizzle-kit`

- [ ] **Step 2: Write `tables.ts`**

```ts
// packages/schema/src/tables.ts
import { sqliteTable, text, integer, blob, primaryKey, index } from 'drizzle-orm/sqlite-core';

// Server-only. Client schema omits this table entirely.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id'), // null on client
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  revision: integer('revision').notNull().default(0),
});

export const fontMeta = sqliteTable('font_meta', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  familyName: text('family_name').notNull(),
  styleName: text('style_name').notNull().default('Regular'),
  unitsPerEm: integer('units_per_em').notNull().default(1000),
  ascender: integer('ascender').notNull().default(800),
  descender: integer('descender').notNull().default(-200),
  capHeight: integer('cap_height').notNull().default(700),
  xHeight: integer('x_height').notNull().default(500),
});

export const masters = sqliteTable('masters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  weight: integer('weight').notNull().default(400),
  width: integer('width').notNull().default(100),
});

export const glyphs = sqliteTable(
  'glyphs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    advanceWidth: integer('advance_width').notNull().default(500),
    unicodeCodepoint: integer('unicode_codepoint'),
    revision: integer('revision').notNull().default(0),
  },
  (t) => ({
    projectNameIdx: index('idx_glyphs_project_name').on(t.projectId, t.name),
  }),
);

export const layers = sqliteTable('layers', {
  id: text('id').primaryKey(),
  glyphId: text('glyph_id').notNull().references(() => glyphs.id, { onDelete: 'cascade' }),
  masterId: text('master_id').notNull().references(() => masters.id, { onDelete: 'cascade' }),
  contoursJson: text('contours_json').notNull().default('[]'),
  componentsJson: text('components_json').notNull().default('[]'),
  anchorsJson: text('anchors_json').notNull().default('[]'),
});

export const kerningPairs = sqliteTable(
  'kerning_pairs',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    leftGlyph: text('left_glyph').notNull(),
    rightGlyph: text('right_glyph').notNull(),
    value: integer('value').notNull(),
    revision: integer('revision').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.leftGlyph, t.rightGlyph] }) }),
);

export const features = sqliteTable(
  'features',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    source: text('source').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.tag] }) }),
);

export const projectBlobs = sqliteTable(
  'project_blobs',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    bytes: blob('bytes').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.key] }) }),
);

// Client-only. Server tracks revisions on rows themselves.
export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull(),
  tableName: text('table_name').notNull(),
  rowKey: text('row_key').notNull(),
  revision: integer('revision').notNull(),
  op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
  payload: text('payload'), // JSON
});
```

- [ ] **Step 3: Write `index.ts` (public surface)**

```ts
// packages/schema/src/index.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as t from './tables.js';

export const tables = t;

export type Project = InferSelectModel<typeof t.projects>;
export type ProjectInsert = InferInsertModel<typeof t.projects>;
export type FontMetaRow = InferSelectModel<typeof t.fontMeta>;
export type MasterRow = InferSelectModel<typeof t.masters>;
export type GlyphRow = InferSelectModel<typeof t.glyphs>;
export type LayerRow = InferSelectModel<typeof t.layers>;
export type KerningPairRow = InferSelectModel<typeof t.kerningPairs>;
export type FeatureRow = InferSelectModel<typeof t.features>;
export type ProjectBlobRow = InferSelectModel<typeof t.projectBlobs>;
export type SyncLogRow = InferSelectModel<typeof t.syncLog>;
```

- [ ] **Step 4: drizzle.config.ts**

```ts
// packages/schema/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/tables.ts',
  out: './migrations',
  // Two outputs: server uses migrations dir directly; client bundles SQL files.
});
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/schema bun.lockb
git commit -m "feat(schema): define drizzle schema for projects, glyphs, layers, kerning"
```

### Task A.2: Generate initial migration + ship as bundled SQL

**Files:**
- Create: `packages/schema/migrations/0000_initial.sql` (generated)
- Create: `packages/schema/src/client-ddl.ts` (loads + filters DDL for client)
- Create: `packages/schema/src/client-ddl.test.ts`

- [ ] **Step 1: Generate migration**

Run: `cd packages/schema && bunx drizzle-kit generate --name initial`
Expected: `migrations/0000_initial.sql` created with `CREATE TABLE` for every table.

- [ ] **Step 2: Verify the generated SQL contains every table**

Open `migrations/0000_initial.sql`. Confirm `CREATE TABLE` appears for: `users`, `projects`, `font_meta`, `masters`, `glyphs`, `layers`, `kerning_pairs`, `features`, `project_blobs`, `sync_log`. (10 tables.)

- [ ] **Step 3: Write the failing test for client-ddl filter**

```ts
// packages/schema/src/client-ddl.test.ts
import { test, expect } from 'bun:test';
import { getClientDDL } from './client-ddl.js';

test('client DDL omits the users table', () => {
  const sql = getClientDDL();
  expect(sql).not.toMatch(/CREATE TABLE.*\busers\b/i);
});

test('client DDL keeps projects, glyphs, layers, sync_log', () => {
  const sql = getClientDDL();
  expect(sql).toMatch(/CREATE TABLE.*\bprojects\b/i);
  expect(sql).toMatch(/CREATE TABLE.*\bglyphs\b/i);
  expect(sql).toMatch(/CREATE TABLE.*\blayers\b/i);
  expect(sql).toMatch(/CREATE TABLE.*\bsync_log\b/i);
});

test('client DDL is deterministic across calls', () => {
  expect(getClientDDL()).toBe(getClientDDL());
});
```

- [ ] **Step 4: Run test (FAIL — module missing)**

Run: `cd packages/schema && bun test`
Expected: FAIL with "Cannot find module './client-ddl.js'".

- [ ] **Step 5: Implement**

```ts
// packages/schema/src/client-ddl.ts
import migration0000 from '../migrations/0000_initial.sql' with { type: 'text' };

const SERVER_ONLY_TABLES = new Set(['users']);

function stripStatementsForTables(sql: string, tables: Set<string>): string {
  // drizzle-kit emits one statement per blank-line-delimited block.
  return sql
    .split(/\n\s*\n/)
    .filter((stmt) => {
      const m = stmt.match(/CREATE TABLE\s+`?([a-z_]+)`?/i);
      return !m || !tables.has(m[1]!.toLowerCase());
    })
    .join('\n\n');
}

const allMigrations = [migration0000];

export function getClientDDL(): string {
  return allMigrations.map((m) => stripStatementsForTables(m, SERVER_ONLY_TABLES)).join('\n\n');
}

export function getServerDDL(): string {
  return allMigrations.join('\n\n');
}

export const MIGRATION_VERSION = allMigrations.length;
```

- [ ] **Step 6: Run test (PASS)**

Run: `cd packages/schema && bun test`
Expected: PASS.

- [ ] **Step 7: Re-export from index**

Append to `packages/schema/src/index.ts`:

```ts
export { getClientDDL, getServerDDL, MIGRATION_VERSION } from './client-ddl.js';
```

- [ ] **Step 8: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): generate initial migration and client DDL filter"
```

---

## Phase 1, Module B — `packages/core` (domain model + commands)

Pure TypeScript. Zero I/O dependencies. This is the most-tested module: every operation has unit tests, and outline operations should be referentially transparent.

### Task B.1: Define domain types

**Files:**
- Create: `packages/core/src/font.ts`
- Create: `packages/core/src/glyph.ts`
- Create: `packages/core/src/contour.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Write `contour.ts`**

```ts
// packages/core/src/contour.ts
export type PointType = 'line' | 'curve' | 'qcurve' | 'offcurve';

export interface Point {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly type: PointType;
  readonly smooth: boolean;
}

export interface Contour {
  readonly id: string;
  readonly closed: boolean;
  readonly points: readonly Point[];
}

export interface Anchor {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface ComponentRef {
  readonly id: string;
  readonly baseGlyph: string;
  readonly transform: readonly [number, number, number, number, number, number]; // 2x3 affine
}
```

- [ ] **Step 2: Write `glyph.ts`**

```ts
// packages/core/src/glyph.ts
import type { Anchor, ComponentRef, Contour } from './contour.js';

export interface Layer {
  readonly id: string;
  readonly masterId: string;
  readonly contours: readonly Contour[];
  readonly components: readonly ComponentRef[];
  readonly anchors: readonly Anchor[];
}

export interface Glyph {
  readonly id: string;
  readonly name: string;
  readonly advanceWidth: number;
  readonly unicodeCodepoint: number | null;
  readonly layers: readonly Layer[];
  readonly revision: number;
}
```

- [ ] **Step 3: Write `font.ts`**

```ts
// packages/core/src/font.ts
import type { Glyph } from './glyph.js';

export interface Master {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly width: number;
}

export interface FontMeta {
  readonly familyName: string;
  readonly styleName: string;
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly xHeight: number;
}

export interface KerningPair {
  readonly leftGlyph: string;
  readonly rightGlyph: string;
  readonly value: number;
}

export interface Font {
  readonly id: string;
  readonly meta: FontMeta;
  readonly masters: readonly Master[];
  readonly glyphs: { readonly [glyphId: string]: Glyph };
  readonly glyphOrder: readonly string[];
  readonly kerning: readonly KerningPair[];
  readonly revision: number;
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
// packages/core/src/index.ts
export type { Point, PointType, Contour, Anchor, ComponentRef } from './contour.js';
export type { Glyph, Layer } from './glyph.js';
export type { Font, FontMeta, Master, KerningPair } from './font.js';
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/core && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): define Font/Glyph/Layer/Contour domain types"
```

### Task B.2: ID generation utility

**Files:**
- Create: `packages/core/src/id.ts`
- Create: `packages/core/src/id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/id.test.ts
import { test, expect } from 'bun:test';
import { newId } from './id.js';

test('newId returns a 21-char nanoid', () => {
  const id = newId();
  expect(id).toHaveLength(21);
  expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
});

test('newId is unique across many calls', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(ids.size).toBe(1000);
});
```

- [ ] **Step 2: Install nanoid**

Run: `cd packages/core && bun add nanoid`

- [ ] **Step 3: Run test (FAIL — module missing)**

Run: `cd packages/core && bun test`
Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
// packages/core/src/id.ts
import { nanoid } from 'nanoid';

export function newId(): string {
  return nanoid();
}
```

- [ ] **Step 5: Run test (PASS)**

Run: `cd packages/core && bun test`
Expected: PASS.

- [ ] **Step 6: Re-export and commit**

Append to `packages/core/src/index.ts`:

```ts
export { newId } from './id.js';
```

```bash
git add packages/core bun.lockb
git commit -m "feat(core): add newId utility"
```

### Task B.3: Outline ops — insert and remove point

**Files:**
- Create: `packages/core/src/ops/contour-ops.ts`
- Create: `packages/core/src/ops/contour-ops.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/ops/contour-ops.test.ts
import { test, expect } from 'bun:test';
import type { Contour, Point } from '../contour.js';
import { insertPoint, removePoint } from './contour-ops.js';

const p = (id: string, x: number, y: number, type: Point['type'] = 'line'): Point => ({
  id, x, y, type, smooth: false,
});

const square: Contour = {
  id: 'c1',
  closed: true,
  points: [p('a', 0, 0), p('b', 100, 0), p('c', 100, 100), p('d', 0, 100)],
};

test('insertPoint inserts at the given index', () => {
  const next = insertPoint(square, 2, p('x', 100, 50));
  expect(next.points.map((q) => q.id)).toEqual(['a', 'b', 'x', 'c', 'd']);
});

test('insertPoint at end appends', () => {
  const next = insertPoint(square, 4, p('x', 50, 50));
  expect(next.points.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd', 'x']);
});

test('insertPoint preserves contour identity (id, closed)', () => {
  const next = insertPoint(square, 0, p('x', -10, 0));
  expect(next.id).toBe(square.id);
  expect(next.closed).toBe(square.closed);
});

test('insertPoint does not mutate input', () => {
  insertPoint(square, 0, p('x', -10, 0));
  expect(square.points.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
});

test('removePoint removes by id', () => {
  const next = removePoint(square, 'c');
  expect(next.points.map((q) => q.id)).toEqual(['a', 'b', 'd']);
});

test('removePoint with unknown id is a no-op', () => {
  const next = removePoint(square, 'zzz');
  expect(next).toBe(square);
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `cd packages/core && bun test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/ops/contour-ops.ts
import type { Contour, Point } from '../contour.js';

export function insertPoint(contour: Contour, index: number, point: Point): Contour {
  const points = [...contour.points];
  points.splice(index, 0, point);
  return { ...contour, points };
}

export function removePoint(contour: Contour, pointId: string): Contour {
  const idx = contour.points.findIndex((p) => p.id === pointId);
  if (idx === -1) return contour;
  const points = [...contour.points];
  points.splice(idx, 1);
  return { ...contour, points };
}
```

- [ ] **Step 4: Run test (PASS)**

Run: `cd packages/core && bun test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): insertPoint and removePoint contour ops"
```

### Task B.4: Outline ops — move points and convert curve type

**Files:**
- Modify: `packages/core/src/ops/contour-ops.ts`
- Modify: `packages/core/src/ops/contour-ops.test.ts`

- [ ] **Step 1: Write the failing tests (append)**

```ts
// append to contour-ops.test.ts
import { movePoints, convertPointType } from './contour-ops.js';

test('movePoints translates the listed point ids', () => {
  const next = movePoints(square, new Set(['b', 'c']), 5, -3);
  const byId = Object.fromEntries(next.points.map((q) => [q.id, q]));
  expect(byId.a).toEqual(square.points[0]!);
  expect(byId.b).toMatchObject({ x: 105, y: -3 });
  expect(byId.c).toMatchObject({ x: 105, y: 97 });
  expect(byId.d).toEqual(square.points[3]!);
});

test('movePoints with empty set is a no-op (same reference)', () => {
  expect(movePoints(square, new Set(), 5, 5)).toBe(square);
});

test('convertPointType changes type by id', () => {
  const next = convertPointType(square, 'b', 'curve');
  expect(next.points[1]!.type).toBe('curve');
  expect(next.points[0]!.type).toBe('line');
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `cd packages/core && bun test`
Expected: FAIL.

- [ ] **Step 3: Implement (append)**

```ts
// append to contour-ops.ts
import type { PointType } from '../contour.js';

export function movePoints(
  contour: Contour,
  pointIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): Contour {
  if (pointIds.size === 0) return contour;
  const points = contour.points.map((p) =>
    pointIds.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p,
  );
  return { ...contour, points };
}

export function convertPointType(contour: Contour, pointId: string, newType: PointType): Contour {
  const points = contour.points.map((p) => (p.id === pointId ? { ...p, type: newType } : p));
  return { ...contour, points };
}
```

- [ ] **Step 4: Run test (PASS)**

Run: `cd packages/core && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): movePoints and convertPointType contour ops"
```

### Task B.5: Glyph and Font helpers

**Files:**
- Create: `packages/core/src/ops/glyph-ops.ts`
- Create: `packages/core/src/ops/glyph-ops.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/ops/glyph-ops.test.ts
import { test, expect } from 'bun:test';
import type { Font, Glyph, Layer } from '../index.js';
import { updateGlyph, replaceLayer, emptyFont } from './glyph-ops.js';

const layer: Layer = { id: 'l1', masterId: 'm1', contours: [], components: [], anchors: [] };
const glyph: Glyph = {
  id: 'g1', name: 'A', advanceWidth: 500, unicodeCodepoint: 65, layers: [layer], revision: 0,
};
const font: Font = {
  id: 'f1',
  meta: { familyName: 'X', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, capHeight: 700, xHeight: 500 },
  masters: [{ id: 'm1', name: 'Regular', weight: 400, width: 100 }],
  glyphs: { g1: glyph },
  glyphOrder: ['g1'],
  kerning: [],
  revision: 0,
};

test('updateGlyph replaces the glyph and bumps revisions', () => {
  const next = updateGlyph(font, 'g1', (g) => ({ ...g, advanceWidth: 600 }));
  expect(next.glyphs.g1!.advanceWidth).toBe(600);
  expect(next.glyphs.g1!.revision).toBe(glyph.revision + 1);
  expect(next.revision).toBe(font.revision + 1);
  expect(next).not.toBe(font);
});

test('replaceLayer swaps a layer by id', () => {
  const newLayer: Layer = { ...layer, contours: [{ id: 'c1', closed: true, points: [] }] };
  const next = replaceLayer(glyph, newLayer);
  expect(next.layers[0]!.contours).toHaveLength(1);
});

test('emptyFont returns a usable font with one master and no glyphs', () => {
  const f = emptyFont('My Font');
  expect(f.meta.familyName).toBe('My Font');
  expect(f.masters).toHaveLength(1);
  expect(f.glyphOrder).toHaveLength(0);
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `cd packages/core && bun test`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/ops/glyph-ops.ts
import type { Font, Glyph, Layer } from '../index.js';
import { newId } from '../id.js';

export function updateGlyph(font: Font, glyphId: string, updater: (g: Glyph) => Glyph): Font {
  const existing = font.glyphs[glyphId];
  if (!existing) return font;
  const updated = updater(existing);
  if (updated === existing) return font;
  return {
    ...font,
    glyphs: { ...font.glyphs, [glyphId]: { ...updated, revision: existing.revision + 1 } },
    revision: font.revision + 1,
  };
}

export function replaceLayer(glyph: Glyph, layer: Layer): Glyph {
  const layers = glyph.layers.map((l) => (l.id === layer.id ? layer : l));
  return { ...glyph, layers };
}

export function emptyFont(familyName: string): Font {
  const masterId = newId();
  return {
    id: newId(),
    meta: {
      familyName, styleName: 'Regular', unitsPerEm: 1000,
      ascender: 800, descender: -200, capHeight: 700, xHeight: 500,
    },
    masters: [{ id: masterId, name: 'Regular', weight: 400, width: 100 }],
    glyphs: {},
    glyphOrder: [],
    kerning: [],
    revision: 0,
  };
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): updateGlyph, replaceLayer, emptyFont helpers"
```

### Task B.6: Command pattern interface

**Files:**
- Create: `packages/core/src/commands/command.ts`
- Create: `packages/core/src/commands/command.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/commands/command.test.ts
import { test, expect } from 'bun:test';
import type { Command } from './command.js';
import { UndoRedoStack } from './command.js';

type Counter = { value: number };

const inc: Command<Counter> = {
  type: 'inc',
  apply: (s) => ({ value: s.value + 1 }),
  revert: (s) => ({ value: s.value - 1 }),
};

test('apply pushes onto the undo stack and clears redo', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  expect(s.value).toBe(1);
  expect(stack.canUndo()).toBe(true);
  expect(stack.canRedo()).toBe(false);
});

test('undo reverts and moves command to redo', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  s = stack.undo(s)!;
  expect(s.value).toBe(0);
  expect(stack.canRedo()).toBe(true);
});

test('redo re-applies', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  s = stack.undo(s)!;
  s = stack.redo(s)!;
  expect(s.value).toBe(1);
});

test('apply after undo clears redo', () => {
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, inc);
  s = stack.undo(s)!;
  s = stack.apply(s, inc);
  expect(stack.canRedo()).toBe(false);
});

test('mergeable consecutive commands collapse', () => {
  const mergeableInc: Command<Counter> = {
    type: 'inc',
    apply: (s) => ({ value: s.value + 1 }),
    revert: (s) => ({ value: s.value - 1 }),
    canMergeWith: (other) => other.type === 'inc',
    mergeWith: (other) => ({
      type: 'inc',
      apply: (s) => other.apply(mergeableInc.apply(s)),
      revert: (s) => mergeableInc.revert(other.revert(s)),
    }),
  };
  const stack = new UndoRedoStack<Counter>();
  let s: Counter = { value: 0 };
  s = stack.apply(s, mergeableInc);
  s = stack.apply(s, mergeableInc);
  // Two inc applied, but only one undo step
  expect(s.value).toBe(2);
  s = stack.undo(s)!;
  expect(s.value).toBe(0);
});

test('capacity drops oldest commands', () => {
  const stack = new UndoRedoStack<Counter>(2);
  let s: Counter = { value: 0 };
  for (let i = 0; i < 5; i++) s = stack.apply(s, inc);
  // Only last two are recoverable
  s = stack.undo(s)!;
  s = stack.undo(s)!;
  expect(stack.canUndo()).toBe(false);
  expect(s.value).toBe(3);
});
```

- [ ] **Step 2: Run test (FAIL)**

Run: `cd packages/core && bun test`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/commands/command.ts
export interface Command<T> {
  readonly type: string;
  apply(state: T): T;
  revert(state: T): T;
  canMergeWith?(other: Command<T>): boolean;
  mergeWith?(other: Command<T>): Command<T>;
}

export class UndoRedoStack<T> {
  private undoStack: Command<T>[] = [];
  private redoStack: Command<T>[] = [];

  constructor(private readonly capacity: number = 200) {}

  apply(state: T, command: Command<T>): T {
    const next = command.apply(state);
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && last.canMergeWith?.(command) && last.mergeWith) {
      this.undoStack[this.undoStack.length - 1] = last.mergeWith(command);
    } else {
      this.undoStack.push(command);
      if (this.undoStack.length > this.capacity) this.undoStack.shift();
    }
    this.redoStack = [];
    return next;
  }

  undo(state: T): T | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    this.redoStack.push(cmd);
    return cmd.revert(state);
  }

  redo(state: T): T | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    this.undoStack.push(cmd);
    return cmd.apply(state);
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  clear(): void { this.undoStack = []; this.redoStack = []; }
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Re-export from index, commit**

Append to `packages/core/src/index.ts`:

```ts
export type { Command } from './commands/command.js';
export { UndoRedoStack } from './commands/command.js';
```

```bash
git add packages/core
git commit -m "feat(core): Command interface and UndoRedoStack with merging"
```

### Task B.7: Concrete font commands

**Files:**
- Create: `packages/core/src/commands/font-commands.ts`
- Create: `packages/core/src/commands/font-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/commands/font-commands.test.ts
import { test, expect } from 'bun:test';
import type { Font, Layer } from '../index.js';
import { emptyFont } from '../ops/glyph-ops.js';
import {
  movePointsCommand,
  insertPointCommand,
  removePointCommand,
  convertPointTypeCommand,
} from './font-commands.js';

function fontWithGlyph(): Font {
  const f = emptyFont('Test');
  const masterId = f.masters[0]!.id;
  const layer: Layer = {
    id: 'l1', masterId,
    contours: [{
      id: 'c1', closed: true,
      points: [
        { id: 'p1', x: 0, y: 0, type: 'line', smooth: false },
        { id: 'p2', x: 100, y: 0, type: 'line', smooth: false },
      ],
    }],
    components: [], anchors: [],
  };
  return {
    ...f,
    glyphs: {
      g1: { id: 'g1', name: 'A', advanceWidth: 500, unicodeCodepoint: 65, layers: [layer], revision: 0 },
    },
    glyphOrder: ['g1'],
  };
}

test('movePointsCommand applies and reverts cleanly', () => {
  const f0 = fontWithGlyph();
  const cmd = movePointsCommand({ glyphId: 'g1', layerId: 'l1', contourId: 'c1', pointIds: ['p2'], dx: 5, dy: 7 });
  const f1 = cmd.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.x).toBe(105);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.y).toBe(7);
  const f2 = cmd.revert(f1);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.x).toBe(100);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.y).toBe(0);
});

test('insertPointCommand and removePointCommand are inverses', () => {
  const f0 = fontWithGlyph();
  const newPoint = { id: 'p3', x: 100, y: 50, type: 'line' as const, smooth: false };
  const insert = insertPointCommand({ glyphId: 'g1', layerId: 'l1', contourId: 'c1', index: 2, point: newPoint });
  const f1 = insert.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points).toHaveLength(3);
  const f2 = insert.revert(f1);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points).toHaveLength(2);
});

test('convertPointTypeCommand round-trips', () => {
  const f0 = fontWithGlyph();
  const cmd = convertPointTypeCommand({ glyphId: 'g1', layerId: 'l1', contourId: 'c1', pointId: 'p2', newType: 'curve' });
  const f1 = cmd.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.type).toBe('curve');
  const f2 = cmd.revert(f1);
  expect(f2.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.type).toBe('line');
});

test('two consecutive movePoints commands on the same point set merge', () => {
  const a = movePointsCommand({ glyphId: 'g1', layerId: 'l1', contourId: 'c1', pointIds: ['p2'], dx: 1, dy: 0 });
  const b = movePointsCommand({ glyphId: 'g1', layerId: 'l1', contourId: 'c1', pointIds: ['p2'], dx: 2, dy: 0 });
  expect(a.canMergeWith?.(b)).toBe(true);
  const merged = a.mergeWith?.(b)!;
  const f0 = fontWithGlyph();
  const f1 = merged.apply(f0);
  expect(f1.glyphs.g1!.layers[0]!.contours[0]!.points[1]!.x).toBe(103);
});
```

- [ ] **Step 2: Run test (FAIL)** — `bun test`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/commands/font-commands.ts
import type { Font, Point, PointType, Layer } from '../index.js';
import type { Command } from './command.js';
import { insertPoint, removePoint, movePoints, convertPointType } from '../ops/contour-ops.js';
import { updateGlyph, replaceLayer } from '../ops/glyph-ops.js';

interface ContourTarget {
  glyphId: string;
  layerId: string;
  contourId: string;
}

function withContour(font: Font, t: ContourTarget, fn: (c: Layer['contours'][number]) => Layer['contours'][number]): Font {
  return updateGlyph(font, t.glyphId, (g) => {
    const layer = g.layers.find((l) => l.id === t.layerId);
    if (!layer) return g;
    const contour = layer.contours.find((c) => c.id === t.contourId);
    if (!contour) return g;
    const next = fn(contour);
    if (next === contour) return g;
    const layers = g.layers.map((l) =>
      l.id === t.layerId
        ? { ...l, contours: l.contours.map((c) => (c.id === t.contourId ? next : c)) }
        : l,
    );
    return replaceLayer(g, layers.find((l) => l.id === t.layerId)!);
  });
}

export interface MovePointsArgs extends ContourTarget {
  pointIds: readonly string[];
  dx: number;
  dy: number;
}

export function movePointsCommand(args: MovePointsArgs): Command<Font> {
  const ids = new Set(args.pointIds);
  return {
    type: 'movePoints',
    apply: (f) => withContour(f, args, (c) => movePoints(c, ids, args.dx, args.dy)),
    revert: (f) => withContour(f, args, (c) => movePoints(c, ids, -args.dx, -args.dy)),
    canMergeWith: (other) =>
      other.type === 'movePoints' &&
      sameSet(ids, new Set((other as Command<Font> & { _ids: ReadonlySet<string> })._ids ?? [])),
    mergeWith: (other) => {
      const o = other as Command<Font> & { _dx: number; _dy: number };
      return movePointsCommand({ ...args, dx: args.dx + o._dx, dy: args.dy + o._dy });
    },
    _ids: ids, _dx: args.dx, _dy: args.dy,
  } as Command<Font> & { _ids: ReadonlySet<string>; _dx: number; _dy: number };
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export interface InsertPointArgs extends ContourTarget {
  index: number;
  point: Point;
}

export function insertPointCommand(args: InsertPointArgs): Command<Font> {
  return {
    type: 'insertPoint',
    apply: (f) => withContour(f, args, (c) => insertPoint(c, args.index, args.point)),
    revert: (f) => withContour(f, args, (c) => removePoint(c, args.point.id)),
  };
}

export interface RemovePointArgs extends ContourTarget {
  pointId: string;
}

export function removePointCommand(args: RemovePointArgs): Command<Font> {
  let removed: Point | null = null;
  let removedIndex = -1;
  return {
    type: 'removePoint',
    apply: (f) =>
      withContour(f, args, (c) => {
        const idx = c.points.findIndex((p) => p.id === args.pointId);
        if (idx === -1) return c;
        removed = c.points[idx]!;
        removedIndex = idx;
        return removePoint(c, args.pointId);
      }),
    revert: (f) =>
      withContour(f, args, (c) => (removed ? insertPoint(c, removedIndex, removed) : c)),
  };
}

export interface ConvertPointTypeArgs extends ContourTarget {
  pointId: string;
  newType: PointType;
}

export function convertPointTypeCommand(args: ConvertPointTypeArgs): Command<Font> {
  let prev: PointType | null = null;
  return {
    type: 'convertPointType',
    apply: (f) =>
      withContour(f, args, (c) => {
        const p = c.points.find((q) => q.id === args.pointId);
        if (!p) return c;
        prev = p.type;
        return convertPointType(c, args.pointId, args.newType);
      }),
    revert: (f) =>
      withContour(f, args, (c) => (prev ? convertPointType(c, args.pointId, prev) : c)),
  };
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Re-export and commit**

Append to `packages/core/src/index.ts`:

```ts
export {
  movePointsCommand, insertPointCommand, removePointCommand, convertPointTypeCommand,
} from './commands/font-commands.js';
```

```bash
git add packages/core
git commit -m "feat(core): font commands (move, insert, remove, convertType) with merging"
```

---

## Phase 1, Module C — `packages/font-io`

Wraps `opentype.js` for OTF/TTF and hand-rolls UFO. Designed to run in a Web Worker; the public surface is plain serializable data structures.

### Task C.1: Install opentype.js + OTF/TTF parser

**Files:**
- Modify: `packages/font-io/package.json`
- Create: `packages/font-io/src/opentype.ts`
- Create: `packages/font-io/src/opentype.test.ts`
- Create: `packages/font-io/test-fixtures/sample.ttf` (download)

- [ ] **Step 1: Install**

Run: `cd packages/font-io && bun add opentype.js && bun add -d @types/opentype.js`

- [ ] **Step 2: Add a small public-domain test font**

Run from repo root:

```bash
mkdir -p packages/font-io/test-fixtures
curl -L -o packages/font-io/test-fixtures/sample.ttf \
  https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.ttf
```

(Inter is OFL-licensed; commit the binary.)

- [ ] **Step 3: Write the failing test**

```ts
// packages/font-io/src/opentype.test.ts
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOTF } from './opentype.js';

const sample = new Uint8Array(readFileSync(join(import.meta.dir, '../test-fixtures/sample.ttf')));

test('parseOTF returns a Font with a glyph map', () => {
  const font = parseOTF(sample.buffer);
  expect(font.meta.familyName).toBeTruthy();
  expect(font.meta.unitsPerEm).toBeGreaterThan(0);
  expect(font.glyphOrder.length).toBeGreaterThan(10);
  const someName = font.glyphOrder[0]!;
  expect(font.glyphs[someName]).toBeDefined();
});

test('parseOTF surfaces unicode codepoints for ASCII glyphs', () => {
  const font = parseOTF(sample.buffer);
  const A = Object.values(font.glyphs).find((g) => g.unicodeCodepoint === 65);
  expect(A?.name).toBeTruthy();
});
```

- [ ] **Step 4: Run test (FAIL)** — `bun test`

- [ ] **Step 5: Implement**

```ts
// packages/font-io/src/opentype.ts
import opentype from 'opentype.js';
import { newId, type Font, type Glyph, type Layer, type Contour, type Point } from '@interrobang/core';

export function parseOTF(bytes: ArrayBuffer): Font {
  const ot = opentype.parse(bytes);
  const masterId = newId();
  const familyName = ot.names.fontFamily?.en ?? 'Untitled';
  const styleName = ot.names.fontSubfamily?.en ?? 'Regular';
  const glyphs: { [id: string]: Glyph } = {};
  const order: string[] = [];

  for (let i = 0; i < ot.glyphs.length; i++) {
    const g = ot.glyphs.get(i);
    const name = g.name || `glyph${i}`;
    const layer = pathToLayer(g.path, masterId);
    const glyphId = newId();
    glyphs[glyphId] = {
      id: glyphId,
      name,
      advanceWidth: g.advanceWidth ?? 500,
      unicodeCodepoint: g.unicode ?? null,
      layers: [layer],
      revision: 0,
    };
    order.push(glyphId);
  }

  return {
    id: newId(),
    meta: {
      familyName, styleName,
      unitsPerEm: ot.unitsPerEm,
      ascender: ot.ascender,
      descender: ot.descender,
      capHeight: (ot.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? 700,
      xHeight: (ot.tables.os2 as { sxHeight?: number } | undefined)?.sxHeight ?? 500,
    },
    masters: [{ id: masterId, name: styleName, weight: 400, width: 100 }],
    glyphs,
    glyphOrder: order,
    kerning: [],
    revision: 0,
  };
}

function pathToLayer(path: opentype.Path, masterId: string): Layer {
  const contours: Contour[] = [];
  let current: Point[] = [];
  let lastMove: { x: number; y: number } | null = null;

  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      if (current.length) contours.push({ id: newId(), closed: true, points: current });
      current = [{ id: newId(), x: cmd.x, y: cmd.y, type: 'line', smooth: false }];
      lastMove = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === 'L') {
      current.push({ id: newId(), x: cmd.x, y: cmd.y, type: 'line', smooth: false });
    } else if (cmd.type === 'Q') {
      current.push({ id: newId(), x: cmd.x1, y: cmd.y1, type: 'offcurve', smooth: false });
      current.push({ id: newId(), x: cmd.x, y: cmd.y, type: 'qcurve', smooth: false });
    } else if (cmd.type === 'C') {
      current.push({ id: newId(), x: cmd.x1, y: cmd.y1, type: 'offcurve', smooth: false });
      current.push({ id: newId(), x: cmd.x2, y: cmd.y2, type: 'offcurve', smooth: false });
      current.push({ id: newId(), x: cmd.x, y: cmd.y, type: 'curve', smooth: false });
    } else if (cmd.type === 'Z') {
      if (current.length) {
        contours.push({ id: newId(), closed: true, points: current });
        current = [];
      }
    }
  }
  if (current.length) contours.push({ id: newId(), closed: !!lastMove, points: current });

  return { id: newId(), masterId, contours, components: [], anchors: [] };
}
```

- [ ] **Step 6: Run test (PASS)** — `bun test`

- [ ] **Step 7: Commit**

```bash
git add packages/font-io
git commit -m "feat(font-io): OTF/TTF parser via opentype.js"
```

### Task C.2: OTF/TTF writer

**Files:**
- Modify: `packages/font-io/src/opentype.ts`
- Modify: `packages/font-io/src/opentype.test.ts`

- [ ] **Step 1: Add round-trip test**

```ts
// append
import { writeOTF } from './opentype.js';

test('writeOTF round-trips family name and unitsPerEm', () => {
  const font = parseOTF(sample.buffer);
  const bytes = writeOTF(font);
  const reparsed = parseOTF(bytes);
  expect(reparsed.meta.familyName).toBe(font.meta.familyName);
  expect(reparsed.meta.unitsPerEm).toBe(font.meta.unitsPerEm);
  // glyph count may differ (opentype.js normalizes); we just check non-empty
  expect(reparsed.glyphOrder.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test (FAIL)** — `bun test`

- [ ] **Step 3: Implement**

```ts
// append to opentype.ts
export function writeOTF(font: Font): ArrayBuffer {
  const otGlyphs: opentype.Glyph[] = [];
  // .notdef is required as the first glyph
  otGlyphs.push(new opentype.Glyph({
    name: '.notdef', unicode: 0, advanceWidth: font.meta.unitsPerEm / 2,
    path: new opentype.Path(),
  }));
  for (const id of font.glyphOrder) {
    const g = font.glyphs[id]!;
    if (g.name === '.notdef') continue;
    otGlyphs.push(new opentype.Glyph({
      name: g.name,
      unicode: g.unicodeCodepoint ?? undefined,
      advanceWidth: g.advanceWidth,
      path: layerToPath(g.layers[0]!),
    }));
  }
  const ot = new opentype.Font({
    familyName: font.meta.familyName,
    styleName: font.meta.styleName,
    unitsPerEm: font.meta.unitsPerEm,
    ascender: font.meta.ascender,
    descender: font.meta.descender,
    glyphs: otGlyphs,
  });
  return ot.toArrayBuffer();
}

function layerToPath(layer: Layer): opentype.Path {
  const path = new opentype.Path();
  for (const contour of layer.contours) {
    let started = false;
    let i = 0;
    while (i < contour.points.length) {
      const p = contour.points[i]!;
      if (!started) {
        path.moveTo(p.x, p.y);
        started = true;
        i += 1;
        continue;
      }
      if (p.type === 'line') { path.lineTo(p.x, p.y); i += 1; }
      else if (p.type === 'qcurve') {
        const c = contour.points[i - 1]!;
        path.quadraticCurveTo(c.x, c.y, p.x, p.y);
        i += 1;
      }
      else if (p.type === 'curve') {
        const c1 = contour.points[i - 2]!;
        const c2 = contour.points[i - 1]!;
        path.curveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
        i += 1;
      }
      else { i += 1; } // skip raw offcurves; handled above
    }
    if (contour.closed) path.close();
  }
  return path;
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Commit**

```bash
git add packages/font-io
git commit -m "feat(font-io): OTF/TTF writer with round-trip"
```

### Task C.3: Plist + GLIF parsers

**Files:**
- Create: `packages/font-io/src/ufo/plist.ts`
- Create: `packages/font-io/src/ufo/plist.test.ts`
- Create: `packages/font-io/src/ufo/glif.ts`
- Create: `packages/font-io/src/ufo/glif.test.ts`

- [ ] **Step 1: Install fast-xml-parser**

Run: `cd packages/font-io && bun add fast-xml-parser`

- [ ] **Step 2: Plist tests**

```ts
// packages/font-io/src/ufo/plist.test.ts
import { test, expect } from 'bun:test';
import { parsePlist, writePlist } from './plist.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>familyName</key><string>MyFont</string>
    <key>unitsPerEm</key><integer>1000</integer>
    <key>ascender</key><real>800.5</real>
    <key>italic</key><false/>
  </dict>
</plist>`;

test('parsePlist parses dict, string, integer, real, false', () => {
  const v = parsePlist(SAMPLE) as Record<string, unknown>;
  expect(v.familyName).toBe('MyFont');
  expect(v.unitsPerEm).toBe(1000);
  expect(v.ascender).toBe(800.5);
  expect(v.italic).toBe(false);
});

test('writePlist round-trips', () => {
  const v = parsePlist(SAMPLE);
  const out = writePlist(v);
  const v2 = parsePlist(out);
  expect(v2).toEqual(v);
});
```

- [ ] **Step 3: Run test (FAIL)** — `bun test`

- [ ] **Step 4: Implement plist**

```ts
// packages/font-io/src/ufo/plist.ts
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

type PlistValue =
  | string | number | boolean | Date | Uint8Array
  | PlistValue[] | { [k: string]: PlistValue };

const parser = new XMLParser({
  ignoreAttributes: false,
  alwaysCreateTextNode: false,
  preserveOrder: true,
  parseTagValue: false,
  trimValues: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  preserveOrder: true,
  suppressEmptyNode: true,
});

export function parsePlist(xml: string): PlistValue {
  const tree = parser.parse(xml);
  const plist = findNode(tree, 'plist');
  if (!plist) throw new Error('Not a plist');
  const value = (plist as { plist: unknown[] }).plist[0];
  return decode(value);
}

function findNode(tree: unknown[], name: string): unknown | null {
  for (const n of tree) {
    if (typeof n === 'object' && n !== null && name in n) return n;
  }
  return null;
}

function decode(node: unknown): PlistValue {
  if (typeof node !== 'object' || node === null) return node as string;
  const entries = Object.entries(node);
  const [tag, content] = entries[0]!;
  if (tag === 'dict') return decodeDict(content as unknown[]);
  if (tag === 'array') return (content as unknown[]).map(decode);
  if (tag === 'string') return getText(content);
  if (tag === 'integer') return parseInt(getText(content), 10);
  if (tag === 'real') return parseFloat(getText(content));
  if (tag === 'true') return true;
  if (tag === 'false') return false;
  throw new Error(`Unknown plist tag: ${tag}`);
}

function getText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content) && content.length === 0) return '';
  if (Array.isArray(content)) return getText(content[0]);
  if (typeof content === 'object' && content !== null && '#text' in content) {
    return String((content as { '#text': unknown })['#text']);
  }
  return '';
}

function decodeDict(items: unknown[]): { [k: string]: PlistValue } {
  const out: { [k: string]: PlistValue } = {};
  for (let i = 0; i < items.length; i += 2) {
    const keyNode = items[i] as { key: unknown };
    const valNode = items[i + 1];
    out[getText(keyNode.key)] = decode(valNode);
  }
  return out;
}

export function writePlist(value: PlistValue): string {
  const body = encode(value);
  const tree = [
    { '?xml': [], ':@': { '@_version': '1.0', '@_encoding': 'UTF-8' } },
    { plist: [body], ':@': { '@_version': '1.0' } },
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    builder.build([tree[1]])
  );
}

function encode(value: PlistValue): unknown {
  if (typeof value === 'string') return { string: value };
  if (typeof value === 'boolean') return value ? { true: '' } : { false: '' };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integer: String(value) } : { real: String(value) };
  }
  if (Array.isArray(value)) return { array: value.map(encode) };
  if (typeof value === 'object' && value !== null) {
    const items: unknown[] = [];
    for (const [k, v] of Object.entries(value)) {
      items.push({ key: k });
      items.push(encode(v));
    }
    return { dict: items };
  }
  throw new Error(`Cannot encode plist value: ${typeof value}`);
}
```

- [ ] **Step 5: Run test (PASS)** — `bun test`

- [ ] **Step 6: GLIF tests**

```ts
// packages/font-io/src/ufo/glif.test.ts
import { test, expect } from 'bun:test';
import { parseGlif, writeGlif } from './glif.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="A" format="2">
  <advance width="500"/>
  <unicode hex="0041"/>
  <outline>
    <contour>
      <point x="100" y="0" type="line"/>
      <point x="400" y="0" type="line"/>
      <point x="250" y="700" type="line"/>
    </contour>
  </outline>
</glyph>`;

test('parseGlif extracts name, advance, unicode, contours', () => {
  const g = parseGlif(SAMPLE);
  expect(g.name).toBe('A');
  expect(g.advanceWidth).toBe(500);
  expect(g.unicodeCodepoint).toBe(0x41);
  expect(g.contours).toHaveLength(1);
  expect(g.contours[0]!.points).toHaveLength(3);
});

test('writeGlif round-trips structurally', () => {
  const g = parseGlif(SAMPLE);
  const out = writeGlif(g);
  const g2 = parseGlif(out);
  expect(g2.name).toBe(g.name);
  expect(g2.advanceWidth).toBe(g.advanceWidth);
  expect(g2.unicodeCodepoint).toBe(g.unicodeCodepoint);
  expect(g2.contours[0]!.points).toEqual(g.contours[0]!.points);
});
```

- [ ] **Step 7: Implement glif**

```ts
// packages/font-io/src/ufo/glif.ts
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { newId, type Contour, type Point, type PointType } from '@interrobang/core';

export interface GlifGlyph {
  name: string;
  advanceWidth: number;
  unicodeCodepoint: number | null;
  contours: Contour[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true });

export function parseGlif(xml: string): GlifGlyph {
  const tree = parser.parse(xml) as { glyph: GlifTree };
  const g = tree.glyph;
  const advanceWidth = g.advance ? Number(g.advance['@_width']) : 500;
  const unicode = g.unicode ? parseInt(g.unicode['@_hex'], 16) : null;
  const rawContours = g.outline?.contour ?? [];
  const contoursArr = Array.isArray(rawContours) ? rawContours : [rawContours];
  const contours = contoursArr.map((c) => {
    const rawPoints = c.point ?? [];
    const pts = Array.isArray(rawPoints) ? rawPoints : [rawPoints];
    const points: Point[] = pts.map((p) => ({
      id: newId(),
      x: Number(p['@_x']),
      y: Number(p['@_y']),
      type: (p['@_type'] as PointType | undefined) ?? 'offcurve',
      smooth: p['@_smooth'] === 'yes',
    }));
    return { id: newId(), closed: true, points } satisfies Contour;
  });
  return { name: g['@_name'], advanceWidth, unicodeCodepoint: unicode, contours };
}

export function writeGlif(g: GlifGlyph): string {
  const tree = {
    glyph: {
      '@_name': g.name,
      '@_format': '2',
      advance: { '@_width': g.advanceWidth },
      ...(g.unicodeCodepoint !== null
        ? { unicode: { '@_hex': g.unicodeCodepoint.toString(16).toUpperCase().padStart(4, '0') } }
        : {}),
      outline: {
        contour: g.contours.map((c) => ({
          point: c.points.map((p) => ({
            '@_x': p.x,
            '@_y': p.y,
            ...(p.type !== 'offcurve' ? { '@_type': p.type } : {}),
            ...(p.smooth ? { '@_smooth': 'yes' } : {}),
          })),
        })),
      },
    },
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(tree);
}

interface GlifTree {
  '@_name': string;
  advance?: { '@_width': string };
  unicode?: { '@_hex': string };
  outline?: { contour?: GlifContourTree | GlifContourTree[] };
}
interface GlifContourTree {
  point?: GlifPointTree | GlifPointTree[];
}
interface GlifPointTree {
  '@_x': string;
  '@_y': string;
  '@_type'?: string;
  '@_smooth'?: string;
}
```

- [ ] **Step 8: Run test (PASS)** — `bun test`

- [ ] **Step 9: Commit**

```bash
git add packages/font-io bun.lockb
git commit -m "feat(font-io): plist and GLIF parsers/writers for UFO support"
```

### Task C.4: UFO directory I/O (in-memory `Map<path, bytes>`)

**Files:**
- Create: `packages/font-io/src/ufo/ufo.ts`
- Create: `packages/font-io/src/ufo/ufo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/font-io/src/ufo/ufo.test.ts
import { test, expect } from 'bun:test';
import { emptyFont } from '@interrobang/core';
import { fontToUfo, ufoToFont } from './ufo.js';

test('round-trip empty font through UFO file map', () => {
  const f0 = emptyFont('Test Family');
  const files = fontToUfo(f0);
  expect(files.has('metainfo.plist')).toBe(true);
  expect(files.has('fontinfo.plist')).toBe(true);
  expect(files.has('glyphs/contents.plist')).toBe(true);
  const f1 = ufoToFont(files);
  expect(f1.meta.familyName).toBe('Test Family');
  expect(f1.meta.unitsPerEm).toBe(f0.meta.unitsPerEm);
});
```

- [ ] **Step 2: Run test (FAIL)** — `bun test`

- [ ] **Step 3: Implement**

```ts
// packages/font-io/src/ufo/ufo.ts
import { newId, type Font, type Glyph, type Layer } from '@interrobang/core';
import { parsePlist, writePlist } from './plist.js';
import { parseGlif, writeGlif } from './glif.js';

const TEXT = new TextEncoder();
const FROM_TEXT = new TextDecoder();

export function fontToUfo(font: Font): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('metainfo.plist', TEXT.encode(writePlist({
    creator: 'app.interrobang', formatVersion: 3,
  })));
  files.set('fontinfo.plist', TEXT.encode(writePlist({
    familyName: font.meta.familyName,
    styleName: font.meta.styleName,
    unitsPerEm: font.meta.unitsPerEm,
    ascender: font.meta.ascender,
    descender: font.meta.descender,
    capHeight: font.meta.capHeight,
    xHeight: font.meta.xHeight,
  })));
  files.set('layercontents.plist', TEXT.encode(writePlist([['public.default', 'glyphs']])));
  const contents: Record<string, string> = {};
  for (const id of font.glyphOrder) {
    const g = font.glyphs[id]!;
    const filename = glifFilename(g.name);
    contents[g.name] = filename;
    files.set(`glyphs/${filename}`, TEXT.encode(writeGlif({
      name: g.name,
      advanceWidth: g.advanceWidth,
      unicodeCodepoint: g.unicodeCodepoint,
      contours: [...(g.layers[0]?.contours ?? [])],
    })));
  }
  files.set('glyphs/contents.plist', TEXT.encode(writePlist(contents)));
  return files;
}

export function ufoToFont(files: Map<string, Uint8Array>): Font {
  const fontinfo = parsePlist(FROM_TEXT.decode(getRequired(files, 'fontinfo.plist'))) as Record<string, number | string>;
  const masterId = newId();
  const layerContentsRaw = files.get('layercontents.plist');
  const layerDir = layerContentsRaw
    ? (parsePlist(FROM_TEXT.decode(layerContentsRaw)) as [string, string][])[0]?.[1] ?? 'glyphs'
    : 'glyphs';
  const contentsRaw = files.get(`${layerDir}/contents.plist`);
  const contents = contentsRaw
    ? parsePlist(FROM_TEXT.decode(contentsRaw)) as Record<string, string>
    : {};
  const glyphs: { [id: string]: Glyph } = {};
  const order: string[] = [];
  for (const [name, filename] of Object.entries(contents)) {
    const raw = files.get(`${layerDir}/${filename}`);
    if (!raw) continue;
    const glif = parseGlif(FROM_TEXT.decode(raw));
    const layer: Layer = { id: newId(), masterId, contours: glif.contours, components: [], anchors: [] };
    const id = newId();
    glyphs[id] = {
      id, name, advanceWidth: glif.advanceWidth, unicodeCodepoint: glif.unicodeCodepoint,
      layers: [layer], revision: 0,
    };
    order.push(id);
  }
  return {
    id: newId(),
    meta: {
      familyName: String(fontinfo.familyName ?? 'Untitled'),
      styleName: String(fontinfo.styleName ?? 'Regular'),
      unitsPerEm: Number(fontinfo.unitsPerEm ?? 1000),
      ascender: Number(fontinfo.ascender ?? 800),
      descender: Number(fontinfo.descender ?? -200),
      capHeight: Number(fontinfo.capHeight ?? 700),
      xHeight: Number(fontinfo.xHeight ?? 500),
    },
    masters: [{ id: masterId, name: String(fontinfo.styleName ?? 'Regular'), weight: 400, width: 100 }],
    glyphs,
    glyphOrder: order,
    kerning: [],
    revision: 0,
  };
}

function getRequired(files: Map<string, Uint8Array>, path: string): Uint8Array {
  const v = files.get(path);
  if (!v) throw new Error(`Missing required UFO file: ${path}`);
  return v;
}

// UFO names uppercase letters with a trailing underscore: A -> A_.glif
function glifFilename(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `${c}_`) + '.glif';
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Re-export from index**

```ts
// packages/font-io/src/index.ts
export { parseOTF, writeOTF } from './opentype.js';
export { fontToUfo, ufoToFont } from './ufo/ufo.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/font-io
git commit -m "feat(font-io): UFO read/write via in-memory file map"
```

### Task C.5: Worker RPC wrapper

**Files:**
- Create: `packages/font-io/src/worker/font-io-worker.ts` (worker entry)
- Create: `packages/font-io/src/worker/client.ts` (main-thread client)
- Create: `packages/font-io/src/worker/protocol.ts`

- [ ] **Step 1: Define the protocol**

```ts
// packages/font-io/src/worker/protocol.ts
import type { Font } from '@interrobang/core';

export type Request =
  | { id: number; kind: 'parseOTF'; bytes: ArrayBuffer }
  | { id: number; kind: 'writeOTF'; font: Font }
  | { id: number; kind: 'parseUFO'; files: [string, Uint8Array][] }
  | { id: number; kind: 'writeUFO'; font: Font };

export type Response =
  | { id: number; kind: 'ok'; result: unknown }
  | { id: number; kind: 'err'; message: string };
```

- [ ] **Step 2: Implement worker entry**

```ts
// packages/font-io/src/worker/font-io-worker.ts
/// <reference lib="webworker" />
import { parseOTF, writeOTF } from '../opentype.js';
import { fontToUfo, ufoToFont } from '../ufo/ufo.js';
import type { Request, Response } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    let result: unknown;
    if (req.kind === 'parseOTF') result = parseOTF(req.bytes);
    else if (req.kind === 'writeOTF') result = writeOTF(req.font);
    else if (req.kind === 'parseUFO') result = ufoToFont(new Map(req.files));
    else if (req.kind === 'writeUFO') {
      const map = fontToUfo(req.font);
      result = Array.from(map.entries());
    }
    const ok: Response = { id: req.id, kind: 'ok', result };
    ctx.postMessage(ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errResp: Response = { id: req.id, kind: 'err', message: msg };
    ctx.postMessage(errResp);
  }
});
```

- [ ] **Step 3: Implement main-thread client**

```ts
// packages/font-io/src/worker/client.ts
import type { Font } from '@interrobang/core';
import type { Request, Response } from './protocol.js';

export class FontIoClient {
  private nextId = 1;
  private pending = new Map<number, (r: Response) => void>();

  constructor(private worker: Worker) {
    worker.addEventListener('message', (e: MessageEvent<Response>) => {
      const cb = this.pending.get(e.data.id);
      if (cb) {
        this.pending.delete(e.data.id);
        cb(e.data);
      }
    });
  }

  private call<T>(req: Omit<Request, 'id'>): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => {
        if (r.kind === 'ok') resolve(r.result as T);
        else reject(new Error(r.message));
      });
      this.worker.postMessage({ ...req, id } as Request);
    });
  }

  parseOTF(bytes: ArrayBuffer): Promise<Font> { return this.call({ kind: 'parseOTF', bytes }); }
  writeOTF(font: Font): Promise<ArrayBuffer> { return this.call({ kind: 'writeOTF', font }); }
  parseUFO(files: Map<string, Uint8Array>): Promise<Font> {
    return this.call({ kind: 'parseUFO', files: Array.from(files.entries()) });
  }
  writeUFO(font: Font): Promise<Map<string, Uint8Array>> {
    return this.call<[string, Uint8Array][]>({ kind: 'writeUFO', font }).then((arr) => new Map(arr));
  }

  terminate(): void { this.worker.terminate(); }
}

export function createFontIoWorker(): FontIoClient {
  const worker = new Worker(new URL('./font-io-worker.ts', import.meta.url), { type: 'module' });
  return new FontIoClient(worker);
}
```

- [ ] **Step 4: Re-export and commit**

```ts
// append packages/font-io/src/index.ts
export { FontIoClient, createFontIoWorker } from './worker/client.js';
export type { Request as FontIoRequest, Response as FontIoResponse } from './worker/protocol.js';
```

```bash
git add packages/font-io
git commit -m "feat(font-io): worker RPC wrapper for parse/write off main thread"
```

(No worker integration test in Phase 1 — happy-dom doesn't run real workers. Worker is exercised manually in `apps/web` and covered by Phase 3 E2E.)

---

## Phase 1, Module D — `packages/storage`

wa-sqlite running in a dedicated worker. The main thread sees an async storage adapter; the worker owns the DB connection and the schema migrations.

### Task D.1: wa-sqlite worker bootstrap

**Files:**
- Modify: `packages/storage/package.json`
- Create: `packages/storage/src/worker/sqlite-worker.ts`
- Create: `packages/storage/src/worker/protocol.ts`
- Create: `packages/storage/src/worker/client.ts`

- [ ] **Step 1: Install wa-sqlite**

Run: `cd packages/storage && bun add wa-sqlite`

- [ ] **Step 2: Define the protocol**

```ts
// packages/storage/src/worker/protocol.ts
export type Request =
  | { id: number; kind: 'open'; dbName: string }
  | { id: number; kind: 'exec'; sql: string }
  | { id: number; kind: 'query'; sql: string; params: SqlValue[] }
  | { id: number; kind: 'mutate'; sql: string; params: SqlValue[] };

export type Response =
  | { id: number; kind: 'ok'; rows?: Row[]; changes?: number }
  | { id: number; kind: 'err'; message: string };

export type SqlValue = string | number | null | Uint8Array;
export type Row = Record<string, SqlValue>;
```

- [ ] **Step 3: Worker entry**

```ts
// packages/storage/src/worker/sqlite-worker.ts
/// <reference lib="webworker" />
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import type { Request, Response, Row, SqlValue } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let api: ReturnType<typeof SQLite.Factory> | null = null;
let db: number | null = null;

async function open(dbName: string): Promise<void> {
  const module = await SQLiteESMFactory();
  api = SQLite.Factory(module);
  let vfs;
  try {
    vfs = await OPFSCoopSyncVFS.create(`opfs-${dbName}`, module);
  } catch {
    vfs = await IDBBatchAtomicVFS.create(`idb-${dbName}`, module);
  }
  api.vfs_register(vfs, true);
  db = await api.open_v2(dbName);
}

async function exec(sql: string): Promise<void> {
  if (!api || db === null) throw new Error('DB not open');
  await api.exec(db, sql);
}

async function run(sql: string, params: SqlValue[]): Promise<{ rows: Row[]; changes: number }> {
  if (!api || db === null) throw new Error('DB not open');
  const rows: Row[] = [];
  const stmt = await prepare(api, db, sql);
  try {
    bindParams(api, stmt, params);
    while ((await api.step(stmt)) === SQLite.SQLITE_ROW) {
      rows.push(readRow(api, stmt));
    }
  } finally {
    await api.finalize(stmt);
  }
  const changes = api.changes(db);
  return { rows, changes };
}

async function prepare(api: ReturnType<typeof SQLite.Factory>, db: number, sql: string): Promise<number> {
  const it = api.statements(db, sql);
  const next = await it.next();
  if (next.done || next.value === undefined) throw new Error('No statement');
  return next.value;
}

function bindParams(api: ReturnType<typeof SQLite.Factory>, stmt: number, params: SqlValue[]): void {
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    const idx = i + 1;
    if (p === null) api.bind_null(stmt, idx);
    else if (typeof p === 'string') api.bind_text(stmt, idx, p);
    else if (typeof p === 'number') {
      Number.isInteger(p) ? api.bind_int(stmt, idx, p) : api.bind_double(stmt, idx, p);
    } else api.bind_blob(stmt, idx, p);
  }
}

function readRow(api: ReturnType<typeof SQLite.Factory>, stmt: number): Row {
  const out: Row = {};
  const colCount = api.column_count(stmt);
  for (let i = 0; i < colCount; i++) {
    const name = api.column_name(stmt, i);
    const type = api.column_type(stmt, i);
    if (type === SQLite.SQLITE_INTEGER) out[name] = api.column_int(stmt, i);
    else if (type === SQLite.SQLITE_FLOAT) out[name] = api.column_double(stmt, i);
    else if (type === SQLite.SQLITE_TEXT) out[name] = api.column_text(stmt, i);
    else if (type === SQLite.SQLITE_BLOB) out[name] = api.column_blob(stmt, i);
    else out[name] = null;
  }
  return out;
}

ctx.addEventListener('message', async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    if (req.kind === 'open') {
      await open(req.dbName);
      ctx.postMessage({ id: req.id, kind: 'ok' } satisfies Response);
    } else if (req.kind === 'exec') {
      await exec(req.sql);
      ctx.postMessage({ id: req.id, kind: 'ok' } satisfies Response);
    } else if (req.kind === 'query' || req.kind === 'mutate') {
      const out = await run(req.sql, req.params);
      ctx.postMessage({ id: req.id, kind: 'ok', rows: out.rows, changes: out.changes } satisfies Response);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ id: req.id, kind: 'err', message } satisfies Response);
  }
});
```

- [ ] **Step 4: Main-thread client**

```ts
// packages/storage/src/worker/client.ts
import type { Request, Response, SqlValue, Row } from './protocol.js';

export class SqliteClient {
  private nextId = 1;
  private pending = new Map<number, (r: Response) => void>();

  constructor(private worker: Worker) {
    worker.addEventListener('message', (e: MessageEvent<Response>) => {
      const cb = this.pending.get(e.data.id);
      if (cb) { this.pending.delete(e.data.id); cb(e.data); }
    });
  }

  private call(req: Omit<Request, 'id'>): Promise<Response> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => (r.kind === 'ok' ? resolve(r) : reject(new Error(r.message))));
      this.worker.postMessage({ ...req, id } as Request);
    });
  }

  open(dbName: string): Promise<void> {
    return this.call({ kind: 'open', dbName }).then(() => undefined);
  }
  exec(sql: string): Promise<void> {
    return this.call({ kind: 'exec', sql }).then(() => undefined);
  }
  query(sql: string, params: SqlValue[] = []): Promise<Row[]> {
    return this.call({ kind: 'query', sql, params }).then((r) => (r as { rows: Row[] }).rows);
  }
  mutate(sql: string, params: SqlValue[] = []): Promise<number> {
    return this.call({ kind: 'mutate', sql, params }).then((r) => (r as { changes: number }).changes);
  }
}

export function createSqliteClient(): SqliteClient {
  const worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' });
  return new SqliteClient(worker);
}
```

- [ ] **Step 5: Commit**

(No automated test in Phase 1 — happy-dom can't load the wa-sqlite WASM module reliably. This module is exercised by `apps/web` smoke tests in Module F and the Phase 3 E2E plan. Manual verification: load `apps/web` and confirm "DB ready" log.)

```bash
git add packages/storage bun.lockb
git commit -m "feat(storage): wa-sqlite worker with OPFSCoopSyncVFS + IDB fallback"
```

### Task D.2: Migration runner

**Files:**
- Create: `packages/storage/src/migrations.ts`

- [ ] **Step 1: Implement**

```ts
// packages/storage/src/migrations.ts
import { getClientDDL, MIGRATION_VERSION } from '@interrobang/schema';
import type { SqliteClient } from './worker/client.js';

export async function runMigrations(db: SqliteClient): Promise<void> {
  const rows = await db.query('PRAGMA user_version');
  const current = Number((rows[0] as { user_version?: number } | undefined)?.user_version ?? 0);
  if (current >= MIGRATION_VERSION) return;
  const ddl = getClientDDL();
  await db.exec('BEGIN');
  try {
    await db.exec(ddl);
    await db.exec(`PRAGMA user_version = ${MIGRATION_VERSION}`);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/storage
git commit -m "feat(storage): migration runner driven by PRAGMA user_version"
```

### Task D.3: Storage adapter interface

**Files:**
- Create: `packages/storage/src/adapter.ts`

- [ ] **Step 1: Define the interface**

```ts
// packages/storage/src/adapter.ts
import type { Font } from '@interrobang/core';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  revision: number;
}

export interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<string>;
  loadFont(projectId: string): Promise<Font>;
  saveFont(projectId: string, font: Font): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  readBlob(projectId: string, key: string): Promise<Uint8Array | null>;
  writeBlob(projectId: string, key: string, bytes: Uint8Array): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/storage
git commit -m "feat(storage): define StorageAdapter interface"
```

### Task D.4: Browser storage adapter implementation

**Files:**
- Create: `packages/storage/src/browser/browser-adapter.ts`
- Create: `packages/storage/src/browser/serialize.ts`

- [ ] **Step 1: Serialization helpers**

```ts
// packages/storage/src/browser/serialize.ts
import type { Font, Glyph, Layer } from '@interrobang/core';

export function serializeLayer(layer: Layer): {
  contoursJson: string; componentsJson: string; anchorsJson: string;
} {
  return {
    contoursJson: JSON.stringify(layer.contours),
    componentsJson: JSON.stringify(layer.components),
    anchorsJson: JSON.stringify(layer.anchors),
  };
}

export function deserializeLayer(row: {
  id: string; master_id: string;
  contours_json: string; components_json: string; anchors_json: string;
}): Layer {
  return {
    id: row.id,
    masterId: row.master_id,
    contours: JSON.parse(row.contours_json),
    components: JSON.parse(row.components_json),
    anchors: JSON.parse(row.anchors_json),
  };
}

export function serializeGlyph(g: Glyph): {
  id: string; name: string; advance_width: number;
  unicode_codepoint: number | null; revision: number;
} {
  return {
    id: g.id, name: g.name, advance_width: g.advanceWidth,
    unicode_codepoint: g.unicodeCodepoint, revision: g.revision,
  };
}
```

- [ ] **Step 2: Implement adapter**

```ts
// packages/storage/src/browser/browser-adapter.ts
import { newId, type Font, type Glyph } from '@interrobang/core';
import type { SqliteClient } from '../worker/client.js';
import type { ProjectSummary, StorageAdapter } from '../adapter.js';
import { serializeGlyph, serializeLayer, deserializeLayer } from './serialize.js';

export class BrowserStorageAdapter implements StorageAdapter {
  constructor(private db: SqliteClient) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = await this.db.query(
      'SELECT id, name, updated_at, revision FROM projects ORDER BY updated_at DESC',
    );
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      updatedAt: r.updated_at as number,
      revision: r.revision as number,
    }));
  }

  async createProject(name: string): Promise<string> {
    const id = newId();
    const now = Date.now();
    await this.db.mutate(
      'INSERT INTO projects(id, name, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 0)',
      [id, name, now, now],
    );
    const masterId = newId();
    await this.db.mutate(
      'INSERT INTO masters(id, project_id, name, weight, width) VALUES (?, ?, ?, 400, 100)',
      [masterId, id, 'Regular'],
    );
    await this.db.mutate(
      `INSERT INTO font_meta(project_id, family_name, style_name, units_per_em, ascender, descender, cap_height, x_height)
       VALUES (?, ?, 'Regular', 1000, 800, -200, 700, 500)`,
      [id, name],
    );
    return id;
  }

  async loadFont(projectId: string): Promise<Font> {
    const meta = (await this.db.query(
      'SELECT * FROM font_meta WHERE project_id = ?', [projectId],
    ))[0];
    if (!meta) throw new Error(`No project: ${projectId}`);

    const masterRows = await this.db.query(
      'SELECT * FROM masters WHERE project_id = ?', [projectId],
    );
    const glyphRows = await this.db.query(
      'SELECT * FROM glyphs WHERE project_id = ?', [projectId],
    );
    const layerRows = await this.db.query(
      `SELECT layers.* FROM layers
       INNER JOIN glyphs ON glyphs.id = layers.glyph_id
       WHERE glyphs.project_id = ?`, [projectId],
    );
    const kerningRows = await this.db.query(
      'SELECT * FROM kerning_pairs WHERE project_id = ?', [projectId],
    );

    const layersByGlyph = new Map<string, ReturnType<typeof deserializeLayer>[]>();
    for (const r of layerRows) {
      const arr = layersByGlyph.get(r.glyph_id as string) ?? [];
      arr.push(deserializeLayer(r as never));
      layersByGlyph.set(r.glyph_id as string, arr);
    }

    const projRow = (await this.db.query(
      'SELECT id, revision FROM projects WHERE id = ?', [projectId],
    ))[0]!;

    const glyphs: { [id: string]: Glyph } = {};
    const order: string[] = [];
    for (const g of glyphRows) {
      const id = g.id as string;
      glyphs[id] = {
        id,
        name: g.name as string,
        advanceWidth: g.advance_width as number,
        unicodeCodepoint: (g.unicode_codepoint as number | null) ?? null,
        layers: layersByGlyph.get(id) ?? [],
        revision: g.revision as number,
      };
      order.push(id);
    }

    return {
      id: projRow.id as string,
      meta: {
        familyName: meta.family_name as string,
        styleName: meta.style_name as string,
        unitsPerEm: meta.units_per_em as number,
        ascender: meta.ascender as number,
        descender: meta.descender as number,
        capHeight: meta.cap_height as number,
        xHeight: meta.x_height as number,
      },
      masters: masterRows.map((m) => ({
        id: m.id as string,
        name: m.name as string,
        weight: m.weight as number,
        width: m.width as number,
      })),
      glyphs,
      glyphOrder: order,
      kerning: kerningRows.map((k) => ({
        leftGlyph: k.left_glyph as string,
        rightGlyph: k.right_glyph as string,
        value: k.value as number,
      })),
      revision: projRow.revision as number,
    };
  }

  async saveFont(projectId: string, font: Font): Promise<void> {
    await this.db.exec('BEGIN');
    try {
      // Replace meta
      await this.db.mutate(
        `UPDATE font_meta SET family_name=?, style_name=?, units_per_em=?, ascender=?, descender=?,
                              cap_height=?, x_height=? WHERE project_id=?`,
        [
          font.meta.familyName, font.meta.styleName, font.meta.unitsPerEm,
          font.meta.ascender, font.meta.descender, font.meta.capHeight, font.meta.xHeight, projectId,
        ],
      );

      // Replace glyphs + layers (delete-and-insert at v1; full normalization is a Phase 3 concern)
      await this.db.mutate('DELETE FROM glyphs WHERE project_id = ?', [projectId]);

      for (const id of font.glyphOrder) {
        const g = font.glyphs[id]!;
        const row = serializeGlyph(g);
        await this.db.mutate(
          `INSERT INTO glyphs(id, project_id, name, advance_width, unicode_codepoint, revision)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.id, projectId, row.name, row.advance_width, row.unicode_codepoint, row.revision],
        );
        for (const layer of g.layers) {
          const ser = serializeLayer(layer);
          await this.db.mutate(
            `INSERT INTO layers(id, glyph_id, master_id, contours_json, components_json, anchors_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [layer.id, g.id, layer.masterId, ser.contoursJson, ser.componentsJson, ser.anchorsJson],
          );
        }
      }

      // Replace kerning
      await this.db.mutate('DELETE FROM kerning_pairs WHERE project_id = ?', [projectId]);
      for (const k of font.kerning) {
        await this.db.mutate(
          `INSERT INTO kerning_pairs(project_id, left_glyph, right_glyph, value, revision)
           VALUES (?, ?, ?, ?, 0)`,
          [projectId, k.leftGlyph, k.rightGlyph, k.value],
        );
      }

      await this.db.mutate(
        'UPDATE projects SET updated_at=?, revision=? WHERE id=?',
        [Date.now(), font.revision, projectId],
      );
      await this.db.exec('COMMIT');
    } catch (err) {
      await this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.db.mutate('DELETE FROM projects WHERE id = ?', [projectId]);
  }

  async readBlob(projectId: string, key: string): Promise<Uint8Array | null> {
    const rows = await this.db.query(
      'SELECT bytes FROM project_blobs WHERE project_id = ? AND key = ?',
      [projectId, key],
    );
    return (rows[0]?.bytes as Uint8Array | undefined) ?? null;
  }

  async writeBlob(projectId: string, key: string, bytes: Uint8Array): Promise<void> {
    await this.db.mutate(
      `INSERT INTO project_blobs(project_id, key, bytes) VALUES (?, ?, ?)
       ON CONFLICT(project_id, key) DO UPDATE SET bytes = excluded.bytes`,
      [projectId, key, bytes],
    );
  }
}
```

- [ ] **Step 3: Re-export and commit**

```ts
// packages/storage/src/index.ts
export type { StorageAdapter, ProjectSummary } from './adapter.js';
export { BrowserStorageAdapter } from './browser/browser-adapter.js';
export { SqliteClient, createSqliteClient } from './worker/client.js';
export { runMigrations } from './migrations.js';
```

```bash
git add packages/storage
git commit -m "feat(storage): browser storage adapter (CRUD over SQLite worker)"
```

### Task D.5: Single-tab guard via BroadcastChannel

**Files:**
- Create: `packages/storage/src/single-tab-guard.ts`

- [ ] **Step 1: Implement**

```ts
// packages/storage/src/single-tab-guard.ts
const CHANNEL = 'interrobang.tabs';

export function claimSingleTab(): Promise<'leader' | 'follower'> {
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(CHANNEL);
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ch.postMessage({ type: 'leader' });
        resolve('leader');
      }
    }, 250);
    ch.addEventListener('message', (e: MessageEvent<{ type: string }>) => {
      if (e.data.type === 'leader' && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        ch.postMessage({ type: 'busy' });
        resolve('follower');
      }
    });
    ch.postMessage({ type: 'probe' });
  });
}
```

- [ ] **Step 2: Re-export and commit**

```ts
// append packages/storage/src/index.ts
export { claimSingleTab } from './single-tab-guard.js';
```

```bash
git add packages/storage
git commit -m "feat(storage): claimSingleTab guard via BroadcastChannel"
```

---

## Phase 1, Module E — `packages/editor`

The Canvas 2D editor surface. Lives as a React leaf with imperative internals. All transient state is internal; committed edits go through `applyCommand`. Three channels per the spec.

### Task E.1: Viewport math (pan/zoom transform)

**Files:**
- Create: `packages/editor/src/viewport.ts`
- Create: `packages/editor/src/viewport.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/editor/src/viewport.test.ts
import { test, expect } from 'bun:test';
import { Viewport } from './viewport.js';

test('default viewport maps font origin to canvas centre', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const { x, y } = vp.fontToScreen(0, 0);
  expect(x).toBe(400);
  expect(y).toBe(300);
});

test('Y axis flips (font Y up, screen Y down)', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const a = vp.fontToScreen(0, 0);
  const b = vp.fontToScreen(0, 100);
  expect(b.y).toBeLessThan(a.y);
});

test('zoom about a pivot keeps the pivot stable', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const before = vp.fontToScreen(50, 50);
  vp.zoomAbout(2, before.x, before.y);
  const after = vp.fontToScreen(50, 50);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
});

test('panBy translates everything', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  vp.panBy(10, -20);
  const { x, y } = vp.fontToScreen(0, 0);
  expect(x).toBe(410);
  expect(y).toBe(280);
});

test('screenToFont inverts fontToScreen', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  vp.zoomAbout(1.5, 200, 200);
  vp.panBy(13, -7);
  const screen = vp.fontToScreen(123, 456);
  const back = vp.screenToFont(screen.x, screen.y);
  expect(back.x).toBeCloseTo(123);
  expect(back.y).toBeCloseTo(456);
});
```

- [ ] **Step 2: Run test (FAIL)** — `bun test`

- [ ] **Step 3: Implement**

```ts
// packages/editor/src/viewport.ts
export interface ViewportOpts { canvasWidth: number; canvasHeight: number; }

export class Viewport {
  private scale = 1;
  private originX: number;
  private originY: number;

  constructor(opts: ViewportOpts) {
    this.originX = opts.canvasWidth / 2;
    this.originY = opts.canvasHeight / 2;
  }

  fontToScreen(fx: number, fy: number): { x: number; y: number } {
    return { x: this.originX + fx * this.scale, y: this.originY - fy * this.scale };
  }

  screenToFont(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.originX) / this.scale, y: (this.originY - sy) / this.scale };
  }

  zoomAbout(factor: number, screenX: number, screenY: number): void {
    const fontPt = this.screenToFont(screenX, screenY);
    this.scale *= factor;
    const newScreen = this.fontToScreen(fontPt.x, fontPt.y);
    this.originX += screenX - newScreen.x;
    this.originY += screenY - newScreen.y;
  }

  panBy(dx: number, dy: number): void {
    this.originX += dx;
    this.originY += dy;
  }

  getScale(): number { return this.scale; }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.originX = canvasWidth / 2;
    this.originY = canvasHeight / 2;
  }
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Commit**

```bash
git add packages/editor
git commit -m "feat(editor): Viewport with pan, zoom-about-pivot, and inverse mapping"
```

### Task E.2: Hit testing

**Files:**
- Create: `packages/editor/src/hit-test.ts`
- Create: `packages/editor/src/hit-test.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/editor/src/hit-test.test.ts
import { test, expect } from 'bun:test';
import type { Layer } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { hitTest } from './hit-test.js';

const layer: Layer = {
  id: 'l1', masterId: 'm1', anchors: [], components: [],
  contours: [{
    id: 'c1', closed: true,
    points: [
      { id: 'p1', x: 0, y: 0, type: 'line', smooth: false },
      { id: 'p2', x: 100, y: 0, type: 'line', smooth: false },
      { id: 'p3', x: 100, y: 100, type: 'line', smooth: false },
    ],
  }],
};

test('hit on a point returns its id', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const screen = vp.fontToScreen(100, 0);
  const hit = hitTest(layer, vp, screen.x, screen.y, 8);
  expect(hit).toEqual({ kind: 'point', pointId: 'p2', contourId: 'c1' });
});

test('miss returns null', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const hit = hitTest(layer, vp, 0, 0, 4);
  expect(hit).toBeNull();
});

test('within tolerance counts as hit', () => {
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const screen = vp.fontToScreen(100, 0);
  const hit = hitTest(layer, vp, screen.x + 5, screen.y - 5, 8);
  expect(hit).not.toBeNull();
});
```

- [ ] **Step 2: Run test (FAIL)** — `bun test`

- [ ] **Step 3: Implement**

```ts
// packages/editor/src/hit-test.ts
import type { Layer } from '@interrobang/core';
import type { Viewport } from './viewport.js';

export type HitResult = { kind: 'point'; pointId: string; contourId: string } | null;

export function hitTest(
  layer: Layer,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  tolerancePx: number,
): HitResult {
  let best: { dist: number; result: HitResult } = { dist: Infinity, result: null };
  for (const contour of layer.contours) {
    for (const p of contour.points) {
      const screen = viewport.fontToScreen(p.x, p.y);
      const dx = screen.x - screenX;
      const dy = screen.y - screenY;
      const dist = Math.hypot(dx, dy);
      if (dist <= tolerancePx && dist < best.dist) {
        best = { dist, result: { kind: 'point', pointId: p.id, contourId: contour.id } };
      }
    }
  }
  return best.result;
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Commit**

```bash
git add packages/editor
git commit -m "feat(editor): point hit-testing with screen-space tolerance"
```

### Task E.3: Glyph renderer (pure draw on a Canvas 2D context)

**Files:**
- Create: `packages/editor/src/render.ts`
- Create: `packages/editor/src/render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor/src/render.test.ts
import { test, expect, mock } from 'bun:test';
import type { Layer } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { drawLayer } from './render.js';

function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    beginPath: mock(() => calls.push('beginPath')),
    moveTo: mock((x: number, y: number) => calls.push(`moveTo(${x},${y})`)),
    lineTo: mock((x: number, y: number) => calls.push(`lineTo(${x},${y})`)),
    closePath: mock(() => calls.push('closePath')),
    stroke: mock(() => calls.push('stroke')),
    fill: mock(() => calls.push('fill')),
    arc: mock(() => calls.push('arc')),
    quadraticCurveTo: mock(() => calls.push('quadraticCurveTo')),
    bezierCurveTo: mock(() => calls.push('bezierCurveTo')),
    save: mock(() => calls.push('save')),
    restore: mock(() => calls.push('restore')),
    set strokeStyle(_: string) { /* noop */ },
    set fillStyle(_: string) { /* noop */ },
    set lineWidth(_: number) { /* noop */ },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

test('drawLayer issues moveTo + lineTo for a triangle contour', () => {
  const layer: Layer = {
    id: 'l1', masterId: 'm1', anchors: [], components: [],
    contours: [{
      id: 'c1', closed: true,
      points: [
        { id: 'p1', x: 0, y: 0, type: 'line', smooth: false },
        { id: 'p2', x: 100, y: 0, type: 'line', smooth: false },
        { id: 'p3', x: 50, y: 100, type: 'line', smooth: false },
      ],
    }],
  };
  const vp = new Viewport({ canvasWidth: 800, canvasHeight: 600 });
  const { ctx, calls } = fakeCtx();
  drawLayer(ctx, layer, vp, new Set());
  expect(calls.some((c) => c.startsWith('moveTo'))).toBe(true);
  expect(calls.filter((c) => c.startsWith('lineTo')).length).toBeGreaterThanOrEqual(2);
  expect(calls).toContain('closePath');
  expect(calls).toContain('stroke');
});
```

- [ ] **Step 2: Run test (FAIL)** — `bun test`

- [ ] **Step 3: Implement**

```ts
// packages/editor/src/render.ts
import type { Contour, Layer } from '@interrobang/core';
import type { Viewport } from './viewport.js';

export interface RenderTheme {
  outline: string;
  point: string;
  pointSelected: string;
  pointOff: string;
  handle: string;
}

export const DEFAULT_THEME: RenderTheme = {
  outline: '#e6e6e6',
  point: '#3aa9ff',
  pointSelected: '#ff7a3a',
  pointOff: '#9aa0a6',
  handle: '#5a6066',
};

const POINT_RADIUS = 3.5;

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  viewport: Viewport,
  selectedPointIds: ReadonlySet<string>,
  theme: RenderTheme = DEFAULT_THEME,
): void {
  for (const contour of layer.contours) drawContourPath(ctx, contour, viewport, theme);
  for (const contour of layer.contours) drawContourPoints(ctx, contour, viewport, selectedPointIds, theme);
}

function drawContourPath(ctx: CanvasRenderingContext2D, contour: Contour, vp: Viewport, theme: RenderTheme): void {
  if (contour.points.length === 0) return;
  ctx.beginPath();
  let i = 0;
  const first = vp.fontToScreen(contour.points[0]!.x, contour.points[0]!.y);
  ctx.moveTo(first.x, first.y);
  i = 1;
  while (i < contour.points.length) {
    const p = contour.points[i]!;
    const screen = vp.fontToScreen(p.x, p.y);
    if (p.type === 'line') ctx.lineTo(screen.x, screen.y);
    else if (p.type === 'qcurve') {
      const c = vp.fontToScreen(contour.points[i - 1]!.x, contour.points[i - 1]!.y);
      ctx.quadraticCurveTo(c.x, c.y, screen.x, screen.y);
    } else if (p.type === 'curve') {
      const c1 = vp.fontToScreen(contour.points[i - 2]!.x, contour.points[i - 2]!.y);
      const c2 = vp.fontToScreen(contour.points[i - 1]!.x, contour.points[i - 1]!.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, screen.x, screen.y);
    }
    i += 1;
  }
  if (contour.closed) ctx.closePath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.outline;
  ctx.stroke();
}

function drawContourPoints(
  ctx: CanvasRenderingContext2D, contour: Contour, vp: Viewport,
  selected: ReadonlySet<string>, theme: RenderTheme,
): void {
  for (const p of contour.points) {
    const screen = vp.fontToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = selected.has(p.id)
      ? theme.pointSelected
      : p.type === 'offcurve' ? theme.pointOff : theme.point;
    ctx.fill();
  }
}
```

- [ ] **Step 4: Run test (PASS)** — `bun test`

- [ ] **Step 5: Commit**

```bash
git add packages/editor
git commit -m "feat(editor): Canvas 2D renderer for layers (outline + points)"
```

### Task E.4: EditorCanvas React component (the leaf)

**Files:**
- Modify: `packages/editor/package.json`
- Create: `packages/editor/src/EditorCanvas.tsx`

- [ ] **Step 1: Install React**

Run: `cd packages/editor && bun add react && bun add -d @types/react`

- [ ] **Step 2: Implement**

```tsx
// packages/editor/src/EditorCanvas.tsx
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import type { Glyph } from '@interrobang/core';
import { Viewport } from './viewport.js';
import { drawLayer } from './render.js';
import { hitTest } from './hit-test.js';

export interface LiveEditEvent {
  kind: 'point-drag';
  pointIds: readonly string[];
  dx: number;
  dy: number;
}

export type LiveEditListener = (e: LiveEditEvent) => void;

export interface EditorCanvasHandle {
  setGlyph(glyph: Glyph): void;
  setSelection(ids: ReadonlySet<string>): void;
  setTool(tool: 'select' | 'pen'): void;
  fitToView(): void;
  on(event: 'liveEdit', cb: LiveEditListener): () => void;
}

export interface EditorCanvasProps {
  width: number;
  height: number;
  initialGlyph: Glyph;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { width, height, initialGlyph, onCommitMove, onSelectionChange }, ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    glyph: initialGlyph,
    selection: new Set<string>(),
    tool: 'select' as 'select' | 'pen',
    drag: null as null | { pointIds: string[]; startFontX: number; startFontY: number; lastDx: number; lastDy: number },
  });
  const viewportRef = useRef(new Viewport({ canvasWidth: width, canvasHeight: height }));
  const liveListenersRef = useRef(new Set<LiveEditListener>());
  const rafRef = useRef<number | null>(null);

  function scheduleDraw(): void {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const layer = stateRef.current.glyph.layers[0];
      if (layer) drawLayer(ctx, layer, viewportRef.current, stateRef.current.selection);
    });
  }

  useImperativeHandle(ref, () => ({
    setGlyph(glyph) { stateRef.current.glyph = glyph; scheduleDraw(); },
    setSelection(ids) { stateRef.current.selection = new Set(ids); scheduleDraw(); },
    setTool(tool) { stateRef.current.tool = tool; },
    fitToView() {
      viewportRef.current = new Viewport({ canvasWidth: width, canvasHeight: height });
      scheduleDraw();
    },
    on(_event, cb) {
      liveListenersRef.current.add(cb);
      return () => liveListenersRef.current.delete(cb);
    },
  }));

  useEffect(() => { scheduleDraw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [width, height]);

  function emitLive(e: LiveEditEvent): void {
    for (const cb of liveListenersRef.current) cb(e);
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const layer = stateRef.current.glyph.layers[0];
    if (!layer) return;
    const hit = hitTest(layer, viewportRef.current, sx, sy, 8);
    if (hit && hit.kind === 'point') {
      const ids = stateRef.current.selection.has(hit.pointId)
        ? Array.from(stateRef.current.selection)
        : [hit.pointId];
      stateRef.current.selection = new Set(ids);
      onSelectionChange?.(stateRef.current.selection);
      const startFont = viewportRef.current.screenToFont(sx, sy);
      stateRef.current.drag = {
        pointIds: ids,
        startFontX: startFont.x, startFontY: startFont.y,
        lastDx: 0, lastDy: 0,
      };
      scheduleDraw();
    } else {
      stateRef.current.selection = new Set();
      onSelectionChange?.(stateRef.current.selection);
      scheduleDraw();
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = stateRef.current.drag;
    if (!drag) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cur = viewportRef.current.screenToFont(sx, sy);
    const dx = cur.x - drag.startFontX;
    const dy = cur.y - drag.startFontY;
    const stepDx = dx - drag.lastDx;
    const stepDy = dy - drag.lastDy;
    drag.lastDx = dx; drag.lastDy = dy;
    // mutate the in-memory glyph for preview only — committed on mouseup
    stateRef.current.glyph = previewMove(stateRef.current.glyph, drag.pointIds, stepDx, stepDy);
    emitLive({ kind: 'point-drag', pointIds: drag.pointIds, dx, dy });
    scheduleDraw();
  }

  function onMouseUp() {
    const drag = stateRef.current.drag;
    if (drag) {
      onCommitMove?.(drag.pointIds, drag.lastDx, drag.lastDy);
      stateRef.current.drag = null;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      className="editor-canvas"
    />
  );
});

function previewMove(glyph: Glyph, pointIds: readonly string[], dx: number, dy: number): Glyph {
  const ids = new Set(pointIds);
  return {
    ...glyph,
    layers: glyph.layers.map((layer) => ({
      ...layer,
      contours: layer.contours.map((c) => ({
        ...c,
        points: c.points.map((p) => (ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
      })),
    })),
  };
}
```

- [ ] **Step 3: Re-export and commit**

```ts
// packages/editor/src/index.ts
export { EditorCanvas } from './EditorCanvas.js';
export type { EditorCanvasHandle, EditorCanvasProps, LiveEditEvent, LiveEditListener } from './EditorCanvas.js';
export { Viewport } from './viewport.js';
export { hitTest } from './hit-test.js';
export { drawLayer, DEFAULT_THEME } from './render.js';
```

```bash
git add packages/editor bun.lockb
git commit -m "feat(editor): EditorCanvas React leaf with imperative handle and channels"
```

### Task E.5: Pen tool (insert points)

**Files:**
- Modify: `packages/editor/src/EditorCanvas.tsx`

- [ ] **Step 1: Add pen-tool branch in onMouseDown**

Replace the contents of `onMouseDown` with:

```tsx
function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
  const rect = canvasRef.current!.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const layer = stateRef.current.glyph.layers[0];
  if (!layer) return;

  if (stateRef.current.tool === 'pen') {
    const fontPt = viewportRef.current.screenToFont(sx, sy);
    onPenClick?.(fontPt.x, fontPt.y);
    return;
  }

  const hit = hitTest(layer, viewportRef.current, sx, sy, 8);
  if (hit && hit.kind === 'point') {
    const ids = stateRef.current.selection.has(hit.pointId)
      ? Array.from(stateRef.current.selection) : [hit.pointId];
    stateRef.current.selection = new Set(ids);
    onSelectionChange?.(stateRef.current.selection);
    const startFont = viewportRef.current.screenToFont(sx, sy);
    stateRef.current.drag = {
      pointIds: ids, startFontX: startFont.x, startFontY: startFont.y, lastDx: 0, lastDy: 0,
    };
    scheduleDraw();
  } else {
    stateRef.current.selection = new Set();
    onSelectionChange?.(stateRef.current.selection);
    scheduleDraw();
  }
}
```

- [ ] **Step 2: Add `onPenClick` to props**

```tsx
export interface EditorCanvasProps {
  width: number;
  height: number;
  initialGlyph: Glyph;
  onCommitMove?: (pointIds: readonly string[], dx: number, dy: number) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onPenClick?: (fontX: number, fontY: number) => void;
}
```

And destructure `onPenClick` in the component.

- [ ] **Step 3: Commit**

```bash
git add packages/editor
git commit -m "feat(editor): pen tool emits onPenClick with font coordinates"
```

---

## Phase 1, Module F — `apps/web` (the SPA)

React 19 + TanStack Router + Tailwind v4 + shadcn/ui (Base UI). Wires the storage worker, font-io worker, and editor together.

### Task F.1: Vite scaffold + Bun dev script

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`

- [ ] **Step 1: Install deps**

Run:

```bash
cd apps/web
bun add react react-dom @tanstack/react-router
bun add -d @types/react @types/react-dom vite @vitejs/plugin-react typescript
```

- [ ] **Step 2: package.json scripts**

```json
{
  "name": "@interrobang/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

(Why Vite, not the Bun bundler: Vite has a more mature React + workers + WASM story today; Bun bundler is the fallback if Vite causes friction. Bun is still the runtime and test runner — only the *dev server* uses Vite.)

- [ ] **Step 3: vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['wa-sqlite'] },
  server: { port: 5173 },
});
```

- [ ] **Step 4: index.html**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Interrobang</title>
  </head>
  <body class="antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: main.tsx + app.tsx (placeholder)**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

```tsx
// apps/web/src/app.tsx
export function App() {
  return <div className="p-6 text-foreground">Interrobang — bootstrap.</div>;
}
```

```css
/* apps/web/src/styles.css — placeholder, replaced by Tailwind in next task */
:root { color-scheme: dark; }
body { background: #0a0a0a; color: #f0f0f0; font: 14px ui-sans-serif, system-ui; }
```

- [ ] **Step 6: Smoke test the dev server**

Run: `cd apps/web && bun run dev`
Expected: Vite serves on http://localhost:5173 and renders "Interrobang — bootstrap." Open in a browser to confirm. Then Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add apps/web bun.lockb
git commit -m "chore(web): scaffold Vite SPA with React 19 entry"
```

### Task F.2: Tailwind v4 + shadcn/ui (Base UI) init

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/vite.config.ts`
- Create: `components.json`
- Create: `apps/web/src/components/ui/*` (added by shadcn CLI)

- [ ] **Step 1: Install Tailwind v4**

Run: `cd apps/web && bun add -d tailwindcss @tailwindcss/vite`

- [ ] **Step 2: Update vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['wa-sqlite'] },
  server: { port: 5173 },
});
```

- [ ] **Step 3: Replace `apps/web/src/styles.css`**

```css
@import "tailwindcss";

@theme inline {
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;
}
```

- [ ] **Step 4: Init shadcn (Base UI variant)**

Run from the workspace root:

```bash
cd apps/web
npx shadcn@latest init -d --base base-ui
```

Expected: creates `components.json`, `src/components/ui/`, `src/lib/utils.ts`, and updates `styles.css` with shadcn theme tokens. Verify it added `@theme inline` color tokens and the `cn()` util.

- [ ] **Step 5: Apply the Geist font fix from the shadcn skill**

If `shadcn init` introduced `--font-sans: var(--font-sans)` (circular), replace with literal names per the skill (already shown in Step 3 above).

- [ ] **Step 6: Add starter components**

```bash
npx shadcn@latest add button dialog dropdown-menu input label \
  separator sheet tabs tooltip command popover scroll-area alert-dialog
```

- [ ] **Step 7: Smoke-test**

Update `app.tsx`:

```tsx
import { Button } from './components/ui/button.js';

export function App() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-medium">Interrobang</h1>
      <Button>It works</Button>
    </div>
  );
}
```

Run: `bun run dev` and confirm a styled button appears.

- [ ] **Step 8: Commit**

```bash
git add apps/web components.json bun.lockb
git commit -m "chore(web): tailwind v4 + shadcn/ui (base-ui) with starter components"
```

### Task F.3: TanStack Router setup

**Files:**
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/routes/root.tsx`
- Create: `apps/web/src/routes/index.tsx`
- Create: `apps/web/src/routes/project.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Define routes (code-based, not file-based, to keep the skeleton minimal)**

```tsx
// apps/web/src/routes/root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
export const rootRoute = createRootRoute({ component: () => <Outlet /> });
```

```tsx
// apps/web/src/routes/index.tsx
import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './root.js';
import { ProjectPickerPage } from '../pages/ProjectPickerPage.js';

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProjectPickerPage,
});
```

```tsx
// apps/web/src/routes/project.tsx
import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './root.js';
import { EditorPage } from '../pages/EditorPage.js';

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: EditorPage,
});
```

```tsx
// apps/web/src/router.tsx
import { createRouter } from '@tanstack/react-router';
import { rootRoute } from './routes/root.js';
import { indexRoute } from './routes/index.js';
import { projectRoute } from './routes/project.js';

const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
```

- [ ] **Step 2: Wire main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
);
```

- [ ] **Step 3: Page placeholders**

```tsx
// apps/web/src/pages/ProjectPickerPage.tsx
export function ProjectPickerPage() {
  return <div className="p-6">Project picker — coming next.</div>;
}
```

```tsx
// apps/web/src/pages/EditorPage.tsx
import { projectRoute } from '../routes/project.js';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  return <div className="p-6">Editor for project {projectId}</div>;
}
```

- [ ] **Step 4: Smoke test**

Run: `bun run dev`. Visit `/` and `/project/abc`. Confirm both render.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "chore(web): TanStack Router with index and project routes"
```

### Task F.4: Storage bootstrap (singleton service)

**Files:**
- Create: `apps/web/src/services/storage.ts`

- [ ] **Step 1: Implement**

```ts
// apps/web/src/services/storage.ts
import { BrowserStorageAdapter, claimSingleTab, createSqliteClient, runMigrations } from '@interrobang/storage';

let adapterPromise: Promise<BrowserStorageAdapter> | null = null;

export function getStorage(): Promise<BrowserStorageAdapter> {
  if (!adapterPromise) adapterPromise = bootstrap();
  return adapterPromise;
}

async function bootstrap(): Promise<BrowserStorageAdapter> {
  const role = await claimSingleTab();
  if (role === 'follower') {
    throw new Error('SINGLE_TAB');
  }
  const client = createSqliteClient();
  await client.open('interrobang.sqlite');
  await runMigrations(client);
  return new BrowserStorageAdapter(client);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web
git commit -m "feat(web): singleton storage bootstrap with single-tab guard"
```

### Task F.5: Project store (Zustand) — open projects + active id

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/stores/project-store.ts`

- [ ] **Step 1: Install Zustand**

Run: `cd apps/web && bun add zustand`

- [ ] **Step 2: Implement**

```ts
// apps/web/src/stores/project-store.ts
import { create } from 'zustand';
import { UndoRedoStack, type Command, type Font } from '@interrobang/core';

export interface OpenProject {
  id: string;
  name: string;
  font: Font;
  undoStack: UndoRedoStack<Font>;
  dirty: boolean;
}

interface ProjectState {
  openProjects: { [id: string]: OpenProject };
  openOrder: string[];
  activeId: string | null;

  addOpenProject: (p: Omit<OpenProject, 'undoStack' | 'dirty'>) => void;
  closeProject: (id: string) => void;
  setActive: (id: string | null) => void;
  applyCommand: (id: string, cmd: Command<Font>) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  markClean: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  openProjects: {},
  openOrder: [],
  activeId: null,

  addOpenProject(p) {
    set((s) => {
      if (s.openProjects[p.id]) return s;
      return {
        openProjects: { ...s.openProjects, [p.id]: { ...p, undoStack: new UndoRedoStack<Font>(), dirty: false } },
        openOrder: [...s.openOrder, p.id],
        activeId: s.activeId ?? p.id,
      };
    });
  },

  closeProject(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.openProjects;
      const order = s.openOrder.filter((x) => x !== id);
      const activeId = s.activeId === id ? (order[order.length - 1] ?? null) : s.activeId;
      return { openProjects: rest, openOrder: order, activeId };
    });
  },

  setActive(id) { set({ activeId: id }); },

  applyCommand(id, cmd) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const nextFont = proj.undoStack.apply(proj.font, cmd);
    set((s) => ({
      openProjects: { ...s.openProjects, [id]: { ...proj, font: nextFont, dirty: true } },
    }));
  },

  undo(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const next = proj.undoStack.undo(proj.font);
    if (!next) return;
    set((s) => ({ openProjects: { ...s.openProjects, [id]: { ...proj, font: next, dirty: true } } }));
  },

  redo(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    const next = proj.undoStack.redo(proj.font);
    if (!next) return;
    set((s) => ({ openProjects: { ...s.openProjects, [id]: { ...proj, font: next, dirty: true } } }));
  },

  markClean(id) {
    const proj = get().openProjects[id];
    if (!proj) return;
    set((s) => ({ openProjects: { ...s.openProjects, [id]: { ...proj, dirty: false } } }));
  },
}));
```

- [ ] **Step 3: Commit**

```bash
git add apps/web bun.lockb
git commit -m "feat(web): project store with open projects, undo/redo, dirty tracking"
```

### Task F.6: Editor store (Zustand) — tool, selection, sync indicator

**Files:**
- Create: `apps/web/src/stores/editor-store.ts`

- [ ] **Step 1: Implement**

```ts
// apps/web/src/stores/editor-store.ts
import { create } from 'zustand';

export type Tool = 'select' | 'pen';

interface EditorState {
  tool: Tool;
  // selection by glyphId so two tabs can have independent selection
  selectionByGlyph: { [glyphId: string]: ReadonlySet<string> };

  setTool: (t: Tool) => void;
  setSelection: (glyphId: string, ids: ReadonlySet<string>) => void;
  clearSelection: (glyphId: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectionByGlyph: {},

  setTool(tool) { set({ tool }); },
  setSelection(glyphId, ids) {
    set((s) => ({ selectionByGlyph: { ...s.selectionByGlyph, [glyphId]: ids } }));
  },
  clearSelection(glyphId) {
    set((s) => {
      const { [glyphId]: _, ...rest } = s.selectionByGlyph;
      return { selectionByGlyph: rest };
    });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web
git commit -m "feat(web): editor store for tool + selection state"
```

### Task F.7: Project Picker page

**Files:**
- Modify: `apps/web/src/pages/ProjectPickerPage.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/pages/ProjectPickerPage.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { getStorage } from '../services/storage.js';
import type { ProjectSummary } from '@interrobang/storage';

export function ProjectPickerPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('Untitled');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getStorage()
      .then((s) => s.listProjects())
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function create() {
    try {
      const s = await getStorage();
      const id = await s.createProject(name);
      await navigate({ to: '/project/$projectId', params: { projectId: id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error === 'SINGLE_TAB') {
    return (
      <div className="p-6">
        <h2 className="text-xl">Already open in another tab</h2>
        <p className="text-muted-foreground mt-2">Switch to that tab to continue editing.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-3xl font-medium">Interrobang</h1>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
        <Button onClick={create}>New project</Button>
      </div>
      {error && error !== 'SINGLE_TAB' && (
        <div className="text-destructive">{error}</div>
      )}
      <div className="space-y-2">
        {projects === null && <div className="text-muted-foreground">Loading…</div>}
        {projects?.length === 0 && <div className="text-muted-foreground">No projects yet.</div>}
        {projects?.map((p) => (
          <Link
            key={p.id}
            to="/project/$projectId"
            params={{ projectId: p.id }}
            className="block rounded-md border border-border p-3 hover:bg-accent"
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground">
              Updated {new Date(p.updatedAt).toLocaleString()} · rev {p.revision}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

Run: `bun run dev`. Visit `/`. Type a name, click New project. Should navigate to `/project/<id>`.

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): project picker with list + create"
```

### Task F.8: Editor page — load font, render canvas, wire commands

**Files:**
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Create: `apps/web/src/components/EditorShell.tsx`

- [ ] **Step 1: EditorShell**

```tsx
// apps/web/src/components/EditorShell.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Font, Glyph } from '@interrobang/core';
import { movePointsCommand, insertPointCommand } from '@interrobang/core';
import { EditorCanvas, type EditorCanvasHandle } from '@interrobang/editor';
import { useProjectStore } from '../stores/project-store.js';
import { useEditorStore } from '../stores/editor-store.js';
import { Button } from './ui/button.js';

interface Props { projectId: string; }

export function EditorShell({ projectId }: Props) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  const applyCommand = useProjectStore((s) => s.applyCommand);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const tool = useEditorStore((s) => s.tool);
  const setSelection = useEditorStore((s) => s.setSelection);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);

  const activeGlyph: Glyph | null = useMemo(() => {
    if (!proj) return null;
    const firstId = proj.font.glyphOrder[0];
    return firstId ? proj.font.glyphs[firstId] ?? null : null;
  }, [proj?.font]);

  // Keep the canvas in sync with the model (channel ①)
  useEffect(() => {
    if (canvasRef.current && activeGlyph) canvasRef.current.setGlyph(activeGlyph);
  }, [activeGlyph]);

  // Push tool changes (channel ②)
  useEffect(() => { canvasRef.current?.setTool(tool); }, [tool]);

  if (!proj) return <div className="p-6 text-muted-foreground">Loading project…</div>;
  if (!activeGlyph) return (
    <div className="p-6">
      <p className="text-muted-foreground mb-2">No glyphs in this project yet.</p>
      <Button onClick={() => createStarterGlyph(projectId)}>Add a glyph "A"</Button>
    </div>
  );

  return (
    <div className="flex-1">
      <EditorCanvas
        ref={canvasRef}
        width={800}
        height={600}
        initialGlyph={activeGlyph}
        onCommitMove={(pointIds, dx, dy) => {
          const layer = activeGlyph.layers[0]!;
          const contour = layer.contours.find((c) => c.points.some((p) => pointIds.includes(p.id)));
          if (!contour) return;
          applyCommand(projectId, movePointsCommand({
            glyphId: activeGlyph.id, layerId: layer.id, contourId: contour.id,
            pointIds, dx, dy,
          }));
        }}
        onSelectionChange={(ids) => setSelection(activeGlyph.id, ids)}
        onPenClick={(fx, fy) => {
          const layer = activeGlyph.layers[0]!;
          const contour = layer.contours[0];
          if (!contour) return;
          applyCommand(projectId, insertPointCommand({
            glyphId: activeGlyph.id, layerId: layer.id, contourId: contour.id,
            index: contour.points.length,
            point: { id: crypto.randomUUID(), x: fx, y: fy, type: 'line', smooth: false },
          }));
        }}
      />
      <div className="absolute bottom-4 left-4 flex gap-2">
        <Button variant="outline" onClick={() => undo(projectId)}>Undo</Button>
        <Button variant="outline" onClick={() => redo(projectId)}>Redo</Button>
      </div>
    </div>
  );
}

function createStarterGlyph(projectId: string) {
  // Filled in by EditorPage's effect — this UI just delegates upward.
  document.dispatchEvent(new CustomEvent('interrobang:add-starter', { detail: { projectId } }));
}
```

- [ ] **Step 2: EditorPage — load the project on mount**

```tsx
// apps/web/src/pages/EditorPage.tsx
import { useEffect, useState } from 'react';
import { projectRoute } from '../routes/project.js';
import { getStorage } from '../services/storage.js';
import { useProjectStore } from '../stores/project-store.js';
import { EditorShell } from '../components/EditorShell.js';
import { newId } from '@interrobang/core';

export function EditorPage() {
  const { projectId } = projectRoute.useParams();
  const addOpenProject = useProjectStore((s) => s.addOpenProject);
  const open = useProjectStore((s) => s.openProjects[projectId]);
  const applyCommand = useProjectStore((s) => s.applyCommand);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    getStorage()
      .then((s) => s.loadFont(projectId))
      .then((font) => addOpenProject({ id: projectId, name: font.meta.familyName, font }))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId, open, addOpenProject]);

  // Listen for "add starter glyph" event from EditorShell
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ projectId: string }>).detail;
      if (detail.projectId !== projectId || !open) return;
      const masterId = open.font.masters[0]!.id;
      const layerId = newId();
      const contourId = newId();
      const glyphId = newId();
      // Direct font mutation (not a command — initial seed)
      const next = {
        ...open.font,
        glyphs: {
          ...open.font.glyphs,
          [glyphId]: {
            id: glyphId, name: 'A', advanceWidth: 500, unicodeCodepoint: 65, revision: 0,
            layers: [{
              id: layerId, masterId, components: [], anchors: [],
              contours: [{
                id: contourId, closed: true,
                points: [
                  { id: newId(), x: 100, y: 0, type: 'line', smooth: false },
                  { id: newId(), x: 400, y: 0, type: 'line', smooth: false },
                  { id: newId(), x: 250, y: 700, type: 'line', smooth: false },
                ],
              }],
            }],
          },
        },
        glyphOrder: [...open.font.glyphOrder, glyphId],
      };
      // Bypass undo for initial seed — it's not a user edit
      useProjectStore.setState((s) => ({
        openProjects: { ...s.openProjects, [projectId]: { ...s.openProjects[projectId]!, font: next, dirty: true } },
      }));
    }
    document.addEventListener('interrobang:add-starter', handler);
    return () => document.removeEventListener('interrobang:add-starter', handler);
  }, [open, projectId]);

  if (error) return <div className="p-6 text-destructive">{error}</div>;
  return (
    <div className="h-screen w-screen flex">
      <EditorShell projectId={projectId} />
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`. Create a project. Click "Add a glyph A". Drag a point. Undo. Redo.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): editor page renders glyph, drag to move, undo/redo"
```

### Task F.9: Save-on-dirty (debounced)

**Files:**
- Create: `apps/web/src/services/save-loop.ts`
- Modify: `apps/web/src/pages/EditorPage.tsx`

- [ ] **Step 1: Implement save loop**

```ts
// apps/web/src/services/save-loop.ts
import { useProjectStore } from '../stores/project-store.js';
import { getStorage } from './storage.js';

const DEBOUNCE_MS = 800;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleSave(projectId: string): void {
  const existing = timers.get(projectId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    timers.delete(projectId);
    const proj = useProjectStore.getState().openProjects[projectId];
    if (!proj) return;
    try {
      const s = await getStorage();
      await s.saveFont(projectId, proj.font);
      useProjectStore.getState().markClean(projectId);
    } catch (err) {
      console.error('Save failed', err);
    }
  }, DEBOUNCE_MS);
  timers.set(projectId, timer);
}
```

- [ ] **Step 2: Subscribe to dirty changes in EditorPage**

```tsx
// add to EditorPage component body
useEffect(() => {
  return useProjectStore.subscribe((s, prev) => {
    const cur = s.openProjects[projectId];
    const old = prev.openProjects[projectId];
    if (cur && cur.dirty && cur !== old) scheduleSave(projectId);
  });
}, [projectId]);
```

(Add `import { scheduleSave } from '../services/save-loop.js';` at the top.)

- [ ] **Step 3: Smoke test persistence**

Run dev server. Edit a glyph. Refresh the browser. Confirm the edit survived. (If wa-sqlite write didn't persist, check OPFS in DevTools → Application → Storage → IndexedDB / OPFS.)

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): debounced auto-save on dirty"
```

### Task F.10: Tab bar (multi-document switching)

**Files:**
- Create: `apps/web/src/components/TabBar.tsx`
- Modify: `apps/web/src/pages/EditorPage.tsx`

- [ ] **Step 1: TabBar**

```tsx
// apps/web/src/components/TabBar.tsx
import { Link, useNavigate } from '@tanstack/react-router';
import { useProjectStore } from '../stores/project-store.js';
import { Button } from './ui/button.js';

export function TabBar({ activeId }: { activeId: string }) {
  const order = useProjectStore((s) => s.openOrder);
  const projects = useProjectStore((s) => s.openProjects);
  const closeProject = useProjectStore((s) => s.closeProject);
  const nav = useNavigate();

  return (
    <div className="flex items-center gap-1 border-b border-border bg-card px-2 h-9">
      {order.map((id) => {
        const p = projects[id];
        if (!p) return null;
        const active = id === activeId;
        return (
          <div
            key={id}
            className={`flex items-center gap-1 rounded-t px-2 h-8 text-sm cursor-pointer ${
              active ? 'bg-background border-x border-t border-border' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link to="/project/$projectId" params={{ projectId: id }}>
              {p.name}{p.dirty ? ' •' : ''}
            </Link>
            <button
              type="button"
              className="text-xs opacity-60 hover:opacity-100"
              onClick={() => {
                closeProject(id);
                if (active) {
                  const next = order.filter((x) => x !== id).pop();
                  next ? nav({ to: '/project/$projectId', params: { projectId: next } }) : nav({ to: '/' });
                }
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <Link to="/" className="ml-auto">
        <Button variant="ghost" size="sm">+ New / Open</Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire into EditorPage**

```tsx
// EditorPage return value
return (
  <div className="h-screen w-screen flex flex-col">
    <TabBar activeId={projectId} />
    <div className="flex-1 relative">
      <EditorShell projectId={projectId} />
    </div>
  </div>
);
```

(Add `import { TabBar } from '../components/TabBar.js';`)

- [ ] **Step 3: Smoke test**

Open two projects, switch tabs, close one.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): tab bar for multi-document switching"
```

### Task F.11: Keyboard shortcuts (undo/redo, tool switch)

**Files:**
- Create: `apps/web/src/hooks/useKeyboardShortcuts.ts`
- Modify: `apps/web/src/pages/EditorPage.tsx`

- [ ] **Step 1: Hook**

```ts
// apps/web/src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';
import { useProjectStore } from '../stores/project-store.js';
import { useEditorStore } from '../stores/editor-store.js';

export function useEditorKeyboardShortcuts(projectId: string): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo(projectId);
      } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useProjectStore.getState().redo(projectId);
      } else if (e.key === 'v' || e.key === 'V') {
        useEditorStore.getState().setTool('select');
      } else if (e.key === 'p' || e.key === 'P') {
        useEditorStore.getState().setTool('pen');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId]);
}
```

- [ ] **Step 2: Wire into EditorPage**

```tsx
useEditorKeyboardShortcuts(projectId);
```

(Add the import.)

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): keyboard shortcuts for undo/redo, V (select), P (pen)"
```

### Task F.12: Import OTF/TTF and UFO

**Files:**
- Create: `apps/web/src/services/font-io.ts`
- Create: `apps/web/src/components/ImportButton.tsx`
- Modify: `apps/web/src/pages/ProjectPickerPage.tsx`

- [ ] **Step 1: Font-io singleton**

```ts
// apps/web/src/services/font-io.ts
import { createFontIoWorker, type FontIoClient } from '@interrobang/font-io';
let client: FontIoClient | null = null;
export function getFontIo(): FontIoClient {
  if (!client) client = createFontIoWorker();
  return client;
}
```

- [ ] **Step 2: ImportButton**

```tsx
// apps/web/src/components/ImportButton.tsx
import { useNavigate } from '@tanstack/react-router';
import { Button } from './ui/button.js';
import { getStorage } from '../services/storage.js';
import { getFontIo } from '../services/font-io.js';

export function ImportButton() {
  const nav = useNavigate();

  async function importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.otf,.ttf,.ufo,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const bytes = await file.arrayBuffer();
      const fontIo = getFontIo();
      const lower = file.name.toLowerCase();
      const font = lower.endsWith('.ufo') || lower.endsWith('.zip')
        ? await fontIo.parseUFO(await unzipToMap(new Uint8Array(bytes)))
        : await fontIo.parseOTF(bytes);
      const storage = await getStorage();
      const id = await storage.createProject(font.meta.familyName);
      await storage.saveFont(id, { ...font, id });
      await nav({ to: '/project/$projectId', params: { projectId: id } });
    };
    input.click();
  }

  return <Button variant="outline" onClick={importFile}>Import OTF / TTF / UFO</Button>;
}

async function unzipToMap(_bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  // v1: tell the user UFO-as-folder is not supported in browser yet — only OTF/TTF
  // and UFO-as-zip via a future fflate/unzipit dep. Throw a friendly message.
  throw new Error('UFO import in v1 requires a future zip helper — use OTF/TTF for now');
}
```

(Note the deliberate scope cut on UFO browser import in v1 — UFO is a directory format and the browser File System Access API for directories isn't universally available. Phase 3 plan will add `unzipit` for `.zip` UFOs and File System Access API for directory pickers in supporting browsers.)

- [ ] **Step 3: Wire into ProjectPickerPage**

In `ProjectPickerPage.tsx`, add `<ImportButton />` next to the "New project" button.

- [ ] **Step 4: Smoke test**

Drop in a small TTF (the Inter sample committed earlier works). Confirm a project is created and opens.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): import OTF/TTF via worker; UFO deferred to Phase 3"
```

### Task F.13: Export OTF

**Files:**
- Create: `apps/web/src/components/ExportButton.tsx`
- Modify: `apps/web/src/components/EditorShell.tsx`

- [ ] **Step 1: ExportButton**

```tsx
// apps/web/src/components/ExportButton.tsx
import { Button } from './ui/button.js';
import { useProjectStore } from '../stores/project-store.js';
import { getFontIo } from '../services/font-io.js';

export function ExportButton({ projectId }: { projectId: string }) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  if (!proj) return null;

  async function exportOtf() {
    const bytes = await getFontIo().writeOTF(proj.font);
    const blob = new Blob([bytes], { type: 'font/otf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.font.meta.familyName.replace(/\s+/g, '_')}.otf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <Button onClick={exportOtf}>Export OTF</Button>;
}
```

- [ ] **Step 2: Mount in EditorShell** — add `<ExportButton projectId={projectId} />` to the floating action area.

- [ ] **Step 3: Smoke test**

Edit, click Export OTF, install the downloaded file in your OS font book, confirm renders.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): export OTF via worker + browser download"
```

### Task F.14: Sidebar — glyph list + coordinates panel (channel ③ live demo)

**Files:**
- Create: `apps/web/src/components/GlyphList.tsx`
- Create: `apps/web/src/components/CoordinatesPanel.tsx`
- Modify: `apps/web/src/pages/EditorPage.tsx`

- [ ] **Step 1: GlyphList**

```tsx
// apps/web/src/components/GlyphList.tsx
import { useProjectStore } from '../stores/project-store.js';

export function GlyphList({ projectId }: { projectId: string }) {
  const proj = useProjectStore((s) => s.openProjects[projectId]);
  if (!proj) return null;
  return (
    <div className="w-44 border-r border-border overflow-y-auto p-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wide px-2 py-1">Glyphs</div>
      {proj.font.glyphOrder.map((id) => {
        const g = proj.font.glyphs[id]!;
        return (
          <div key={id} className="px-2 py-1 text-sm hover:bg-accent rounded">
            {g.name} <span className="text-xs text-muted-foreground">{g.unicodeCodepoint ? `U+${g.unicodeCodepoint.toString(16).toUpperCase()}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: CoordinatesPanel — subscribes to channel ③**

```tsx
// apps/web/src/components/CoordinatesPanel.tsx
import { useEffect, useState } from 'react';
import type { EditorCanvasHandle, LiveEditEvent } from '@interrobang/editor';

interface Props { canvasRef: React.RefObject<EditorCanvasHandle | null>; }

export function CoordinatesPanel({ canvasRef }: Props) {
  const [live, setLive] = useState<LiveEditEvent | null>(null);
  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    const off = handle.on('liveEdit', setLive);
    return off;
  }, [canvasRef]);

  return (
    <div className="w-56 border-l border-border p-3 text-xs">
      <div className="text-muted-foreground uppercase tracking-wide mb-1">Coordinates</div>
      {live ? (
        <div className="font-mono">
          Δx {live.dx.toFixed(1)}<br />
          Δy {live.dy.toFixed(1)}<br />
          {live.pointIds.length} point(s)
        </div>
      ) : (
        <div className="text-muted-foreground">Drag a point.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire both into EditorPage**

Update the `EditorPage` return to lay out left sidebar, canvas in middle, right sidebar:

```tsx
return (
  <div className="h-screen w-screen flex flex-col">
    <TabBar activeId={projectId} />
    <div className="flex-1 flex">
      <GlyphList projectId={projectId} />
      <div className="flex-1 relative">
        <EditorShell projectId={projectId} canvasHandleRef={canvasHandleRef} />
      </div>
      <CoordinatesPanel canvasRef={canvasHandleRef} />
    </div>
  </div>
);
```

(Promote `canvasRef` from `EditorShell` to `EditorPage` via a `useRef<EditorCanvasHandle | null>(null)` and pass it down as `canvasHandleRef`.)

- [ ] **Step 4: Smoke test**

Drag a point. Confirm the right panel shows live Δx/Δy values updating *during* the drag (not just on release). This is the live-edit channel working.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): sidebar with glyph list and live-coordinates panel"
```

### Task F.15: Phase 1 acceptance — manual verification checklist

This task has no code. Run through the checklist in a fresh browser profile:

- [ ] Visit `/`. Project Picker loads with "No projects yet."
- [ ] Type "Test", click New project. Editor opens at `/project/<id>`.
- [ ] Click "Add a glyph A". Triangle appears.
- [ ] Drag a point. Coordinates panel shows live deltas during drag. Point lands at the new position on release.
- [ ] Cmd/Ctrl-Z undoes; Cmd/Ctrl-Shift-Z redoes.
- [ ] Press P, click on canvas. New point appears (pen tool).
- [ ] Press V to return to select tool.
- [ ] Wait 1s after editing. Check DevTools → Application → Origin Private File System — `interrobang.sqlite` exists.
- [ ] Refresh the browser. Edits persisted.
- [ ] Open a second tab to the same URL. Single-tab guard fires; second tab shows "Already open in another tab".
- [ ] Click Export OTF. File downloads. Open in Font Book / equivalent. Renders.
- [ ] Import the Inter sample TTF. New project created with hundreds of glyphs.
- [ ] Open two projects. Tab bar switches between them. Each retains its own state.

If any item fails, it is a Phase 1 bug — open an issue, fix, re-verify, commit.

- [ ] **Final commit**

```bash
git commit --allow-empty -m "chore: Phase 1 manual acceptance verified"
```

---

## What's not in Phase 1 (becomes Phase 2 and 3 plans)

These items appear in the spec but are deliberately deferred. They will get their own plans after Phase 1 ships.

### Phase 2 — Server, auth, sync (next plan)

- `apps/server`: Bun + Hono + Drizzle + bun:sqlite + better-auth (magic link), endpoints `/auth/*`, `/projects`, `/sync/push`, `/sync/pull`.
- `packages/sync`: revision-based, single-writer client engine; `sync_log` consumption; conflict prompt.
- Cross-device pull-and-restore flow.
- Hosting: Fly.io with Litestream → S3/R2.
- Sync-status indicator UI in the editor.

### Phase 3 — Polish (next-next plan)

- Round-trip test corpus: a public-domain UFO + OTF set; CI compares import → save → re-export → diff.
- Performance budgets enforced in CI: bundle size (<400KB initial), wa-sqlite lazy-load, opentype.js lazy-load.
- Playwright E2E for the Module F.15 checklist plus sync flows from Phase 2.
- UFO-as-zip import via `unzipit` and UFO-as-folder via File System Access API where supported.
- Custom font preview text input above the canvas.
- Electron shell with native menus and multi-window.
- CI workflow (Bun test, typecheck, biome, bundle-size check).

---

## Self-review

Spec coverage check (against `docs/superpowers/specs/2026-04-17-font-editor-design.md`):

- ✅ Scope A (outline editing, Latin + symbols, OTF/TTF/UFO round-trip): Modules B, C, F.
- ✅ Multi-document via in-app tabs: Task F.10.
- ✅ Undo/redo via command pattern, per-project stack, capacity 200: Tasks B.6, B.7.
- ✅ Local-first, no account required: Phase 1 has no auth at all.
- ✅ Repository layout matches spec: Tasks 0.3 + per-module tasks.
- ✅ React + TanStack Router + shadcn/ui (Base UI) + Tailwind v4 + Zustand: Tasks F.1–F.6.
- ✅ Canvas 2D editor as React leaf with imperative internals; three channels: Module E + Task F.14 (live-edit panel demo).
- ✅ wa-sqlite + OPFSCoopSyncVFS, IDBBatchAtomicVFS fallback, single-tab guard: Tasks D.1, D.5.
- ✅ Drizzle schema; client-side DDL stripped of `users`: Tasks A.1, A.2.
- ✅ Font I/O in worker: Tasks C.5.
- ✅ Bun runtime + test runner; Biome lint/format: Phase 0.
- ⚠️ "Reactive store keyed per-project (Zustand)" — Phase 1 uses a single project store with `openProjects` keyed by id. Equivalent in practice; spec doesn't mandate one-store-per-project. No change needed.
- ⏭️ Sync engine, server, auth, Litestream — explicitly deferred to Phase 2 plan.
- ⏭️ Round-trip test corpus, performance budgets, Playwright E2E, Electron — explicitly deferred to Phase 3 plan.
- ⚠️ UFO import in browser — deferred to Phase 3 (Task F.12 surfaces the limit). Spec says UFO is in scope; this is a *partial* defer (export works in Phase 1, import in Phase 3). Acceptable trade-off documented.

Placeholder scan: searched for "TODO", "TBD", "implement later", "fill in details", "similar to", "appropriate error handling" — none present in plan code. The Step text occasionally uses prose like "(Note...)" but every step that touches code shows the code.

Type consistency check:
- `Command<T>` interface: defined in B.6, used in B.7 and F.5 — signatures match (`apply`, `revert`, optional `canMergeWith`/`mergeWith`).
- `Font`, `Glyph`, `Layer`, `Contour`, `Point` — defined in B.1, used everywhere — consistent.
- `EditorCanvasHandle` — defined in E.4 (`setGlyph`, `setSelection`, `setTool`, `fitToView`, `on`), consumed in F.8 and F.14 — matches.
- `StorageAdapter` — defined in D.3, implemented in D.4, consumed in F.4/F.7/F.9/F.12 — matches.
- `LiveEditEvent` — defined in E.4, consumed in F.14 — matches.
- `SqlValue`, `Row` — defined in D.1 protocol, consumed in D.4 adapter — matches.

Issues found and fixed inline: none on this pass.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-phase-1-local-editor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for Phase 1 because the breadth (35+ tasks across 7 modules) benefits from focused subagent context windows and clean per-task reviews.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Slower context-wise but you stay in the same conversation.

Which approach?




