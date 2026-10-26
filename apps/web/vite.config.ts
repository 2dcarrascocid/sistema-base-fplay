import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    port: 5173,
    strictPort: true,
    // Same origin as in production, where CloudFront routes /api/* to API Gateway.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  // Pre-bundle every view's dependencies at startup, including the Vuetify components the plugin
  // auto-imports: otherwise each first visit to a page makes Vite reload it (blank screen on a fresh clone).
  // A component missing from this list only costs one reload the first time it is used.
  optimizeDeps: {
    entries: ['index.html', 'src/**/*.vue'],
    include: [
      'VAlert', 'VApp', 'VAppBar', 'VAutocomplete', 'VAvatar', 'VBtn', 'VCard', 'VCheckbox', 'VChip', 'VDataTable',
      'VDialog', 'VDivider', 'VEmptyState', 'VForm', 'VGrid', 'VIcon', 'VImg', 'VList', 'VMain', 'VMenu',
      'VNavigationDrawer', 'VProgressCircular', 'VSelect', 'VSnackbar', 'VSwitch', 'VTable', 'VTabs', 'VTextField',
      'VTextarea', 'VWindow',
    ].map((name) => `vuetify/components/${name}`),
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
