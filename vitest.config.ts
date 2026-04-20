import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
  plugins: [sqlTextImportPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
      // Mirror apps/web: run tests against workspace sources, not dist.
      '@interrobang/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@interrobang/schema': path.resolve(__dirname, './packages/schema/src/index.ts'),
      '@interrobang/editor': path.resolve(__dirname, './packages/editor/src/index.ts'),
      '@interrobang/font-io': path.resolve(__dirname, './packages/font-io/src/index.ts'),
      '@interrobang/storage': path.resolve(__dirname, './packages/storage/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'test-setup/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
    ],
  },
});
