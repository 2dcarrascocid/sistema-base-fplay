<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AppPageHeader } from '@base/ui';
import { createCompanySchema, SAPHI_PERMISSIONS, type CompanyDto, type SaphiPermission } from '@base/saphi';
import { normalizeRut } from '@base/shared';
import { useSaphiAction as useApiAction } from '../composables/useSaphiAction';
import { useSessionStore } from '../../../stores/session';
import { adminApi } from '../../../services/api';
import { saphiApi } from '../services/api';
import { useSaphiCompanyStore } from '../stores/company';

const {t}=useI18n();const session=useSessionStore();const store=useSaphiCompanyStore();
const {run,loading,error}=useApiAction();
const companies=ref<CompanyDto[]>([]);const cursor=ref<string|null>(null);const dialog=ref(false);const invalid=ref(false);
const fieldErrors=ref<Record<string,string>>({});
const users=ref<{title:string;value:string}[]>([]);const search=ref('');
const minimum:SaphiPermission[]=['saphi.companies:view','saphi.memberships:view','saphi.memberships:edit'];
const choices=ref<SaphiPermission[]>([]);
const form=reactive({rut:'',legalName:'',tradeName:'',contactEmail:'',contactPhone:'',initialUserId:'',initialPermissions:[] as SaphiPermission[],reason:''});
const canBootstrap=computed(()=>session.role==='superuser');
async function load(next=false){
  const result=await run(()=>saphiApi.companies({...(next&&cursor.value?{cursor:cursor.value}:{})}));
  if(result){companies.value=next?[...companies.value,...result.data]:result.data;cursor.value=result.page.nextCursor;}
}
async function searchUsers(){
  const result=await run(()=>adminApi.users({search:search.value,status:'active',pageSize:50}));
  if(result)users.value=result.items.filter(u=>u.id!==session.me?.user.id).map(u=>({title:`${u.first_name} ${u.last_name} · ${u.email}`,value:u.id}));
}
async function openCreate(){
  Object.assign(form,{rut:'',legalName:'',tradeName:'',contactEmail:'',contactPhone:'',initialUserId:'',initialPermissions:[],reason:''});
  invalid.value=false;fieldErrors.value={};choices.value=[];dialog.value=true;await searchUsers();
}
let userGeneration=0;
watch(()=>form.initialUserId,async userId=>{
  const generation=++userGeneration;form.initialPermissions=[];choices.value=[];
  if(!userId)return;
  const result=await run(()=>adminApi.userPermissions(userId));
  if(result&&generation===userGeneration){choices.value=SAPHI_PERMISSIONS.filter(key=>result.permissions.includes(key));form.initialPermissions=[...choices.value];}
});
async function save(){
  if(loading.value)return;
  const result=createCompanySchema.safeParse({...form,rut:normalizeRut(form.rut)??form.rut,
    tradeName:form.tradeName||null,contactEmail:form.contactEmail||null,contactPhone:form.contactPhone||null});
  invalid.value=!result.success||!minimum.every(p=>form.initialPermissions.includes(p));
  fieldErrors.value=result.success?{}:Object.fromEntries(result.error.issues.map(issue=>[String(issue.path[0]??''),t('saphi.invalid')]));
  if(!minimum.every(p=>form.initialPermissions.includes(p)))fieldErrors.value['initialPermissions']=t('saphi.initialHint');
  if(!result.success||invalid.value)return;
  const created=await run(()=>saphiApi.createCompany(result.data),t('app.saved'));
  if(created){dialog.value=false;await session.loadMe();await load();}
}
onMounted(()=>{store.clear();void load();});
</script>
<template>
  <div>
    <AppPageHeader :title="t('saphi.title')" :subtitle="t('saphi.subtitle')">
      <template #actions><v-btn v-if="canBootstrap" color="primary" prepend-icon="mdi-plus" :disabled="loading" @click="openCreate">{{t('saphi.createCompany')}}</v-btn></template>
    </AppPageHeader>
    <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="load()">{{t('saphi.reload')}}</v-btn></v-alert>
    <v-progress-linear v-if="loading" indeterminate :aria-label="t('app.loading')" />
    <v-alert v-if="!loading&&!companies.length&&!error" type="info" variant="tonal">{{t('saphi.noCompanies')}}</v-alert>
    <v-row class="mt-1">
      <v-col v-for="company in companies" :key="company.id" cols="12" md="6" lg="4">
        <v-card variant="outlined" class="h-100"><v-card-title class="text-wrap">{{company.legalName}}</v-card-title>
          <v-card-subtitle>{{company.rut}}</v-card-subtitle><v-card-text v-if="company.tradeName">{{company.tradeName}}</v-card-text>
          <v-card-actions><v-btn color="primary" :to="store.companyDestination(company.id)">{{t('saphi.selectCompany')}}</v-btn></v-card-actions>
        </v-card>
      </v-col>
    </v-row>
    <v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
    <v-dialog v-model="dialog" max-width="720" :persistent="loading"><v-card :title="t('saphi.createCompany')"><v-form :disabled="loading" @submit.prevent="save"><v-card-text>
      <v-alert type="info" variant="tonal" class="mb-4">{{t('saphi.initialHint')}}</v-alert>
      <v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.invalid')}}</v-alert>
      <v-text-field v-model="form.legalName" :error-messages="fieldErrors['legalName']" :label="t('saphi.legalName')" maxlength="200" required />
      <v-text-field v-model="form.rut" :error-messages="fieldErrors['rut']" :label="t('saphi.rut')" required />
      <v-text-field v-model="form.tradeName" :label="t('saphi.tradeName')" maxlength="200" />
      <v-row><v-col cols="12" sm="6"><v-text-field v-model="form.contactEmail" :label="t('saphi.email')" type="email" /></v-col>
        <v-col cols="12" sm="6"><v-text-field v-model="form.contactPhone" :label="t('saphi.phone')" maxlength="40" /></v-col></v-row>
      <v-text-field v-model="search" :label="t('saphi.searchUsers')"><template #append><v-btn variant="text" :disabled="loading" @click="searchUsers">{{t('saphi.searchUsers')}}</v-btn></template></v-text-field>
      <v-autocomplete v-model="form.initialUserId" :error-messages="fieldErrors['initialUserId']" :items="users" :label="t('saphi.initialUser')" clearable />
      <v-select v-model="form.initialPermissions" :error-messages="fieldErrors['initialPermissions']" :items="choices" :label="t('saphi.permissions')" multiple chips />
      <v-textarea v-model="form.reason" :error-messages="fieldErrors['reason']" :label="t('saphi.reason')" rows="2" maxlength="500" required />
    </v-card-text><v-card-actions><v-spacer/><v-btn :disabled="loading" @click="dialog=false">{{t('app.cancel')}}</v-btn><v-btn color="primary" type="submit" :loading="loading">{{t('app.create')}}</v-btn></v-card-actions></v-form></v-card></v-dialog>
  </div>
</template>
