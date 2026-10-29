import { afterEach,describe,it,expect } from 'vitest';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { installBackend,mountApp,unmountApp,pageText,click,fill,choose,submit,apiError,type Routes } from '../harness';
const c='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',s='33333333-3333-4333-8333-333333333333';
const base=`/saphi/companies/${c}`;
const dates={version:1,createdAt:'2026-10-27T15:00:00.000Z',updatedAt:'2026-10-27T15:00:00.000Z'};
const sample={id:s,companyId:c,plotId:p,samplingPointId:null,code:'M-001',sampledAt:'2026-10-01T15:00:00.000Z',notes:'Muestra capturada',...dates};
const page=(data:unknown[],cursor:string|null=null)=>({data,page:{nextCursor:cursor,hasMore:!!cursor}});
function backend(extra:Routes={},permissions:readonly string[]=SAPHI_PERMISSIONS){
 return installBackend({
  [`GET ${base}`]:{data:{id:c,rut:'12345678-5',legalName:'Empresa muestras',tradeName:null,contactEmail:null,contactPhone:null,status:'active',...dates}},
  [`GET ${base}/capabilities`]:{data:{companyId:c,membershipVersion:1,effectivePermissions:permissions,menu:[]}},
  [`GET ${base}/plots`]:page([{id:p,code:'P1',name:'Cuartel uno'}]),
  [`GET ${base}/sampling-points`]:page([]),
  [`GET ${base}/samples`]:page([sample]),[`GET ${base}/samples/${s}`]:{data:sample},...extra,
 });
}
afterEach(()=>unmountApp());
describe('samples and laboratory views',()=>{
 it('lists immutable history and opens detail with both instants',async()=>{
  backend();await mountApp(`${base}/samples`);expect(pageText()).toContain('M-001');expect(pageText()).toContain('P1 · Cuartel uno');expect(pageText()).toContain('no se editan ni eliminan');
  await click('Ver detalle');expect(pageText()).toContain('Muestra capturada');expect(pageText()).toContain(sample.createdAt);await click('Cerrar');
 });
 it('validates required capture fields before sending',async()=>{
  backend();await mountApp(`${base}/samples`);await click('Registrar muestra');await submit();expect(pageText()).toContain('Revisa los campos');
 });
 it('registers a sample from a local date and time and selected plot',async()=>{
  const api=backend({[`POST ${base}/samples`]:{data:sample}});
  await mountApp(`${base}/samples`);await click('Registrar muestra');
  await Promise.all([fill('Código','M-002'),fill('Fecha y hora de toma','2026-10-02T12:00')]);
  await choose('Cuartel','P1 · Cuartel uno');await submit();
  expect(api.called(`POST ${base}/samples`)).toHaveLength(1);
  expect(api.called(`POST ${base}/samples`)[0]?.body).toMatchObject({sampledAt:new Date('2026-10-02T12:00').toISOString(),plotId:p});
  expect(pageText()).toContain('M-001');
 });
 it('filters, pages, and handles unavailable history',async()=>{
  const api=backend({[`GET ${base}/samples`]:({query})=>query.has('cursor')?page([{...sample,id:p,code:'M-002'}]):page([sample],'next')});
  await mountApp(`${base}/samples`);await click('Siguiente');expect(pageText()).toContain('M-002');
  await choose('Filtrar por cuartel','P1 · Cuartel uno');await click('Aplicar filtros');
  expect(api.called(`GET ${base}/samples`).at(-1)?.query.get('plotId')).toBe(p);
  await fill('Desde (fecha y hora)','2026-10-03T00:00');await fill('Hasta (fecha y hora)','2026-10-01T00:00');await click('Aplicar filtros');expect(pageText()).toContain('Desde debe ser anterior');
  await fill('Desde (fecha y hora)','2026-10-01T00:00');await fill('Hasta (fecha y hora)','2026-10-31T00:00');api.routes[`GET ${base}/samples`]=apiError(503,'INTERNAL_ERROR');await click('Aplicar filtros');expect(pageText()).toContain('Recargar datos');
 });
 it('hides writes for readers and declares pending analysis definitions',async()=>{
  backend({},['saphi.companies:view','saphi.samples:view','saphi.laboratory:view']);await mountApp(`${base}/samples`);expect(pageText()).not.toContain('Registrar muestra');
 });
 it('does not fabricate analysis results or expose an analysis form',async()=>{
  backend();await mountApp(`${base}/laboratory`);expect(pageText()).toContain('Definición pendiente');expect(pageText()).toContain('no está habilitado');
 });
});
