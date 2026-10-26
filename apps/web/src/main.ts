import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './plugins/i18n';
import { vuetify } from './plugins/vuetify';
import { router } from './router';
import { useSessionStore } from './stores/session';

const app = createApp(App);
app.use(createPinia());
useSessionStore().attach();
app.use(i18n).use(vuetify).use(router);
app.mount('#app');
