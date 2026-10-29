import {describe,it,expect} from 'vitest';
import {iotEnvelopeSchema} from './iot-ingestion.js';
const e={payload:{schemaVersion:1,messageId:'11111111-1111-4111-8111-111111111111',deviceId:'sensor-piloto-001',timestamp:'2026-10-28T15:00:00Z',source:'simulator',measurements:{temperature:{value:19.5,unit:'C'}}},broker:{accountId:'123456789012',principal:'a'.repeat(64),clientId:'sensor-piloto-001',topic:'sensores/telemetria',receivedAt:1793200000000}};
describe('broker envelope',()=>{
 it('requires authenticated metadata and strict units without accepting a tenant selector',()=>{
  expect(iotEnvelopeSchema.safeParse(e).success).toBe(true);
  for(const value of [{...e,companyId:'untrusted'},{payload:e.payload},{...e,payload:{...e.payload,measurements:{}}},{...e,payload:{...e.payload,measurements:{temperature:{value:NaN,unit:'C'}}}}])expect(iotEnvelopeSchema.safeParse(value).success).toBe(false);
 });
});
