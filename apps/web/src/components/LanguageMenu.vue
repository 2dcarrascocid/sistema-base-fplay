<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { setLocale } from '../plugins/i18n';
import type { Locale } from '../services/types';

const { t, locale } = useI18n();
const locales: Locale[] = ['es', 'en'];
</script>

<template>
  <v-menu>
    <template #activator="{ props }">
      <v-btn v-bind="props" variant="text" prepend-icon="mdi-translate" :aria-label="t('nav.language')">
        {{ locale.toUpperCase() }}
      </v-btn>
    </template>
    <v-list density="compact">
      <v-list-item v-for="code in locales" :key="code" :active="locale === code" @click="setLocale(code)">
        {{ t(`locales.${code}`) }}
      </v-list-item>
    </v-list>
  </v-menu>
</template>
