import { afterEach, describe, expect, it } from 'vitest';
import { SAPHI_PERMISSIONS, type CompanyCapabilitiesDto, type CompanyDto } from '@base/saphi';
import { router } from '../../src/router';
import { useSaphiCompanyStore } from '../../src/modules/saphi/stores/company';
import { installBackend,mountApp,unmountApp,pageText,click,clickLabel,fill,choose as select,submit,confirmDialog,apiError,settle,ME,type Routes } from '../harness';

const c='11111111-1111-4111-8111-111111111111';const u='22222222-2222-4222-8222-222222222222';
const f='33333333-3333-4333-8333-333333333333';const p='44444444-4444-4444-8444-444444444444';
const s='55555555-5555-4555-8555-555555555555';const base=`/saphi/companies/${c}`;
const dates={createdAt:'2026-10-27T12:00:00.000Z',updatedAt:'2026-10-27T12:00:00.000Z',version:1,status:'active' as const};
const company:CompanyDto={id:c,rut:'12345678-5',legalName:'Agrícola del Valle',tradeName:null,contactEmail:null,contactPhone:null,...dates};
const farm={id:f,companyId:c,code:'F1',name:'Predio Norte',areaHa:'5.0000',...dates};
const plot={...farm,id:p,code:'C1',name:'Cuartel Uno',farmId:f,grapeVariety:'Registrada',plantingYear:2020,soilType:null};
const point={id:s,companyId:c,plotId:p,code:'S1',location:{type:'Point',coordinates:[-70,-33]},...dates};
const device={id:'66666666-6666-4666-8666-666666666666',companyId:c,plotId:p,code:'D1',providerCode:'manual',externalDeviceId:'probe-1',metadata:{},...dates};
const sample={id:'77777777-7777-4777-8777-777777777777',companyId:c,plotId:p,samplingPointId:s,code:'M1',sampledAt:'2026-10-27T12:00:00.000Z',notes:null,...dates};
const reading={id:'88888888-8888-4888-8888-888888888888',companyId:c,deviceId:device.id,metricCode:'soil_moisture',value:'21.5',unitCode:'percent',observedAt:'2026-10-27T12:00:00.000Z',receivedAt:'2026-10-27T12:01:00.000Z',qualityCode:null};
const page=(data:unknown[],nextCursor:string|null=null)=>({data,page:{nextCursor,hasMore:nextCursor!==null}});
const caps=(permissions=[...SAPHI_PERMISSIONS]):CompanyCapabilitiesDto=>({companyId:c,membershipVersion:1,effectivePermissions:permissions,
  menu:[{code:'saphi',kind:'module',name:{es:'Saphi Chile',en:'Saphi Chile'},route:null,icon:null,children:[
    {code:'saphi.farms',kind:'menu',name:{es:'Predios',en:'Farms'},route:'/saphi/farms',icon:null,children:[]},
  ]}]});
function backend(extra:Routes={},permissions=[...SAPHI_PERMISSIONS]){
  return installBackend({
    'GET /saphi/companies':page([company]),[`GET ${base}`]:{data:company},[`GET ${base}/capabilities`]:{data:caps(permissions)},
    [`GET ${base}/farms`]:page([farm]),[`GET ${base}/plots`]:page([plot]),[`GET ${base}/sampling-points`]:page([point]),
    [`GET ${base}/devices`]:page([device]),[`GET ${base}/samples`]:page([sample]),[`GET ${base}/telemetry/latest`]:{data:[reading]},
    [`GET ${base}/memberships`]:page([{userId:ME.user.id,firstName:'Ana',lastName:'Pérez',status:'active',version:1,permissions:[]},
      {userId:u,firstName:'Gestora',lastName:'Demo',status:'active',version:1,permissions:['saphi.companies:view']}]),
    ...extra,
  });
}
afterEach(()=>unmountApp());

