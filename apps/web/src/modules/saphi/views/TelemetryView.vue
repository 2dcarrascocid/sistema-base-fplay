<script setup lang="ts">
import { computed,reactive,ref,watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { telemetryHistoryQuerySchema,telemetryLatestQuerySchema,type ReadingDto } from '@base/saphi';
import { saphiApi } from '../services/api';
import { useSaphiCompanyStore } from '../stores/company';
import { useSaphiAction } from '../composables/useSaphiAction';
import CompanyHeader from '../components/CompanyHeader.vue';
import TelemetryPanel from '../components/TelemetryPanel.vue';
import {useTelemetryPolling} from '../composables/useTelemetryPolling';
import { localDateTime,utcInstant } from '../utils/dateTime';
const {t}=useI18n();const store=useSaphiCompanyStore();const {run,loading,error}=useSaphiAction();
const defaults=()=>({plotId:'',deviceId:'',metricCode:'',from:localDateTime(new Date(Date.now()-86400000)),to:localDateTime(new Date())});
const polling=ref(false),pollSeconds=ref(30);
const filters=reactive(defaults());const mode=ref('history');const rows=ref<ReadingDto[]>([]);const cursor=ref<string|null>(null);const invalid=ref(false);
const devices=ref<{title:string;value:string}[]>([]);const deviceCursor=ref<string|null>(null);let generation=0;let deviceGeneration=0;
const plots=ref<{title:string;value:string}[]>([]),plotCursor=ref<string|null>(null);let plotGeneration=0;
async function loadPlots(next=false){const companyId=store.companyId;if(!companyId||!store.can('saphi.plots:view'))return;const current=++plotGeneration;
  const result=await run(()=>saphiApi.list(companyId,'plots',{limit:100,...(next&&plotCursor.value?{cursor:plotCursor.value}:{})}));
  if(result&&current===plotGeneration&&store.companyId===companyId){const items=result.data.map(row=>({title:'name' in row?`${row.code} · ${row.name}`:row.code,value:row.id}));plots.value=next?[...plots.value,...items]:items;plotCursor.value=result.page.nextCursor;}
}
async function loadDevices(next=false){const companyId=store.companyId;if(!companyId||!store.can('saphi.devices:view'))return;const current=++deviceGeneration;
  const result=await run(()=>saphiApi.devices(companyId,{limit:100,...(filters.plotId?{plotId:filters.plotId}:{}),...(next&&deviceCursor.value?{cursor:deviceCursor.value}:{})}));
  if(result&&current===deviceGeneration&&store.companyId===companyId){const items=result.data.map(row=>({title:row.code,value:row.id}));devices.value=next?[...devices.value,...items]:items;deviceCursor.value=result.page.nextCursor;}
}
async function load(next=false){const companyId=store.companyId;if(!companyId||loading.value)return;const current=++generation;
  const common={deviceId:filters.deviceId,...(filters.metricCode?{metricCode:filters.metricCode}:{})};
  let data:ReadingDto[]|undefined;let nextCursor:string|null=null;
  if(mode.value==='history'){
    const parsed=telemetryHistoryQuerySchema.safeParse({...common,from:utcInstant(filters.from),to:utcInstant(filters.to),limit:25,...(next&&cursor.value?{cursor:cursor.value}:{})});
    invalid.value=!parsed.success;if(!parsed.success)return;
    const result=await run(()=>saphiApi.readings(companyId,parsed.data));data=result?.data;nextCursor=result?.page.nextCursor??null;
  }else{
    const parsed=telemetryLatestQuerySchema.safeParse(common);invalid.value=!parsed.success;if(!parsed.success)return;
    const result=await run(()=>saphiApi.latest(companyId,parsed.data));data=result?.data;
  }
  if(data&&current===generation&&store.companyId===companyId){rows.value=next?[...rows.value,...data]:data;cursor.value=nextCursor;}
}
watch(()=>[filters.deviceId,filters.metricCode,filters.from,filters.to,mode.value],()=>{generation++;rows.value=[];cursor.value=null;invalid.value=false;});
watch(()=>filters.plotId,()=>{generation++;deviceGeneration++;filters.deviceId='';rows.value=[];devices.value=[];deviceCursor.value=null;if(store.can('saphi.telemetry:view'))void loadDevices();});
watch(()=>[store.companyId,store.capabilities],()=>{polling.value=false;generation++;deviceGeneration++;plotGeneration++;Object.assign(filters,defaults());rows.value=[];cursor.value=null;devices.value=[];deviceCursor.value=null;plots.value=[];plotCursor.value=null;if(store.can('saphi.telemetry:view')){void loadDevices();void loadPlots();}},{immediate:true});
useTelemetryPolling(()=>load(),computed(()=>polling.value&&mode.value==='latest'&&!!filters.deviceId&&store.can('saphi.telemetry:view')&&store.can('saphi.devices:view')),pollSeconds);
</script>
<template><div>
  <CompanyHeader :title="t('saphi.telemetry')" />
  <v-alert type="info" variant="tonal" class="mb-4">{{t('saphi.ingestionPending')}}</v-alert>
  <v-alert v-if="!store.can('saphi.devices:view')" type="info">{{t('saphi.devicesReadRequired')}}</v-alert>
  <v-alert v-if="error" type="error" class="mb-4">{{error}}</v-alert>
  <v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.invalidTelemetry')}}</v-alert>
  <v-form :disabled="loading" @submit.prevent="load()"><v-row>
    <v-col v-if="store.can('saphi.plots:view')" cols="12" md="4"><v-select v-model="filters.plotId" :items="plots" clearable :label="t('saphi.plot')" /><v-btn v-if="plotCursor" variant="text" @click="loadPlots(true)">{{t('saphi.moreOptions')}}</v-btn></v-col>
    <v-col cols="12" md="4"><v-select v-model="filters.deviceId" :items="devices" :label="t('saphi.device')" required /></v-col>
    <v-col cols="12" md="4"><v-select v-model="mode" :items="[{value:'history',title:t('saphi.history')},{value:'latest',title:t('saphi.latest')}]" :label="t('saphi.queryMode')" /></v-col>
    <v-col cols="12" md="4"><v-text-field v-model="filters.metricCode" :label="t('saphi.metric')" maxlength="64" /></v-col>
    <template v-if="mode==='history'"><v-col cols="12" md="6"><v-text-field v-model="filters.from" type="datetime-local" :label="t('saphi.from')" /></v-col><v-col cols="12" md="6"><v-text-field v-model="filters.to" type="datetime-local" :label="t('saphi.to')" /></v-col></template>
  </v-row><v-btn v-if="deviceCursor" variant="text" @click="loadDevices(true)">{{t('saphi.moreOptions')}}</v-btn><v-btn type="submit" color="primary" :disabled="!store.can('saphi.devices:view')" :loading="loading" class="mb-4">{{t('saphi.applyFilters')}}</v-btn></v-form>
  <div v-if="mode==='latest'"><v-checkbox v-model="polling" :label="t('saphi.telemetryPoll')" /><v-text-field v-model.number="pollSeconds" type="number" min="5" max="3600" :label="t('saphi.telemetryPollSeconds')" /></div>
  <p class="mb-3">{{t('saphi.telemetryConnectionNotice')}}</p>
  <TelemetryPanel :rows="rows" /><v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
</div></template>
