import { readFile } from 'node:fs/promises';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function sqlTextImportPlugin(): Plugin {
  return {
    name: 'sql-text-import',
    enforce: 'pre',
    async load(id) {
      const [file] = id.split('?');
      if (!file || !file.endsWith('.sql')) return null;
      const text = await readFile(file, 'utf8');
      return `export default ${JSON.stringify(text)};`;
    },
  };
}

export default defineConfig({
  plugins: [sqlTextImportPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Workspace packages resolve to source so Vite processes TS + follows
      // `new URL('./worker.ts', import.meta.url)` to the real file. `dist/`
      // is still emitted by tsup for external consumers.
      '@interrobang/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@interrobang/schema': path.resolve(__dirname, '../../packages/schema/src/index.ts'),
      '@interrobang/editor': path.resolve(__dirname, '../../packages/editor/src/index.ts'),
      '@interrobang/font-io': path.resolve(__dirname, '../../packages/font-io/src/index.ts'),
      '@interrobang/storage': path.resolve(__dirname, '../../packages/storage/src/index.ts'),
    },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['wa-sqlite'] },
  server: { port: 5173 },
});