describe('Saphi company views',()=>{
  it('resolves static catalogue bridges through the selected company and falls back without one',async()=>{
    backend();await mountApp(base);
    for(const kind of ['plots','sampling-points','memberships']){await router.push(`/saphi/${kind}`);await settle();expect(router.currentRoute.value.path).toBe(`${base}/${kind}`);}
    useSaphiCompanyStore().clear();await router.push('/saphi/farms');await settle();expect(router.currentRoute.value.name).toBe('saphi-companies');
  });
  it('returns to the last company section after visiting the company selector',async()=>{
    backend();await mountApp(base);await router.push(`${base}/plots`);await settle();
    expect(useSaphiCompanyStore().companyDestination(c)).toBe(`${base}/plots`);
    await router.push('/saphi/companies');await settle();
    expect(useSaphiCompanyStore().companyDestination(c)).toBe(`${base}/plots`);
    await click('Seleccionar empresa');expect(router.currentRoute.value.path).toBe(`${base}/plots`);
  });
  it('lists accessible companies and enters a guarded company workspace',async()=>{
    const api=backend();await mountApp('/saphi/companies');expect(pageText()).toContain('Agrícola del Valle');
    await click('Seleccionar empresa');expect(router.currentRoute.value.name).toBe('saphi-company');
    await settle();expect(pageText()).toContain('Predios');expect(useSaphiCompanyStore().companyId).toBe(c);
    expect(pageText()).toContain('Resumen de Agrícola del Valle');expect(pageText()).toContain('Cuartel Uno');
    expect(pageText()).toContain('M1');expect(pageText()).toContain('Puntos de muestreo');
    expect(pageText()).toContain('12345678-5');expect(pageText()).not.toContain('Últimas lecturas de telemetría');
    expect(pageText()).not.toContain('DEMO / DATOS SIMULADOS');
    expect(api.called(`GET ${base}/farms`)).toHaveLength(1);
    expect(api.called(`GET ${base}/plots`)).toHaveLength(1);
    expect(api.called(`GET ${base}/samples`)).toHaveLength(1);
    expect(api.called(`GET ${base}/sampling-points`)).toHaveLength(1);
    expect(api.called(`GET ${base}/telemetry/latest`)).toHaveLength(0);
    expect(document.querySelector('.saphi-dashboard .saphi-sidebar')).toBeNull();
    await click('Predios');expect(router.currentRoute.value.name).toBe('saphi-farms');
  });
  it('places members last in the company section menu',async()=>{
    backend();await mountApp(base);
    const links=[...document.querySelectorAll('nav[aria-label="Secciones de la empresa"] a')];
    expect(links.at(-1)?.textContent?.trim()).toBe('Miembros');
  });
  it('hides restricted company data without requesting its endpoints',async()=>{
    const api=backend({},['saphi.companies:view','saphi.plots:view']);await mountApp(base);await settle();
    expect(pageText()).toContain('Cuartel Uno');expect(pageText()).toContain('Sin acceso a estos datos');
    expect(pageText()).not.toContain('Últimas lecturas de telemetría');
    expect(api.called(`GET ${base}/plots`)).toHaveLength(1);
    for(const kind of ['farms','devices','samples','sampling-points','telemetry/latest']) expect(api.called(`GET ${base}/${kind}`)).toHaveLength(0);
  });
  it('shows an empty sampling-point state without requesting device data',async()=>{
    const api=backend({[`GET ${base}/sampling-points`]:page([])});await mountApp(base);await settle();
    expect(pageText()).toContain('Puntos de muestreo');
    expect(api.called(`GET ${base}/devices`)).toHaveLength(0);
  });
  it('handles empty companies and reloadable load errors',async()=>{
    const api=backend({'GET /saphi/companies':apiError(503,'INTERNAL_ERROR')});await mountApp('/saphi/companies');
    expect(pageText()).toContain('Recargar datos');api.routes['GET /saphi/companies']=page([]);await click('Recargar datos');
    expect(pageText()).toContain('No tienes empresas asignadas');
  });
  it('creates a company using an existing manager and explicit permitted keys',async()=>{
    const api=backend({
      'GET /admin/users':{items:[{id:u,first_name:'Gestora',last_name:'Demo',email:'gestora@test.cl',status:'active'}]},
      [`GET /admin/users/${u}/permissions`]:{permissions:[...SAPHI_PERMISSIONS]},'POST /saphi/companies':{data:company},
    });await mountApp('/saphi/companies');await click('Crear empresa');
    await submit();expect(pageText()).toContain('Revisa los campos');
    await fill('Razón social','Nueva empresa');await fill('RUT canónico','12.345.678-5');
    await select('Primera persona gestora','Gestora Demo · gestora@test.cl');await settle();
    await fill('Motivo del cambio','Piloto autorizado');await submit();
    expect(api.called('POST /saphi/companies')[0]?.body).toMatchObject({rut:'12345678-5',initialUserId:u,legalName:'Nueva empresa'});
  });
  it('edits contact data with expectedVersion and preserves conflicts',async()=>{
    const api=backend({[`PATCH ${base}`]:apiError(409,'VERSION_CONFLICT')});await mountApp(base);
    await fill('Razón social','Nuevo nombre');await submit();expect(pageText()).toContain('Revisa los campos');
    await fill('Motivo del cambio','Contacto actualizado');await submit();expect(pageText()).toContain('Recarga los datos');
    api.routes[`PATCH ${base}`]={data:{...company,legalName:'Nuevo nombre',version:2}};await submit();
    expect(api.called(`PATCH ${base}`)[0]?.body.expectedVersion).toBe(1);
    expect(pageText()).toContain('Versión 2');
  });
  it('deactivates only from the superuser control and returns to selection',async()=>{
    backend({[`PATCH ${base}`]:{data:{...company,status:'inactive',version:2}}});await mountApp(base);
    await select('Estado','Inactivo');await fill('Motivo del cambio','Cierre solicitado');await submit();
    await confirmDialog();
    expect(router.currentRoute.value.name).toBe('saphi-companies');expect(useSaphiCompanyStore().companyId).toBeNull();
  });
});

