import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { CompanyCapabilitiesDto, CompanyDto, SaphiPermission } from '@base/saphi';
import { useSessionStore } from '../../../stores/session';
import { saphiApi } from '../services/api';

export const useSaphiCompanyStore=defineStore('saphi-company',()=>{
  const session=useSessionStore();
  const companyId=ref<string|null>(null);
  const company=ref<CompanyDto|null>(null);
  const capabilities=ref<CompanyCapabilitiesDto|null>(null);
  const loading=ref(false);
  const lastSection=ref<Record<string,string>>({});
  const sections=new Set(['farms','plots','sampling-points','memberships','samples','laboratory','devices','telemetry','satellite','dashboard']);
  function rememberSection(id:string,section:string){
    if(!sections.has(section))return;
    lastSection.value={...lastSection.value,[id]:section};
  }
  function companyDestination(id:string){return `/saphi/companies/${encodeURIComponent(id)}${lastSection.value[id]?'/'+lastSection.value[id]:''}`;}
  let generation=0;
  const menu=computed(()=>capabilities.value?.menu??[]);
  const can=(permission:SaphiPermission)=>capabilities.value?.effectivePermissions.includes(permission)??false;
  function clear(){ generation++;companyId.value=null;company.value=null;capabilities.value=null;loading.value=false; }
  async function activate(id:string){
    const current=++generation;
    companyId.value=id;company.value=null;capabilities.value=null;loading.value=true;
    try{
      const [details,access]=await Promise.all([saphiApi.company(id),saphiApi.capabilities(id)]);
      if(current!==generation)return false;
      company.value=details.data;capabilities.value=access.data;return true;
    }catch(error){if(current!==generation)return false;clear();throw error;}
    finally{if(current===generation)loading.value=false;}
  }
  watch(()=>session.me?.user.id,(next,previous)=>{if(next!==previous){clear();lastSection.value={};}});
  return{companyId,company,capabilities,loading,menu,can,clear,activate,rememberSection,companyDestination};
});
