import { sql,type Selectable } from 'kysely';
import type { ObservationDto } from '@base/saphi';
import type { Database } from '../../lib/db-types.js';
import type { Tx } from '../../lib/db.js';
import { paginate,slice,type KeysetPage } from '../persistence/pagination.js';
const dto=(r:Selectable<Database['saphi.satellite_observations']>&{asset_ids:string[]}):ObservationDto=>({
  id:r.id,companyId:r.company_id,plotId:r.plot_id,providerCode:r.provider_code,sourceObservationId:r.source_observation_id,
  productReference:r.product_reference,licenceReference:r.licence_reference,acquiredAt:r.acquired_at.toISOString(),receivedAt:r.received_at.toISOString(),
  qualityCode:r.quality_code,coverageText:r.coverage_text,assetIds:r.asset_ids,indicesStatus:'pending_definition',downloadStatus:'pending_definition',
});
export class PostgresObservationRepository {
  constructor(private readonly tx:Tx){}
  private query(companyId:string){return this.tx.selectFrom('saphi.satellite_observations as o').selectAll('o').where('o.company_id','=',companyId)
    .select(sql<string[]>`coalesce((select jsonb_agg(a.id order by a.id) from saphi.satellite_assets a where a.company_id=o.company_id and a.observation_id=o.id),'[]'::jsonb)`.as('asset_ids'));}
  async list(companyId:string,page:KeysetPage,filters:{plotId:string;from:string;to:string}){
    const query=this.query(companyId).where('o.plot_id','=',filters.plotId).where('o.acquired_at','>=',new Date(filters.from)).where('o.acquired_at','<',new Date(filters.to));
    return slice(await paginate(query,page,'o','acquired_at').execute(),page.limit,dto);
  }
  async find(companyId:string,id:string){const row=await this.query(companyId).where('o.id','=',id).executeTakeFirst();return row?dto(row):null;}
  async assetExists(companyId:string,observationId:string,assetId:string){return !!await this.tx.selectFrom('saphi.satellite_assets').select('id')
    .where('company_id','=',companyId).where('observation_id','=',observationId).where('id','=',assetId).executeTakeFirst();}
}
