import { sql } from 'kysely';
import type { DashboardDto, DashboardItem, DashboardQuery, DashboardSection, SaphiPermission } from '@base/saphi';
import type { Tx } from '../../lib/db.js';
import { forbidden, notFound } from '../../lib/errors.js';

const limit = 6;
/** Bounded source previews, in the authenticated transaction under app_api and source RLS. */
export async function dashboard(tx: Tx, companyId: string, filters: DashboardQuery): Promise<DashboardDto> {
  const { rows } = await sql<{ permission: string }>`select menu_code||':'||action_code as permission
    from app.current_permissions() where saphi.has_permission(${companyId}::uuid,menu_code,action_code)
    and saphi.has_permission(${companyId}::uuid,menu_code,'view')`.execute(tx);
  const allowed = new Set(rows.map(r => r.permission));
  const can = (...keys: SaphiPermission[]) => keys.every(key => allowed.has(key));
  let farmId: string|undefined;
  if (filters.plotId) {
    if (!can('saphi.plots:view')) throw forbidden();
    const plot = await tx.selectFrom('saphi.plots').select('farm_id').where('company_id','=',companyId).where('id','=',filters.plotId).executeTakeFirst();
    if (!plot) throw notFound();
    farmId = plot.farm_id;
  }
  const section = async (permissions: SaphiPermission[], load: () => Promise<DashboardItem[]>): Promise<DashboardSection> => {
    if (!can(...permissions)) return { status: 'forbidden' };
    const data = await load();
    return data.length ? { status: 'available', data: data.slice(0,limit), hasMore: data.length > limit } : { status: 'no_data' };
  };
  const pending = (permission: SaphiPermission): DashboardSection => ({ status: can(permission) ? 'pending_definition' : 'forbidden' });
  const farms = await section(['saphi.farms:view'],async () => {
    const data = await tx.selectFrom('saphi.farms').select(['id','code','name']).where('company_id','=',companyId)
      .$if(!!farmId,q => q.where('id','=',farmId!)).orderBy('created_at','desc').orderBy('id','desc').limit(limit+1).execute();
    return data.map(r => ({id:r.id,label:`${r.code} · ${r.name}`}));
  });
  const plots = await section(['saphi.plots:view'],async () => {
    const data = await tx.selectFrom('saphi.plots').select(['id','code','name']).where('company_id','=',companyId)
      .$if(!!filters.plotId,q => q.where('id','=',filters.plotId!)).orderBy('created_at','desc').orderBy('id','desc').limit(limit+1).execute();
    return data.map(r => ({id:r.id,label:`${r.code} · ${r.name}`}));
  });
  const devices = await section(['saphi.devices:view'],async () => {
    const data = await tx.selectFrom('saphi.devices').select(['id','code']).where('company_id','=',companyId)
      .$if(!!filters.plotId,q => q.where('plot_id','=',filters.plotId!)).orderBy('created_at','desc').orderBy('id','desc').limit(limit+1).execute();
    return data.map(r => ({id:r.id,label:r.code}));
  });
  const samples = await section(['saphi.samples:view'],async () => {
    const data = await tx.selectFrom('saphi.soil_samples').select(['id','code','sampled_at']).where('company_id','=',companyId)
      .where('sampled_at','>=',new Date(filters.from)).where('sampled_at','<',new Date(filters.to))
      .$if(!!filters.plotId,q => q.where('plot_id','=',filters.plotId!)).orderBy('sampled_at','desc').orderBy('id','desc').limit(limit+1).execute();
    return data.map(r => ({id:r.id,label:r.code,at:r.sampled_at.toISOString()}));
  });
  const telemetry = await section(['saphi.telemetry:view','saphi.devices:view'],async () => {
    const data = await tx.selectFrom('saphi.sensor_readings as r').innerJoin('saphi.devices as d',j => j.onRef('d.id','=','r.device_id').onRef('d.company_id','=','r.company_id'))
      .select(['r.id','d.code','r.metric_code','r.value','r.unit_code','r.observed_at']).where('r.company_id','=',companyId)
      .where('r.observed_at','>=',new Date(filters.from)).where('r.observed_at','<',new Date(filters.to))
      .$if(!!filters.plotId,q => q.where('d.plot_id','=',filters.plotId!)).orderBy('r.observed_at','desc').orderBy('r.id','desc').limit(limit+1).execute();
    return data.map(r => ({id:r.id,label:`${r.code} · ${r.metric_code}`,value:r.value,unit:r.unit_code,at:r.observed_at.toISOString()}));
  });
  const satellite = await section(['saphi.satellite:view','saphi.plots:view'],async () => {
    const data = await tx.selectFrom('saphi.satellite_observations').select(['id','provider_code','source_observation_id','acquired_at'])
      .where('company_id','=',companyId).where('acquired_at','>=',new Date(filters.from)).where('acquired_at','<',new Date(filters.to))
      .$if(!!filters.plotId,q => q.where('plot_id','=',filters.plotId!)).orderBy('acquired_at','desc').orderBy('id','desc').limit(limit+1).execute();
    return data.map(r => ({id:r.id,label:`${r.provider_code} · ${r.source_observation_id}`,at:r.acquired_at.toISOString()}));
  });
  return {companyId,plotId:filters.plotId??null,period:{from:filters.from,to:filters.to},generatedAt:new Date().toISOString(),limit,
    sections:{farms,plots,devices,samples,telemetry,satellite,laboratory:pending('saphi.laboratory:view'),indicators:pending('saphi.indicators:view')}};
}
