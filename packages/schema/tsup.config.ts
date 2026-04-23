import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // esbuild (tsup's bundler) does not support the `with { type: 'text' }`
  // import attribute used by `client-ddl.ts` to inline migration SQL files.
  // Substitute a plugin that reads the `.sql` file at build time and emits
  // a `default` export containing the text. This mirrors what the Vite
  // `sqlTextImportPlugin` does for apps/web.
  esbuildPlugins: [
    {
      name: 'sql-text-import',
      setup(build) {
        build.onResolve({ filter: /\.sql$/ }, (args) => ({
          path: resolvePath(args.resolveDir, args.path),
          namespace: 'sql-text',
        }));
        build.onLoad({ filter: /.*/, namespace: 'sql-text' }, (args) => {
          const text = readFileSync(args.path, 'utf8');
          return {
            contents: `export default ${JSON.stringify(text)};`,
            loader: 'js',
          };
        });
      },
    },
  ],
});
