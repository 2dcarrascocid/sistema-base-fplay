import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Test files share the app_test database (and a few global settings rows).
    fileParallelism: false,
    testTimeout: 20_000,
    // Multi-company fixtures provision users, profiles and authenticated resources in a real DB.
    // Keep setup bounded without relying on Vitest's shorter 10s default on shared local CPUs.
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // AWS SDK adapters and Lambda entry points only wire real clients; their logic lives in tested modules.
      exclude: ['src/lib/aws/**', 'src/**/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
