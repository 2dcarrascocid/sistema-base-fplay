<script setup lang="ts">
import { reactive,ref,watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { satelliteQuerySchema,type ObservationDto } from '@base/saphi';
import { saphiApi } from '../services/api';
import { useSaphiCompanyStore } from '../stores/company';
import { useSaphiAction } from '../composables/useSaphiAction';
import CompanyHeader from '../components/CompanyHeader.vue';
import SatelliteMap from '../components/SatelliteMap.vue';
import { localDateTime,utcInstant } from '../utils/dateTime';
const {t}=useI18n();const store=useSaphiCompanyStore();const {run,loading,error}=useSaphiAction();
const defaults=()=>({plotId:'',from:localDateTime(new Date(Date.now()-30*86400000)),to:localDateTime(new Date())});
const filters=reactive(defaults());const rows=ref<ObservationDto[]>([]);const cursor=ref<string|null>(null);const invalid=ref(false);const detail=ref<ObservationDto|null>(null);
const plots=ref<{title:string;value:string}[]>([]);const plotCursor=ref<string|null>(null);let generation=0;let scopeGeneration=0;let detailRequest=0;
async function loadPlots(next=false){const companyId=store.companyId;if(!companyId||!store.can('saphi.plots:view'))return;const current=scopeGeneration;
  const result=await run(()=>saphiApi.list(companyId,'plots',{limit:100,...(next&&plotCursor.value?{cursor:plotCursor.value}:{})}));
  if(result&&scopeGeneration===current&&store.companyId===companyId){const items=result.data.map(row=>({title:`${row.code} · ${'name' in row?row.name:''}`,value:row.id}));plots.value=next?[...plots.value,...items]:items;plotCursor.value=result.page.nextCursor;}
}
async function load(next=false){const companyId=store.companyId;if(!companyId||loading.value)return;const current=++generation;
  const parsed=satelliteQuerySchema.safeParse({...filters,from:utcInstant(filters.from),to:utcInstant(filters.to),limit:25,...(next&&cursor.value?{cursor:cursor.value}:{})});invalid.value=!parsed.success;if(!parsed.success)return;
  const result=await run(()=>saphiApi.observations(companyId,parsed.data));
  if(result&&current===generation&&store.companyId===companyId){rows.value=next?[...rows.value,...result.data]:result.data;cursor.value=result.page.nextCursor;}
}
async function show(id:string){const companyId=store.companyId;if(!companyId)return;const current=generation;const request=++detailRequest;
  const result=await run(()=>saphiApi.observation(companyId,id));if(result&&request===detailRequest&&current===generation&&store.companyId===companyId)detail.value=result.data;
}
function closeDetail(open:boolean){if(!open){detailRequest++;detail.value=null;}}
async function reload(){if(!plots.value.length&&store.can('saphi.plots:view'))await loadPlots();if(filters.plotId)await load();}
watch(()=>[filters.plotId,filters.from,filters.to],()=>{generation++;rows.value=[];cursor.value=null;detail.value=null;invalid.value=false;});
watch(()=>[store.companyId,store.capabilities],()=>{generation++;scopeGeneration++;Object.assign(filters,defaults());rows.value=[];cursor.value=null;detail.value=null;plots.value=[];plotCursor.value=null;if(store.can('saphi.satellite:view'))void loadPlots();},{immediate:true});
</script>
<template><div>
  <CompanyHeader :title="t('saphi.satellite')" />
  <v-alert type="info" variant="tonal" class="mb-4">{{t('saphi.satellitePending')}}</v-alert>
  <v-alert v-if="!store.can('saphi.plots:view')" type="info">{{t('saphi.satellitePlotRequired')}}</v-alert>
  <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="reload">{{t('saphi.reload')}}</v-btn></v-alert>
  <v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.satelliteInvalid')}}</v-alert>
  <v-form :disabled="loading" @submit.prevent="load()"><v-row>
    <v-col cols="12" md="4"><v-select v-model="filters.plotId" :items="plots" :label="t('saphi.plot')" required /></v-col>
    <v-col cols="12" md="4"><v-text-field v-model="filters.from" type="datetime-local" :label="t('saphi.from')" /></v-col>
    <v-col cols="12" md="4"><v-text-field v-model="filters.to" type="datetime-local" :label="t('saphi.to')" /></v-col>
  </v-row><v-btn v-if="plotCursor" variant="text" :disabled="loading" @click="loadPlots(true)">{{t('saphi.moreOptions')}}</v-btn><v-btn type="submit" color="primary" :disabled="!store.can('saphi.plots:view')" :loading="loading" class="mb-4">{{t('saphi.applyFilters')}}</v-btn></v-form>
  <SatelliteMap v-if="store.can('saphi.plots:view')" :plot-id="filters.plotId" />
  <v-card variant="outlined"><v-table><thead><tr><th>{{t('saphi.sourceObservation')}}</th><th>{{t('saphi.provider')}}</th><th>{{t('saphi.acquiredAt')}}</th><th>{{t('saphi.quality')}}</th><th>{{t('saphi.details')}}</th></tr></thead>
    <tbody><tr v-for="row in rows" :key="row.id"><td>{{row.sourceObservationId}}</td><td>{{row.providerCode}}</td><td>{{row.acquiredAt}}</td><td>{{row.qualityCode??'—'}}</td><td><v-btn variant="text" :aria-label="`${t('saphi.details')} ${row.sourceObservationId}`" @click="show(row.id)">{{t('saphi.details')}}</v-btn></td></tr></tbody></v-table><v-card-text v-if="!loading&&!rows.length">{{t('saphi.satelliteEmpty')}}</v-card-text></v-card>
  <v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
  <v-dialog :model-value="!!detail" max-width="720" @update:model-value="closeDetail"><v-card v-if="detail" :title="detail.sourceObservationId"><v-card-text>
    <dl><dt>{{t('saphi.provider')}}</dt><dd>{{detail.providerCode}}</dd><dt>{{t('saphi.productReference')}}</dt><dd>{{detail.productReference}}</dd>
    <dt>{{t('saphi.licenceReference')}}</dt><dd class="text-break">{{detail.licenceReference}}</dd><dt>{{t('saphi.acquiredAt')}}</dt><dd>{{detail.acquiredAt}}</dd><dt>{{t('saphi.receivedAt')}}</dt><dd>{{detail.receivedAt}}</dd>
    <dt>{{t('saphi.coverageText')}}</dt><dd>{{detail.coverageText??'—'}}</dd><dt>{{t('saphi.quality')}}</dt><dd>{{detail.qualityCode??'—'}}</dd>
    <dt>{{t('saphi.assetIds')}}</dt><dd class="text-break">{{detail.assetIds.join(', ')||'—'}}</dd></dl>
    <v-alert type="info" variant="tonal" class="mt-4">{{t('saphi.indicesPending')}}</v-alert><p class="mt-4">{{t('saphi.downloadPending')}}</p>
  </v-card-text><v-card-actions><v-btn @click="closeDetail(false)">{{t('saphi.close')}}</v-btn></v-card-actions></v-card></v-dialog>
</div></template>
