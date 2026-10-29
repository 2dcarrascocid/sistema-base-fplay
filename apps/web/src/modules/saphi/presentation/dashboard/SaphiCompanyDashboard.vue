<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FarmDto, Page, PlotDto, SamplingPointDto, SoilSampleDto } from '@base/saphi';
import { useSaphiCompanyStore } from '../../stores/company';
import { saphiApi } from '../../services/api';
import { useSaphiAction } from '../../composables/useSaphiAction';
import './styles/saphi-dashboard.css';
import './styles/saphi-company-dashboard.css';

type DataKey = 'farms' | 'plots' | 'points' | 'samples';
type LoadState = 'loading' | 'ready' | 'restricted' | 'error';
const store = useSaphiCompanyStore();
const { run } = useSaphiAction();
const rows = ref<{ farms: FarmDto[]; plots: PlotDto[]; points: SamplingPointDto[]; samples: SoilSampleDto[] }>({
  farms: [], plots: [], points: [], samples: [],
});
const state = ref<Record<DataKey, LoadState>>({ farms: 'loading', plots: 'loading', points: 'loading', samples: 'loading' });
const hasMore = ref<Record<DataKey, boolean>>({ farms: false, plots: false, points: false, samples: false });
let overviewGeneration = 0;

const sections = [
  { key: 'farms', label: 'Predios', icon: 'mdi-barn', permission: 'saphi.farms:view', route: 'farms' },
  { key: 'plots', label: 'Cuarteles', icon: 'mdi-map-outline', permission: 'saphi.plots:view', route: 'plots' },
  { key: 'points', label: 'Puntos de muestreo', icon: 'mdi-map-marker', permission: 'saphi.samples:view', route: 'sampling-points' },
  { key: 'samples', label: 'Muestras · 30 días', icon: 'mdi-test-tube', permission: 'saphi.samples:view', route: 'samples' },
] as const;

function companyRoute(kind: string) {
  return `/saphi/companies/${encodeURIComponent(store.companyId ?? '')}/${kind}`;
}
function pageCount(key: DataKey) {
  if (state.value[key] !== 'ready') return '—';
  return `${rows.value[key].length}${hasMore.value[key] ? '+' : ''}`;
}
function period() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}
function showDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function loadSection(key: DataKey, companyId: string, generation: number) {
  const section = sections.find((item) => item.key === key)!;
  if (!store.can(section.permission)) {
    state.value[key] = 'restricted';
    return;
  }
  state.value[key] = 'loading';
  let result: Page<FarmDto> | Page<PlotDto> | Page<SamplingPointDto> | Page<SoilSampleDto> | undefined;
  if (key === 'farms') result = await run(() => saphiApi.list(companyId, 'farms', { limit: 100 })) as Page<FarmDto> | undefined;
  else if (key === 'plots') result = await run(() => saphiApi.list(companyId, 'plots', { limit: 100 })) as Page<PlotDto> | undefined;
  else if (key === 'points') result = await run(() => saphiApi.list(companyId, 'sampling-points', { limit: 100 })) as Page<SamplingPointDto> | undefined;
  else result = await run(() => saphiApi.samples(companyId, { limit: 100, ...period() }));
  if (generation !== overviewGeneration || store.companyId !== companyId) return;
  if (!result) {
    state.value[key] = 'error';
    return;
  }
  // Each count describes only the records returned by this page, never a fabricated global total.
  if (key === 'farms') rows.value.farms = result.data as FarmDto[];
  else if (key === 'plots') rows.value.plots = result.data as PlotDto[];
  else if (key === 'points') rows.value.points = result.data as SamplingPointDto[];
  else rows.value.samples = result.data as SoilSampleDto[];
  hasMore.value[key] = result.page.hasMore;
  state.value[key] = 'ready';
}

function loadOverview() {
  const companyId = store.companyId;
  const generation = ++overviewGeneration;
  rows.value = { farms: [], plots: [], points: [], samples: [] };
  state.value = { farms: 'loading', plots: 'loading', points: 'loading', samples: 'loading' };
  hasMore.value = { farms: false, plots: false, points: false, samples: false };
  if (!companyId || !store.capabilities) return;
  for (const section of sections) void loadSection(section.key, companyId, generation);
}

watch(() => [store.companyId, store.capabilities], loadOverview, { immediate: true });

const plotRows = computed(() => rows.value.plots.slice(0, 6));
const sampleRows = computed(() => rows.value.samples.slice(0, 5));
function farmName(id: string) {
  const farm = rows.value.farms.find(item => item.id === id);
  return farm ? `${farm.code} · ${farm.name}` : 'Predio no disponible';
}
function plotName(id: string) {
  const plot = rows.value.plots.find(item => item.id === id);
  return plot ? `${plot.code} · ${plot.name}` : 'Cuartel no disponible';
}
const maxArea = computed(() => Math.max(0, ...plotRows.value.map((plot) => Number(plot.areaHa ?? 0)).filter(Number.isFinite)));
function areaWidth(area: string | null) {
  const value = Number(area);
  return area && maxArea.value > 0 && Number.isFinite(value) ? `${Math.max(0, Math.min(100, value / maxArea.value * 100))}%` : '0%';
}
</script>

