import {describe,it,expect,beforeAll,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {ingest,payloadHash,postgresIngestionStore} from '../../src/saphi/integrations/iot/ingest.js';
import {iotEnvelopeSchema} from '@base/saphi';
import {computeRutCheckDigit} from '@base/shared';
import {apiDb,authDb,ownerDb} from '../helpers.js';
const company=randomUUID(),farm=randomUUID(),plot=randomUUID(),device=randomUUID(),binding=randomUUID();
const event=()=>({payload:{schemaVersion:1 as const,messageId:randomUUID(),deviceId:'sensor-piloto-001',timestamp:new Date().toISOString(),
 measurements:{temperature:{value:19.5,unit:'C' as const},soilMoisture:{value:28.4,unit:'%' as const}},source:'simulator' as const},
 broker:{accountId:'123456789012',principal:'a'.repeat(64),clientId:'sensor-piloto-001',topic:'sensores/telemetria',receivedAt:Date.now()}});
const store=postgresIngestionStore(ownerDb);
beforeAll(async()=>{
 await sql`insert into saphi.companies(id,rut,legal_name) values(${company}::uuid,${'99111601-'+computeRutCheckDigit('99111601')},'IoT isolated integration')`.execute(ownerDb);
 await sql`insert into saphi.farms(id,company_id,code,name) values(${farm}::uuid,${company}::uuid,'IOT-F','Test farm')`.execute(ownerDb);
 await sql`insert into saphi.plots(id,company_id,farm_id,code,name) values(${plot}::uuid,${company}::uuid,${farm}::uuid,'IOT-P','Test plot')`.execute(ownerDb);
 await sql`insert into saphi.devices(id,company_id,plot_id,code,provider_code,external_device_id) values(${device}::uuid,${company}::uuid,${plot}::uuid,'IOT-D','aws.iot','sensor-piloto-001')`.execute(ownerDb);
 await sql`insert into saphi.iot_bindings(id,company_id,device_id,account_id,principal,client_id,external_device_id,topic,temperature_metric,max_past_seconds,max_future_seconds)
 values(${binding}::uuid,${company}::uuid,${device}::uuid,'123456789012',${'a'.repeat(64)},'sensor-piloto-001','sensor-piloto-001','sensores/telemetria','temperature.unspecified',86400,300)`.execute(ownerDb);
});
describe('AWS IoT ingestion',()=>{
 it('validates strict envelopes, units, dates and rejects tenant injection before persistence',async()=>{
  const persist=vi.fn();for(const value of [null,{...event(),companyId:company},{...event(),payload:{...event().payload,companyId:company}},
   {...event(),payload:{...event().payload,timestamp:'bad'}},{...event(),payload:{...event().payload,measurements:{temperature:{value:1,unit:'F'}}}}]){
   expect(await ingest(value,{persist})).toEqual({status:'rejected',code:'INVALID_EVENT'});
  }expect(persist).not.toHaveBeenCalled();
 });
 it('writes a whole message, marks demo data, deduplicates concurrently and detects conflicts',async()=>{
  const e=event();const results=await Promise.all([ingest(e,store),ingest(e,store)]);
  expect(results.map(r=>r.status).sort()).toEqual(['accepted','duplicate']);
  const rows=await sql<{company_id:string;quality_code:string;metric_code:string;value:string}>`select company_id,quality_code,metric_code,value from saphi.sensor_readings where device_id=${device}::uuid and source_message_id=${e.payload.messageId}`.execute(ownerDb);
  expect(rows.rows).toHaveLength(2);expect(rows.rows.every(r=>r.company_id===company&&r.quality_code==='demo.simulator')).toBe(true);
  expect(rows.rows.find(r=>r.metric_code==='temperature.unspecified')?.value).toBe('19.5');
  expect((await ingest({...e,payload:{...e.payload,measurements:{temperature:{value:99,unit:'C'}}}},store)).status).toBe('rejected');
 });
 it('rejects forged broker identities, unknown devices, wrong topics, inactive bindings and stale clocks',async()=>{
  for(const patch of [{principal:'b'.repeat(64)},{accountId:'222222222222'},{clientId:'other'},{topic:'sensores/other/telemetria'}]){
   const e=event();expect((await ingest({...e,broker:{...e.broker,...patch}},store)).status).toBe('rejected');
  }
  const e=event();expect((await ingest({...e,payload:{...e.payload,deviceId:'unknown'}},store)).status).toBe('rejected');
  expect((await ingest({...e,payload:{...e.payload,timestamp:'2000-01-01T00:00:00Z'}},store)).status).toBe('rejected');
  await sql`update saphi.iot_bindings set active=false where id=${binding}::uuid`.execute(ownerDb);
  expect((await ingest(event(),store)).status).toBe('rejected');
  await sql`update saphi.iot_bindings set active=true where id=${binding}::uuid`.execute(ownerDb);
  await sql`update saphi.devices set status='inactive' where id=${device}::uuid`.execute(ownerDb);
  expect((await ingest(event(),store)).status).toBe('rejected');
  await sql`update saphi.devices set status='active' where id=${device}::uuid`.execute(ownerDb);
 });
 it('does not grant human writes or service reads; the service can only call the narrow function',async()=>{
  for(const db of [apiDb,authDb])await expect(sql`select saphi.ingest_iot(${JSON.stringify(event())}::jsonb,${'a'.repeat(64)})`.execute(db)).rejects.toMatchObject({code:'42501'});
  await ownerDb.transaction().execute(async tx=>{
   await sql`grant saphi_ingest to postgres with set true`.execute(tx);
   await sql`set local role saphi_ingest`.execute(tx);
   const e=event();const result=await sql<{status:string}>`select saphi.ingest_iot(${JSON.stringify(e)}::jsonb,${payloadHash(iotEnvelopeSchema.parse(e))}) as status`.execute(tx);
   expect(result.rows[0]?.status).toBe('accepted');
   await sql`reset role`.execute(tx);
   await sql`revoke saphi_ingest from postgres`.execute(tx);
  });
  const rights=await sql<{allowed:boolean}>`select has_table_privilege('saphi_ingest','saphi.sensor_readings','select') as allowed`.execute(ownerDb);expect(rights.rows[0]?.allowed).toBe(false);
  expect((await sql<{allowed:boolean}>`select has_table_privilege('app_api','saphi.sensor_readings','insert') as allowed`.execute(ownerDb)).rows[0]?.allowed).toBe(false);
 });
 it('rolls back receipts on invalid measurements and throws retryable persistence failures',async()=>{
  const e=event();const bad={...e,payload:{...e.payload,measurements:{temperature:{value:1,unit:'F'}}}};
  await expect(sql`select saphi.ingest_iot(${JSON.stringify(bad)}::jsonb,${'a'.repeat(64)})`.execute(ownerDb)).rejects.toMatchObject({code:'22023'});
  const count=await sql<{n:number}>`select count(*)::int n from saphi.iot_receipts where id=${e.payload.messageId}::uuid`.execute(ownerDb);expect(count.rows[0]?.n).toBe(0);
  await expect(sql`update saphi.iot_bindings set company_id=${randomUUID()}::uuid where id=${binding}::uuid`.execute(ownerDb)).rejects.toMatchObject({code:'42501'});
  const version=await sql<{version:string}>`select version from saphi.iot_bindings where id=${binding}::uuid`.execute(ownerDb);
  expect(Number(version.rows[0]?.version)).toBeGreaterThan(1);
  await expect(ingest(e,{persist:async()=>{throw new Error('private database details');}})).rejects.toThrow('IOT_PERSISTENCE_UNAVAILABLE');
 });
});
