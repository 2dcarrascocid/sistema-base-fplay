<script setup lang="ts">
import type { DashboardPreviewData } from '../types/dashboard.types';
defineProps<{ items: DashboardPreviewData['navigation'] }>();
</script>

<template>
  <aside class="saphi-sidebar">
    <p class="saphi-nav-caption">ESPACIO DE TRABAJO</p>
    <nav aria-label="Menú ilustrativo Saphi"><ul><li v-for="(item, index) in items" :key="item.label">
      <span :class="['saphi-nav-item', { 'is-active': index === 0 }]" :aria-current="index === 0 ? 'page' : undefined" :title="`${item.label} · navegación de demostración`">
        <v-icon :icon="item.icon" aria-hidden="true" /><span>{{ item.label }}</span><span v-if="index === 0" class="saphi-active-dot" />
      </span>
    </li></ul></nav>
    <div class="saphi-sidebar-note"><v-icon icon="mdi-leaf" aria-hidden="true" /><strong>Cultivar mejor.<br>Con menos recursos.</strong><p>Una mirada inteligente a tu campo.</p></div>
    <small class="saphi-sidebar-footer">SAPHI CHILE · VISTA PREVIA</small>
  </aside>
</template>
