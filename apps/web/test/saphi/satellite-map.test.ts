import {afterEach,describe,it,expect,vi} from 'vitest';
import {SAPHI_PERMISSIONS} from '@base/saphi';
import {installBackend,mountApp,unmountApp,pageText,choose,click,fill,wait,settle,apiError,type Routes} from '../harness';
const leaflet=vi.hoisted(()=>{
  const map={setView:vi.fn(),invalidateSize:vi.fn(),fitBounds:vi.fn(),remove:vi.fn()};map.setView.mockReturnValue(map);
  const layer={on:vi.fn(),off:vi.fn(),addTo:vi.fn(),remove:vi.fn()};
  return {map,layer,tileLayer:vi.fn(()=>layer)};
});
vi.mock('leaflet',()=>({default:{map:()=>leaflet.map,tileLayer:leaflet.tileLayer}}));
const c='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',p2='33333333-3333-4333-8333-333333333333';
const base=`/saphi/companies/${c}`;
const data={companyId:c,plotId:p,areaSource:'sampling_points_envelope',tileUrl:'https://earthengine.googleapis.com/v1/projects/test/maps/test/tiles/{z}/{x}/{y}',
  index:'NDVI',formula:'(B8-B4)/(B8+B4)',collection:'COPERNICUS/S2_SR_HARMONIZED',start:'2026-09-01',endExclusive:'2026-10-01',bbox:[-71.66,-35.43,-71.65,-35.42],maxCloudPercentage:30,sceneCount:3,
  composite:'median_of_per_scene_indices',visualization:{min:-1,max:1,palette:['000000','ffffff']},attribution:'test',note:'test'};
const page=(rows:unknown[])=>({data:rows,page:{hasMore:false,nextCursor:null}});
function backend(extra:Routes={},permissions:readonly string[]=SAPHI_PERMISSIONS){return installBackend({
  [`GET ${base}`]:{data:{id:c,rut:'12345678-5',legalName:'Empresa GEE',status:'active',version:1}},
  [`GET ${base}/capabilities`]:{data:{companyId:c,membershipVersion:1,effectivePermissions:permissions,menu:[]}},
  [`GET ${base}/plots`]:page([{id:p,code:'P1',name:'Uno'},{id:p2,code:'P2',name:'Dos'}]),
  [`GET ${base}/satellite/observations`]:page([]),
  [`GET ${base}/satellite/map`]:({query})=>({data:{...data,index:query.get('index'),start:query.get('start'),endExclusive:query.get('end')}}),...extra,
});}
afterEach(()=>{unmountApp();vi.clearAllMocks();});
describe('integrated Sentinel-2 map',()=>{
  it('requests the authenticated company endpoint only after selecting a plot and explicitly viewing',async()=>{
    const api=backend();await mountApp(`${base}/satellite`);expect(api.called(`GET ${base}/satellite/map`)).toHaveLength(0);
    await choose('Cuartel','P1 · Uno');await click('Visualizar Sentinel-2');expect(pageText()).toContain('3 escenas');
    expect(leaflet.tileLayer).toHaveBeenCalledWith(data.tileUrl,expect.objectContaining({noWrap:true}));
    const request=api.called(`GET ${base}/satellite/map`)[0]!;expect(request.query.get('plotId')).toBe(p);expect(request.query.has('bbox')).toBe(false);
    expect(api.calls.some(call=>call.path.includes('procesar-sentinel'))).toBe(false);
  });
  it('replaces layers when the index changes without presenting old results',async()=>{
    const api=backend();await mountApp(`${base}/satellite`);await choose('Cuartel','P1 · Uno');await click('Visualizar Sentinel-2');
    await choose('Índice espectral','NDWI');expect(leaflet.layer.remove).toHaveBeenCalled();expect(pageText()).not.toContain('3 escenas');
    // Leaflet's remove event unregisters map zoom handlers; clearing listeners first leaks them.
    expect(leaflet.layer.remove.mock.invocationCallOrder.at(-1)).toBeLessThan(leaflet.layer.off.mock.invocationCallOrder.at(-1)!);
    await wait(650);expect(api.called(`GET ${base}/satellite/map`).at(-1)?.query.get('index')).toBe('NDWI');expect(pageText()).toContain('3 escenas');
  });
  it('shows the actual provider configuration error without fabricating tiles',async()=>{
    backend({[`GET ${base}/satellite/map`]:apiError(503,'SATELLITE_PROVIDER_CONFIGURATION')});await mountApp(`${base}/satellite`);
    await choose('Cuartel','P1 · Uno');await click('Visualizar Sentinel-2');expect(pageText()).toContain('Earth Engine no pudo autenticarse');expect(leaflet.tileLayer).not.toHaveBeenCalled();
  });
  it('requires point read permissions and validates date input locally',async()=>{
    const api=backend({},['saphi.companies:view','saphi.satellite:view','saphi.plots:view']);await mountApp(`${base}/satellite`);
    expect(pageText()).toContain('permiso de lectura de puntos');expect(api.called(`GET ${base}/satellite/map`)).toHaveLength(0);
  });
  it('discards a late result after changing plots',async()=>{
    let resolve!:(value:unknown)=>void;const pending=new Promise(yes=>{resolve=yes;});
    backend({[`GET ${base}/satellite/map`]:async()=>pending});await mountApp(`${base}/satellite`);await choose('Cuartel','P1 · Uno');await click('Visualizar Sentinel-2');
    await choose('Cuartel','P2 · Dos');resolve({data});await settle();expect(pageText()).not.toContain('3 escenas');expect(leaflet.tileLayer).not.toHaveBeenCalled();
  });
  it('rejects an invalid period without sending a map request',async()=>{
    const api=backend();await mountApp(`${base}/satellite`);await choose('Cuartel','P1 · Uno');
    await fill('Desde (fecha UTC)','2026-10-01');await fill('Hasta (fecha UTC, excluida)','2026-10-01');await click('Visualizar Sentinel-2');
    expect(pageText()).toContain('período de 1–366 días');expect(api.called(`GET ${base}/satellite/map`)).toHaveLength(0);
  });
});
