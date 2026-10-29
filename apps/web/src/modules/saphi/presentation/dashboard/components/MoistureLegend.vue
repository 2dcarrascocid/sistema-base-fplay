<script setup lang="ts">
import type { DashboardPreviewData } from '../types/dashboard.types';
defineProps<{ items: DashboardPreviewData['legend'] }>();
</script>
<template><ul class="saphi-legend" aria-label="Estados ilustrativos de humedad"><li v-for="item in items" :key="item.state"><span :class="['saphi-state-dot', item.state]" />{{ item.label }}</li></ul></template>
