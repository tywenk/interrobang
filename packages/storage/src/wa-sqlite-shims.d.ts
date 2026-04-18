// Ambient declarations for wa-sqlite subpath modules that ship as .js files
// without corresponding .d.ts declarations. The VFS classes are plain classes
// (not `.create()` factories), so they're exposed here with `new` semantics.

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  import type { SQLiteVFS } from 'wa-sqlite';
  export class IDBBatchAtomicVFS implements SQLiteVFS {
    constructor(idbDatabaseName?: string, options?: unknown);
    readonly name: string;
    mxPathName?: number;
    // The VFS surface is large and fully handled by wa-sqlite internals; we
    // intentionally do not enumerate xRead/xWrite/etc. here.
    [key: string]: unknown;
  }
}

declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  import type { SQLiteVFS } from 'wa-sqlite';
  export class AccessHandlePoolVFS implements SQLiteVFS {
    constructor(directoryPath: string);
    readonly name: string;
    mxPathName?: number;
    isReady: Promise<unknown>;
    [key: string]: unknown;
  }
}

declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  import type { SQLiteVFS } from 'wa-sqlite';
  export class OriginPrivateFileSystemVFS implements SQLiteVFS {
    constructor();
    readonly name: string;
    mxPathName?: number;
    [key: string]: unknown;
  }
}
