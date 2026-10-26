<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useLocale, useTheme } from 'vuetify';
import AppLayout from './layouts/AppLayout.vue';
import AuthLayout from './layouts/AuthLayout.vue';
import { setLocale, storedLocale } from './plugins/i18n';
import { applyBrand } from './plugins/vuetify';
import { useNotifyStore } from './stores/notify';
import { useSessionStore } from './stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const notify = useNotifyStore();
const theme = useTheme();
const { t, locale } = useI18n();
const vuetifyLocale = useLocale();

const layout = computed(() => (route.meta.layout === 'auth' || route.meta.public ? AuthLayout : AppLayout));

// Vuetify's own texts (pagination, "no data"…) follow the app language.
watch(locale, (value) => (vuetifyLocale.current.value = value), { immediate: true });

// After sign-in: the account language (or the system default) and the brand colors.
watch(
  () => session.me,
  (me) => {
    if (!me) return;
    setLocale(me.user.locale ?? storedLocale() ?? me.settings.default_locale);
    applyBrand(theme, me.settings.primary_color, me.settings.secondary_color);
    document.title = me.settings.system_name;
  },
);

// The session ended by itself (expired, revoked, locked): back to login with a notice.
watch(
  () => session.lost,
  (lost) => {
    if (!lost) return;
    notify.show(t('auth.sessionExpired'), 'info');
    void router.replace({ name: 'login' });
  },
);
</script>

<template>
  <v-app>
    <component :is="layout">
      <!-- Protected pages read session.me: never render them once the session is gone. -->
      <router-view v-if="route.meta.public || session.me" />
    </component>
    <v-snackbar
      :model-value="notify.current !== null"
      :color="notify.current?.tone === 'error' ? 'error' : notify.current?.tone === 'info' ? 'info' : 'success'"
      timeout="5000"
      location="bottom right"
      @update:model-value="(open: boolean) => !open && notify.dismiss()"
    >
      {{ notify.current?.text }}
      <template #actions>
        <v-btn variant="text" @click="notify.dismiss()">{{ t('app.close') }}</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<style>
html,
body {
  overflow-x: hidden;
}
</style>
