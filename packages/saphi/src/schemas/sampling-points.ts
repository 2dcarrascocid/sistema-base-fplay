import { z } from 'zod';
import { codeSchema, entityIdSchema, statusSchema, versionSchema } from './common.js';

export const pointSchema = z.strictObject({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});
export const createSamplingPointSchema = z.strictObject({
  plotId: entityIdSchema, code: codeSchema, location: pointSchema, status: statusSchema.default('active'),
});
export const updateSamplingPointSchema = z.strictObject({
  expectedVersion: versionSchema, location: pointSchema.optional(), status: statusSchema.optional(),
}).refine((v) => v.location !== undefined || v.status !== undefined, 'At least one change is required');
export type CreateSamplingPointInput = z.infer<typeof createSamplingPointSchema>;
export type UpdateSamplingPointInput = z.infer<typeof updateSamplingPointSchema>;
