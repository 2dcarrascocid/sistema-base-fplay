import { beforeAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { computeRutCheckDigit } from '@base/shared';
import { saphiRoutes } from '../../src/saphi/routes.js';
import { apiDb,ownerDb,caller,createUser,createSession,makeDeps } from '../helpers.js';
const call=caller(saphiRoutes(makeDeps(apiDb)));const scope='/saphi/companies/{companyId}';
let token:string,readerToken:string,noDeviceToken:string,companyId:string,otherId:string,plotId:string,otherPlot:string,deviceId:string,secondDevice:string;
let readerId:string,noDeviceId:string;
const opts=(body?:unknown,id?:string)=>({token,pathParameters:{companyId,...(id?{id}:{})},...(body?{body}:{})});
const period={from:'2026-10-01T00:00:00Z',to:'2026-10-04T00:00:00Z'};
const fixture=(n:number,metric='test.metric')=>({id:`a6000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,company_id:companyId,device_id:deviceId,
 source_message_id:`test-message-${n}`,sample_index:0,metric_code:metric,value:String(n),unit_code:'test.unit',observed_at:`2026-10-01T0${Math.min(n,2)}:00:00Z`,received_at:'2026-10-02T00:00:00Z',quality_code:null,payload_hash:'a'.repeat(64),binding_version:'1'});
beforeAll(async()=>{
 const creator=await createUser({role:'superuser',mfaEnabled:true});const manager=await createUser({role:'superuser',mfaEnabled:true});
 const reader=await createUser();const noDevice=await createUser();readerId=reader.id;noDeviceId=noDevice.id;
 token=(await createSession(manager)).accessToken;readerToken=(await createSession(reader)).accessToken;noDeviceToken=(await createSession(noDevice)).accessToken;
 const creatorToken=(await createSession(creator)).accessToken;
 for(let i=0;i<2;i++){
  const body=String(99000601+i);const c=await call('POST','/saphi/companies',{token:creatorToken,body:{rut:`${body}-${computeRutCheckDigit(body)}`,legalName:`IoT tests ${i}`,initialUserId:manager.id,initialPermissions:[...SAPHI_PERMISSIONS],reason:'Tests'}});
  expect(c.status).toBe(201);const cid=c.body.data.id;
  const farm=await call('POST',`${scope}/farms`,{token,pathParameters:{companyId:cid},body:{code:'F',name:'Farm'}});
  const plot=await call('POST',`${scope}/plots`,{token,pathParameters:{companyId:cid},body:{code:'P',name:'Plot',farmId:farm.body.data.id}});
  if(i===0){companyId=cid;plotId=plot.body.data.id;}else{otherId=cid;otherPlot=plot.body.data.id;}
 }
 for(const [user,keys] of [[reader,['saphi.companies:view','saphi.devices:view','saphi.telemetry:view']],[noDevice,['saphi.companies:view','saphi.telemetry:view']]] as const){
  const profile=await ownerDb.insertInto('app.profiles').values({name:`iot-read-${randomUUID()}`}).returning('id').executeTakeFirstOrThrow();
  await sql`insert into app.profile_permissions(profile_id,menu_action_id) select ${profile.id}::uuid,ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id where m.code||':'||a.code=any(${[...keys]}::text[])`.execute(ownerDb);
  await ownerDb.insertInto('app.user_profiles').values({user_id:user.id,profile_id:profile.id}).execute();
  expect((await call('PUT',`${scope}/memberships/{userId}`,{...opts({expectedVersion:0,status:'active',reason:'Tests'}),pathParameters:{companyId,userId:user.id}})).status).toBe(200);
  expect((await call('PUT',`${scope}/memberships/{userId}/permissions`,{...opts({expectedVersion:1,permissions:[...keys],reason:'Tests'}),pathParameters:{companyId,userId:user.id}})).status).toBe(200);
 }
});
describe('device registry',()=>{
 it('creates devices, lists by scope and protects identity and metadata',async()=>{
  for(const code of ['D1','D2']){
   const result=await call('POST',`${scope}/devices`,opts({plotId,code,providerCode:'test.provider',externalDeviceId:'Same informational ID',metadata:{model:'Test model'}}));
   expect(result.status,JSON.stringify(result.body)).toBe(201);if(code==='D1')deviceId=result.body.data.id;else secondDevice=result.body.data.id;
  }
  const page=await call('GET',`${scope}/devices`,{...opts(),query:{plotId,limit:'1'}});expect(page.body.data).toHaveLength(1);expect(page.body.page.nextCursor).toBeTruthy();
  const next=await call('GET',`${scope}/devices`,{...opts(),query:{plotId,limit:'1',cursor:page.body.page.nextCursor}});expect(next.body.data[0].id).not.toBe(page.body.data[0].id);
  const body={plotId,code:'X',providerCode:'test.provider',externalDeviceId:'x'};
  expect((await call('POST',`${scope}/devices`,opts({...body,metadata:{token:'secret'}}))).status).toBe(400);
  expect((await call('POST',`${scope}/devices`,opts({...body,plotId:otherPlot}))).status).toBe(404);
  expect((await call('POST',`${scope}/devices`,opts({...body,code:'D1'}))).status).toBe(409);
  expect((await call('PATCH',`${scope}/devices/{id}`,opts({expectedVersion:1,externalDeviceId:'new'},deviceId))).status).toBe(400);
  const updated=await call('PATCH',`${scope}/devices/{id}`,opts({expectedVersion:1,status:'inactive',metadata:{model:'Updated'}},deviceId));expect(updated.status).toBe(200);expect(updated.body.data.version).toBe(2);
  expect((await call('GET',`${scope}/devices`,{...opts(),query:{status:'inactive'}})).body.data).toHaveLength(1);
  expect((await call('PATCH',`${scope}/devices/{id}`,opts({expectedVersion:1,status:'active'},deviceId))).status).toBe(409);
  expect((await call('GET',`${scope}/devices/{id}`,{token,pathParameters:{companyId:otherId,id:deviceId}})).status).toBe(404);
 });
 it('authorizes read-only members without granting device writes or bypassing RLS',async()=>{
  expect((await call('GET',`${scope}/devices/{id}`,{token:readerToken,pathParameters:{companyId,id:deviceId}})).status).toBe(200);
  expect((await call('POST',`${scope}/devices`,{...opts({plotId,code:'NO',providerCode:'test',externalDeviceId:'no'}),token:readerToken})).status).toBe(403);
  const events=await ownerDb.selectFrom('app.audit_log').select('id').where('entity_id','=',deviceId).execute();expect(events.length).toBeGreaterThanOrEqual(2);
 });
});
describe('telemetry read storage; no operational ingestion',()=>{
 it('preserves decimal precision, half-open time and observed-time ordering',async()=>{
  await ownerDb.insertInto('saphi.sensor_readings').values([
   {...fixture(0),received_at:'2026-10-03T00:00:00Z',value:'5'},fixture(1),{...fixture(2),value:'20'},{...fixture(3),value:'21'},
   {...fixture(4,'test.other'),value:'0.123456789012345678901234567890',observed_at:'2026-10-01T03:00:00Z'},
  ]).execute();
  const query={...period,deviceId,limit:'2'};const first=await call('GET',`${scope}/telemetry/readings`,{...opts(),query});expect(first.status).toBe(200);expect(first.body.data[0].value).toBe('0.123456789012345678901234567890');
  const second=await call('GET',`${scope}/telemetry/readings`,{...opts(),query:{...query,cursor:first.body.page.nextCursor}});
  const third=await call('GET',`${scope}/telemetry/readings`,{...opts(),query:{...query,cursor:second.body.page.nextCursor}});
  expect(new Set([...first.body.data,...second.body.data,...third.body.data].map((r:{id:string})=>r.id)).size).toBe(5);
  const range=await call('GET',`${scope}/telemetry/readings`,{...opts(),query:{deviceId,from:period.from,to:'2026-10-01T02:00:00Z'}});expect(range.body.data).toHaveLength(2);
  expect(first.body.data[0]).not.toHaveProperty('payload_hash');expect(first.body.data[0]).not.toHaveProperty('sourceMessageId');
  expect((await call('GET',`${scope}/telemetry/readings`,{...opts(),query:{...query,cursor:first.body.page.nextCursor,metricCode:'test.metric'}})).status).toBe(400);
 });
 it('returns latest per metric by observation with stable ties, not reception time',async()=>{
  const latest=await call('GET',`${scope}/telemetry/latest`,{...opts(),query:{deviceId}});expect(latest.status).toBe(200);expect(latest.body.data).toHaveLength(2);
  expect(latest.body.data.find((r:{metricCode:string})=>r.metricCode==='test.metric').value).toBe('21');
  expect((await call('GET',`${scope}/telemetry/latest`,{...opts(),query:{deviceId:secondDevice}})).body.data).toEqual([]);
 });
 it('rejects missing/large periods and cross-tenant or insufficient-source access',async()=>{
  for(const query of [{deviceId},{deviceId,from:period.from,to:'2026-12-01T00:00:00Z'}])expect((await call('GET',`${scope}/telemetry/readings`,{...opts(),query})).status).toBe(400);
  expect((await call('GET',`${scope}/telemetry/latest`,{token,pathParameters:{companyId:otherId},query:{deviceId}})).status).toBe(404);
  expect((await call('GET',`${scope}/telemetry/latest`,{token:readerToken,pathParameters:{companyId},query:{deviceId}})).status).toBe(200);
  expect((await call('GET',`${scope}/telemetry/latest`,{token:noDeviceToken,pathParameters:{companyId},query:{deviceId}})).status).toBe(403);
  await apiDb.transaction().execute(async tx=>{
   await sql`select set_config('app.user_id',${noDeviceId},true),set_config('saphi.company_id',${companyId},true)`.execute(tx);
   expect((await tx.selectFrom('saphi.sensor_readings').select('id').execute())).toEqual([]);
  });
  expect(readerId).not.toBe(noDeviceId);
 });
 it('rejects duplicate identities and exposes neither ingestion nor destructive routes',async()=>{
  await expect(ownerDb.insertInto('saphi.sensor_readings').values({...fixture(0),id:randomUUID()}).execute()).rejects.toMatchObject({code:'23505'});
  const routes=saphiRoutes(makeDeps(apiDb));expect(routes['POST /ingestion/telemetry']).toBeUndefined();expect(routes[`POST ${scope}/telemetry/readings`]).toBeUndefined();expect(routes[`DELETE ${scope}/devices/{id}`]).toBeUndefined();
 });
 it('requires a metric filter rather than silently truncating excessive latest magnitudes',async()=>{
  await ownerDb.insertInto('saphi.sensor_readings').values(Array.from({length:101},(_,i)=>({...fixture(100+i,`test.metric${i}`),device_id:secondDevice}))).execute();
  expect((await call('GET',`${scope}/telemetry/latest`,{...opts(),query:{deviceId:secondDevice}})).status).toBe(400);
  const filtered=await call('GET',`${scope}/telemetry/latest`,{...opts(),query:{deviceId:secondDevice,metricCode:'test.metric0'}});expect(filtered.status).toBe(200);expect(filtered.body.data).toHaveLength(1);
 });
});
