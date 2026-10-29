import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import vuetify from 'vite-plugin-vuetify';

/** Separate dev/build configuration: no API proxy, routes or application bootstrap. */
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    host: '127.0.0.1', port: 5178, strictPort: true,
    // Support existing dependencies reused through a local worktree junction.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules'), realpathSync('node_modules/@mdi/font')] },
  },
  build: { rollupOptions: { input: resolve('saphi-preview.html') } },
});
