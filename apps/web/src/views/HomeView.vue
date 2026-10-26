<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Locale, MenuNode } from '../services/types';
import { useSessionStore } from '../stores/session';
import { formatDateTime } from '../utils/format';

const session = useSessionStore();
const { t, locale } = useI18n();

/** Every page the user can open, for quick access. */
const shortcuts = computed(() => {
  const flat = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap((n) => [...(n.route ? [n] : []), ...flat(n.children)]);
  return flat(session.me?.menu ?? []);
});
const lastLogin = computed(() => formatDateTime(session.me?.user.last_login_at, locale.value, session.me?.user.time_zone ?? undefined));
</script>

<template>
  <section v-if="session.me" class="d-flex flex-column ga-6">
    <header>
      <h1 class="text-h5 font-weight-bold">{{ t('home.welcome', { name: session.me.user.first_name }) }}</h1>
      <p class="text-medium-emphasis">{{ t('home.intro') }}</p>
      <p v-if="lastLogin" class="text-caption text-medium-emphasis">{{ t('home.lastLogin', { date: lastLogin }) }}</p>
    </header>

    <v-alert v-if="shortcuts.length === 0" type="info" variant="tonal">{{ t('home.noMenu') }}</v-alert>
    <v-row v-else>
      <v-col v-for="item in shortcuts" :key="item.code" cols="12" sm="6" md="4" lg="3">
        <v-card :to="item.route!" variant="outlined" class="h-100">
          <v-card-item>
            <template #prepend>
              <v-icon :icon="item.icon ?? 'mdi-circle-small'" color="primary" />
            </template>
            <v-card-title class="text-body-1 font-weight-medium">{{ item.name[locale as Locale] }}</v-card-title>
          </v-card-item>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>
