import { beforeAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { computeRutCheckDigit } from '@base/shared';
import { saphiRoutes } from '../../src/saphi/routes.js';
import { apiDb,ownerDb,caller,createUser,createSession,makeDeps } from '../helpers.js';
const call=caller(saphiRoutes(makeDeps(apiDb)));const scope='/saphi/companies/{companyId}';
const query={from:'2026-10-01T00:00:00Z',to:'2026-10-03T00:00:00Z'};
let token:string,readerToken:string,noDashboardToken:string,companyId:string,otherId:string,plotId:string,otherPlot:string;
let readerProfileId:string,readerId:string,creatorToken:string;
beforeAll(async()=>{
 const creator=await createUser({role:'superuser',mfaEnabled:true});const manager=await createUser({role:'superuser',mfaEnabled:true});
 token=(await createSession(manager)).accessToken;creatorToken=(await createSession(creator)).accessToken;
 for(let i=0;i<2;i++){
  const rut=String(99000901+i);const result=await call('POST','/saphi/companies',{token:creatorToken,body:{rut:`${rut}-${computeRutCheckDigit(rut)}`,legalName:`Dashboard ${i}`,initialUserId:manager.id,initialPermissions:[...SAPHI_PERMISSIONS],reason:'Tests'}});
  expect(result.status).toBe(201);const cid=result.body.data.id;
  const farm=await call('POST',`${scope}/farms`,{token,pathParameters:{companyId:cid},body:{code:'F',name:`Farm ${i}`}});
  const plot=await call('POST',`${scope}/plots`,{token,pathParameters:{companyId:cid},body:{code:'P',name:`Plot ${i}`,farmId:farm.body.data.id}});
  if(i===0){companyId=cid;plotId=plot.body.data.id;}else{otherId=cid;otherPlot=plot.body.data.id;}
 }
 for(const keys of [['saphi.companies:view','saphi.dashboard:view','saphi.telemetry:view','saphi.satellite:view'],['saphi.companies:view','saphi.farms:view']]){
  const user=await createUser();const session=await createSession(user);
  if(keys.includes('saphi.dashboard:view'))readerToken=session.accessToken;else noDashboardToken=session.accessToken;
  const profile=await ownerDb.insertInto('app.profiles').values({name:`dashboard-${randomUUID()}`}).returning('id').executeTakeFirstOrThrow();
  if(keys.includes('saphi.dashboard:view')){readerProfileId=profile.id;readerId=user.id;}
  await sql`insert into app.profile_permissions(profile_id,menu_action_id) select ${profile.id}::uuid,ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id where m.code||':'||a.code=any(${keys}::text[])`.execute(ownerDb);
  await ownerDb.insertInto('app.user_profiles').values({user_id:user.id,profile_id:profile.id}).execute();
  const pathParameters={companyId,userId:user.id};
  expect((await call('PUT',`${scope}/memberships/{userId}`,{token,pathParameters,body:{expectedVersion:0,status:'active',reason:'Tests'}})).status).toBe(200);
  expect((await call('PUT',`${scope}/memberships/{userId}/permissions`,{token,pathParameters,body:{expectedVersion:1,permissions:keys,reason:'Tests'}})).status).toBe(200);
 }
});
const get=(accessToken=token,extra:Record<string,string>={},cid=companyId)=>call('GET',`${scope}/dashboard`,{token:accessToken,pathParameters:{companyId:cid},query:{...query,...extra}});
describe('consolidated dashboard',()=>{
 it('returns bounded source previews, empty data and pending definitions without invented results',async()=>{
  const result=await get();expect(result.status,JSON.stringify(result.body)).toBe(200);
  const data=result.body.data;expect(data.companyId).toBe(companyId);expect(data.sections.farms.data[0].label).toBe('F · Farm 0');
  expect(data.sections.telemetry).toEqual({status:'no_data'});expect(data.sections.satellite).toEqual({status:'no_data'});
  expect(data.sections.indicators).toEqual({status:'pending_definition'});expect(data.sections.laboratory).toEqual({status:'pending_definition'});
 });
 it('filters before limiting, applies half-open source dates and retains decimal strings and real zeros',async()=>{
  const device=await call('POST',`${scope}/devices`,{token,pathParameters:{companyId},body:{code:'D',plotId,providerCode:'test',externalDeviceId:'d'}});
  expect(device.status).toBe(201);
  await ownerDb.insertInto('saphi.soil_samples').values(Array.from({length:8},(_,i)=>({company_id:companyId,plot_id:plotId,code:`S${i}`,sampled_at:i===7?query.to:'2026-10-02T00:00:00Z'}))).execute();
  await ownerDb.insertInto('saphi.sensor_readings').values({company_id:companyId,device_id:device.body.data.id,source_message_id:'dashboard-zero',sample_index:0,metric_code:'test.metric',value:'0',unit_code:'test.unit',observed_at:query.from,received_at:query.to,quality_code:null,payload_hash:'a'.repeat(64),binding_version:'1'}).execute();
  await ownerDb.insertInto('saphi.satellite_observations').values({company_id:companyId,plot_id:plotId,provider_code:'test',source_observation_id:'dashboard-observation',product_reference:'test.v1',licence_reference:'test.licence',acquired_at:query.from}).execute();
  const data=(await get(token,{plotId})).body.data;
  expect(data.sections.samples.data).toHaveLength(6);expect(data.sections.samples.hasMore).toBe(true);expect(data.sections.samples.data.map((r:{label:string})=>r.label)).not.toContain('S7');
  expect(data.sections.devices.data[0].label).toBe('D');expect(data.sections.telemetry.data[0]).toMatchObject({value:'0',unit:'test.unit'});
  expect(data.sections.satellite.data[0].label).toBe('test · dashboard-observation');expect(data.sections.farms.data).toHaveLength(1);
  expect((await get(token,{from:'2026-10-03T00:00:00Z',to:'2026-10-04T00:00:00Z',plotId})).body.data.sections.telemetry.status).toBe('no_data');
 });
 it('requires dashboard and source permissions without leaking restricted data or counts',async()=>{
  expect((await get(noDashboardToken)).status).toBe(403);
  const result=await get(readerToken);expect(result.status).toBe(200);
  for(const section of Object.values(result.body.data.sections))expect(section).toEqual({status:'forbidden'});
  expect((await get(readerToken,{plotId})).status).toBe(403);
 });
 it('isolates company and plot scope and rejects unsupported or invalid query fields',async()=>{
  const other=await get(token,{},otherId);expect(other.body.data.sections.farms.data[0].label).toBe('F · Farm 1');expect(other.body.data.sections.samples.status).toBe('no_data');
  expect((await get(readerToken,{},otherId)).status).toBe(404);expect((await get(token,{plotId:otherPlot})).status).toBe(404);
  for(const extra of [{plotId:'bad'},{to:query.from},{farmId:plotId},{url:'https://example.test'}])expect((await get(token,extra)).status).toBe(400);
 });
 it('observes a revoked global ceiling on the next request while company grants remain',async()=>{
  const {rows}=await sql<{menu_action_id:string}>`delete from app.profile_permissions pp using app.menu_actions ma,app.menus m
    where pp.profile_id=${readerProfileId}::uuid and pp.menu_action_id=ma.id and ma.menu_id=m.id and m.code='saphi.dashboard'
    returning pp.menu_action_id`.execute(ownerDb);
  expect(rows).toHaveLength(1);
  try{expect((await get(readerToken)).status).toBe(403);}
  finally{await ownerDb.insertInto('app.profile_permissions').values(rows.map(row=>({profile_id:readerProfileId,menu_action_id:row.menu_action_id}))).execute();}
  expect((await get(readerToken)).status).toBe(200);
 });
 it('honors membership deactivation and denies a superuser without membership',async()=>{
  expect((await get(creatorToken)).status).toBe(404);
  const pathParameters={companyId,userId:readerId};
  const disabled=await call('PUT',`${scope}/memberships/{userId}`,{token,pathParameters,body:{expectedVersion:2,status:'inactive',reason:'Revocation test'}});
  expect(disabled.status).toBe(200);
  try{expect((await get(readerToken)).status).toBe(404);}
  finally{expect((await call('PUT',`${scope}/memberships/{userId}`,{token,pathParameters,body:{expectedVersion:disabled.body.data.version,status:'active',reason:'Restore test fixture'}})).status).toBe(200);}
 });
});
