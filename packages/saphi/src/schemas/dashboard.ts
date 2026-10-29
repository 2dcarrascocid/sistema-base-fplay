import { z } from 'zod';
import { entityIdSchema } from './common.js';
import { sampleInstantSchema } from './soil-samples.js';
export const dashboardQuerySchema = z.strictObject({
  from: sampleInstantSchema, to: sampleInstantSchema, plotId: entityIdSchema.optional(),
}).refine(v => v.from < v.to, { path: ['to'], message: 'from must precede to' });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
