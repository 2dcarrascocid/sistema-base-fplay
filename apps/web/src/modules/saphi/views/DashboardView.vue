<script setup lang="ts">
import { onScopeDispose, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { dashboardQuerySchema, type DashboardDto, type DashboardSectionKey, type Page, type PlotDto, type SamplingPointDto } from '@base/saphi';
import CompanyHeader from '../components/CompanyHeader.vue';
import { saphiApi } from '../services/api';
import { useSaphiAction } from '../composables/useSaphiAction';
import { useSaphiCompanyStore } from '../stores/company';
import { localDateTime,utcInstant } from '../utils/dateTime';
const {t}=useI18n();const store=useSaphiCompanyStore();const {run,loading,error}=useSaphiAction();
const defaults=()=>({from:localDateTime(new Date(Date.now()-30*86400000)),to:localDateTime(new Date()),plotId:''});
const filters=reactive(defaults());const result=ref<DashboardDto|null>(null);const points=ref<Page<SamplingPointDto>|null>(null);const plots=ref<PlotDto[]>([]);const invalid=ref(false);let generation=0;
const keys:DashboardSectionKey[]=['farms','plots','samples'];
async function load(){
  const companyId=store.companyId;if(!companyId||!store.can('saphi.dashboard:view'))return;
  const parsed=dashboardQuerySchema.safeParse({from:utcInstant(filters.from),to:utcInstant(filters.to),...(filters.plotId?{plotId:filters.plotId}:{})});
  invalid.value=!parsed.success;if(!parsed.success)return;
  const request=++generation;result.value=null;points.value=null;
  const response=await run(()=>saphiApi.dashboard(companyId,parsed.data));
  if(request!==generation||store.companyId!==companyId||!response)return;
  result.value=response.data;
  if(store.can('saphi.samples:view')){
    const pointPage=await run(()=>saphiApi.list(companyId,'sampling-points',{limit:100,...(filters.plotId?{plotId:filters.plotId}:{})})) as Page<SamplingPointDto>|undefined;
    if(request===generation&&store.companyId===companyId&&pointPage)points.value=pointPage;
  }
}
watch(()=>[filters.from,filters.to,filters.plotId],()=>{generation++;result.value=null;points.value=null;invalid.value=false;},{flush:'sync'});
watch(()=>[store.companyId,store.capabilities],()=>{
  generation++;result.value=null;points.value=null;plots.value=[];Object.assign(filters,defaults());void load();
  const companyId=store.companyId;
  if(companyId&&store.can('saphi.plots:view'))void run(()=>saphiApi.list(companyId,'plots',{limit:100})).then(page=>{
    if(store.companyId===companyId&&page)plots.value=page.data as PlotDto[];
  });
},{immediate:true});
function target(key:DashboardSectionKey|'sampling-points'){return `/saphi/companies/${encodeURIComponent(store.companyId??'')}/${key}`;}
onScopeDispose(()=>{generation++;});
</script>
<template><div>
  <CompanyHeader :title="t('saphi.dashboard')" />
  <p class="mb-4">Predios, cuarteles, puntos de muestreo y muestras de {{store.company?.tradeName || store.company?.legalName}}.</p>
  <v-card v-if="store.company" variant="outlined" class="mb-4"><v-card-title tag="h2">Datos generales</v-card-title><v-card-text>
    <strong>{{store.company.legalName}}</strong> · RUT {{store.company.rut}} · {{store.company.status==='active'?'Activa':'Inactiva'}}<br />
    Correo: {{store.company.contactEmail || 'Sin registrar'}} · Teléfono: {{store.company.contactPhone || 'Sin registrar'}}
  </v-card-text></v-card>
  <v-form :disabled="loading" @submit.prevent="load"><v-row>
    <v-col cols="12" md="4"><v-text-field v-model="filters.from" type="datetime-local" :label="t('saphi.from')" /></v-col>
    <v-col cols="12" md="4"><v-text-field v-model="filters.to" type="datetime-local" :label="t('saphi.to')" /></v-col>
    <v-col v-if="store.can('saphi.plots:view')" cols="12" md="4"><v-select v-model="filters.plotId" :items="[{title:'Todos los cuarteles',value:''},...plots.map(plot=>({title:`${plot.code} · ${plot.name}`,value:plot.id}))]" label="Cuartel" /></v-col>
  </v-row><v-btn type="submit" color="primary" :loading="loading" class="mb-4">{{t('saphi.applyFilters')}}</v-btn></v-form>
  <v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.invalidPeriod')}}</v-alert>
  <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" :disabled="loading" @click="load">{{t('saphi.reload')}}</v-btn></v-alert>
  <div aria-live="polite"><v-progress-linear v-if="loading" indeterminate :aria-label="t('saphi.dashboardLoading')" />
    <template v-if="result">
      <p class="text-body-2 mb-4">Las muestras corresponden al período seleccionado. Los listados son vistas previas y no representan totales.</p>
      <v-row><v-col v-for="key in keys" :key="key" cols="12" md="6" xl="4">
        <v-card variant="outlined" height="100%"><v-card-title tag="h2">{{t(`saphi.${key}`)}}</v-card-title><v-card-text>
          <template v-if="result.sections[key].status==='available'">
            <ul class="saphi-overview-list"><li v-for="item in result.sections[key].data" :key="item.id">
              <strong>{{item.label}}</strong><span v-if="item.value!==undefined"> · {{item.value}} {{item.unit}}</span>
              <div v-if="item.at" class="text-body-2">{{item.at}} · UTC</div>
            </li></ul>
            <p class="mt-3">{{t('saphi.dashboardPreview',{limit:result.limit})}} <span v-if="result.sections[key].hasMore">{{t('saphi.dashboardMore')}}</span></p>
          </template>
          <p v-else>{{t(`saphi.dashboardState_${result.sections[key].status}`)}}</p>
          <v-btn v-if="result.sections[key].status!=='forbidden'" :to="target(key)" variant="text" class="mt-3">{{t('saphi.dashboardExplore')}}</v-btn>
        </v-card-text></v-card>
      </v-col></v-row>
      <v-card v-if="store.can('saphi.samples:view')" variant="outlined" class="mt-4"><v-card-title tag="h2">Puntos de muestreo</v-card-title><v-card-text>
        <p v-if="!points && !error">Cargando puntos de muestreo…</p>
        <p v-else-if="!points">No se pudieron cargar los puntos de muestreo.</p>
        <p v-else-if="!points.data.length">No hay puntos de muestreo registrados.</p>
        <template v-else><ul class="saphi-overview-list"><li v-for="point in points.data.slice(0,6)" :key="point.id">{{point.code}} · {{point.status==='active'?'Activo':'Inactivo'}}</li></ul>
          <p class="mt-3">Se muestran hasta seis puntos. <span v-if="points.data.length>6||points.page.hasMore">Hay más registros.</span></p></template>
        <v-btn :to="target('sampling-points')" variant="text" class="mt-3">Ver puntos de muestreo</v-btn>
      </v-card-text></v-card>
    </template>
  </div>
</div></template>
<style scoped>.saphi-overview-list{padding-inline-start:1.25rem;overflow-wrap:anywhere}.saphi-overview-list li+li{margin-top:.75rem}</style>
