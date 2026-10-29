import {createHash} from 'node:crypto';
import {sql} from 'kysely';
import {iotEnvelopeSchema,type IotEnvelope} from '@base/saphi';
import type {Db} from '../../../lib/db.js';
export interface IngestionStore {persist(event:IotEnvelope,hash:string):Promise<'accepted'|'duplicate'>}
/** Canonical fields in fixed order. Payload property insertion order must not change identity. */
export function payloadHash(event:IotEnvelope):string{
  const p=event.payload;
  return createHash('sha256').update(JSON.stringify([p.schemaVersion,p.messageId,p.deviceId,p.timestamp,p.source,
    p.measurements.temperature?[p.measurements.temperature.value,'C']:null,
    p.measurements.soilMoisture?[p.measurements.soilMoisture.value,'%']:null])).digest('hex');
}
export async function ingest(event:unknown,store:IngestionStore){
  const parsed=iotEnvelopeSchema.safeParse(event);
  if(!parsed.success)return {status:'rejected' as const,code:'INVALID_EVENT'};
  try{return {status:await store.persist(parsed.data,payloadHash(parsed.data))};}
  catch(error){
    const code=(error as {code?:string}).code;
    if(code==='22023'||code==='23505'||code==='42501')return {status:'rejected' as const,code:'DEVICE_OR_MESSAGE_REJECTED'};
    // Throw transient failures so Lambda retries; never acknowledge a failed database write.
    throw new Error('IOT_PERSISTENCE_UNAVAILABLE');
  }
}
export function postgresIngestionStore(db:Db):IngestionStore{
  return {async persist(event,hash){
    const result=await sql<{status:'accepted'|'duplicate'}>`select saphi.ingest_iot(${JSON.stringify(event)}::jsonb,${hash}) as status`.execute(db);
    return result.rows[0]!.status;
  }};
}
