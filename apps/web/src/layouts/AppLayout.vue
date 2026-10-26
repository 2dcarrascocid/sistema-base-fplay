<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import LanguageMenu from '../components/LanguageMenu.vue';
import type { Locale } from '../services/types';
import { useNotifyStore } from '../stores/notify';
import { useSessionStore } from '../stores/session';
import { fullName, initials } from '../utils/format';

const session = useSessionStore();
const notify = useNotifyStore();
const router = useRouter();
const { t, locale } = useI18n();
const { mobile } = useDisplay();
const drawer = ref<boolean | null>(null);

const me = computed(() => session.me);
const label = (name: { es: string; en: string }) => name[locale.value as Locale] ?? name.es;

async function logout() {
  await session.logout();
  notify.show(t('auth.loggedOut'), 'info');
  await router.replace({ name: 'login' });
}
</script>

<template>
  <v-navigation-drawer v-model="drawer" :permanent="!mobile" width="272">
    <v-list nav density="comfortable">
      <v-list-item :to="{ name: 'home' }" prepend-icon="mdi-home-outline" :title="t('nav.home')" exact />
      <template v-for="module in me?.menu ?? []" :key="module.code">
        <v-list-subheader v-if="module.kind === 'module'" class="text-uppercase">{{ label(module.name) }}</v-list-subheader>
        <template v-for="item in module.kind === 'module' ? module.children : [module]" :key="item.code">
          <v-list-group v-if="item.children.length > 0" :value="item.code">
            <template #activator="{ props }">
              <v-list-item v-bind="props" :prepend-icon="item.icon ?? 'mdi-folder-outline'" :title="label(item.name)" />
            </template>
            <v-list-item
              v-for="child in item.children"
              :key="child.code"
              :to="child.route ?? undefined"
              :disabled="!child.route"
              :title="label(child.name)"
            />
          </v-list-group>
          <v-list-item v-else :to="item.route ?? undefined" :prepend-icon="item.icon ?? 'mdi-circle-small'" :title="label(item.name)" />
        </template>
      </template>
    </v-list>
  </v-navigation-drawer>

  <v-app-bar flat border="b" density="comfortable">
    <v-app-bar-nav-icon v-if="mobile" :aria-label="t('nav.menu')" @click="drawer = !drawer" />
    <img v-if="me?.settings.logoUrl" :src="me.settings.logoUrl" alt="" class="app-logo ml-4" />
    <v-app-bar-title class="font-weight-bold">{{ me?.settings.system_name }}</v-app-bar-title>
    <LanguageMenu />
    <v-menu v-if="me">
      <template #activator="{ props }">
        <v-btn v-bind="props" variant="text" class="text-none" :aria-label="t('nav.account')">
          <v-avatar size="32" color="primary" class="mr-2">
            <v-img v-if="me.user.photoUrl" :src="me.user.photoUrl" :alt="fullName(me.user)" />
            <span v-else class="text-caption font-weight-bold">{{ initials(me.user) }}</span>
          </v-avatar>
          <span class="d-none d-sm-inline">{{ me.user.first_name }}</span>
        </v-btn>
      </template>
      <v-list density="compact" min-width="220">
        <v-list-item :title="fullName(me.user)" :subtitle="me.user.email" />
        <v-divider />
        <v-list-item :to="{ name: 'account' }" prepend-icon="mdi-account-cog-outline" :title="t('nav.account')" />
        <v-list-item prepend-icon="mdi-logout" :title="t('nav.logout')" @click="logout" />
      </v-list>
    </v-menu>
  </v-app-bar>

  <v-main>
    <v-container class="py-6" style="max-width: 1280px">
      <slot />
    </v-container>
  </v-main>
</template>

<style scoped>
.app-logo {
  height: 28px;
  max-width: 140px;
  object-fit: contain;
}
</style>
