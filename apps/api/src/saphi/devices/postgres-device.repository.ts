import type { Selectable } from 'kysely';
import type { CreateDeviceInput,UpdateDeviceInput,DeviceDto } from '@base/saphi';
import type { Database } from '../../lib/db-types.js';
import type { Tx } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { paginate,slice,type KeysetPage } from '../persistence/pagination.js';
const dto=(r:Selectable<Database['saphi.devices']>):DeviceDto=>({id:r.id,companyId:r.company_id,plotId:r.plot_id,code:r.code,
  providerCode:r.provider_code,externalDeviceId:r.external_device_id,status:r.status,metadata:r.metadata,version:Number(r.version),
  createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
export class PostgresDeviceRepository {
  constructor(private readonly tx:Tx){}
  async list(companyId:string,page:KeysetPage,plotId?:string){
    let query=this.tx.selectFrom('saphi.devices').selectAll().where('company_id','=',companyId);
    if(plotId)query=query.where('plot_id','=',plotId);if(page.status)query=query.where('status','=',page.status);
    return slice(await paginate(query,page).execute(),page.limit,dto);
  }
  async find(companyId:string,id:string){const row=await this.tx.selectFrom('saphi.devices').selectAll().where('company_id','=',companyId).where('id','=',id).executeTakeFirst();return row?dto(row):null;}
  async create(companyId:string,input:CreateDeviceInput){return dto(await this.tx.insertInto('saphi.devices').values({company_id:companyId,plot_id:input.plotId,
    code:input.code,provider_code:input.providerCode,external_device_id:input.externalDeviceId,status:input.status,metadata:JSON.stringify(input.metadata)}).returningAll().executeTakeFirstOrThrow());}
  async update(companyId:string,id:string,input:UpdateDeviceInput){
    const row=await this.tx.updateTable('saphi.devices').set({status:input.status,...(input.metadata?{metadata:JSON.stringify(input.metadata)}:{})})
      .where('company_id','=',companyId).where('id','=',id).where('version','=',String(input.expectedVersion)).returningAll().executeTakeFirst();
    if(!row)throw new AppError(409,'VERSION_CONFLICT');return dto(row);
  }
}
