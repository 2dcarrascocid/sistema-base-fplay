<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { createFarmSchema, updateFarmSchema, createPlotSchema, updatePlotSchema, createSamplingPointSchema, updateSamplingPointSchema,
  type FarmDto, type PlotDto, type SamplingPointDto, type SaphiPermission } from '@base/saphi';
import { useSaphiAction as useApiAction } from '../composables/useSaphiAction';
import CompanyHeader from '../components/CompanyHeader.vue';
import SamplingPointMap from '../components/SamplingPointMap.vue';
import { saphiApi, type MasterKind, type MasterDto } from '../services/api';
import { useSaphiCompanyStore } from '../stores/company';

const props=defineProps<{kind:MasterKind}>();const {t}=useI18n();const store=useSaphiCompanyStore();const {run,loading,error}=useApiAction();
const rows=ref<MasterDto[]>([]);const cursor=ref<string|null>(null);const parents=ref<{title:string;value:string}[]>([]);const parentCursor=ref<string|null>(null);
const plotFarmIds=ref<Record<string,string>>({});const farmNames=ref<Record<string,string>>({});
const parentFilter=ref<string|null>(null);const statusFilter=ref<string|null>(null);const dialog=ref(false);const invalid=ref(false);const editing=ref<MasterDto|null>(null);
const fieldErrors=ref<Record<string,string>>({});
const form=reactive({code:'',name:'',areaHa:'',parentId:'',grapeVariety:'',plantingYear:'',soilType:'',longitude:'',latitude:'',status:'active' as 'active'|'inactive'});
const menu=computed(()=>props.kind==='sampling-points'?'samples':props.kind);
const parentKind=computed<MasterKind|null>(()=>props.kind==='plots'?'farms':props.kind==='sampling-points'?'plots':null);
const parentLabel=computed(()=>props.kind==='plots'?'saphi.farm':'saphi.plot');
const parentRead=computed(()=>!parentKind.value||store.can(`saphi.${parentKind.value}:view` as SaphiPermission));
const canCreate=computed(()=>parentRead.value&&store.can(`saphi.${menu.value}:create` as SaphiPermission));
const canEdit=computed(()=>store.can(`saphi.${menu.value}:edit` as SaphiPermission));
const statusItems=computed(()=>['active','inactive'].map(value=>({value,title:t(`saphi.${value}`)})));
const parentNames=computed(()=>Object.fromEntries(parents.value.map(item=>[item.value,item.title])));
const farmName=(id:string)=>farmNames.value[id]??parentNames.value[id]??id;
const plotName=(id:string)=>parentNames.value[id]??id;
const pointFarmName=(plotId:string)=>{const farmId=plotFarmIds.value[plotId];return farmId?farmName(farmId):'—';};
const plotFarm=(row:MasterDto)=>farmName((row as PlotDto).farmId);
const pointFarm=(row:MasterDto)=>pointFarmName((row as SamplingPointDto).plotId);
const pointPlot=(row:MasterDto)=>plotName((row as SamplingPointDto).plotId);
function selectMapPoint(longitude:string,latitude:string){form.longitude=longitude;form.latitude=latitude;}
async function changeStatus(row:MasterDto){
  const companyId=store.companyId;if(!companyId||loading.value)return;
  const status=row.status==='active'?'inactive':'active';
  const schema=props.kind==='farms'?updateFarmSchema:props.kind==='plots'?updatePlotSchema:updateSamplingPointSchema;
  const parsed=schema.safeParse({expectedVersion:row.version,status});if(!parsed.success)return;
  const result=await run(()=>saphiApi.update(companyId,props.kind,row.id,parsed.data),t('app.saved'));
  if(result&&companyId===store.companyId)await load();
}
let epoch=0;
async function load(next=false){
  const companyId=store.companyId;if(!companyId||!store.can(`saphi.${menu.value}:view` as SaphiPermission))return;
  const generation=++epoch;const kind=props.kind;
  const result=await run(()=>saphiApi.list(companyId,kind,{status:statusFilter.value??undefined,
    ...(parentFilter.value?{[kind==='plots'?'farmId':'plotId']:parentFilter.value}:{}),...(next&&cursor.value?{cursor:cursor.value}:{})}));
  if(result&&generation===epoch&&companyId===store.companyId){rows.value=next?[...rows.value,...result.data]:result.data;cursor.value=result.page.nextCursor;}
}
async function loadParents(next=false){
  const companyId=store.companyId;const kind=parentKind.value;if(!companyId||!kind||!parentRead.value)return;
  const result=await run(()=>saphiApi.list(companyId,kind,{limit:100,...(next&&parentCursor.value?{cursor:parentCursor.value}:{})}));
  if(result&&companyId===store.companyId&&kind===parentKind.value){
    const options=result.data.map(r=>({value:r.id,title:`${r.code} · ${(r as FarmDto).name}`}));
    parents.value=next?[...parents.value,...options]:options;parentCursor.value=result.page.nextCursor;
    if(kind==='farms')farmNames.value={...farmNames.value,...Object.fromEntries(result.data.map(row=>[row.id,`${row.code} · ${(row as FarmDto).name}`]))};
    if(kind==='plots')plotFarmIds.value={...plotFarmIds.value,...Object.fromEntries(result.data.map(row=>[row.id,(row as PlotDto).farmId]))};
  }
}
async function loadFarmNames(){
  const companyId=store.companyId;if(!companyId||!store.can('saphi.farms:view'))return;
  let nextCursor:string|null=null;
  do{
    const result=await run(()=>saphiApi.list(companyId,'farms',{limit:100,...(nextCursor?{cursor:nextCursor}:{})}));
    if(!result||companyId!==store.companyId)return;
    farmNames.value={...farmNames.value,...Object.fromEntries(result.data.map(row=>[row.id,`${row.code} · ${(row as FarmDto).name}`]))};
    nextCursor=result.page.nextCursor;
  }while(nextCursor);
}
function openEditor(row:MasterDto|null){
  editing.value=row;invalid.value=false;fieldErrors.value={};const farm=row as FarmDto|null;const plot=row as PlotDto|null;const point=row as SamplingPointDto|null;
  Object.assign(form,{code:row?.code??'',name:farm?.name??'',areaHa:farm?.areaHa??'',parentId:plot?.farmId??point?.plotId??'',
    grapeVariety:plot?.grapeVariety??'',plantingYear:plot?.plantingYear?.toString()??'',soilType:plot?.soilType??'',
    longitude:point?.location?.coordinates[0]?.toString()??'',latitude:point?.location?.coordinates[1]?.toString()??'',status:row?.status??'active'});
  dialog.value=true;
}
async function save(){
  const companyId=store.companyId;if(!companyId||loading.value)return;
  const edit=editing.value;let input:unknown;let schema;
  const fields={name:form.name,areaHa:form.areaHa||null,status:form.status};
  if(props.kind==='sampling-points'){
    input={location:{type:'Point',coordinates:[form.longitude.trim()===''?NaN:Number(form.longitude),form.latitude.trim()===''?NaN:Number(form.latitude)]},status:form.status,
      ...(edit?{expectedVersion:edit.version}:{code:form.code,plotId:form.parentId})};
    schema=edit?updateSamplingPointSchema:createSamplingPointSchema;
  }else{
    input={...fields,...(props.kind==='plots'?{grapeVariety:form.grapeVariety||null,plantingYear:form.plantingYear===''?null:Number(form.plantingYear),soilType:form.soilType||null}:{}),
      ...(edit?{expectedVersion:edit.version}:{code:form.code,...(props.kind==='plots'?{farmId:form.parentId}:{})})};
    schema=props.kind==='plots'?(edit?updatePlotSchema:createPlotSchema):(edit?updateFarmSchema:createFarmSchema);
  }
  const parsed=schema.safeParse(input);invalid.value=!parsed.success;
  fieldErrors.value=parsed.success?{}:Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]??''),t('saphi.invalid')]));
  if(!parsed.success)return;
  const result=await run(()=>edit?saphiApi.update(companyId,props.kind,edit.id,parsed.data):saphiApi.create(companyId,props.kind,parsed.data),t('app.saved'));
  if(result&&companyId===store.companyId){dialog.value=false;await load();}
}
function reset(){epoch++;rows.value=[];cursor.value=null;parents.value=[];parentCursor.value=null;plotFarmIds.value={};farmNames.value={};dialog.value=false;parentFilter.value=null;statusFilter.value=null;}
watch(()=>[store.companyId,props.kind,store.capabilities] as const,()=>{reset();if(store.can(`saphi.${menu.value}:view` as SaphiPermission)){void load();void loadParents();if(props.kind==='sampling-points')void loadFarmNames();}},{immediate:true});
watch([parentFilter,statusFilter],()=>{if(store.capabilities)void load();});
</script>
<template>
  <div>
    <CompanyHeader :title="t(`saphi.${kind}`)"><v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" :disabled="loading" @click="openEditor(null)">{{t('app.create')}}</v-btn></CompanyHeader>
    <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="dialog=false;load()">{{t('saphi.reload')}}</v-btn></v-alert>
    <v-alert v-if="!parentRead" type="info" variant="tonal" class="mb-4">{{t('saphi.noParent')}}</v-alert>
    <v-row dense><v-col cols="12" sm="4"><v-select v-model="statusFilter" :items="statusItems" :label="t('saphi.status')" clearable /></v-col>
      <v-col v-if="parentKind&&parentRead" cols="12" sm="6"><v-select v-model="parentFilter" :items="parents" :label="t(parentLabel)" clearable /></v-col></v-row>
    <v-btn v-if="parentCursor" variant="text" :disabled="loading" @click="loadParents(true)">{{t('saphi.moreOptions')}}</v-btn>
    <v-progress-linear v-if="loading" indeterminate :aria-label="t('app.loading')" />
    <v-card variant="outlined"><v-table><thead><tr><th>{{t('saphi.code')}}</th><th v-if="kind!=='farms'">{{t('saphi.farm')}}</th><th v-if="kind==='sampling-points'">{{t('saphi.plot')}}</th><th>{{t(kind==='sampling-points'?'saphi.coordinates':'saphi.name')}}</th><th>{{t('saphi.status')}}</th><th>{{t('app.edit')}}</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.id"><td>{{row.code}}</td><td v-if="kind==='plots'">{{plotFarm(row)}}</td><td v-if="kind==='sampling-points'">{{pointFarm(row)}}</td><td v-if="kind==='sampling-points'">{{pointPlot(row)}}</td><td>{{'location' in row?row.location.coordinates.join(', '):row.name}}</td>
        <td>{{t(`saphi.${row.status}`)}}</td><td><template v-if="canEdit"><v-btn variant="text" :aria-label="`${t('app.edit')} ${row.code}`" @click="openEditor(row)">{{t('app.edit')}}</v-btn>
          <v-btn variant="text" :disabled="loading" :aria-label="`${t(row.status==='active'?'saphi.deactivate':'saphi.activate')} ${row.code}`" @click="changeStatus(row)">{{t(row.status==='active'?'saphi.deactivate':'saphi.activate')}}</v-btn></template></td></tr></tbody></v-table>
      <v-card-text v-if="!loading&&!rows.length">{{t('saphi.empty')}}</v-card-text>
    </v-card>
    <v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
    <v-dialog v-model="dialog" max-width="680" :persistent="loading"><v-card :title="t(editing?'app.edit':'app.create')"><v-form :disabled="loading" @submit.prevent="save"><v-card-text>
      <v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.invalid')}}</v-alert>
      <v-text-field v-if="!editing" v-model="form.code" :error-messages="fieldErrors['code']" :label="t('saphi.code')" maxlength="64" required />
      <v-select v-if="parentKind&&!editing" v-model="form.parentId" :error-messages="fieldErrors[kind==='plots'?'farmId':'plotId']" :items="parents" :label="t(parentLabel)" required />
      <template v-if="kind!=='sampling-points'">
        <v-text-field v-model="form.name" :error-messages="fieldErrors['name']" :label="t('saphi.name')" maxlength="200" required />
        <v-text-field v-model="form.areaHa" :error-messages="fieldErrors['areaHa']" :label="t('saphi.area')" :hint="t('saphi.areaHint')" inputmode="decimal" persistent-hint />
      </template>
      <template v-if="kind==='plots'"><v-text-field v-model="form.grapeVariety" :label="t('saphi.variety')" maxlength="200" />
        <v-text-field v-model="form.plantingYear" :error-messages="fieldErrors['plantingYear']" :label="t('saphi.year')" inputmode="numeric" />
        <v-text-field v-model="form.soilType" :label="t('saphi.soil')" maxlength="200" /></template>
      <template v-if="kind==='sampling-points'"><p class="mb-2">{{t('saphi.pointMapHint')}}</p><SamplingPointMap v-if="dialog" :longitude="form.longitude" :latitude="form.latitude" :label="t('saphi.pointMapLabel')" class="mb-4" @select="selectMapPoint" /></template>
      <v-row v-if="kind==='sampling-points'"><v-col cols="12" sm="6"><v-text-field v-model="form.longitude" :error-messages="fieldErrors['location']" :label="t('saphi.longitude')" hint="−180 … 180" persistent-hint inputmode="decimal" required /></v-col>
        <v-col cols="12" sm="6"><v-text-field v-model="form.latitude" :error-messages="fieldErrors['location']" :label="t('saphi.latitude')" hint="−90 … 90" persistent-hint inputmode="decimal" required /></v-col></v-row>
      <v-select v-model="form.status" :items="statusItems" :label="t('saphi.status')" />
    </v-card-text><v-card-actions><v-spacer/><v-btn :disabled="loading" @click="dialog=false">{{t('app.cancel')}}</v-btn><v-btn color="primary" type="submit" :loading="loading">{{t('app.save')}}</v-btn></v-card-actions></v-form></v-card></v-dialog>
  </div>
</template>
