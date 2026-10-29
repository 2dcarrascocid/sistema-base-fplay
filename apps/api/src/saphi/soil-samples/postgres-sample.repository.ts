import type { Selectable } from 'kysely';
import type { CreateSoilSampleInput, SoilSampleDto } from '@base/saphi';
import type { Database } from '../../lib/db-types.js';
import type { Tx } from '../../lib/db.js';
import { paginate,slice,type KeysetPage } from '../persistence/pagination.js';

const dto=(row:Selectable<Database['saphi.soil_samples']>):SoilSampleDto=>({
  id:row.id,companyId:row.company_id,plotId:row.plot_id,samplingPointId:row.sampling_point_id,code:row.code,
  sampledAt:row.sampled_at.toISOString(),notes:row.notes,version:Number(row.version),
  createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),
});
export class PostgresSampleRepository {
  constructor(private readonly tx:Tx){}
  async list(companyId:string,page:KeysetPage,filters:{plotId?:string|undefined;from?:string|undefined;to?:string|undefined}){
    let query=this.tx.selectFrom('saphi.soil_samples').selectAll().where('company_id','=',companyId);
    if(filters.plotId)query=query.where('plot_id','=',filters.plotId);
    if(filters.from)query=query.where('sampled_at','>=',new Date(filters.from));
    if(filters.to)query=query.where('sampled_at','<',new Date(filters.to));
    return slice(await paginate(query,page,undefined,'sampled_at').execute(),page.limit,dto);
  }
  async find(companyId:string,id:string){
    const row=await this.tx.selectFrom('saphi.soil_samples').selectAll().where('company_id','=',companyId).where('id','=',id).executeTakeFirst();
    return row?dto(row):null;
  }
  async create(companyId:string,input:CreateSoilSampleInput){
    return dto(await this.tx.insertInto('saphi.soil_samples').values({company_id:companyId,plot_id:input.plotId,
      sampling_point_id:input.samplingPointId??null,code:input.code,sampled_at:input.sampledAt,notes:input.notes??null})
      .returningAll().executeTakeFirstOrThrow());
  }
}
