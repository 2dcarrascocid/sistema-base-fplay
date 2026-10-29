<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { membershipSchema, membershipPermissionsSchema, entityIdSchema, type MembershipDto, type SaphiPermission } from '@base/saphi';
import { useSessionStore } from '../../../stores/session';
import { useSaphiAction as useApiAction } from '../composables/useSaphiAction';
import CompanyHeader from '../components/CompanyHeader.vue';
import { saphiApi } from '../services/api';
import { useSaphiCompanyStore } from '../stores/company';

const {t}=useI18n();const session=useSessionStore();const store=useSaphiCompanyStore();const {run,loading,error}=useApiAction();
const members=ref<MembershipDto[]>([]);const cursor=ref<string|null>(null);const dialog=ref(false);const invalid=ref(false);
const statusFilter=ref<string|null>(null);
const editing=ref<MembershipDto|null>(null);const mode=ref<'add'|'permissions'|'status'>('add');
const form=reactive({userId:'',status:'active' as 'active'|'inactive',permissions:[] as SaphiPermission[],reason:''});
const editable=computed(()=>store.can('saphi.memberships:edit'));const states=computed(()=>['active','inactive'].map(value=>({value,title:t(`saphi.${value}`)})));
const choices=computed(()=>store.capabilities?.effectivePermissions??[]);
let epoch=0;
async function load(next=false){
  const companyId=store.companyId;if(!companyId||!store.can('saphi.memberships:view'))return;const generation=++epoch;
  const result=await run(()=>saphiApi.members(companyId,{status:statusFilter.value??undefined,...(next&&cursor.value?{cursor:cursor.value}:{})}));
  if(result&&generation===epoch&&companyId===store.companyId){members.value=next?[...members.value,...result.data]:result.data;cursor.value=result.page.nextCursor;}
}
function openEditor(action:'add'|'permissions'|'status',member:MembershipDto|null=null){
  mode.value=action;editing.value=member;invalid.value=false;
  Object.assign(form,{userId:member?.userId??'',status:action==='status'&&member?(member.status==='active'?'inactive':'active'):member?.status??'active',permissions:[...(member?.permissions??[])],reason:''});dialog.value=true;
}
async function save(){
  const companyId=store.companyId;if(!companyId||loading.value)return;
  const user=entityIdSchema.safeParse(form.userId);invalid.value=!user.success;if(!user.success)return;
  const version=editing.value?.version??0;
  if(mode.value==='permissions'){
    const parsed=membershipPermissionsSchema.safeParse({expectedVersion:version,permissions:form.permissions,reason:form.reason});
    invalid.value=!parsed.success;if(!parsed.success)return;
    if(!await run(()=>saphiApi.setPermissions(companyId,user.data,parsed.data),t('app.saved')))return;
  }else{
    const parsed=membershipSchema.safeParse({expectedVersion:version,status:form.status,reason:form.reason});
    invalid.value=!parsed.success;if(!parsed.success)return;
    if(!await run(()=>saphiApi.setMember(companyId,user.data,parsed.data),t('app.saved')))return;
  }
  if(companyId===store.companyId){dialog.value=false;await load();}
}
watch(()=>[store.companyId,store.capabilities] as const,()=>{epoch++;members.value=[];cursor.value=null;dialog.value=false;
  if(store.can('saphi.memberships:view'))void load();},{immediate:true});
watch(statusFilter,()=>{void load();});
</script>
<template>
  <div>
    <CompanyHeader :title="t('saphi.memberships')"><v-btn v-if="editable" color="primary" prepend-icon="mdi-plus" :disabled="loading" @click="openEditor('add')">{{t('saphi.addMember')}}</v-btn></CompanyHeader>
    <v-alert v-if="error" type="error" class="mb-4">{{error}} <v-btn variant="text" @click="dialog=false;load()">{{t('saphi.reload')}}</v-btn></v-alert>
    <v-progress-linear v-if="loading" indeterminate :aria-label="t('app.loading')" />
    <v-select v-model="statusFilter" :items="states" :label="t('saphi.status')" clearable />
    <v-card variant="outlined"><v-table><thead><tr><th>{{t('saphi.name')}}</th><th>{{t('saphi.status')}}</th><th>{{t('saphi.permissions')}}</th></tr></thead>
      <tbody><tr v-for="member in members" :key="member.userId"><td><div>{{member.firstName}} {{member.lastName}}</div><code class="text-caption">{{member.userId}}</code></td>
        <td>{{t(`saphi.${member.status}`)}}</td><td>
          <span v-if="member.userId===session.me?.user.id" class="text-body-2">{{t('saphi.ownMembership')}}</span>
          <template v-else-if="editable"><v-btn variant="text" :aria-label="`${t('saphi.editPermissions')} ${member.firstName}`" @click="openEditor('permissions',member)">{{t('saphi.editPermissions')}}</v-btn>
            <v-btn variant="text" :aria-label="`${t(member.status==='active'?'saphi.deactivate':'saphi.activate')} ${member.firstName}`" @click="openEditor('status',member)">{{t(member.status==='active'?'saphi.deactivate':'saphi.activate')}}</v-btn></template>
        </td></tr></tbody></v-table><v-card-text v-if="!loading&&!members.length">{{t('saphi.empty')}}</v-card-text></v-card>
    <v-btn v-if="cursor" class="mt-4" :loading="loading" @click="load(true)">{{t('saphi.next')}}</v-btn>
    <v-dialog v-model="dialog" max-width="680" :persistent="loading"><v-card :title="t(mode==='add'?'saphi.addMember':mode==='permissions'?'saphi.editPermissions':'saphi.changeStatus')"><v-form :disabled="loading" @submit.prevent="save"><v-card-text>
      <v-alert v-if="invalid" type="error" class="mb-4">{{t('saphi.invalid')}}</v-alert>
      <v-alert type="info" variant="tonal" class="mb-4">{{t(mode==='permissions'?'saphi.permissionsHint':'saphi.memberHint')}}</v-alert>
      <v-text-field v-if="mode==='add'" v-model="form.userId" :label="t('saphi.userId')" required />
      <v-select v-if="mode==='permissions'" v-model="form.permissions" :items="choices" :label="t('saphi.permissions')" multiple chips />
      <v-select v-else v-model="form.status" :items="states" :label="t('saphi.status')" />
      <v-textarea v-model="form.reason" :label="t('saphi.reason')" rows="2" maxlength="500" required />
    </v-card-text><v-card-actions><v-spacer/><v-btn :disabled="loading" @click="dialog=false">{{t('app.cancel')}}</v-btn><v-btn color="primary" type="submit" :loading="loading">{{t('app.save')}}</v-btn></v-card-actions></v-form></v-card></v-dialog>
  </div>
</template>
