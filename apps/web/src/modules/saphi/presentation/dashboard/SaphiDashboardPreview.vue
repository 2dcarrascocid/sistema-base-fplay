<script setup lang="ts">
import type { DashboardPreviewData } from './types/dashboard.types';
import { dashboardPreviewData } from './data/dashboardPreviewData';
import SaphiHeader from './components/SaphiHeader.vue';
import SaphiSidebar from './components/SaphiSidebar.vue';
import DashboardMetricCard from './components/DashboardMetricCard.vue';
import VineyardMap from './components/VineyardMap.vue';
import WeatherCard from './components/WeatherCard.vue';
import VineyardAnalytics from './components/VineyardAnalytics.vue';
import FieldActivity from './components/FieldActivity.vue';
import './styles/saphi-dashboard.css';
withDefaults(defineProps<{ data?: DashboardPreviewData; embedded?: boolean }>(), {
  data: () => dashboardPreviewData,
  embedded: false,
});
</script>

<template>
  <div :class="['saphi-dashboard', { 'is-embedded': embedded }]" lang="es">
    <a v-if="!embedded" class="saphi-skip" href="#saphi-preview-content">Saltar al contenido</a>
    <SaphiHeader v-if="!embedded" :data="data" />
    <div class="saphi-shell"><SaphiSidebar v-if="!embedded" :items="data.navigation" />
      <component :is="embedded ? 'div' : 'main'" id="saphi-preview-content" class="saphi-content" tabindex="-1">
        <div class="saphi-page-heading"><div><p class="saphi-eyebrow">MONITOREO INTELIGENTE</p><p v-if="embedded" class="saphi-company-context">{{ data.estate }}</p><component :is="embedded ? 'h2' : 'h1'" class="saphi-dashboard-title">El pulso de tu viñedo</component><p>Una visión clara para cuidar cada gota y cada cuartel.</p></div><span class="saphi-demo-label">{{ data.demoLabel }}</span></div>
        <div class="saphi-metrics"><DashboardMetricCard v-for="(metric, index) in data.metrics" :key="metric.title" :metric="metric" :variant="index === 0 ? 'bars' : index === 1 ? 'gauge' : 'efficiency'" /></div>
        <div class="saphi-map-grid"><VineyardMap :blocks="data.blocks" :legend="data.legend" /><WeatherCard :weather="data.weather" :location="data.location" /></div>
        <div class="saphi-bottom-grid"><VineyardAnalytics :points="data.analytics" :blocks="data.blocks" /><FieldActivity :events="data.activity" /></div>
        <footer class="saphi-page-footer"><span>Saphi Chile · Agricultura con información</span><span>Vista de presentación · Sin conexión a sensores ni APIs</span></footer>
      </component>
    </div>
  </div>
</template>
