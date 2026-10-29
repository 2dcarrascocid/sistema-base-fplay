<script setup lang="ts">
import { computed,reactive,ref,watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { createSoilSampleSchema,soilSampleQuerySchema,type SoilSampleDto } from '@base/saphi';
import { useSaphiCompanyStore } from '../stores/company';
import { useSaphiAction } from '../composables/useSaphiAction';
import { saphiApi } from '../services/api';
import CompanyHeader from '../components/CompanyHeader.vue';
import { localDateTime,utcInstant } from '../utils/dateTime';
const {t}=useI18n();const store=useSaphiCompanyStore();const {run,loading,error}=useSaphiAction();
const rows=ref<SoilSampleDto[]>([]);const cursor=ref<string|null>(null);const dialog=ref(false);const detail=ref<SoilSampleDto|null>(null);
const invalid=ref(false);const errors=ref<Record<string,string>>({});
const defaultPeriod=()=>({plotId:'',from:localDateTime(new Date(Date.now()-30*86400000)),to:localDateTime(new Date())});
const filters=reactive(defaultPeriod());
const form=reactive({code:'',plotId:'',samplingPointId:'',sampledAt:'',notes:''});
const parents=ref<{title:string;value:string}[]>([]);const parentCursor=ref<string|null>(null);
const points=ref<{title:string;value:string}[]>([]);const pointCursor=ref<string|null>(null);let pointGeneration=0;
let generation=0;
const canCreate=computed(()=>store.can('saphi.samples:create')&&store.can('saphi.plots:view'));
const plotNames=computed(()=>Object.fromEntries(parents.value.map(item=>[item.value,item.title])));
const plotName=(id:string)=>plotNames.value[id]??id;
async function load(next=false){
  const companyId=store.companyId;if(!companyId)return;
  const current=++generation;
  const parsed=soilSampleQuerySchema.safeParse({limit:25,from:utcInstant(filters.from),to:utcInstant(filters.to),
    ...(filters.plotId?{plotId:filters.plotId}:{}),...(next&&cursor.value?{cursor:cursor.value}:{})});
  invalid.value=!parsed.success;if(!parsed.success)return;
  const result=await run(()=>saphiApi.samples(companyId,parsed.data));
  if(result&&current===generation&&store.companyId===companyId){rows.value=next?[...rows.value,...result.data]:result.data;cursor.value=result.page.nextCursor;}
}
async function loadParents(next=false){
  const companyId=store.companyId;if(!companyId||!store.can('saphi.plots:view'))return;
  const result=await run(()=>saphiApi.list(companyId,'plots',{limit:100,...(next&&parentCursor.value?{cursor:parentCursor.value}:{})}));
  if(result&&store.companyId===companyId){const items=result.data.map(row=>({title:`${row.code} · ${'name' in row?row.name:''}`,value:row.id}));parents.value=next?[...parents.value,...items]:items;parentCursor.value=result.page.nextCursor;}
}
function open(){Object.assign(form,{code:'',plotId:'',samplingPointId:'',sampledAt:localDateTime(new Date()),notes:''});errors.value={};dialog.value=true;}
async function loadPoints(next=false){
  const companyId=store.companyId;const plotId=form.plotId;const current=++pointGeneration;
  if(!companyId||!plotId)return;
  const result=await run(()=>saphiApi.list(companyId,'sampling-points',{plotId,limit:100,...(next&&pointCursor.value?{cursor:pointCursor.value}:{})}));
  if(result&&current===pointGeneration&&store.companyId===companyId){const items=result.data.map(row=>({title:row.code,value:row.id}));points.value=next?[...points.value,...items]:items;pointCursor.value=result.page.nextCursor;}
}
watch(()=>form.plotId,()=>{pointGeneration++;points.value=[];pointCursor.value=null;form.samplingPointId='';if(form.plotId)void loadPoints();});
function closeDetail(open:boolean){if(!open)detail.value=null;}
async function save(){
  const companyId=store.companyId;if(!companyId||loading.value)return;
  const parsed=createSoilSampleSchema.safeParse({...form,sampledAt:utcInstant(form.sampledAt),samplingPointId:form.samplingPointId||null,notes:form.notes||null});
  errors.value=parsed.success?{}:Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]),t('saphi.invalid')]));
  if(!parsed.success)return;
  const result=await run(()=>saphiApi.createSample(companyId,parsed.data),t('app.saved'));
  if(result&&store.companyId===companyId){dialog.value=false;await load();}
}
async function show(id:string){
  const companyId=store.companyId;if(!companyId)return;
  const result=await run(()=>saphiApi.sample(companyId,id));
  if(result&&store.companyId===companyId)detail.value=result.data;
}
watch(()=>[store.companyId,store.capabilities],()=>{
  generation++;pointGeneration++;points.value=[];pointCursor.value=null;rows.value=[];cursor.value=null;dialog.value=false;detail.value=null;parents.value=[];parentCursor.value=null;
  Object.assign(filters,defaultPeriod());
  if(store.can('saphi.samples:view')){void load();void loadParents();}
},{immediate:true});
</script>
<template><div>
  <CompanyHeader :title="t('saphi.samples')"><v-btn v-if="canCreate" color="primary" :disabled="loading" @click="open">{{t('saphi.registerSample')}}</v-btn></CompanyHeader>
  <v-btn variant="text" class="mb-4" :to="`/saphi/companies/${store.companyId}/sampling-points`">{{t('saphi.sampling-points')}}</v-btn>
  <v-alert type="info" variant="tonal" class="mb-4">{{t('saphi.immutableSample')}}</v-alert>
  <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="load()">{{t('saphi.reload')}}</v-btn></v-alert>
  <v-alert v-if="invalid" type="error">{{t('saphi.invalidSamplePeriod')}}</v-alert>
  <v-form @submit.prevent="load()"><v-row>
    <v-col cols="12" md="4"><v-select v-model="filters.plotId" :items="parents" :disabled="!store.can('saphi.plots:view')" :label="t('saphi.plotIdFilter')" clearable @update:model-value="filters.plotId=$event??''" /></v-col>
    <v-col cols="12" md="4"><v-text-field v-model="filters.from" type="datetime-local" :label="t('saphi.from')" /></v-col>
    <v-col cols="12" md="4"><v-text-field v-model="filters.to" type="datetime-local" :label="t('saphi.to')" /></v-col>
  </v-row><v-btn v-if="parentCursor" variant="text" :disabled="loading" @click="loadParents(true)">{{t('saphi.moreOptions')}}</v-btn>
    <v-btn type="submit" :disabled="loading" class="mb-4">{{t('saphi.applyFilters')}}</v-btn></v-form>
  <v-progress-linear v-if="loading" indeterminate :aria-label="t('app.loading')" />
  <v-card variant="outlined"><v-table><thead><tr><th>{{t('saphi.code')}}</th><th>{{t('saphi.sampledAt')}}</th><th>{{t('saphi.plot')}}</th><th>{{t('saphi.details')}}</th></tr></thead>
    <tbody><tr v-for="row in rows" :key="row.id"><td>{{row.code}}</td><td>{{row.sampledAt}}</td><td>{{plotName(row.plotId)}}</td><td><v-btn variant="text" :aria-label="`${t('saphi.details')} ${row.code}`" @click="show(row.id)">{{t('saphi.details')}}</v-btn></td></tr></tbody></v-table>
    <v-card-text v-if="!loading&&!rows.length">{{t('saphi.empty')}}</v-card-text>
  </v-card><v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
  <v-dialog v-model="dialog" max-width="680" :persistent="loading"><v-card :title="t('saphi.registerSample')"><v-form :disabled="loading" @submit.prevent="save"><v-card-text>
    <v-text-field v-model="form.code" :label="t('saphi.code')" :error-messages="errors['code']" required maxlength="64" />
    <v-select v-model="form.plotId" :items="parents" :label="t('saphi.plot')" :error-messages="errors['plotId']" required />
    <v-btn v-if="parentCursor" variant="text" @click="loadParents(true)">{{t('saphi.moreOptions')}}</v-btn>
    <v-select v-model="form.samplingPointId" :items="points" :disabled="!form.plotId" :label="t('saphi.pointOptional')" :error-messages="errors['samplingPointId']" clearable />
    <v-btn v-if="pointCursor" variant="text" @click="loadPoints(true)">{{t('saphi.moreOptions')}}</v-btn>
    <v-text-field v-model="form.sampledAt" type="datetime-local" :label="t('saphi.sampledAt')" :hint="t('saphi.isoHint')" persistent-hint :error-messages="errors['sampledAt']" required />
    <v-textarea v-model="form.notes" :label="t('saphi.notes')" :error-messages="errors['notes']" maxlength="2000" />
  </v-card-text><v-card-actions><v-spacer/><v-btn :disabled="loading" @click="dialog=false">{{t('app.cancel')}}</v-btn><v-btn type="submit" color="primary" :loading="loading">{{t('app.create')}}</v-btn></v-card-actions></v-form></v-card></v-dialog>
  <v-dialog :model-value="!!detail" max-width="680" @update:model-value="closeDetail"><v-card v-if="detail" :title="detail.code"><v-card-text>
    <dl><dt>{{t('saphi.sampledAt')}}</dt><dd>{{detail.sampledAt}}</dd><dt>{{t('saphi.receivedAt')}}</dt><dd>{{detail.createdAt}}</dd><dt>{{t('saphi.plot')}}</dt><dd class="text-break">{{plotName(detail.plotId)}}</dd>
    <dt>{{t('saphi.pointIdOptional')}}</dt><dd class="text-break">{{detail.samplingPointId??'—'}}</dd><dt>{{t('saphi.notes')}}</dt><dd class="text-pre-wrap">{{detail.notes??'—'}}</dd></dl>
  </v-card-text><v-card-actions><v-btn @click="detail=null">{{t('saphi.close')}}</v-btn></v-card-actions></v-card></v-dialog>
</div></template>
