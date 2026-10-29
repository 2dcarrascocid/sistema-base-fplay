import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {sql} from 'kysely';
import {SAPHI_PERMISSIONS,type SatelliteMapData} from '@base/saphi';
import {computeRutCheckDigit} from '@base/shared';
import {saphiRoutes} from '../../src/saphi/routes.js';
import {apiDb,ownerDb,caller,createUser,createSession,makeDeps} from '../helpers.js';
const deps=makeDeps(apiDb);const call=caller(saphiRoutes(deps));const scope='/saphi/companies/{companyId}';const endpoint=`${scope}/satellite/map`;
let token:string,readerToken:string,outsiderToken:string,companyId:string,otherId:string,plotId:string,otherPlot:string;
const query=()=>({plotId,index:'NDVI',start:'2026-09-01',end:'2026-10-01',cloud:'30'});
const get=(changes:Record<string,string>={},access=token)=>call('GET',endpoint,{token:access,pathParameters:{companyId},query:{...query(),...changes}});
beforeAll(async()=>{
  const creator=await createUser({role:'superuser',mfaEnabled:true}),manager=await createUser({role:'superuser',mfaEnabled:true});
  const reader=await createUser();token=(await createSession(manager)).accessToken;readerToken=(await createSession(reader)).accessToken;outsiderToken=(await createSession(creator)).accessToken;
  for(let i=0;i<2;i++){
    const rut=String(99000721+i);const c=await call('POST','/saphi/companies',{token:outsiderToken,body:{rut:`${rut}-${computeRutCheckDigit(rut)}`,legalName:`GEE test ${i}`,initialUserId:manager.id,initialPermissions:[...SAPHI_PERMISSIONS],reason:'Tests'}});
    expect(c.status).toBe(201);const cid=c.body.data.id;
    const farm=await call('POST',`${scope}/farms`,{token,pathParameters:{companyId:cid},body:{code:'F',name:'Test'}});
    const plot=await call('POST',`${scope}/plots`,{token,pathParameters:{companyId:cid},body:{code:'P',name:'Test',farmId:farm.body.data.id}});
    if(!i){companyId=cid;plotId=plot.body.data.id;}else{otherId=cid;otherPlot=plot.body.data.id;}
  }
  const profile=await ownerDb.insertInto('app.profiles').values({name:`map-read-${randomUUID()}`}).returning('id').executeTakeFirstOrThrow();
  const keys=['saphi.satellite:view','saphi.plots:view'];
  await sql`insert into app.profile_permissions(profile_id,menu_action_id) select ${profile.id}::uuid,ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id where m.code||':'||a.code=any(${keys}::text[])`.execute(ownerDb);
  await ownerDb.insertInto('app.user_profiles').values({user_id:reader.id,profile_id:profile.id}).execute();
  const pathParameters={companyId,userId:reader.id};
  expect((await call('PUT',`${scope}/memberships/{userId}`,{token,pathParameters,body:{expectedVersion:0,status:'active',reason:'Tests'}})).status).toBe(200);
  expect((await call('PUT',`${scope}/memberships/{userId}/permissions`,{token,pathParameters,body:{expectedVersion:1,permissions:keys,reason:'Tests'}})).status).toBe(200);
});
describe('company-scoped Earth Engine maps',()=>{
  it('requires known coordinates and all source permissions without contacting a provider',async()=>{
    expect((await get()).body.error.code).toBe('SATELLITE_LOCATION_REQUIRED');
    expect((await get({},readerToken)).status).toBe(403);
    expect((await get({},outsiderToken)).status).toBe(404);
    expect((await get({plotId:otherPlot})).status).toBe(404);
    for(const change of [{bbox:'-72,-36,-71,-35'},{companyId:otherId},{cloud:'101'},{url:'https://example.test'}])expect((await get(change)).status).toBe(400);
  });
  it('derives a reference envelope server-side and keeps a missing provider unavailable',async()=>{
    for(const [code,coordinates] of [['P1',[-71.66,-35.43]],['P2',[-71.65,-35.42]]] as const){
      expect((await call('POST',`${scope}/sampling-points`,{token,pathParameters:{companyId},body:{plotId,code,location:{type:'Point',coordinates}}})).status).toBe(201);
    }
    expect((await get()).body.error.code).toBe('SATELLITE_PROVIDER_UNAVAILABLE');
  });
  it('returns genuine provider metadata only inside the authorized plot and period',async()=>{
    const render=vi.fn(async(input)=>({tileUrl:'https://earthengine.googleapis.com/v1/projects/test/maps/test/tiles/{z}/{x}/{y}',index:input.index,
      formula:'(B8-B4)/(B8+B4)',collection:'COPERNICUS/S2_SR_HARMONIZED',start:input.start,endExclusive:input.end,bbox:input.bbox,
      maxCloudPercentage:input.cloud,sceneCount:2,composite:'median_of_per_scene_indices',visualization:{min:-1,max:1,palette:['000000','ffffff']},attribution:'test',note:'test'} as SatelliteMapData));
    deps.satelliteMaps={render};const response=await get();expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({companyId,plotId,areaSource:'sampling_points_envelope',sceneCount:2});
    expect(render).toHaveBeenCalledOnce();expect(render.mock.calls[0]?.[0]).not.toHaveProperty('companyId');
    const bbox=render.mock.calls[0]?.[0].bbox;expect(bbox[0]).toBeCloseTo(-71.661);expect(bbox[3]).toBeCloseTo(-35.419);
    expect((await get({plotId:otherPlot})).status).toBe(404);expect(render).toHaveBeenCalledOnce();
  });
  it('rejects tampered provider URLs and mismatched scope metadata',async()=>{
    const original=await deps.satelliteMaps!.render({index:'NDVI',start:'2026-09-01',end:'2026-10-01',cloud:30,bbox:[-71.661,-35.431,-71.649,-35.419]});
    for(const changes of [{tileUrl:'https://example.test/{z}/{x}/{y}'},{index:'NDWI'},{start:'2026-01-01'},{bbox:[0,0,1,1]}]){
      deps.satelliteMaps={render:async()=>({...original,...changes} as SatelliteMapData)};
      expect((await get()).body.error.code).toBe('SATELLITE_PROVIDER_ERROR');
    }
  });
});
