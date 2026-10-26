<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <v-empty-state icon="mdi-lock-outline" :headline="t('pages.forbidden.title')" :text="t('pages.forbidden.text')">
    <template #actions>
      <v-btn color="primary" :to="{ name: 'home' }">{{ t('nav.home') }}</v-btn>
    </template>
  </v-empty-state>
</template>
