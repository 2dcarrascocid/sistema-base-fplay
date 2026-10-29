import { beforeAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { saphiRoutes } from '../../src/saphi/routes.js';
import { apiDb,ownerDb,caller,createUser,createSession,makeDeps } from '../helpers.js';
const call=caller(saphiRoutes(makeDeps(apiDb)));
const scope='/saphi/companies/{companyId}';let token:string;let companyId:string;let otherId:string;let plotId:string;let pointId:string;let otherPlot:string;let sampleId:string;let readerToken:string;
const period={from:'2026-10-01T00:00:00Z',to:'2026-10-04T00:00:00Z'};
const opts=(body?:unknown,id?:string)=>({token,query:period,pathParameters:{companyId,...(id?{id}:{})},...(body?{body}:{})});
beforeAll(async()=>{
 const creator=await createUser({role:'superuser',mfaEnabled:true});const manager=await createUser({role:'superuser',mfaEnabled:true});const reader=await createUser();
 token=(await createSession(manager)).accessToken;readerToken=(await createSession(reader)).accessToken;
 const creatorToken=(await createSession(creator)).accessToken;
 for(const [rut,other] of [['99000501-K',false],['99000502-8',true]] as const){
   // Valid synthetic RUT generated below to avoid assumptions about check digits.
   const {computeRutCheckDigit}=await import('@base/shared');const b=rut.split('-')[0]!;
   const c=await call('POST','/saphi/companies',{token:creatorToken,body:{rut:`${b}-${computeRutCheckDigit(b)}`,legalName:`Sample tests ${randomUUID()}`,initialUserId:manager.id,initialPermissions:[...SAPHI_PERMISSIONS],reason:'Tests'}});
   expect(c.status).toBe(201);const cid=c.body.data.id;
   const farm=await call('POST',`${scope}/farms`,{token,pathParameters:{companyId:cid},body:{code:'F',name:'Farm'}});
   const plot=await call('POST',`${scope}/plots`,{token,pathParameters:{companyId:cid},body:{code:'P',name:'Plot',farmId:farm.body.data.id}});
   if(other){otherId=cid;otherPlot=plot.body.data.id;}else{companyId=cid;plotId=plot.body.data.id;}
 }
 const point=await call('POST',`${scope}/sampling-points`,opts({plotId,code:'POINT',location:{type:'Point',coordinates:[-71,-35]}}));pointId=point.body.data.id;
});
describe('immutable samples and history',()=>{
 it('records explicit sampling time and returns safe detail',async()=>{
   const result=await call('POST',`${scope}/samples`,opts({code:'S1',plotId,samplingPointId:pointId,sampledAt:'2026-10-01T12:00:00-03:00',notes:'Original'}));
   expect(result.status,JSON.stringify(result.body)).toBe(201);sampleId=result.body.data.id;
   expect(result.body.data.sampledAt).toBe('2026-10-01T15:00:00.000Z');expect(result.body.data.createdAt).not.toBe(result.body.data.sampledAt);
   const detail=await call('GET',`${scope}/samples/{id}`,opts(undefined,sampleId));expect(detail.body.data.notes).toBe('Original');expect(detail.body.data).not.toHaveProperty('created_by');
 });
 it('enforces parent and company boundaries and strict inputs',async()=>{
   const body={code:'INVALID',plotId,sampledAt:'2026-10-02T00:00:00Z'};
   expect((await call('POST',`${scope}/samples`,opts({...body,plotId:otherPlot}))).status).toBe(404);
   const farm=await call('POST',`${scope}/farms`,opts({code:'F-OTHER',name:'Other farm'}));
   const plot=await call('POST',`${scope}/plots`,opts({code:'P-OTHER',name:'Other plot',farmId:farm.body.data.id}));
   expect((await call('POST',`${scope}/samples`,opts({...body,plotId:plot.body.data.id,samplingPointId:pointId}))).status).toBe(404);
   expect((await call('POST',`${scope}/samples`,{token,pathParameters:{companyId:otherId},body:{...body,plotId:otherPlot,samplingPointId:pointId}})).status).toBe(404);
   expect((await call('POST',`${scope}/samples`,opts({...body,sampledAt:'2026-10-02'}))).status).toBe(400);
   expect((await call('POST',`${scope}/samples`,opts({...body,results:[]}))).status).toBe(400);
   expect((await call('GET',`${scope}/samples/{id}`,{token,pathParameters:{companyId:otherId,id:sampleId}})).status).toBe(404);
   expect((await call('GET',`${scope}/samples`,{token:readerToken,pathParameters:{companyId}})).status).toBe(404);
 });
 it('filters half-open sampling periods and binds business-time cursors',async()=>{
   for(let n=2;n<=3;n++)expect((await call('POST',`${scope}/samples`,opts({code:`S${n}`,plotId,sampledAt:`2026-10-0${n}T15:00:00Z`}))).status).toBe(201);
   const first=await call('GET',`${scope}/samples`,{...opts(),query:{...period,limit:'1',plotId}});const cursor=first.body.page.nextCursor;
   expect(first.body.data).toHaveLength(1);expect(cursor).toBeTruthy();
   const next=await call('GET',`${scope}/samples`,{...opts(),query:{...period,limit:'1',plotId,cursor}});expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
   expect(first.body.data[0].code).toBe('S3');expect(next.body.data[0].code).toBe('S2');
   expect((await call('GET',`${scope}/samples`,{...opts(),query:{...period,limit:'1',plotId,cursor,from:'2026-10-02T00:00:00Z'}})).status).toBe(400);
   const range=await call('GET',`${scope}/samples`,{...opts(),query:{from:'2026-10-02T15:00:00Z',to:'2026-10-03T15:00:00Z'}});expect(range.body.data.map((r:{code:string})=>r.code)).toEqual(['S2']);
   expect((await call('GET',`${scope}/samples`,{...opts(),query:{}})).status).toBe(400);
   expect((await call('GET',`${scope}/samples`,{...opts(),query:{from:'2026-10-03T00:00:00Z',to:'2026-10-01T00:00:00Z'}})).status).toBe(400);
 });
 it('rejects duplicates and exposes no update/delete or analysis writes',async()=>{
   expect((await call('POST',`${scope}/samples`,opts({code:'S1',plotId,sampledAt:'2026-10-01T00:00:00Z'}))).status).toBe(409);
   const routes=saphiRoutes(makeDeps(apiDb));expect(routes[`PATCH ${scope}/samples/{id}`]).toBeUndefined();expect(routes[`DELETE ${scope}/samples/{id}`]).toBeUndefined();expect(routes[`POST ${scope}/laboratory/analyses`]).toBeUndefined();
 });
 it('audits capture without enabling DML corrections',async()=>{
   const audit=await ownerDb.selectFrom('app.audit_log').select('id').where('entity_id','=',sampleId).execute();expect(audit.length).toBeGreaterThan(0);
 });
});
