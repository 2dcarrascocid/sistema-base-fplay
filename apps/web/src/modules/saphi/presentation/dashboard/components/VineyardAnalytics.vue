<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnalyticsPoint, VineyardBlock } from '../types/dashboard.types';
const props = defineProps<{ points: AnalyticsPoint[]; blocks: VineyardBlock[] }>();
const tab = ref<'water' | 'moisture' | 'blocks'>('water');
const series = computed(() => tab.value === 'blocks'
  ? props.blocks.map((block) => ({ label: block.id, value: block.moisture, height: Number(block.moisture.replace(',', '.').replace('%', '').trim()) * 2 }))
  : props.points.map((point) => ({ label: point.label, value: String(tab.value === 'water' ? point.water : point.moisture), height: tab.value === 'water' ? point.water : point.moisture * 2 })));
</script>
<template>
  <section class="saphi-card saphi-analytics"><div class="saphi-section-heading"><div><h2>Analítica del viñedo</h2><p>Comparación temporal y por cuartel · DEMO</p></div><span class="saphi-outlined-label">Semana ilustrativa</span></div>
    <div class="saphi-chart-tabs" aria-label="Indicador del gráfico"><button type="button" :aria-pressed="tab === 'water'" @click="tab = 'water'">Consumo de agua</button><button type="button" :aria-pressed="tab === 'moisture'" @click="tab = 'moisture'">Humedad</button><button type="button" :aria-pressed="tab === 'blocks'" @click="tab = 'blocks'">Por cuartel</button></div>
    <p class="saphi-chart-unit">{{ tab === 'water' ? 'Consumo de agua (m³)' : 'Humedad del suelo (%)' }} · valores simulados</p>
    <div v-if="series.length" class="saphi-chart"><div class="saphi-chart-axis" aria-hidden="true"><span>{{ tab === 'water' ? '100' : '50' }}</span><span>{{ tab === 'water' ? '50' : '25' }}</span><span>0</span></div><div class="saphi-chart-plot"><div v-for="point in series" :key="point.label" class="saphi-chart-column"><button type="button" class="saphi-chart-bar" :style="{ height: `${Math.min(100, Math.max(0, point.height))}%` }" :aria-label="`${point.label}: ${point.value} ${tab === 'water' ? 'm³' : '%'}, simulado`"><span class="saphi-chart-tip">{{ point.value }} {{ tab === 'water' ? 'm³' : '%' }}</span></button><span class="saphi-chart-label">{{ point.label }}</span></div></div></div>
    <p v-else class="saphi-empty">Sin datos para este indicador.</p>
    <p class="saphi-chart-legend"><span class="saphi-state-dot optimal" />{{ tab === 'water' ? 'Consumo diario' : 'Humedad ilustrativa' }}<small>DEMO / DATOS SIMULADOS</small></p>
  </section>
</template>