describe('Saphi master forms',()=>{
  it('creates a farm, checks decimal input and handles pagination/filters',async()=>{
    const api=backend({[`GET ${base}/farms`]:call=>page(call.query.get('cursor')?[]:[farm],call.query.get('cursor')?null:'next'),
      [`POST ${base}/farms`]:{data:farm}});await mountApp(`${base}/farms`);
    await click('Siguiente');expect(api.called(`GET ${base}/farms`).at(-1)?.query.get('cursor')).toBe('next');
    await select('Estado','Inactivo');expect(api.called(`GET ${base}/farms`).at(-1)?.query.get('status')).toBe('inactive');
    await click('Crear');await fill('Código','F2');await fill('Nombre','Predio Sur');await fill('Superficie (ha)','0');await submit();
    expect(pageText()).toContain('Revisa los campos');await fill('Superficie (ha)','1.2345');await submit();
    expect(api.called(`POST ${base}/farms`)[0]?.body.areaHa).toBe('1.2345');
  });
  it('edits a farm, keeps failed edits and supports explicit reload/cancel',async()=>{
    const api=backend({[`PATCH ${base}/farms/${f}`]:apiError(409,'VERSION_CONFLICT')});await mountApp(`${base}/farms`);
    await clickLabel('Editar F1');await fill('Nombre','Renombrado');await submit();expect(pageText()).toContain('Recarga los datos');
    api.routes[`PATCH ${base}/farms/${f}`]={data:{...farm,name:'Renombrado',version:2}};await submit();
    expect(api.called(`PATCH ${base}/farms/${f}`)[0]?.body).toMatchObject({name:'Renombrado',expectedVersion:1});
    await clickLabel('Editar F1');await click('Cancelar');
  });
  it('offers direct activation and deactivation on territorial maintainers',async()=>{
    const api=backend({[`PATCH ${base}/farms/${f}`]:{data:{...farm,status:'inactive',version:2}}});
    await mountApp(`${base}/farms`);await clickLabel('Desactivar F1');
    expect(api.called(`PATCH ${base}/farms/${f}`)[0]?.body).toMatchObject({expectedVersion:1,status:'inactive'});
  });
  it('creates and edits a plot through parent options and named fields',async()=>{
    const api=backend({[`POST ${base}/plots`]:{data:plot},[`PATCH ${base}/plots/${p}`]:{data:plot}});await mountApp(`${base}/plots`);
    expect(pageText()).toContain('F1 · Predio Norte');
    await select('Predio','F1 · Predio Norte');await click('Crear');await fill('Código','C2');await fill('Nombre','Cuartel Dos');
    await select('Predio','F1 · Predio Norte');await fill('Variedad de uva','Registrada');await fill('Año de plantación','2024');
    await fill('Tipo de suelo','Descripción');await submit();
    expect(api.called(`POST ${base}/plots`)[0]?.body).toMatchObject({farmId:f,plantingYear:2024,soilType:'Descripción'});
    await clickLabel('Editar C1');await fill('Tipo de suelo','Otro');await submit();
    expect(api.called(`PATCH ${base}/plots/${p}`)[0]?.body.soilType).toBe('Otro');
  });
  it('requires real coordinates for new points and edits locations',async()=>{
    const api=backend({[`POST ${base}/sampling-points`]:{data:point},[`PATCH ${base}/sampling-points/${s}`]:{data:point}});
    await mountApp(`${base}/sampling-points`);expect(pageText()).toContain('F1 · Predio Norte');expect(pageText()).toContain('C1 · Cuartel Uno');
    await click('Crear');await fill('Código','S2');await select('Cuartel','C1 · Cuartel Uno');
    await submit();expect(pageText()).toContain('Revisa los campos');await fill('Longitud','-71.5');await fill('Latitud','-34');await submit();
    expect(api.called(`POST ${base}/sampling-points`)[0]?.body.location.coordinates).toEqual([-71.5,-34]);
    await clickLabel('Editar S1');await fill('Latitud','-35');await submit();
    expect(api.called(`PATCH ${base}/sampling-points/${s}`)[0]?.body).toMatchObject({expectedVersion:1,location:{coordinates:[-70,-35]}});
  });
  it('does not show write actions for scoped readers, even when their global role is superuser',async()=>{
    backend({},['saphi.companies:view','saphi.plots:view']);await mountApp(`${base}/plots`);
    expect(pageText()).toContain('Necesitas acceso de lectura');expect(pageText()).not.toContain('Crear');
    expect(document.querySelector('[aria-label="Editar C1"]')).toBeNull();
  });
});

