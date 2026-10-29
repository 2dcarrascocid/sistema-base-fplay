import { beforeAll,describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { computeRutCheckDigit } from '@base/shared';
import { saphiRoutes } from '../../src/saphi/routes.js';
import { apiDb,ownerDb,caller,createUser,createSession,makeDeps } from '../helpers.js';
const deps=makeDeps(apiDb);const call=caller(saphiRoutes(deps));const scope='/saphi/companies/{companyId}';const collection=`${scope}/satellite/observations`;
let token:string,readerToken:string,companyId:string,otherId:string,plotId:string,otherPlot:string,readerId:string;
let observationId:string,otherObservation:string,secondObservation:string,assetId:string,otherAsset:string,secondAsset:string;
const period={from:'2026-10-01T00:00:00Z',to:'2026-10-04T00:00:00Z'};
const opts=(id?:string)=>({token,pathParameters:{companyId,...(id?{id}:{})}});
beforeAll(async()=>{
 const creator=await createUser({role:'superuser',mfaEnabled:true});const manager=await createUser({role:'superuser',mfaEnabled:true});const reader=await createUser();readerId=reader.id;
 token=(await createSession(manager)).accessToken;readerToken=(await createSession(reader)).accessToken;const creatorToken=(await createSession(creator)).accessToken;
 for(let n=0;n<2;n++){
  const b=String(99000701+n);const c=await call('POST','/saphi/companies',{token:creatorToken,body:{rut:`${b}-${computeRutCheckDigit(b)}`,legalName:`Satellite tests ${n}`,initialUserId:manager.id,initialPermissions:[...SAPHI_PERMISSIONS],reason:'Tests'}});
  expect(c.status).toBe(201);const cid=c.body.data.id;
  const f=await call('POST',`${scope}/farms`,{token,pathParameters:{companyId:cid},body:{code:'F',name:'Farm'}});
  const p=await call('POST',`${scope}/plots`,{token,pathParameters:{companyId:cid},body:{code:'P',name:'Plot',farmId:f.body.data.id}});
  if(n===0){companyId=cid;plotId=p.body.data.id;}else{otherId=cid;otherPlot=p.body.data.id;}
 }
 const profile=await ownerDb.insertInto('app.profiles').values({name:`satellite-read-${randomUUID()}`}).returning('id').executeTakeFirstOrThrow();
 await sql`insert into app.profile_permissions(profile_id,menu_action_id) select ${profile.id}::uuid,ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id where m.code='saphi.satellite' and a.code='view'`.execute(ownerDb);
 await ownerDb.insertInto('app.user_profiles').values({user_id:readerId,profile_id:profile.id}).execute();
 await call('PUT',`${scope}/memberships/{userId}`,{...opts(),pathParameters:{companyId,userId:readerId},body:{expectedVersion:0,status:'active',reason:'Tests'}});
 await call('PUT',`${scope}/memberships/{userId}/permissions`,{...opts(),pathParameters:{companyId,userId:readerId},body:{expectedVersion:1,permissions:['saphi.satellite:view'],reason:'Tests'}});
 for(let n=0;n<4;n++){
  const observation=await ownerDb.insertInto('saphi.satellite_observations').values({company_id:n===3?otherId:companyId,plot_id:n===3?otherPlot:plotId,
    provider_code:'test.provider',source_observation_id:`origin-${n}`,product_reference:'test.product.v1',licence_reference:'test.licence.reference',
    acquired_at:`2026-10-0${n===3?1:n+1}T12:00:00Z`,received_at:n===0?'2026-10-04T12:00:00Z':'2026-10-03T12:00:00Z',quality_code:'test.quality',coverage_text:'test.source.coverage (no normalized unit)'}).returning('id').executeTakeFirstOrThrow();
  const asset=await ownerDb.insertInto('saphi.satellite_assets').values({company_id:n===3?otherId:companyId,observation_id:observation.id,source_asset_reference:`https://untrusted.invalid/private-origin-${n}`}).returning('id').executeTakeFirstOrThrow();
  if(n===0){observationId=observation.id;assetId=asset.id;}if(n===1){secondObservation=observation.id;secondAsset=asset.id;}if(n===3){otherObservation=observation.id;otherAsset=asset.id;}
 }
});
describe('satellite catalogue without provider or storage activation',()=>{
 it('queries a half-open acquisition period, pages by acquisition rather than reception and exposes provenance',async()=>{
  const query={plotId,...period,limit:'1'};const first=await call('GET',collection,{...opts(),query});expect(first.status,JSON.stringify(first.body)).toBe(200);
  expect(first.body.data[0].sourceObservationId).toBe('origin-2');expect(first.body.data[0].licenceReference).toBe('test.licence.reference');expect(first.body.data[0].indicesStatus).toBe('pending_definition');
  const second=await call('GET',collection,{...opts(),query:{...query,cursor:first.body.page.nextCursor}});expect(second.body.data[0].id).toBe(secondObservation);
  const third=await call('GET',collection,{...opts(),query:{...query,cursor:second.body.page.nextCursor}});expect(third.body.data[0].id).toBe(observationId);expect(third.body.page.hasMore).toBe(false);
  expect((await call('GET',collection,{...opts(),query:{...query,cursor:first.body.page.nextCursor,to:'2026-10-03T12:00:00Z'}})).status).toBe(400);
  const range=await call('GET',collection,{...opts(),query:{plotId,from:'2026-10-02T12:00:00Z',to:'2026-10-03T12:00:00Z'}});expect(range.body.data.map((r:{id:string})=>r.id)).toEqual([secondObservation]);
 });
 it('returns opaque asset IDs without private references, URLs, keys or fictional values',async()=>{
  const result=await call('GET',`${collection}/{id}`,opts(observationId));expect(result.status).toBe(200);expect(result.body.data.assetIds).toEqual([assetId]);expect(result.body.data.downloadStatus).toBe('pending_definition');
  expect(JSON.stringify(result.body)).not.toContain('untrusted.invalid');expect(result.body.data).not.toHaveProperty('indices');expect(result.body.data).not.toHaveProperty('source_asset_reference');
 });
 it('keeps own asset downloads closed and never calls external HTTP or photo storage',async()=>{
  const photos=vi.spyOn(deps.storage,'downloadUrl');const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('External calls forbidden'));
  try{
   const result=await call('GET',`${collection}/{id}/assets/{assetId}/download`,{...opts(observationId),pathParameters:{companyId,id:observationId,assetId}});
   expect(result.status).toBe(503);expect(result.body.error.code).toBe('SATELLITE_STORAGE_UNAVAILABLE');expect(photos).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
  }finally{photos.mockRestore();network.mockRestore();}
 });
 it('rejects foreign or mismatched observation assets and unknown destination parameters',async()=>{
  const download=`${collection}/{id}/assets/{assetId}/download`;
  for(const foreignAsset of [otherAsset,secondAsset,randomUUID()])expect((await call('GET',download,{token,pathParameters:{companyId,id:observationId,assetId:foreignAsset}})).status).toBe(404);
  expect((await call('GET',`${collection}/{id}`,opts(otherObservation))).status).toBe(404);
  expect((await call('GET',collection,{...opts(),query:{...period,plotId:otherPlot}})).status).toBe(404);
  expect((await call('GET',download,{token,pathParameters:{companyId,id:observationId,assetId},query:{url:'https://untrusted.invalid'}})).status).toBe(400);
  expect((await call('GET',collection,{...opts(),query:{plotId}})).status).toBe(400);
 });
 it('requires source permission and protects raw references even within a permitted company',async()=>{
  expect((await call('GET',`${collection}/{id}`,{token:readerToken,pathParameters:{companyId,id:observationId}})).status).toBe(403);
  await apiDb.transaction().execute(async tx=>{
   await sql`select set_config('app.user_id',${readerId},true),set_config('saphi.company_id',${companyId},true)`.execute(tx);
   expect(await tx.selectFrom('saphi.satellite_observations').select('id').execute()).toEqual([]);
  });
  const privateColumn=await sql<{allowed:boolean}>`select has_column_privilege('app_api','saphi.satellite_assets','source_asset_reference','SELECT') as allowed`.execute(ownerDb);expect(privateColumn.rows[0]?.allowed).toBe(false);
 });
 it('has no observation/asset ingestion, modification, image proxy or NDVI endpoint',()=>{
  const routes=saphiRoutes(deps);for(const method of ['POST','PATCH','DELETE'])expect(routes[`${method} ${collection}`]).toBeUndefined();expect(routes[`GET ${scope}/satellite/ndvi`]).toBeUndefined();
 });
});
