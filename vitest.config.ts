import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vitest/config';

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
  plugins: [sqlTextImportPlugin()],
  test: {
    environment: 'happy-dom',
    include: ['packages/**/*.test.ts', 'test-setup/**/*.test.ts'],
  },
});
