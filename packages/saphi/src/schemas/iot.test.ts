import { describe,it,expect } from 'vitest';
import { createDeviceSchema,updateDeviceSchema,telemetryHistoryQuerySchema,telemetryLatestQuerySchema } from './iot.js';
const deviceId='11111111-1111-4111-8111-111111111111';
describe('IoT structural contracts without an invented catalogue',()=>{
 it('keeps external identity intact and accepts only descriptive metadata',()=>{
  const device=createDeviceSchema.parse({code:'D1',plotId:deviceId,providerCode:'test.provider',externalDeviceId:' A-1 ',metadata:{model:'Test'}});
  expect(device.externalDeviceId).toBe(' A-1 ');expect(device.status).toBe('active');
  for(const metadata of [{token:'secret'},[],{model:1},{model:'x'.repeat(101)}])expect(createDeviceSchema.safeParse({...device,metadata}).success).toBe(false);
 });
 it('requires an actual versioned state/metadata change and prohibits identity edits',()=>{
  expect(updateDeviceSchema.safeParse({expectedVersion:1}).success).toBe(false);
  expect(updateDeviceSchema.safeParse({expectedVersion:1,status:'inactive',externalDeviceId:'changed'}).success).toBe(false);
  expect(updateDeviceSchema.parse({expectedVersion:1,metadata:{}}).metadata).toEqual({});
 });
 it('requires a finite half-open period of at most 31 days',()=>{
  const query={deviceId,from:'2026-10-01T00:00:00Z',to:'2026-11-01T00:00:00Z'};
  expect(telemetryHistoryQuerySchema.safeParse(query).success).toBe(true);
  for(const patch of [{to:query.from},{to:'2026-11-02T00:00:00Z'},{deviceId:'bad'},{metricCode:'x;drop'}])expect(telemetryHistoryQuerySchema.safeParse({...query,...patch}).success).toBe(false);
  expect(telemetryHistoryQuerySchema.safeParse({deviceId}).success).toBe(false);
 });
 it('uses a separate latest query with no accepted write payload or arbitrary filters',()=>{
  expect(telemetryLatestQuerySchema.parse({deviceId,metricCode:'test.metric'}).metricCode).toBe('test.metric');
  expect(telemetryLatestQuerySchema.safeParse({deviceId,value:'1',companyId:deviceId}).success).toBe(false);
 });
});
