import { z } from 'zod';
import { entityIdSchema,paginationSchema } from './common.js';
import { sampleInstantSchema } from './soil-samples.js';
export const satelliteQuerySchema=paginationSchema.extend({plotId:entityIdSchema,from:sampleInstantSchema,to:sampleInstantSchema})
  .refine(value=>value.from<value.to,{message:'from must precede to',path:['to']});
/** Download accepts authorized opaque IDs in the path, never a client-selected destination. */
export const satelliteAssetQuerySchema=z.strictObject({});
