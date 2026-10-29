import { satelliteMapQuerySchema, dashboardQuerySchema, createCompanySchema, updateCompanySchema, membershipSchema, membershipPermissionsSchema, entityIdSchema,
  paginationSchema, statusSchema, createFarmSchema, updateFarmSchema, createPlotSchema, updatePlotSchema,
  createSamplingPointSchema, updateSamplingPointSchema, createSoilSampleSchema, soilSampleQuerySchema,
  createDeviceSchema,updateDeviceSchema,telemetryHistoryQuerySchema,telemetryLatestQuerySchema,satelliteQuerySchema,satelliteAssetQuerySchema,type SaphiPermission } from '@base/saphi';
import { sql } from 'kysely';
import { authed, type Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import type { Deps } from '../lib/deps.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { json, parse, type HttpResponse, type Request, type Route } from '../lib/http.js';
import { bootstrapCompany, capabilities, listMembers, setMembership, setMemberPermissions, updateCompany } from './application/administration.js';
import { cursorCodec } from './application/cursors.js';
import { PostgresCompanyRepository } from './companies/infrastructure/postgres-company.repository.js';
import { PostgresFarmRepository } from './farms/infrastructure/postgres-farm.repository.js';
import { PostgresPlotRepository } from './plots/infrastructure/postgres-plot.repository.js';
import { PostgresPointRepository } from './sampling-points/infrastructure/postgres-point.repository.js';
import { PostgresCompanyAuthorization } from './tenancy/postgres-authorization.js';
import { PostgresSampleRepository } from './soil-samples/postgres-sample.repository.js';
import { PostgresDeviceRepository } from './devices/postgres-device.repository.js';
import { PostgresReadingRepository } from './telemetry/postgres-reading.repository.js';
import { PostgresObservationRepository } from './satellite/postgres-observation.repository.js';
import { dashboard } from './dashboard/overview.js';
import { satelliteMap } from './satellite/map.js';

type ScopedHandler = (r: Request, a: Actor, tx: Tx, companyId: string) => Promise<HttpResponse>;
const id = (r: Request, key = 'id') => parse(entityIdSchema, r.pathParameters[key]);
const requireFound = <T>(value: T | null): T => { if (!value) throw notFound(); return value; };
const created=(data:{id:string},path:string):HttpResponse=>({...json({data},201),headers:{Location:`/api${path}/${data.id}`}});
const versionCodes: Record<string, string> = { SAPHI_VERSION_CONFLICT: 'VERSION_CONFLICT', SAPHI_LAST_MANAGER: 'LAST_MANAGER', SAPHI_NOT_FOUND: 'NOT_FOUND' };

export function saphiRoutes(deps: Deps): Record<string, Route> {
  const route = (handler: (r: Request, a: Actor, tx: Tx) => Promise<HttpResponse>): Route => {
    const authenticated = authed(deps, async (r, a, tx) => {
      await sql`select set_config('saphi.request_id',${r.requestId},true),set_config('saphi.ip',${r.ip},true),
        set_config('saphi.user_agent',${r.userAgent},true)`.execute(tx);
      return handler(r, a, tx);
    });
    return async (r) => {
      try { return await authenticated(r); }
      catch (error) {
        const e = error as { code?: string; message?: string };
        if (e.code === 'P0001' && e.message && versionCodes[e.message]) throw new AppError(e.message === 'SAPHI_NOT_FOUND' ? 404 : 409, versionCodes[e.message]!);
        if (e.code === '22023' || e.code === '23514' || e.code === '23502') throw badRequest('VALIDATION_ERROR');
        if (e.code === '23503') throw notFound();
        if (e.code === '23505') throw new AppError(409, 'DUPLICATE_RESOURCE');
        throw error;
      }
    };
  };
  const scoped = (permission: SaphiPermission | null, handler: ScopedHandler, shared = true): Route => route(async (r, a, tx) => {
    const companyId = id(r, 'companyId');
    if (permission) await new PostgresCompanyAuthorization(tx, shared).requirePermission(a, { companyId }, permission);
    else {
      const { rows } = await sql<{ member: boolean }>`select saphi.is_member(${companyId}::uuid) as member`.execute(tx);
      if (!rows[0]?.member) throw notFound();
      await sql`select saphi.set_company_context(${companyId}::uuid)`.execute(tx);
    }
    return handler(r, a, tx, companyId);
  });
  const query = (r: Request, a: Actor, companyId: string | null, resource: string, parent?: 'farmId'|'plotId') => {
    const schema = paginationSchema.extend({ ...(resource === 'companies' ? {} : { status: statusSchema.optional() }),
      ...(parent ? { [parent]: entityIdSchema.optional() } : {}) });
    const values = parse(schema, r.query);
    const parentId = parent ? r.query[parent] : undefined;
    const status = r.query['status'] as 'active'|'inactive'|undefined;
    const codec = cursorCodec(deps, { actor: a.userId, companyId, resource, limit: values.limit, parentId: parentId ?? null, status: status ?? null });
    const after = codec.decode(values.cursor);
    return { codec, page: { limit: values.limit, ...(after ? { after } : {}), ...(status ? { status } : {}) }, parentId };
  };
  const prefix = '/saphi/companies/{companyId}';
  return {
    [`GET ${prefix}/satellite/map`]:scoped('saphi.satellite:view',async(r,a,tx,c)=>{
      const values=parse(satelliteMapQuerySchema,r.query);const auth=new PostgresCompanyAuthorization(tx);
      await auth.requirePermission(a,{companyId:c},'saphi.plots:view');
      requireFound(await new PostgresPlotRepository(tx).find({companyId:c},values.plotId));
      await auth.requirePermission(a,{companyId:c},'saphi.samples:view');
      return json({data:await satelliteMap(tx,c,values,deps.satelliteMaps)});
    }),
    [`GET ${prefix}/dashboard`]:scoped('saphi.dashboard:view',async(r,_a,tx,c)=>json({data:await dashboard(tx,c,parse(dashboardQuerySchema,r.query))})),
    [`GET ${prefix}/satellite/observations`]:scoped('saphi.satellite:view',async(r,a,tx,c)=>{
      const values=parse(satelliteQuerySchema,r.query);await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.plots:view');
      requireFound(await new PostgresPlotRepository(tx).find({companyId:c},values.plotId));
      const codec=cursorCodec(deps,{actor:a.userId,companyId:c,resource:'satellite.observations',limit:values.limit,plotId:values.plotId,from:values.from,to:values.to});
      const after=codec.decode(values.cursor);return json(codec.page(await new PostgresObservationRepository(tx).list(c,{limit:values.limit,...(after?{after}:{})},values)));
    }),
    [`GET ${prefix}/satellite/observations/{id}`]:scoped('saphi.satellite:view',async(r,a,tx,c)=>{
      parse(satelliteAssetQuerySchema,r.query);await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.plots:view');
      return json({data:requireFound(await new PostgresObservationRepository(tx).find(c,id(r)))});
    }),
    [`GET ${prefix}/satellite/observations/{id}/assets/{assetId}/download`]:scoped('saphi.satellite:view',async(r,a,tx,c)=>{
      parse(satelliteAssetQuerySchema,r.query);const observationId=id(r);const assetId=id(r,'assetId');
      await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.plots:view');
      const repo=new PostgresObservationRepository(tx);requireFound(await repo.find(c,observationId));
      if(!await repo.assetExists(c,observationId,assetId))throw notFound();
      // No photo/branding storage fallback, URL synthesis or external request while Q07/Q09 are pending.
      throw new AppError(503,'SATELLITE_STORAGE_UNAVAILABLE');
    }),
    [`GET ${prefix}/devices`]:scoped('saphi.devices:view',async(r,a,tx,c)=>{
      const q=query(r,a,c,'devices','plotId');return json(q.codec.page(await new PostgresDeviceRepository(tx).list(c,q.page,q.parentId)));
    }),
    [`POST ${prefix}/devices`]:scoped('saphi.devices:create',async(r,a,tx,c)=>{
      const input=parse(createDeviceSchema,r.body);await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.plots:view');
      requireFound(await new PostgresPlotRepository(tx).find({companyId:c},input.plotId));
      return created(await new PostgresDeviceRepository(tx).create(c,input),`/saphi/companies/${c}/devices`);
    }),
    [`GET ${prefix}/devices/{id}`]:scoped('saphi.devices:view',async(r,_a,tx,c)=>json({data:requireFound(await new PostgresDeviceRepository(tx).find(c,id(r)))})),
    [`PATCH ${prefix}/devices/{id}`]:scoped('saphi.devices:edit',async(r,_a,tx,c)=>{
      const repo=new PostgresDeviceRepository(tx);const resourceId=id(r);requireFound(await repo.find(c,resourceId));
      return json({data:await repo.update(c,resourceId,parse(updateDeviceSchema,r.body))});
    }),
    [`GET ${prefix}/telemetry/readings`]:scoped('saphi.telemetry:view',async(r,a,tx,c)=>{
      const values=parse(telemetryHistoryQuerySchema,r.query);await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.devices:view');
      requireFound(await new PostgresDeviceRepository(tx).find(c,values.deviceId));
      const codec=cursorCodec(deps,{actor:a.userId,companyId:c,resource:'readings',limit:values.limit,deviceId:values.deviceId,metricCode:values.metricCode??null,from:values.from,to:values.to});
      const after=codec.decode(values.cursor);return json(codec.page(await new PostgresReadingRepository(tx).history(c,{limit:values.limit,...(after?{after}:{})},values)));
    }),
    [`GET ${prefix}/telemetry/latest`]:scoped('saphi.telemetry:view',async(r,a,tx,c)=>{
      const values=parse(telemetryLatestQuerySchema,r.query);await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.devices:view');
      requireFound(await new PostgresDeviceRepository(tx).find(c,values.deviceId));
      return json({data:await new PostgresReadingRepository(tx).latest(c,values.deviceId,values.metricCode)});
    }),
    [`GET ${prefix}/samples`]:scoped('saphi.samples:view',async(r,a,tx,c)=>{
      const values=parse(soilSampleQuerySchema,r.query);
      const codec=cursorCodec(deps,{actor:a.userId,companyId:c,resource:'samples',limit:values.limit,
        plotId:values.plotId??null,from:values.from??null,to:values.to??null});
      const after=codec.decode(values.cursor);
      return json(codec.page(await new PostgresSampleRepository(tx).list(c,{limit:values.limit,...(after?{after}:{})},values)));
    }),
    [`GET ${prefix}/samples/{id}`]:scoped('saphi.samples:view',async(r,_a,tx,c)=>
      json({data:requireFound(await new PostgresSampleRepository(tx).find(c,id(r)))})),
    [`POST ${prefix}/samples`]:scoped('saphi.samples:create',async(r,a,tx,c)=>{
      const input=parse(createSoilSampleSchema,r.body);
      await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.plots:view');
      requireFound(await new PostgresPlotRepository(tx).find({companyId:c},input.plotId));
      if(input.samplingPointId){
        const point=requireFound(await new PostgresPointRepository(tx).find({companyId:c},input.samplingPointId));
        if(point.plotId!==input.plotId)throw notFound();
      }
      return created(await new PostgresSampleRepository(tx).create(c,input),`/saphi/companies/${c}/samples`);
    }),
    'GET /saphi/companies': route(async (r,a,tx) => {
      const q = query(r,a,null,'companies');
      return json(q.codec.page(await new PostgresCompanyRepository(tx).listAccessible(q.page)));
    }),
    'POST /saphi/companies': route(async (r,a,tx) => {
      if (a.role !== 'superuser') throw forbidden();
      const company = await bootstrapCompany(tx,parse(createCompanySchema,r.body));
      return { ...json({ data: company },201), headers: { Location: `/api/saphi/companies/${company.id}` } };
    }),
    [`GET ${prefix}`]: scoped('saphi.companies:view',async (_r,_a,tx,c) => json({ data: requireFound(await new PostgresCompanyRepository(tx).find(c)) })),
    [`PATCH ${prefix}`]: scoped('saphi.companies:edit',async (r,_a,tx,c) => json({ data: await updateCompany(tx,c,parse(updateCompanySchema,r.body)) }),false),
    [`GET ${prefix}/capabilities`]: scoped(null,async (_r,a,tx,c) => json({ data: await capabilities(tx,c,a) })),
    [`GET ${prefix}/memberships`]: scoped('saphi.memberships:view',async (r,a,tx,c) => {
      const q=query(r,a,c,'memberships'); return json(q.codec.page(await listMembers(tx,c,q.page.limit,q.page.after,q.page.status)));
    }),
    [`PUT ${prefix}/memberships/{userId}`]: scoped('saphi.memberships:edit',async (r,_a,tx,c) => json({ data: await setMembership(tx,c,id(r,'userId'),parse(membershipSchema,r.body)) }),false),
    [`PUT ${prefix}/memberships/{userId}/permissions`]: scoped('saphi.memberships:edit',async (r,_a,tx,c) => json({ data: await setMemberPermissions(tx,c,id(r,'userId'),parse(membershipPermissionsSchema,r.body)) }),false),
    [`GET ${prefix}/farms`]: scoped('saphi.farms:view',async (r,a,tx,c) => { const q=query(r,a,c,'farms'); return json(q.codec.page(await new PostgresFarmRepository(tx).list({ companyId:c },q.page))); }),
    [`GET ${prefix}/farms/{id}`]: scoped('saphi.farms:view',async (r,_a,tx,c) => json({ data: requireFound(await new PostgresFarmRepository(tx).find({ companyId:c },id(r))) })),
    [`POST ${prefix}/farms`]: scoped('saphi.farms:create',async (r,_a,tx,c) => created(await new PostgresFarmRepository(tx).create({ companyId:c },parse(createFarmSchema,r.body)),`/saphi/companies/${c}/farms`)),
    [`PATCH ${prefix}/farms/{id}`]: scoped('saphi.farms:edit',async (r,_a,tx,c) => {
      const repo=new PostgresFarmRepository(tx); const resourceId=id(r); requireFound(await repo.find({ companyId:c },resourceId));
      return json({ data: await repo.update({ companyId:c },resourceId,parse(updateFarmSchema,r.body)) });
    }),
    [`GET ${prefix}/plots`]: scoped('saphi.plots:view',async (r,a,tx,c) => {
      const q=query(r,a,c,'plots','farmId');
      if(q.parentId) requireFound(await new PostgresFarmRepository(tx).find({companyId:c},q.parentId));
      return json(q.codec.page(await new PostgresPlotRepository(tx).list({companyId:c},q.parentId,q.page)));
    }),
    [`GET ${prefix}/plots/{id}`]: scoped('saphi.plots:view',async (r,_a,tx,c) => json({ data: requireFound(await new PostgresPlotRepository(tx).find({companyId:c},id(r))) })),
    [`POST ${prefix}/plots`]: scoped('saphi.plots:create',async (r,a,tx,c) => {
      const input=parse(createPlotSchema,r.body); await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.farms:view');
      requireFound(await new PostgresFarmRepository(tx).find({companyId:c},input.farmId));
      return created(await new PostgresPlotRepository(tx).create({companyId:c},input),`/saphi/companies/${c}/plots`);
    }),
    [`PATCH ${prefix}/plots/{id}`]: scoped('saphi.plots:edit',async (r,_a,tx,c) => {
      const repo=new PostgresPlotRepository(tx); const resourceId=id(r); requireFound(await repo.find({companyId:c},resourceId));
      return json({ data: await repo.update({companyId:c},resourceId,parse(updatePlotSchema,r.body)) });
    }),
    [`GET ${prefix}/sampling-points`]: scoped('saphi.samples:view',async (r,a,tx,c) => {
      const q=query(r,a,c,'sampling-points','plotId');
      if(q.parentId) requireFound(await new PostgresPlotRepository(tx).find({companyId:c},q.parentId));
      return json(q.codec.page(await new PostgresPointRepository(tx).list({companyId:c},q.parentId,q.page)));
    }),
    [`GET ${prefix}/sampling-points/{id}`]: scoped('saphi.samples:view',async (r,_a,tx,c) => json({ data: requireFound(await new PostgresPointRepository(tx).find({companyId:c},id(r))) })),
    [`POST ${prefix}/sampling-points`]: scoped('saphi.samples:create',async (r,a,tx,c) => {
      const input=parse(createSamplingPointSchema,r.body); await new PostgresCompanyAuthorization(tx).requirePermission(a,{companyId:c},'saphi.plots:view');
      requireFound(await new PostgresPlotRepository(tx).find({companyId:c},input.plotId));
      return created(await new PostgresPointRepository(tx).create({companyId:c},input),`/saphi/companies/${c}/sampling-points`);
    }),
    [`PATCH ${prefix}/sampling-points/{id}`]: scoped('saphi.samples:edit',async (r,_a,tx,c) => {
      const repo=new PostgresPointRepository(tx); const resourceId=id(r); requireFound(await repo.find({companyId:c},resourceId));
      return json({ data: await repo.update({companyId:c},resourceId,parse(updateSamplingPointSchema,r.body)) });
    }),
  };
}
