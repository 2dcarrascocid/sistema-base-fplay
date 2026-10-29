import { sql } from 'kysely';
import { satelliteMapDataSchema } from '@base/saphi';
import type { SatelliteMapDto,SatelliteMapQuery } from '@base/saphi';
import type { Tx } from '../../lib/db.js';
import type { SatelliteMapProvider } from '../integrations/satellite/satellite-map.port.js';
import { AppError,badRequest } from '../../lib/errors.js';
/** Scope has already required satellite, plots and samples permissions under the runtime role. */
export async function satelliteMap(tx:Tx,companyId:string,query:SatelliteMapQuery,provider?:SatelliteMapProvider):Promise<SatelliteMapDto>{
  const {rows}=await sql<{west:number|null;south:number|null;east:number|null;north:number|null}>`
    select min((location->'coordinates'->>0)::double precision) as west,
      min((location->'coordinates'->>1)::double precision) as south,
      max((location->'coordinates'->>0)::double precision) as east,
      max((location->'coordinates'->>1)::double precision) as north
    from saphi.sampling_points where company_id=${companyId}::uuid and plot_id=${query.plotId}::uuid and status='active'
  `.execute(tx);
  const area=rows[0];
  if(!area||area.west===null||area.south===null||area.east===null||area.north===null)
    throw new AppError(409,'SATELLITE_LOCATION_REQUIRED');
  // A padded reference envelope, explicitly not a cadastral/plot polygon or area calculation.
  const bbox:[number,number,number,number]=[Math.max(-180,area.west-.001),Math.max(-85,area.south-.001),Math.min(180,area.east+.001),Math.min(85,area.north+.001)];
  if(bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[2]-bbox[0]>1||bbox[3]-bbox[1]>1)throw badRequest('SATELLITE_AREA_TOO_LARGE');
  if(!provider)throw new AppError(503,'SATELLITE_PROVIDER_UNAVAILABLE');
  const {plotId,...filters}=query;
  const parsed=satelliteMapDataSchema.safeParse(await provider.render({...filters,bbox}));
  if(!parsed.success)throw new AppError(502,'SATELLITE_PROVIDER_ERROR');
  const data=parsed.data;
  if(data.index!==query.index||data.start!==query.start||data.endExclusive!==query.end||data.maxCloudPercentage!==query.cloud||
    data.bbox.some((n,i)=>n!==bbox[i]))throw new AppError(502,'SATELLITE_PROVIDER_ERROR');
  return {...data,companyId,plotId,areaSource:'sampling_points_envelope'};
}
