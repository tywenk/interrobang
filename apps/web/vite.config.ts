import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
    },
    // Prefer workspace packages' TS source over their `dist/` emit so Vite
    // resolves `new URL('./worker.ts', import.meta.url)` against the real
    // file. `dist/` is still the advertised entry for external consumers.
    conditions: ['source', 'module', 'browser', 'import', 'default'],
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['wa-sqlite'] },
  server: { port: 5173 },
});
