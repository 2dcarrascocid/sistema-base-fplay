<script setup lang="ts">
import type { PreviewMetric } from '../types/dashboard.types';
defineProps<{ metric: PreviewMetric; variant: 'bars' | 'gauge' | 'efficiency' }>();
</script>

<template>
  <article class="saphi-card saphi-metric">
    <div class="saphi-card-heading"><h2>{{ metric.title }}</h2><v-icon :icon="metric.icon" aria-hidden="true" /></div>
    <div class="saphi-metric-body"><div><span class="saphi-status">{{ metric.status }}</span><p class="saphi-value">{{ metric.value }}<span>{{ metric.unit }}</span></p><small>DEMO · Valor ilustrativo</small></div>
      <div v-if="variant === 'bars'" class="saphi-sparkbars" role="img" aria-label="Barras ilustrativas de humedad del suelo"><span v-for="(bar, index) in metric.bars" :key="index" :style="{ height: `${bar}%` }" /></div>
      <svg v-else-if="variant === 'gauge'" class="saphi-gauge" viewBox="0 0 150 95" role="img" :aria-label="`${metric.value} por ciento de reducción simulada`"><path d="M 15 78 A 60 60 0 0 1 135 78" class="saphi-gauge-track" /><path d="M 15 78 A 60 60 0 0 1 135 78" class="saphi-gauge-value" pathLength="100" :stroke-dasharray="`${metric.progress} 100`" /><text x="75" y="76" text-anchor="middle">Ahorro de agua</text></svg>
      <div v-else class="saphi-efficiency" role="img" :aria-label="`${metric.value} por ciento de eficiencia simulada`" :style="{ '--progress': `${metric.progress}%` }"><v-icon icon="mdi-sprout-outline" size="32" aria-hidden="true" /></div>
    </div>
    <p class="saphi-metric-detail">{{ metric.detail }}</p>
  </article>
</template>
