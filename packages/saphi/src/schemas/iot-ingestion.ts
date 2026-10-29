import {z} from 'zod';
import {sampleInstantSchema} from './soil-samples.js';
const measurement=(unit:string)=>z.strictObject({value:z.number().finite(),unit:z.literal(unit)});
/** Pilot transport contract; temperature location is resolved from the approved device binding. */
export const iotPayloadSchema=z.strictObject({schemaVersion:z.literal(1),messageId:z.guid(),
  deviceId:z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/),timestamp:sampleInstantSchema,
  measurements:z.strictObject({temperature:measurement('C').optional(),soilMoisture:measurement('%').optional()})
    .refine(v=>v.temperature!==undefined||v.soilMoisture!==undefined,'At least one measurement is required'),
  source:z.enum(['simulator','device']),
});
/** Only a broker-created envelope, never a public HTTP request. IAM restricts the invoker. */
export const iotEnvelopeSchema=z.strictObject({payload:iotPayloadSchema,broker:z.strictObject({
  accountId:z.string().regex(/^\d{12}$/),principal:z.string().regex(/^[a-f0-9]{64}$/),
  clientId:z.string().min(1).max(128),topic:z.string().min(1).max(256),receivedAt:z.number().int().positive(),
})});
export type IotEnvelope=z.infer<typeof iotEnvelopeSchema>;
