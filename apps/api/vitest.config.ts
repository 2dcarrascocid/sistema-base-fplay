import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Test files share the local database container (and a few global settings rows).
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // AWS SDK adapters and Lambda entry points only wire real clients; their logic lives in tested modules.
      exclude: ['src/lib/aws/**', 'src/**/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
