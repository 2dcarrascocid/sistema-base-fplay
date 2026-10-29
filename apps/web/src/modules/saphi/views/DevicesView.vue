<script setup lang="ts">
import { computed,reactive,ref,watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { createDeviceSchema,updateDeviceSchema,type DeviceDto } from '@base/saphi';
import { useSaphiCompanyStore } from '../stores/company';
import { useSaphiAction } from '../composables/useSaphiAction';
import { saphiApi } from '../services/api';
import CompanyHeader from '../components/CompanyHeader.vue';
const {t}=useI18n();const store=useSaphiCompanyStore();const {run,loading,error}=useSaphiAction();
const rows=ref<DeviceDto[]>([]);const cursor=ref<string|null>(null);const dialog=ref(false);const editing=ref<DeviceDto|null>(null);
const status=ref('');const errors=ref<Record<string,string>>({});const invalid=ref(false);
const parents=ref<{title:string;value:string}[]>([]);const parentCursor=ref<string|null>(null);
const form=reactive({code:'',plotId:'',providerCode:'',externalDeviceId:'',status:'active' as 'active'|'inactive',manufacturer:'',model:'',serialNumber:''});
let generation=0;let scopeGeneration=0;
const canCreate=computed(()=>store.can('saphi.devices:create')&&store.can('saphi.plots:view'));
const states=computed(()=>['active','inactive'].map(value=>({value,title:t(`saphi.${value}`)})));
async function load(next=false){const companyId=store.companyId;if(!companyId)return;const current=++generation;
  const result=await run(()=>saphiApi.devices(companyId,{...(status.value?{status:status.value}:{}),...(next&&cursor.value?{cursor:cursor.value}:{})}));
  if(result&&current===generation&&store.companyId===companyId){rows.value=next?[...rows.value,...result.data]:result.data;cursor.value=result.page.nextCursor;}
}
async function loadParents(next=false){const companyId=store.companyId;if(!companyId||!store.can('saphi.plots:view'))return;
  const current=scopeGeneration;
  const result=await run(()=>saphiApi.list(companyId,'plots',{limit:100,...(next&&parentCursor.value?{cursor:parentCursor.value}:{})}));
  if(result&&store.companyId===companyId&&current===scopeGeneration){const items=result.data.map(row=>({title:`${row.code} · ${'name' in row?row.name:''}`,value:row.id}));parents.value=next?[...parents.value,...items]:items;parentCursor.value=result.page.nextCursor;}
}
function open(row:DeviceDto|null){editing.value=row;invalid.value=false;errors.value={};Object.assign(form,{code:row?.code??'',plotId:row?.plotId??'',providerCode:row?.providerCode??'',externalDeviceId:row?.externalDeviceId??'',status:row?.status??'active',manufacturer:row?.metadata.manufacturer??'',model:row?.metadata.model??'',serialNumber:row?.metadata.serialNumber??''});dialog.value=true;}
async function changeStatus(row:DeviceDto){const companyId=store.companyId;if(!companyId||loading.value)return;
  const parsed=updateDeviceSchema.safeParse({expectedVersion:row.version,status:row.status==='active'?'inactive':'active'});if(!parsed.success)return;
  const result=await run(()=>saphiApi.updateDevice(companyId,row.id,parsed.data),t('app.saved'));
  if(result&&store.companyId===companyId)await load();
}
async function save(){const companyId=store.companyId;if(!companyId||loading.value)return;
  const metadata=Object.fromEntries((['manufacturer','model','serialNumber'] as const).map(key=>[key,form[key]]).filter(([,v])=>v));
  const parsed=editing.value?updateDeviceSchema.safeParse({expectedVersion:editing.value.version,status:form.status,metadata}):createDeviceSchema.safeParse({code:form.code,plotId:form.plotId,providerCode:form.providerCode,externalDeviceId:form.externalDeviceId,status:form.status,metadata});
  invalid.value=!parsed.success;errors.value=parsed.success?{}:Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]),t('saphi.invalid')]));if(!parsed.success)return;
  const record=editing.value;
  const result=await run(()=>record?saphiApi.updateDevice(companyId,record.id,updateDeviceSchema.parse(parsed.data)):saphiApi.createDevice(companyId,createDeviceSchema.parse(parsed.data)),t('app.saved'));
  if(result&&store.companyId===companyId){dialog.value=false;await load();}
}
watch(status,()=>{rows.value=[];cursor.value=null;if(store.can('saphi.devices:view'))void load();});
watch(()=>[store.companyId,store.capabilities],()=>{generation++;scopeGeneration++;rows.value=[];cursor.value=null;dialog.value=false;parents.value=[];parentCursor.value=null;
  if(store.can('saphi.devices:view')){void load();void loadParents();}
},{immediate:true});
</script>
<template><div>
  <CompanyHeader :title="t('saphi.devices')"><v-btn v-if="canCreate" color="primary" :disabled="loading" @click="open(null)">{{t('saphi.registerDevice')}}</v-btn></CompanyHeader>
  <v-alert type="info" variant="tonal" class="mb-4">{{t('saphi.ingestionPending')}}</v-alert>
  <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="load()">{{t('saphi.reload')}}</v-btn></v-alert>
  <v-select v-model="status" :items="states" :label="t('saphi.status')" clearable @update:model-value="status=$event??''" />
  <v-progress-linear v-if="loading" indeterminate :aria-label="t('app.loading')" />
  <v-card variant="outlined"><v-table><thead><tr><th>{{t('saphi.code')}}</th><th>{{t('saphi.provider')}}</th><th>{{t('saphi.externalDevice')}}</th><th>{{t('saphi.status')}}</th><th>{{t('app.edit')}}</th></tr></thead>
  <tbody><tr v-for="row in rows" :key="row.id"><td>{{row.code}}</td><td>{{row.providerCode}}</td><td>{{row.externalDeviceId}}</td><td>{{t(`saphi.${row.status}`)}}</td><td><template v-if="store.can('saphi.devices:edit')"><v-btn variant="text" :aria-label="`${t('app.edit')} ${row.code}`" @click="open(row)">{{t('app.edit')}}</v-btn><v-btn variant="text" :disabled="loading" :aria-label="`${t(row.status==='active'?'saphi.deactivate':'saphi.activate')} ${row.code}`" @click="changeStatus(row)">{{t(row.status==='active'?'saphi.deactivate':'saphi.activate')}}</v-btn></template></td></tr></tbody></v-table><v-card-text v-if="!loading&&!rows.length">{{t('saphi.empty')}}</v-card-text></v-card>
  <v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
  <v-dialog v-model="dialog" max-width="680" :persistent="loading"><v-card :title="t(editing?'app.edit':'saphi.registerDevice')"><v-form :disabled="loading" @submit.prevent="save"><v-card-text>
    <v-alert v-if="invalid" type="error">{{t('saphi.invalid')}}</v-alert>
    <v-text-field v-model="form.code" :label="t('saphi.code')" :readonly="!!editing" :error-messages="errors['code']" required />
    <v-select v-if="!editing" v-model="form.plotId" :items="parents" :label="t('saphi.plot')" :error-messages="errors['plotId']" required />
    <v-btn v-if="!editing&&parentCursor" variant="text" @click="loadParents(true)">{{t('saphi.moreOptions')}}</v-btn>
    <v-text-field v-model="form.providerCode" :label="t('saphi.provider')" :readonly="!!editing" :error-messages="errors['providerCode']" required />
    <v-text-field v-model="form.externalDeviceId" :label="t('saphi.externalDevice')" :readonly="!!editing" :error-messages="errors['externalDeviceId']" required />
    <v-text-field v-model="form.manufacturer" :label="t('saphi.manufacturer')" maxlength="100" />
    <v-text-field v-model="form.model" :label="t('saphi.model')" maxlength="100" />
    <v-text-field v-model="form.serialNumber" :label="t('saphi.serialNumber')" maxlength="100" />
    <p class="text-caption mb-4">{{t('saphi.noSecrets')}}</p>
    <v-select v-model="form.status" :items="states" :label="t('saphi.status')" />
  </v-card-text><v-card-actions><v-spacer/><v-btn :disabled="loading" @click="dialog=false">{{t('app.cancel')}}</v-btn><v-btn type="submit" color="primary" :loading="loading">{{t('app.save')}}</v-btn></v-card-actions></v-form></v-card></v-dialog>
</div></template>
