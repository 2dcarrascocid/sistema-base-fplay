import type { Selectable } from 'kysely';
import type { ReadingDto } from '@base/saphi';
import type { Database } from '../../lib/db-types.js';
import type { Tx } from '../../lib/db.js';
import { badRequest } from '../../lib/errors.js';
import { paginate,slice,type KeysetPage } from '../persistence/pagination.js';
const dto=(r:Selectable<Database['saphi.sensor_readings']>):ReadingDto=>({id:r.id,companyId:r.company_id,deviceId:r.device_id,
  metricCode:r.metric_code,value:r.value,unitCode:r.unit_code,observedAt:r.observed_at.toISOString(),receivedAt:r.received_at.toISOString(),qualityCode:r.quality_code});
export class PostgresReadingRepository {
  constructor(private readonly tx:Tx){}
  private query(companyId:string,deviceId:string,metricCode?:string){
    let query=this.tx.selectFrom('saphi.sensor_readings').selectAll().where('company_id','=',companyId).where('device_id','=',deviceId);
    if(metricCode)query=query.where('metric_code','=',metricCode);return query;
  }
  async history(companyId:string,page:KeysetPage,filters:{deviceId:string;metricCode?:string|undefined;from:string;to:string}){
    const query=this.query(companyId,filters.deviceId,filters.metricCode).where('observed_at','>=',new Date(filters.from)).where('observed_at','<',new Date(filters.to));
    return slice(await paginate(query,page,undefined,'observed_at').execute(),page.limit,dto);
  }
  async latest(companyId:string,deviceId:string,metricCode?:string){
    const rows=await this.query(companyId,deviceId,metricCode).distinctOn('metric_code').orderBy('metric_code').orderBy('observed_at','desc').orderBy('id','desc').limit(101).execute();
    if(rows.length>100)throw badRequest('VALIDATION_ERROR');return rows.map(dto);
  }
}
