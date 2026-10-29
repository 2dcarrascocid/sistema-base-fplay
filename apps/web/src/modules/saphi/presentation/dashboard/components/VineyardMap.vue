<script setup lang="ts">
import { useId } from 'vue';
import { useDashboardPreview } from '../composables/useDashboardPreview';
import type { DashboardPreviewData, VineyardBlock } from '../types/dashboard.types';
import MoistureLegend from './MoistureLegend.vue';
const props = defineProps<{ blocks: VineyardBlock[]; legend: DashboardPreviewData['legend'] }>();
const { selectedBlock, zoom, selectBlock, changeZoom, resetView } = useDashboardPreview(() => props.blocks);
const patternId = `vineyard-rows-${useId()}`;
</script>

<template>
  <section class="saphi-card saphi-map-card" aria-label="Mapa ilustrativo del viñedo">
    <div class="saphi-section-heading"><div><h2>Tu viñedo, en perspectiva</h2><p>Distribución de humedad por cuartel · DEMO</p></div><span class="saphi-outlined-label">Vista de cuarteles</span></div>
    <div v-if="blocks.length" class="saphi-map">
      <svg viewBox="0 0 820 400" class="saphi-map-svg" aria-label="Plano esquemático, sin ubicación geográfica real">
        <defs><pattern :id="patternId" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><path d="M0 0V9" stroke="#fff" stroke-opacity=".25" stroke-width="3" /></pattern></defs>
        <rect width="820" height="400" fill="#e7eddf" />
        <path d="M0 30L820 375M65 0L170 400M710 0L770 400" stroke="#cbd5bf" stroke-width="45" />
        <path d="M0 30L820 375M65 0L170 400M710 0L770 400" stroke="#f4efdb" stroke-width="17" />
        <path d="M0 370Q120 310 80 180T50 0M800 0Q720 180 820 300" fill="none" stroke="#b5c9a3" stroke-width="30" />
        <g :transform="`translate(${410 * (1 - zoom)} ${200 * (1 - zoom)}) scale(${zoom})`">
          <g v-for="block in blocks" :key="block.id" class="saphi-block" :class="[block.state, { selected: selectedBlock?.id === block.id }]" role="button" tabindex="0" :aria-label="`${block.id}, ${block.variety}, humedad simulada ${block.moisture}`" :aria-pressed="selectedBlock?.id === block.id" @click="selectBlock(block.id)" @keydown.enter.prevent="selectBlock(block.id)" @keydown.space.prevent="selectBlock(block.id)">
            <title>{{ block.id }} · {{ block.variety }} · {{ block.moisture }} · DEMO</title>
            <polygon :points="block.points" /><polygon :points="block.points" :style="{ fill: `url(#${patternId})` }" class="saphi-block-texture" />
            <text :x="block.labelX" :y="block.labelY" text-anchor="middle">{{ block.id }}</text>
          </g>
        </g>
        <text x="770" y="45" class="saphi-map-north">N ↑</text><path d="M35 361h75m-75-5v10m75-10v10" stroke="#52654b" stroke-width="2" /><text x="35" y="387" class="saphi-map-scale">Esquema sin escala geográfica</text>
      </svg>
      <div class="saphi-map-controls"><button type="button" aria-label="Acercar mapa" :disabled="zoom >= 1.6" @click="changeZoom(0.2)"><v-icon icon="mdi-plus" aria-hidden="true" /></button><button type="button" aria-label="Alejar mapa" :disabled="zoom <= 1" @click="changeZoom(-0.2)"><v-icon icon="mdi-minus" aria-hidden="true" /></button><button type="button" aria-label="Restablecer mapa" @click="resetView"><v-icon icon="mdi-crosshairs-gps" aria-hidden="true" /></button></div>
      <div v-if="selectedBlock" class="saphi-map-tooltip" role="status"><strong>{{ selectedBlock.id }} · {{ selectedBlock.variety }}</strong><span>Humedad: {{ selectedBlock.moisture }} · DEMO</span><button type="button" aria-label="Cerrar detalle del cuartel" @click="resetView">×</button></div>
      <span class="saphi-map-caption">PLANO ILUSTRATIVO · DATOS SIMULADOS</span>
    </div>
    <p v-else class="saphi-empty">Sin cuarteles para mostrar.</p>
    <div class="saphi-map-footer"><MoistureLegend :items="legend" /><small>Selecciona un cuartel para explorar</small></div>
  </section>
</template>
