import type { RouteRecordRaw } from 'vue-router';
import type { SaphiPermission } from '@base/saphi';
import { useSaphiCompanyStore } from './stores/company';
import { ApiError } from '../../services/http';
import { useNotifyStore } from '../../stores/notify';
import { i18n } from '../../plugins/i18n';

const base='/saphi/companies/:companyId';
export const saphiRoutes:RouteRecordRaw[]=[
  {path:'/saphi/companies',name:'saphi-companies',component:()=>import('./views/CompaniesView.vue')},
  {path:base,name:'saphi-company',component:()=>import('./views/CompanyView.vue'),meta:{saphiPermission:'saphi.companies:view'}},
  {path:`${base}/dashboard`,name:'saphi-dashboard',component:()=>import('./views/DashboardView.vue'),meta:{saphiPermission:'saphi.dashboard:view'}},
  {path:`${base}/samples`,name:'saphi-samples',component:()=>import('./views/SamplesView.vue'),meta:{saphiPermission:'saphi.samples:view'}},
  {path:`${base}/devices`,name:'saphi-devices',component:()=>import('./views/DevicesView.vue'),meta:{saphiPermission:'saphi.devices:view'}},
  {path:`${base}/telemetry`,name:'saphi-telemetry',component:()=>import('./views/TelemetryView.vue'),meta:{saphiPermission:'saphi.telemetry:view'}},
  {path:`${base}/satellite`,name:'saphi-satellite',component:()=>import('./views/SatelliteView.vue'),meta:{saphiPermission:'saphi.satellite:view'}},
  {path:`${base}/laboratory`,name:'saphi-laboratory',component:()=>import('./views/LaboratoryView.vue'),meta:{saphiPermission:'saphi.laboratory:view'}},
  {path:`${base}/memberships`,name:'saphi-members',component:()=>import('./views/MembersView.vue'),meta:{saphiPermission:'saphi.memberships:view'}},
  ...(['farms','plots','sampling-points'] as const).map(kind=>({
    path:`${base}/${kind}`,name:`saphi-${kind}`,component:()=>import('./views/MasterDataView.vue'),props:{kind},
    meta:{saphiPermission:`saphi.${kind==='sampling-points'?'samples':kind}:view` as SaphiPermission},
  })),
  ...(['farms','plots','sampling-points','memberships','samples','laboratory','devices','telemetry','satellite','dashboard'] as const).map(kind=>({
    path:`/saphi/${kind}`,redirect:()=>{
      const selected=useSaphiCompanyStore().companyId;
      return selected?`${base.replace(':companyId',encodeURIComponent(selected))}/${kind}`:'/saphi/companies';
    },
  })),
];

export async function saphiNavigation(companyId:unknown,permission:SaphiPermission){
  const store=useSaphiCompanyStore();
  if(typeof companyId!=='string')return{name:'saphi-companies'};
  try{
    if(!await store.activate(companyId))return false;
    return store.can(permission)?true:{name:'forbidden'};
  }catch(error){
    if(error instanceof ApiError && (error.status===403||error.status===404))return{name:'saphi-companies'};
    useNotifyStore().show(i18n.global.t('saphi.unavailable'),'error');
    return{name:'saphi-companies'};
  }
}
