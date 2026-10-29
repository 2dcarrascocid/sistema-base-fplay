<script setup lang="ts">
import type { DashboardPreviewData } from '../types/dashboard.types';
defineProps<{ weather: DashboardPreviewData['weather']; location: string }>();
</script>
<template><section class="saphi-card saphi-weather"><h2>Clima del predio</h2><p>{{ location }}</p><div class="saphi-weather-main"><v-icon icon="mdi-weather-partly-cloudy" size="64" aria-hidden="true" /><strong>{{ weather.temperature }}</strong></div><p>{{ weather.condition }}</p><dl><div v-for="detail in weather.details" :key="detail.label"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div></dl><small>DEMO · Sin servicio meteorológico conectado</small></section></template>
