import { afterEach,describe,it,expect,vi } from 'vitest';
import { SAPHI_PERMISSIONS, type DashboardDto } from '@base/saphi';
import { installBackend,mountApp,unmountApp,pageText,click,fill,choose,apiError,settle,type Routes } from '../harness';
import { router } from '../../src/router';
const c='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222';
const base=`/saphi/companies/${c}`;
const overview=():DashboardDto=>({companyId:c,plotId:null,period:{from:'2026-10-01T00:00:00.000Z',to:'2026-10-02T00:00:00.000Z'},generatedAt:'2026-10-02T12:00:00.000Z',limit:6,
 sections:{farms:{status:'available',data:[{id:p,label:'Predio verificado'}],hasMore:true},plots:{status:'no_data'},devices:{status:'forbidden'},samples:{status:'no_data'},
 telemetry:{status:'available',data:[{id:p,label:'sensor · test.metric',value:'0',unit:'test.unit',at:'2026-10-01T00:00:00.000Z'}],hasMore:false},satellite:{status:'no_data'},laboratory:{status:'pending_definition'},indicators:{status:'pending_definition'}}});
function backend(extra:Routes={},permissions:readonly string[]=SAPHI_PERMISSIONS){return installBackend({
 [`GET ${base}`]:{data:{id:c,rut:'12345678-5',legalName:'Empresa dashboard',status:'active',version:1}},
 [`GET ${base}/capabilities`]:{data:{companyId:c,membershipVersion:1,effectivePermissions:permissions,menu:[]}},
 [`GET ${base}/dashboard`]:{data:overview()},...extra,
 [`GET ${base}/plots`]:{data:[{id:p,companyId:c,farmId:p,code:'C1',name:'Cuartel Uno',areaHa:'5',grapeVariety:null,plantingYear:null,soilType:null,status:'active',version:1,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}],page:{nextCursor:null,hasMore:false}},
 [`GET ${base}/sampling-points`]:{data:[{id:p,companyId:c,plotId:p,code:'PM-1',location:{type:'Point',coordinates:[-70,-33]},status:'active',version:1,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}],page:{nextCursor:null,hasMore:false}},
});}
afterEach(()=>unmountApp());
describe('consolidated dashboard view',()=>{
 it('keeps navigation identities unique when the selector and company catalogue share a route',async()=>{
  const warn=vi.spyOn(console,'warn');
  try{
    backend({[`GET ${base}/capabilities`]:{data:{companyId:c,membershipVersion:1,effectivePermissions:SAPHI_PERMISSIONS,menu:[
      {code:'saphi',kind:'module',name:{es:'Saphi Chile',en:'Saphi Chile'},icon:null,route:null,children:[
        {code:'saphi.companies',kind:'menu',name:{es:'Empresas',en:'Companies'},icon:null,route:'/saphi/companies',children:[]},
      ]},
    ]}}});
    await mountApp(`${base}/dashboard`);
    expect(document.querySelectorAll('nav a[href="/saphi/companies"]').length).toBe(2);
    expect(warn.mock.calls.some(args=>args.some(arg=>String(arg).includes('Multiple nodes with the same ID')))).toBe(false);
  }finally{warn.mockRestore();}
 });
 it('renders company and territorial records without invented totals or pending indicator cards',async()=>{
  const api=backend();await mountApp(`${base}/dashboard`);expect(pageText()).toContain('Predio verificado');expect(pageText()).toContain('PM-1');
  expect(pageText()).toContain('12345678-5');expect(pageText()).toContain('no representan totales');expect(pageText()).toContain('Hay más registros');
  expect(pageText()).not.toContain('test.metric');expect(pageText()).not.toContain('no hay resultados calculados');
  expect(api.called(`GET ${base}/dashboard`)).toHaveLength(1);expect(api.calls.some(call=>call.path.includes('/download'))).toBe(false);
 });
 it('clears previous results on filter edits and applies selected plot and period',async()=>{
  const api=backend();await mountApp(`${base}/dashboard`);await fill('Desde (fecha y hora)','2099-10-03T00:00');expect(pageText()).not.toContain('Predio verificado');
  await click('Aplicar filtros');expect(pageText()).toContain('Revisa las fechas y horas');expect(api.called(`GET ${base}/dashboard`)).toHaveLength(1);
  await choose('Cuartel','C1 · Cuartel Uno');await fill('Desde (fecha y hora)','2026-10-01T00:00');await fill('Hasta (fecha y hora)','2026-10-03T00:00');await click('Aplicar filtros');
  expect(api.called(`GET ${base}/dashboard`).at(-1)?.query.get('plotId')).toBe(p);expect(pageText()).toContain('Predio verificado');
 });
 it('recovers failures through an explicit reload',async()=>{
  const api=backend({[`GET ${base}/dashboard`]:apiError(503,'INTERNAL_ERROR')});await mountApp(`${base}/dashboard`);expect(pageText()).toContain('Recargar datos');
  api.routes[`GET ${base}/dashboard`]={data:overview()};await click('Recargar datos');expect(pageText()).toContain('Predio verificado');
 });
 it('rejects navigation without the dashboard permission',async()=>{
  const api=backend({},['saphi.companies:view']);await mountApp(`${base}/dashboard`);expect(api.called(`GET ${base}/dashboard`)).toHaveLength(0);
 });
 it('discards an old response after editing filters',async()=>{
  let resolve!:(value:unknown)=>void;const pending=new Promise(r=>{resolve=r;});
  backend({[`GET ${base}/dashboard`]:async()=>await pending as {data:DashboardDto}});await mountApp(`${base}/dashboard`);
  await fill('Desde (fecha y hora)','2026-09-01T00:00');resolve({data:overview()});await settle();expect(pageText()).not.toContain('Predio verificado');
 });
 it('keeps company B visible when a late dashboard response from A arrives',async()=>{
  const b='33333333-3333-4333-8333-333333333333',other=`/saphi/companies/${b}`;
  let resolve!:(value:unknown)=>void;const pending=new Promise(r=>{resolve=r;});
  const data=overview();data.companyId=b;data.sections.farms={status:'available',data:[{id:b,label:'Predio exclusivo B'}],hasMore:false};
  backend({[`GET ${base}/dashboard`]:async()=>await pending as {data:DashboardDto},
    [`GET ${other}`]:{data:{id:b,rut:'11111111-1',legalName:'Empresa B',status:'active',version:1}},
    [`GET ${other}/capabilities`]:{data:{companyId:b,membershipVersion:1,effectivePermissions:SAPHI_PERMISSIONS,menu:[]}},
    [`GET ${other}/dashboard`]:{data}});
  await mountApp(`${base}/dashboard`);await router.push(`${other}/dashboard`);await settle();expect(pageText()).toContain('Predio exclusivo B');
  resolve({data:overview()});await settle();expect(pageText()).toContain('Predio exclusivo B');expect(pageText()).not.toContain('Predio verificado');
 });
});