<template>
  <section class="saphi-dashboard saphi-live-dashboard is-embedded" aria-label="Resumen de la empresa seleccionada">
    <div class="saphi-content">
      <div class="saphi-page-heading">
        <div><p class="saphi-eyebrow">SAPHI CHILE · INFORMACIÓN DE LA EMPRESA</p><h2 class="saphi-dashboard-title">Resumen de {{ store.company?.tradeName || store.company?.legalName }}</h2><p>Territorio y actividad registrados para esta empresa.</p></div>
        <button type="button" class="saphi-live-refresh" @click="loadOverview"><v-icon icon="mdi-refresh" aria-hidden="true" /> Actualizar</button>
      </div>
      <section v-if="store.company" class="saphi-card saphi-live-company" aria-label="Datos generales de la empresa">
        <div class="saphi-section-heading"><div><h3>Datos generales</h3><p>{{ store.company.legalName }}</p></div><span class="saphi-live-status" :class="store.company.status === 'active' ? 'is-active' : 'is-inactive'">{{ store.company.status === 'active' ? 'Activa' : 'Inactiva' }}</span></div>
        <dl class="saphi-live-company-details">
          <div><dt>RUT</dt><dd>{{ store.company.rut }}</dd></div>
          <div><dt>Nombre de fantasía</dt><dd>{{ store.company.tradeName || 'Sin registrar' }}</dd></div>
          <div><dt>Correo de contacto</dt><dd>{{ store.company.contactEmail || 'Sin registrar' }}</dd></div>
          <div><dt>Teléfono</dt><dd>{{ store.company.contactPhone || 'Sin registrar' }}</dd></div>
        </dl>
      </section>
      <div class="saphi-metrics saphi-live-metrics">
        <article v-for="section in sections" :key="section.key" class="saphi-card saphi-metric">
          <div class="saphi-card-heading"><h3>{{ section.label }}</h3><v-icon :icon="section.icon" aria-hidden="true" /></div>
          <p class="saphi-value" :aria-label="`${section.label}: ${pageCount(section.key)}`">{{ pageCount(section.key) }}</p>
          <p v-if="state[section.key] === 'loading'" class="saphi-live-note">Cargando datos…</p>
          <p v-else-if="state[section.key] === 'restricted'" class="saphi-live-note">Sin acceso a estos datos</p>
          <p v-else-if="state[section.key] === 'error'" class="saphi-live-note">No se pudieron cargar los datos</p>
          <p v-else class="saphi-live-note">{{ hasMore[section.key] ? 'Al menos los registros mostrados · hay más páginas' : 'Registros de la empresa' }}</p>
          <router-link v-if="state[section.key] !== 'restricted'" :to="companyRoute(section.route)" class="saphi-live-link">Ver {{ section.label.toLowerCase() }}</router-link>
        </article>
      </div>

      <div class="saphi-live-grid">
        <section class="saphi-card" aria-label="Cuarteles registrados">
          <div class="saphi-section-heading"><div><h3>Cuarteles registrados</h3><p>Predio, superficie y variedad declarados</p></div><router-link v-if="state.plots !== 'restricted'" :to="companyRoute('plots')" class="saphi-live-link">Ver todos</router-link></div>
          <p v-if="state.plots === 'loading'" class="saphi-empty">Cargando cuarteles…</p>
          <p v-else-if="state.plots === 'restricted'" class="saphi-empty">Sin acceso a cuarteles.</p>
          <p v-else-if="state.plots === 'error'" class="saphi-empty">No se pudieron cargar los cuarteles.</p>
          <p v-else-if="!plotRows.length" class="saphi-empty">No hay cuarteles registrados.</p>
          <ul v-else class="saphi-live-plots"><li v-for="plot in plotRows" :key="plot.id"><div class="saphi-live-row"><strong>{{ plot.code }} · {{ plot.name }}</strong><span>{{ plot.areaHa === null ? 'Superficie sin registrar' : `${plot.areaHa} ha` }}</span></div><div class="saphi-live-track"><span :style="{ width: areaWidth(plot.areaHa) }" /></div><small>{{ state.farms === 'ready' ? farmName(plot.farmId) : 'Predio no disponible' }} · {{ plot.grapeVariety || 'Variedad sin registrar' }} · {{ plot.status === 'active' ? 'Activo' : 'Inactivo' }}</small></li></ul>
          <p v-if="hasMore.plots" class="saphi-live-footnote">Se muestran los primeros registros. Consulta el listado para ver más.</p>
        </section>

        <section class="saphi-card" aria-label="Muestras recientes">
          <div class="saphi-section-heading"><div><h3>Muestras recientes</h3><p>Registros de los últimos 30 días</p></div><router-link v-if="state.samples !== 'restricted'" :to="companyRoute('samples')" class="saphi-live-link">Ver todas</router-link></div>
          <p v-if="state.samples === 'loading'" class="saphi-empty">Cargando muestras…</p>
          <p v-else-if="state.samples === 'restricted'" class="saphi-empty">Sin acceso a muestras.</p>
          <p v-else-if="state.samples === 'error'" class="saphi-empty">No se pudieron cargar las muestras.</p>
          <p v-else-if="!sampleRows.length" class="saphi-empty">No hay muestras en los últimos 30 días.</p>
          <ul v-else class="saphi-live-samples"><li v-for="sample in sampleRows" :key="sample.id"><span class="saphi-event-icon"><v-icon icon="mdi-test-tube" aria-hidden="true" /></span><div><strong>{{ sample.code }}</strong><small>{{ showDate(sample.sampledAt) }}</small><small>{{ state.plots === 'ready' ? plotName(sample.plotId) : 'Cuartel no disponible' }}</small></div></li></ul>
          <p v-if="hasMore.samples" class="saphi-live-footnote">Hay más muestras en el listado.</p>
        </section>
      </div>

    </div>
  </section>
</template>
