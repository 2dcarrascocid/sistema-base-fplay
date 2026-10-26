<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <v-empty-state icon="mdi-map-marker-question-outline" :headline="t('pages.notFound.title')" :text="t('pages.notFound.text')">
    <template #actions>
      <v-btn color="primary" to="/">{{ t('nav.home') }}</v-btn>
    </template>
  </v-empty-state>
</template>
