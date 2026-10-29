<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { updateCompanySchema } from '@base/saphi';
import { useRouter } from 'vue-router';
import { AppConfirmDialog } from '@base/ui';
import { useSessionStore } from '../../../stores/session';
import { useSaphiAction as useApiAction } from '../composables/useSaphiAction';
import CompanyHeader from '../components/CompanyHeader.vue';
import SaphiCompanyDashboard from '../presentation/dashboard/SaphiCompanyDashboard.vue';
import { saphiApi } from '../services/api';
import { useSaphiCompanyStore } from '../stores/company';

const {t}=useI18n();const router=useRouter();const store=useSaphiCompanyStore();const session=useSessionStore();
const {run,loading,error}=useApiAction();const invalid=ref(false);
const confirm=ref(false);
const fieldErrors=ref<Record<string,string>>({});
const form=reactive({legalName:'',tradeName:'',contactEmail:'',contactPhone:'',status:'active' as 'active'|'inactive',reason:''});
const editable=computed(()=>store.can('saphi.companies:edit'));
const states=computed(()=>['active','inactive'].map(value=>({value,title:t(`saphi.${value}`)})));
watch(()=>store.company,company=>{if(company)Object.assign(form,{legalName:company.legalName,tradeName:company.tradeName??'',
  contactEmail:company.contactEmail??'',contactPhone:company.contactPhone??'',status:company.status,reason:''});},{immediate:true});
async function save(confirmed=false){
  const company=store.company;if(!company||loading.value)return;
  const parsed=updateCompanySchema.safeParse({expectedVersion:company.version,reason:form.reason,legalName:form.legalName,
    tradeName:form.tradeName||null,contactEmail:form.contactEmail||null,contactPhone:form.contactPhone||null,
    ...(form.status!==company.status?{status:form.status}:{})});
  invalid.value=!parsed.success;fieldErrors.value=parsed.success?{}:Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]??''),t('saphi.invalid')]));if(!parsed.success)return;
  if(parsed.data.status==='inactive'&&!confirmed){confirm.value=true;return;}
  confirm.value=false;
  const result=await run(()=>saphiApi.updateCompany(company.id,parsed.data),t('app.saved'));
  if(result&&store.companyId===company.id){
    if(result.data.status==='inactive'){store.clear();await router.replace({name:'saphi-companies'});}
    else store.company=result.data;
  }
}
async function reload(){if(store.companyId)await run(()=>store.activate(store.companyId!));}
</script>
<template>
  <div>
    <CompanyHeader :title="t('saphi.company')" />
    <SaphiCompanyDashboard v-if="store.company" class="mb-6" />
    <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="reload">{{t('saphi.reload')}}</v-btn></v-alert>
    <v-card v-if="store.company" variant="outlined"><v-card-text><p class="text-body-2 mb-4">{{store.company.rut}} · {{t('saphi.version')}} {{store.company.version}}</p>
      <v-form :disabled="loading" @submit.prevent="save()"><v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.invalid')}}</v-alert>
        <v-text-field v-model="form.legalName" :error-messages="fieldErrors['legalName']" :label="t('saphi.legalName')" :readonly="!editable" maxlength="200" />
        <v-text-field v-model="form.tradeName" :label="t('saphi.tradeName')" :readonly="!editable" maxlength="200" />
        <v-row><v-col cols="12" sm="6"><v-text-field v-model="form.contactEmail" :label="t('saphi.email')" :readonly="!editable" type="email" /></v-col>
          <v-col cols="12" sm="6"><v-text-field v-model="form.contactPhone" :label="t('saphi.phone')" :readonly="!editable" maxlength="40" /></v-col></v-row>
        <v-select v-if="editable&&session.role==='superuser'" v-model="form.status" :items="states" :label="t('saphi.status')" :hint="t('saphi.stateHint')" persistent-hint />
        <v-textarea v-if="editable" v-model="form.reason" :error-messages="fieldErrors['reason']" :label="t('saphi.reason')" rows="2" maxlength="500" required />
        <v-btn v-if="editable" color="primary" type="submit" :loading="loading">{{t('app.save')}}</v-btn>
      </v-form>
    </v-card-text></v-card>
    <AppConfirmDialog v-model="confirm" :title="t('saphi.changeStatus')" :message="t('saphi.stateHint')" :confirm-text="t('app.save')" :cancel-text="t('app.cancel')" danger :loading="loading" @confirm="save(true)" />
  </div>
</template>
