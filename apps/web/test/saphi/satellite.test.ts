import { afterEach,describe,it,expect } from 'vitest';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { installBackend,mountApp,unmountApp,pageText,click,choose,apiError,type Routes } from '../harness';
const c='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',o='33333333-3333-4333-8333-333333333333';
const base=`/saphi/companies/${c}`;const dates={version:1,createdAt:'2026-10-28T12:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z'};
const observation={id:o,companyId:c,plotId:p,providerCode:'test.provider',sourceObservationId:'origin-1',productReference:'test.product.v1',licenceReference:'test.licence.reference',acquiredAt:'2026-10-01T00:00:00.000Z',receivedAt:'2026-10-02T00:00:00.000Z',qualityCode:'test.quality',coverageText:'test.source.coverage',assetIds:['44444444-4444-4444-8444-444444444444'],indicesStatus:'pending_definition',downloadStatus:'pending_definition'};
const page=(data:unknown[],cursor:string|null=null)=>({data,page:{nextCursor:cursor,hasMore:!!cursor}});
function backend(extra:Routes={},permissions:readonly string[]=SAPHI_PERMISSIONS){return installBackend({
 [`GET ${base}`]:{data:{id:c,rut:'12345678-5',legalName:'Empresa satélite',status:'active',tradeName:null,contactEmail:null,contactPhone:null,...dates}},
 [`GET ${base}/capabilities`]:{data:{companyId:c,membershipVersion:1,effectivePermissions:permissions,menu:[]}},
 [`GET ${base}/plots`]:page([{id:p,code:'P1',name:'Cuartel uno'}]),
 [`GET ${base}/satellite/observations`]:page([observation]),[`GET ${base}/satellite/observations/${o}`]:{data:observation},...extra,
});}
afterEach(()=>unmountApp());
describe('satellite catalogue view',()=>{
 it('queries provenance and shows detail without a live image or enabled download',async()=>{
  const api=backend();await mountApp(`${base}/satellite`);expect(pageText()).toContain('Importación y descarga pendientes');
  await choose('Cuartel','P1 · Cuartel uno');await click('Aplicar filtros');expect(pageText()).toContain('origin-1');expect(api.called(`GET ${base}/satellite/observations`)[0]?.query.get('plotId')).toBe(p);
  await click('Ver detalle');expect(pageText()).toContain('test.licence.reference');expect(pageText()).toContain('test.source.coverage');expect(pageText()).toContain('Descarga no habilitada');expect(pageText()).toContain('no se calculan NDVI/NDWI');await click('Cerrar');
  expect(api.calls.some(call=>call.path.includes('/download'))).toBe(false);
 });
 it('pages and handles an empty catalogue',async()=>{
  const api=backend({[`GET ${base}/satellite/observations`]:({query})=>query.has('cursor')?page([{...observation,id:p,sourceObservationId:'origin-2'}]):page([observation],'next')});
  await mountApp(`${base}/satellite`);await choose('Cuartel','P1 · Cuartel uno');await click('Aplicar filtros');await click('Siguiente');expect(pageText()).toContain('origin-2');
  api.routes[`GET ${base}/satellite/observations`]=page([]);await click('Aplicar filtros');expect(pageText()).toContain('Sin observaciones');
 });
 it('validates plot and period before requesting data',async()=>{
  const api=backend();await mountApp(`${base}/satellite`);await click('Aplicar filtros');expect(pageText()).toContain('Selecciona cuartel');expect(api.called(`GET ${base}/satellite/observations`)).toHaveLength(0);
 });
 it('handles reloadable API errors without fabricating observations',async()=>{
  const api=backend({[`GET ${base}/satellite/observations`]:apiError(503,'INTERNAL_ERROR')});await mountApp(`${base}/satellite`);await choose('Cuartel','P1 · Cuartel uno');await click('Aplicar filtros');expect(pageText()).toContain('Recargar datos');
  api.routes[`GET ${base}/satellite/observations`]=page([]);await click('Recargar datos');expect(pageText()).toContain('Sin observaciones');
 });
 it('requires source plot read and does not load that directory without permission',async()=>{
  const api=backend({},['saphi.companies:view','saphi.satellite:view']);await mountApp(`${base}/satellite`);expect(pageText()).toContain('Se requiere acceso de lectura a cuarteles');expect(api.called(`GET ${base}/plots`)).toHaveLength(0);
 });
 it('recovers a failed plot directory before querying observations',async()=>{
  const api=backend({[`GET ${base}/plots`]:apiError(503,'INTERNAL_ERROR')});await mountApp(`${base}/satellite`);expect(pageText()).toContain('Recargar datos');
  api.routes[`GET ${base}/plots`]=page([{id:p,code:'P1',name:'Cuartel uno'}]);await click('Recargar datos');await choose('Cuartel','P1 · Cuartel uno');await click('Aplicar filtros');expect(pageText()).toContain('origin-1');
 });
});
