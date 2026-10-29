import { afterEach,describe,it,expect } from 'vitest';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { installBackend,mountApp,unmountApp,pageText,click,fill,choose,submit,apiError,type Routes } from '../harness';
const c='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',d='33333333-3333-4333-8333-333333333333';
const base=`/saphi/companies/${c}`;const dates={version:1,createdAt:'2026-10-28T12:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z'};
const device={id:d,companyId:c,plotId:p,code:'D1',providerCode:'test.provider',externalDeviceId:'external-1',metadata:{model:'Test model'},status:'active',...dates};
const reading={id:p,companyId:c,deviceId:d,metricCode:'test.metric',value:'0.123456789012345678901234',unitCode:'test.unit',observedAt:'2026-10-01T12:00:00.000Z',receivedAt:'2026-10-02T12:00:00.000Z',qualityCode:'test.quality'};
const page=(data:unknown[],nextCursor:string|null=null)=>({data,page:{nextCursor,hasMore:!!nextCursor}});
function backend(extra:Routes={},permissions:readonly string[]=SAPHI_PERMISSIONS){return installBackend({
 [`GET ${base}`]:{data:{id:c,rut:'12345678-5',legalName:'Empresa IoT',status:'active',tradeName:null,contactEmail:null,contactPhone:null,...dates}},
 [`GET ${base}/capabilities`]:{data:{companyId:c,membershipVersion:1,effectivePermissions:permissions,menu:[]}},
 [`GET ${base}/plots`]:page([{id:p,code:'P1',name:'Cuartel uno'}]),[`GET ${base}/devices`]:page([device]),
 [`GET ${base}/telemetry/readings`]:page([reading]),[`GET ${base}/telemetry/latest`]:{data:[reading]},...extra,
});}
afterEach(()=>unmountApp());
describe('device and telemetry views',()=>{
 it('filters device options by plot and clears readings when changing scope',async()=>{
  const api=backend();await mountApp(`${base}/telemetry`);await choose('Dispositivo','D1');await click('Aplicar filtros');expect(pageText()).toContain(reading.value);
  await choose('Cuartel','P1 · Cuartel uno');expect(pageText()).not.toContain(reading.value);
  expect(api.called(`GET ${base}/devices`).at(-1)?.query.get('plotId')).toBe(p);
 });
 it('lists device identity and explains that registry is not connectivity',async()=>{
  backend();await mountApp(`${base}/devices`);expect(pageText()).toContain('external-1');expect(pageText()).toContain('no lo conecta');
 });
 it('registers a device using an existing plot and structured metadata',async()=>{
  const api=backend({[`POST ${base}/devices`]:{data:device}});await mountApp(`${base}/devices`);await click('Registrar dispositivo');
  await Promise.all([fill('Código','D2'),fill('Código de proveedor','test.provider'),fill('ID externo','external-2')]);await choose('Cuartel','P1 · Cuartel uno');await submit();
  expect(api.called(`POST ${base}/devices`)[0]?.body).toMatchObject({plotId:p,code:'D2',externalDeviceId:'external-2',metadata:{}});
 });
 it('edits only state/metadata with a version and retains failed edits',async()=>{
  const api=backend({[`PATCH ${base}/devices/${d}`]:apiError(409,'VERSION_CONFLICT')});await mountApp(`${base}/devices`);await click('Editar');await fill('Modelo','Updated');await submit();expect(pageText()).toContain('Recarga los datos');
  expect(api.called(`PATCH ${base}/devices/${d}`)[0]?.body).toMatchObject({expectedVersion:1,metadata:{model:'Updated'}});
  api.routes[`PATCH ${base}/devices/${d}`]={data:{...device,version:2}};await submit();expect(pageText()).toContain('D1');
 });
 it('hides device writes for readers and handles empty/error states',async()=>{
  const api=backend({[`GET ${base}/devices`]:apiError(503,'INTERNAL_ERROR')},['saphi.companies:view','saphi.devices:view']);await mountApp(`${base}/devices`);expect(pageText()).not.toContain('Registrar dispositivo');expect(pageText()).toContain('Recargar datos');
  api.routes[`GET ${base}/devices`]=page([]);await click('Recargar datos');expect(pageText()).toContain('No hay registros');
 });
 it('queries history and latest, displaying source values without conversions',async()=>{
  const api=backend();await mountApp(`${base}/telemetry`);expect(pageText()).toContain('Sin lecturas');await choose('Dispositivo','D1');await click('Aplicar filtros');
  expect(pageText()).toContain(reading.value);expect(pageText()).toContain('test.unit');expect(pageText()).toContain(reading.observedAt);expect(pageText()).toContain(reading.receivedAt);
  expect(api.called(`GET ${base}/telemetry/readings`)[0]?.query.get('deviceId')).toBe(d);
  await choose('Tipo de consulta','Últimos valores');await click('Aplicar filtros');expect(api.called(`GET ${base}/telemetry/latest`)).toHaveLength(1);
 });
 it('validates periods and requires source-device read access',async()=>{
  backend();await mountApp(`${base}/telemetry`);await click('Aplicar filtros');expect(pageText()).toContain('hasta 31 días');
 });
 it('does not request device data without effective device read permission',async()=>{
  const api=backend({},['saphi.companies:view','saphi.telemetry:view']);await mountApp(`${base}/telemetry`);expect(pageText()).toContain('Se requiere acceso de lectura a dispositivos');expect(api.called(`GET ${base}/devices`)).toHaveLength(0);
 });
});