describe('Saphi membership forms',()=>{
  it('adds memberships without grants and validates the existing-user UUID',async()=>{
    const api=backend({[`PUT ${base}/memberships/${u}`]:{data:{userId:u,status:'active',version:1}}});
    await mountApp(`${base}/memberships`);await click('Añadir miembro');await fill('Identificador de usuario','bad');await submit();
    expect(pageText()).toContain('Revisa los campos');await fill('Identificador de usuario',u);await fill('Motivo del cambio','Alta autorizada');await submit();
    expect(api.called(`PUT ${base}/memberships/${u}`)[0]?.body).toMatchObject({expectedVersion:0,status:'active'});
  });
  it('changes another member permissions/status and hides self-edit controls',async()=>{
    const api=backend({[`PUT ${base}/memberships/${u}/permissions`]:{data:{version:2}},[`PUT ${base}/memberships/${u}`]:{data:{version:2}}});
    await mountApp(`${base}/memberships`);expect(pageText()).toContain('Tu membresía');
    await clickLabel('Editar permisos Gestora');await submit();expect(pageText()).toContain('Revisa los campos');
    await fill('Motivo del cambio','Acceso actualizado');await submit();expect(api.called(`PUT ${base}/memberships/${u}/permissions`)[0]?.body.expectedVersion).toBe(1);
    await clickLabel('Desactivar Gestora');await fill('Motivo del cambio','Retiro autorizado');await submit();
    expect(api.called(`PUT ${base}/memberships/${u}`)[0]?.body.status).toBe('inactive');
  });
  it('hides write operations for a scoped membership reader and handles empty/error pages',async()=>{
    const api=backend({[`GET ${base}/memberships`]:apiError(503,'INTERNAL_ERROR')},['saphi.companies:view','saphi.memberships:view']);
    await mountApp(`${base}/memberships`);expect(pageText()).not.toContain('Añadir miembro');
    api.routes[`GET ${base}/memberships`]=page([]);await click('Recargar datos');expect(pageText()).toContain('No hay registros');
  });
});
