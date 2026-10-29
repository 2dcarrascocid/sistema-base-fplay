import { z } from 'zod';
import { codeSchema,entityIdSchema,paginationSchema,statusSchema,versionSchema } from './common.js';
import { sampleInstantSchema } from './soil-samples.js';
export const deviceMetadataSchema=z.strictObject({
  manufacturer:z.string().trim().min(1).max(100).optional(),model:z.string().trim().min(1).max(100).optional(),
  serialNumber:z.string().trim().min(1).max(100).optional(),
});
export const createDeviceSchema=z.strictObject({plotId:entityIdSchema,code:codeSchema,
  providerCode:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  externalDeviceId:z.string().min(1).max(200).refine(value=>value.trim().length>0),
  metadata:deviceMetadataSchema.default({}),status:statusSchema.default('active'),
});
export const updateDeviceSchema=z.strictObject({expectedVersion:versionSchema,status:statusSchema.optional(),metadata:deviceMetadataSchema.optional()})
  .refine(value=>value.status!==undefined||value.metadata!==undefined,'At least one change is required');
export const metricCodeSchema=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/);
export const telemetryLatestQuerySchema=z.strictObject({deviceId:entityIdSchema,metricCode:metricCodeSchema.optional()});
export const telemetryHistoryQuerySchema=paginationSchema.extend({deviceId:entityIdSchema,metricCode:metricCodeSchema.optional(),from:sampleInstantSchema,to:sampleInstantSchema})
  .refine(v=>v.from<v.to&&Date.parse(v.to)-Date.parse(v.from)<=31*86400000,{message:'Use a nonempty period of at most 31 days',path:['to']});
export type DeviceMetadata=z.infer<typeof deviceMetadataSchema>;
export type CreateDeviceInput=z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput=z.infer<typeof updateDeviceSchema>;
