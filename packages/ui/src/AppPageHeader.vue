<script setup lang="ts">
/** Page title with an optional subtitle and an actions slot (right side, wraps on phones). */
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="app-page-header">
    <div class="app-page-header__text">
      <h1 class="text-h5 font-weight-bold">{{ title }}</h1>
      <p v-if="subtitle" class="text-body-2 text-medium-emphasis">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="app-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.app-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 20px;
}
.app-page-header__text {
  min-width: 0;
}
.app-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
