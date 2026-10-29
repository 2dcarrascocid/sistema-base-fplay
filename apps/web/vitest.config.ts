import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  test: {
    // Mounted Vuetify applications are CPU/memory heavy; bound worker contention in CI/local.
    maxWorkers: 2,
    // Full-app Vuetify flows plus coverage can exceed Vitest's 5s default on shared CPUs.
    // This is a test runner deadline, not a product/API timeout or a coverage relaxation.
    testTimeout: 10_000,
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    server: { deps: { inline: ['vuetify'] } },
    coverage: {
      provider: 'v8',
      // All of src: views and layouts are exercised through the mounted app (test/harness.ts).
      include: ['src/**/*.{ts,vue}'],
      // main.ts only bootstraps; env.d.ts only declares types.
      exclude: ['src/main.ts', 'src/env.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
