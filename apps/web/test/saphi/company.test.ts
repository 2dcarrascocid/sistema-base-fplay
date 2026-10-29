import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyCapabilitiesDto, CompanyDto, ResourceResponse } from '@base/saphi';
import type { Me } from '../../src/services/types';
import { ApiError } from '../../src/services/http';
import { useSessionStore } from '../../src/stores/session';
import { useNotifyStore } from '../../src/stores/notify';
import { saphiApi } from '../../src/modules/saphi/services/api';
import { useSaphiCompanyStore } from '../../src/modules/saphi/stores/company';
import { saphiNavigation } from '../../src/modules/saphi/routes';

const company=(id:string):CompanyDto=>({id,rut:'12345678-5',legalName:id,tradeName:null,contactEmail:null,contactPhone:null,
  status:'active',version:1,createdAt:'2026-10-27T12:00:00.000Z',updatedAt:'2026-10-27T12:00:00.000Z'});
const caps=(companyId:string):CompanyCapabilitiesDto=>({companyId,membershipVersion:1,effectivePermissions:['saphi.companies:view','saphi.farms:view'],menu:[]});
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
let pinia:Pinia;
beforeEach(()=>{
  pinia=createPinia();setActivePinia(pinia);
  useSessionStore().me={user:{id:'user1'},role:'superuser'} as Me;
  vi.spyOn(saphiApi,'company').mockImplementation(async id=>({data:company(id)}));
  vi.spyOn(saphiApi,'capabilities').mockImplementation(async id=>({data:caps(id)}));
});
afterEach(()=>{disposePinia(pinia);vi.restoreAllMocks();});

describe('company state and navigation',()=>{
  it('uses company-specific capabilities instead of the superuser global bypass',async()=>{
    const store=useSaphiCompanyStore();expect(store.can('saphi.farms:edit')).toBe(false);
    expect(await store.activate('A')).toBe(true);expect(store.company?.legalName).toBe('A');
    expect(store.can('saphi.farms:view')).toBe(true);expect(store.can('saphi.farms:edit')).toBe(false);expect(store.loading).toBe(false);
    store.clear();expect(store.companyId).toBeNull();expect(store.menu).toEqual([]);
  });
  it('discards late responses from A after the user has selected B',async()=>{
    const a=deferred<ResourceResponse<CompanyDto>>();vi.mocked(saphiApi.company).mockImplementation(id=>id==='A'?a.promise:Promise.resolve({data:company(id)}));
    const store=useSaphiCompanyStore();const previous=store.activate('A');
    expect(await store.activate('B')).toBe(true);a.resolve({data:company('A')});expect(await previous).toBe(false);
    expect(store.companyId).toBe('B');expect(store.company?.id).toBe('B');
  });
  it('ignores a late error from a canceled selection and preserves B',async()=>{
    const a=deferred<ResourceResponse<CompanyDto>>();vi.mocked(saphiApi.company).mockImplementation(id=>id==='A'?a.promise:Promise.resolve({data:company(id)}));
    const store=useSaphiCompanyStore();const previous=store.activate('A');await store.activate('B');a.reject(new ApiError(404,'NOT_FOUND'));
    expect(await previous).toBe(false);expect(store.companyId).toBe('B');
  });
  it('clears selected data when access is lost and does not retain an old permission set',async()=>{
    const store=useSaphiCompanyStore();await store.activate('A');vi.mocked(saphiApi.company).mockRejectedValue(new ApiError(404,'NOT_FOUND'));
    await expect(store.activate('B')).rejects.toMatchObject({status:404});expect(store.companyId).toBeNull();
    expect(store.can('saphi.farms:view')).toBe(false);expect(store.loading).toBe(false);
  });
  it('clears and invalidates pending work when the authenticated user logs out',async()=>{
    const a=deferred<ResourceResponse<CompanyDto>>();vi.mocked(saphiApi.company).mockReturnValue(a.promise);
    const store=useSaphiCompanyStore();const pending=store.activate('A');useSessionStore().me=null;await nextTick();
    a.resolve({data:company('A')});expect(await pending).toBe(false);expect(store.companyId).toBeNull();
  });
  it('guards direct links by tenant capability, including missing context and read-only users',async()=>{
    expect(await saphiNavigation(undefined,'saphi.farms:view')).toEqual({name:'saphi-companies'});
    expect(await saphiNavigation('A','saphi.farms:view')).toBe(true);
    expect(await saphiNavigation('A','saphi.farms:edit')).toEqual({name:'forbidden'});
  });
  it('returns to selection on inaccessible companies and reports other service failures',async()=>{
    vi.mocked(saphiApi.company).mockRejectedValueOnce(new ApiError(403,'FORBIDDEN')).mockRejectedValueOnce(new Error('network'));
    expect(await saphiNavigation('A','saphi.farms:view')).toEqual({name:'saphi-companies'});
    expect(await saphiNavigation('A','saphi.farms:view')).toEqual({name:'saphi-companies'});
    expect(useNotifyStore().current?.tone).toBe('error');
  });
});
