import { randomInt, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { computeRutCheckDigit } from '@base/shared';
import { SAPHI_PERMISSIONS } from '@base/saphi';
import { saphiRoutes } from '../../src/saphi/routes.js';
import { apiDb, ownerDb, makeDeps, caller, createUser, createSession, type TestUser } from '../helpers.js';

const call=caller(saphiRoutes(makeDeps(apiDb)));
const root='/saphi/companies';
const scoped='/saphi/companies/{companyId}';
let creator: TestUser; let manager: TestUser; let reader: TestUser; let outsider: TestUser;
let creatorToken:string; let managerToken:string; let readerToken:string; let outsiderToken:string;
let companyId:string; let otherCompanyId:string;
let farmId:string; let plotId:string; let pointId:string;
const rut=()=>{const body=String(randomInt(20000000,99000000));return `${body}-${computeRutCheckDigit(body)}`;};
const bootstrap=(userId:string,override:Record<string,unknown>={})=>({rut:rut(),legalName:'Empresa de prueba',initialUserId:userId,initialPermissions:[...SAPHI_PERMISSIONS],reason:'Piloto autorizado',...override});
const opts=(body?:unknown,id?:string)=>({token:managerToken,pathParameters:{companyId,...(id?{id}:{})},...(body===undefined?{}:{body})});

beforeAll(async()=>{
  creator=await createUser({role:'superuser',mfaEnabled:true}); manager=await createUser({role:'superuser',mfaEnabled:true});
  reader=await createUser(); outsider=await createUser();
  [creatorToken,managerToken,readerToken,outsiderToken]=await Promise.all([
    createSession(creator).then(s=>s.accessToken),createSession(manager).then(s=>s.accessToken),
    createSession(reader).then(s=>s.accessToken),createSession(outsider).then(s=>s.accessToken),
  ]);
  const profile=await ownerDb.insertInto('app.profiles').values({name:`saphi-ceiling-${randomUUID()}`}).returning('id').executeTakeFirstOrThrow();
  const actions=await ownerDb.selectFrom('app.menu_actions as ma').innerJoin('app.menus as m','m.id','ma.menu_id').select('ma.id')
    .where('m.code','like','saphi.%').execute();
  await ownerDb.insertInto('app.profile_permissions').values(actions.map(a=>({profile_id:profile.id,menu_action_id:a.id}))).execute();
  await ownerDb.insertInto('app.user_profiles').values({user_id:reader.id,profile_id:profile.id}).execute();
  const created=await call('POST',root,{token:creatorToken,body:bootstrap(manager.id)});
  expect(created.status,JSON.stringify(created.body)).toBe(201); companyId=created.body.data.id;
  const second=await call('POST',root,{token:creatorToken,body:bootstrap(manager.id)}); otherCompanyId=second.body.data.id;
});

describe('Saphi companies and scoped membership',()=>{
  it('keeps bootstrap atomic and denies self-assignment and unprivileged callers',async()=>{
    expect((await call('POST',root,{token:creatorToken,body:bootstrap(creator.id)})).status).toBe(403);
    expect((await call('POST',root,{token:readerToken,body:bootstrap(manager.id)})).status).toBe(403);
    expect((await call('POST',root,{token:creatorToken,body:bootstrap(outsider.id)})).status).toBe(403);
    expect((await call('POST',root,{token:creatorToken,body:bootstrap(manager.id,{initialPermissions:['saphi.companies:view']})})).status).toBe(400);
    expect((await call('POST',root,{token:creatorToken,body:bootstrap(manager.id,{reason:''})})).status).toBe(400);
    expect((await call('GET',root,{token:creatorToken})).body.data).toEqual([]);
    expect((await call('GET',root,{token:managerToken})).body.data).toHaveLength(2);
  });
  it('returns minimal company data and handles version conflicts without rewriting identity',async()=>{
    const current=await call('GET',scoped,opts());expect(current.status).toBe(200);
    expect(current.body.data).not.toHaveProperty('created_by');
    const patch={legalName:'Empresa actualizada',reason:'Cambio registrado',expectedVersion:current.body.data.version};
    expect((await call('PATCH',scoped,opts(patch))).status).toBe(200);
    expect((await call('PATCH',scoped,opts(patch))).body.error.code).toBe('VERSION_CONFLICT');
    expect((await call('PATCH',scoped,opts({...patch,rut:rut()}))).status).toBe(400);
    expect((await call('GET',scoped,{token:outsiderToken,pathParameters:{companyId}})).status).toBe(404);
  });
  it('adds a user without implicit scoped grants and rejects self modifications',async()=>{
    const route=`${scoped}/memberships/{userId}`;
    const response=await call('PUT',route,{...opts({expectedVersion:0,status:'active',reason:'Incorporación'}),pathParameters:{companyId,userId:reader.id}});
    expect(response.status).toBe(200);expect(response.body.data.version).toBe(1);
    expect((await call('GET',`${scoped}/capabilities`,{token:readerToken,pathParameters:{companyId}})).body.data.effectivePermissions).toEqual([]);
    expect((await call('PUT',route,{...opts({expectedVersion:1,status:'inactive',reason:'Auto cambio'}),pathParameters:{companyId,userId:manager.id}})).status).toBe(403);
    expect((await call('PUT',route,{...opts({expectedVersion:0,status:'inactive',reason:'Versión vieja'}),pathParameters:{companyId,userId:reader.id}})).status).toBe(409);
  });
  it('assigns company-specific keys from the existing catalogue and verifies prerequisites',async()=>{
    const route=`${scoped}/memberships/{userId}/permissions`;
    const grant=(permissions:string[],expectedVersion=1)=>call('PUT',route,{...opts({expectedVersion,permissions,reason:'Acceso de consulta'}),pathParameters:{companyId,userId:reader.id}});
    expect((await grant(['saphi.farms:edit'])).status).toBe(400);
    expect((await grant(['security.users:view'])).status).toBe(400);
    expect((await grant(['saphi.companies:view','saphi.farms:view','saphi.plots:view','saphi.samples:view'])).status).toBe(200);
    expect((await grant(['saphi.farms:view'])).status).toBe(409);
    const caps=await call('GET',`${scoped}/capabilities`,{token:readerToken,pathParameters:{companyId}});
    expect(caps.body.data.effectivePermissions).toContain('saphi.farms:view');
    expect(caps.body.data.effectivePermissions).not.toContain('saphi.farms:edit');
    expect(caps.body.data.menu[0].children.some((m:{code:string})=>m.code==='saphi.farms')).toBe(true);
    const members=await call('GET',`${scoped}/memberships`,opts());expect(members.body.data).toHaveLength(2);
    expect(members.body.data[0]).not.toHaveProperty('email');
    expect((await call('GET',`${scoped}/memberships`,{token:readerToken,pathParameters:{companyId}})).status).toBe(403);
  });
  it('supports the existing fixed Base Fairplay UUID when explicitly assigning membership',async()=>{
    const legacyUser='00000000-0000-0000-0000-000000000001';
    const result=await call('PUT',`${scoped}/memberships/{userId}`,{...opts({expectedVersion:0,status:'active',reason:'Asignación explícita'}),pathParameters:{companyId,userId:legacyUser}});
    expect(result.status).toBe(200);expect(result.body.data.userId).toBe(legacyUser);expect(result.body.data.permissions).toEqual([]);
  });
});

describe('master CRUD and isolation',()=>{
  it('creates farms, paginates with an opaque authenticated cursor and validates query bindings',async()=>{
    for(const code of ['F1','F2','F3']) {
      const result=await call('POST',`${scoped}/farms`,opts({code,name:`Predio ${code}`,areaHa:'5.1234'}));
      expect(result.status).toBe(201);farmId=result.body.data.id;expect(result.body.data.areaHa).toBe('5.1234');
    }
    const first=await call('GET',`${scoped}/farms`,{...opts(),query:{limit:'1'}});
    expect(first.body.page.hasMore).toBe(true);const cursor=first.body.page.nextCursor;
    const second=await call('GET',`${scoped}/farms`,{...opts(),query:{limit:'1',cursor}});
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    for(const query of [{limit:'2',cursor},{limit:'1',cursor:`${cursor}x`},{limit:'1',cursor,status:'inactive'},{limit:'101'}]) {
      expect((await call('GET',`${scoped}/farms`,{...opts(),query})).status).toBe(400);
    }
    expect((await call('GET',`${scoped}/farms`,{token:readerToken,pathParameters:{companyId},query:{limit:'1',cursor}})).status).toBe(400);
    const foreign=await call('GET',`${scoped}/farms`,{token:managerToken,pathParameters:{companyId:otherCompanyId},query:{limit:'1',cursor}});
    expect(foreign.status).toBe(400);
  });
  it('rejects duplicate codes, tenant injection, bad decimals and stale versions',async()=>{
    expect((await call('POST',`${scoped}/farms`,opts({code:'F1',name:'Otro'}))).status).toBe(409);
    expect((await call('POST',`${scoped}/farms`,opts({code:'F4',name:'Otro',companyId:otherCompanyId}))).status).toBe(400);
    expect((await call('POST',`${scoped}/farms`,opts({code:'F4',name:'Otro',areaHa:'0'}))).status).toBe(400);
    const get=await call('GET',`${scoped}/farms/{id}`,opts(undefined,farmId));expect(get.status).toBe(200);
    const patch={expectedVersion:get.body.data.version,name:'Predio editado'};
    const results=await Promise.all([call('PATCH',`${scoped}/farms/{id}`,opts(patch,farmId)),call('PATCH',`${scoped}/farms/{id}`,opts(patch,farmId))]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await call('GET',`${scoped}/farms/{id}`,opts(undefined,randomUUID()))).status).toBe(404);
  });
  it('does not skip rows sharing a PostgreSQL microsecond timestamp across pages',async()=>{
    await sql`insert into saphi.farms(company_id,code,name) values(${companyId},'BATCH1','One'),(${companyId},'BATCH2','Two')`.execute(ownerDb);
    const found:string[]=[];let cursor:string|undefined;
    do{
      const result=await call('GET',`${scoped}/farms`,{...opts(),query:{limit:'1',...(cursor?{cursor}:{})}});
      expect(result.status).toBe(200);found.push(...result.body.data.map((r:{id:string})=>r.id));
      cursor=result.body.page.nextCursor??undefined;
    }while(cursor&&found.length<10);
    expect(found).toHaveLength(5);expect(new Set(found).size).toBe(5);
  });
  it('creates and updates plots with correct parents and company boundaries',async()=>{
    const made=await call('POST',`${scoped}/plots`,opts({farmId,code:'C1',name:'Cuartel',grapeVariety:'Variedad registrada',plantingYear:2020}));
    expect(made.status).toBe(201);plotId=made.body.data.id;
    expect((await call('GET',`${scoped}/plots`,{...opts(),query:{farmId,status:'active'}})).body.data).toHaveLength(1);
    expect((await call('GET',`${scoped}/plots/{id}`,opts(undefined,plotId))).status).toBe(200);
    expect((await call('PATCH',`${scoped}/plots/{id}`,opts({expectedVersion:1,soilType:'Registrado',areaHa:null},plotId))).status).toBe(200);
    expect((await call('PATCH',`${scoped}/plots/{id}`,opts({expectedVersion:1,name:'Stale'},plotId))).status).toBe(409);
    expect((await call('PATCH',`${scoped}/plots/{id}`,opts({expectedVersion:2,farmId:randomUUID()},plotId))).status).toBe(400);
    const foreign={token:managerToken,pathParameters:{companyId:otherCompanyId},body:{farmId,code:'X',name:'Wrong'}};
    expect((await call('POST',`${scoped}/plots`,foreign)).status).toBe(404);
    expect((await call('GET',`${scoped}/plots`,{token:managerToken,pathParameters:{companyId:otherCompanyId},query:{farmId}})).status).toBe(404);
  });
  it('creates geographic sampling points without inventing GIS capabilities',async()=>{
    const location={type:'Point',coordinates:[-70,-33]};
    const made=await call('POST',`${scoped}/sampling-points`,opts({plotId,code:'S1',location}));
    expect(made.status).toBe(201);pointId=made.body.data.id;
    expect((await call('GET',`${scoped}/sampling-points/{id}`,opts(undefined,pointId))).body.data.location).toEqual(location);
    expect((await call('GET',`${scoped}/sampling-points`,{...opts(),query:{plotId,status:'active'}})).body.data).toHaveLength(1);
    expect((await call('PATCH',`${scoped}/sampling-points/{id}`,opts({expectedVersion:1,location:{type:'Point',coordinates:[-71,-34]}},pointId))).status).toBe(200);
    expect((await call('PATCH',`${scoped}/sampling-points/{id}`,opts({expectedVersion:1,status:'inactive'},pointId))).status).toBe(409);
    expect((await call('POST',`${scoped}/sampling-points`,opts({plotId,code:'S2',location:{type:'Point',coordinates:[181,0]}}))).status).toBe(400);
    expect((await call('POST',`${scoped}/sampling-points`,{token:managerToken,pathParameters:{companyId:otherCompanyId},body:{plotId,code:'X',location}})).status).toBe(404);
  });
  it.each(['farms','plots','sampling-points'])('enforces read-only scope and missing resources on %s',async(resource)=>{
    const ids:Record<string,string>={farms:farmId,plots:plotId,'sampling-points':pointId};
    const base=`${scoped}/${resource}`;
    expect((await call('GET',base,{token:readerToken,pathParameters:{companyId}})).status).toBe(200);
    expect((await call('PATCH',`${base}/{id}`,{token:readerToken,pathParameters:{companyId,id:ids[resource]!},body:{expectedVersion:1,status:'inactive'}})).status).toBe(403);
    expect((await call('GET',`${base}/{id}`,{token:managerToken,pathParameters:{companyId:otherCompanyId,id:ids[resource]!}})).status).toBe(404);
    expect((await call('GET',base,{token:outsiderToken,pathParameters:{companyId}})).status).toBe(404);
  });
  it('records request/tenant metadata in the original audit chain',async()=>{
    const result=await sql<{request_id:string;new_value:{companyId:string}}>`select request_id,new_value from app.audit_log
      where event_type='saphi.farms.created' and actor_user_id=${manager.id} order by id desc limit 1`.execute(ownerDb);
    expect(result.rows[0]?.request_id).toMatch(/^req-/);expect(result.rows[0]?.new_value.companyId).toBe(companyId);
    expect((await sql<{broken:string|null}>`select app.verify_audit_chain() as broken`.execute(ownerDb)).rows[0]?.broken).toBeNull();
  });
});
