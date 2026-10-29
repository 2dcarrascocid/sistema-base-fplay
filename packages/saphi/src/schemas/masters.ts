import { isValidRut } from '@base/shared';
import { z } from 'zod';
import { codeSchema, entityIdSchema, nameSchema, positiveAreaSchema, statusSchema, versionSchema } from './common.js';

/** Canonical RUT only; normalization remains the caller's explicit operation. */
export const companyRutSchema = z.string().refine(isValidRut, 'Invalid RUT');

export const createFarmSchema = z.strictObject({
  code: codeSchema,
  name: nameSchema,
  areaHa: positiveAreaSchema.nullable().optional(),
  status: statusSchema.default('active'),
});

export const updateFarmSchema = z.strictObject({
  expectedVersion: versionSchema,
  name: nameSchema.optional(),
  areaHa: positiveAreaSchema.nullable().optional(),
  status: statusSchema.optional(),
}).refine((value) => value.name !== undefined || value.areaHa !== undefined || value.status !== undefined,
  'At least one change is required');

export const createPlotSchema = z.strictObject({
  farmId: entityIdSchema,
  code: codeSchema,
  name: nameSchema,
  areaHa: positiveAreaSchema.nullable().optional(),
  grapeVariety: nameSchema.nullable().optional(),
  plantingYear: z.number().int().min(1).max(9999).nullable().optional(),
  soilType: nameSchema.nullable().optional(),
  status: statusSchema.default('active'),
});

export const updatePlotSchema = z.strictObject({
  expectedVersion: versionSchema,
  name: nameSchema.optional(),
  areaHa: positiveAreaSchema.nullable().optional(),
  grapeVariety: nameSchema.nullable().optional(),
  plantingYear: z.number().int().min(1).max(9999).nullable().optional(),
  soilType: nameSchema.nullable().optional(),
  status: statusSchema.optional(),
}).refine(({ expectedVersion: _version, ...changes }) => Object.values(changes).some((value) => value !== undefined),
  'At least one change is required');

export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;
export type CreatePlotInput = z.infer<typeof createPlotSchema>;
export type UpdatePlotInput = z.infer<typeof updatePlotSchema>;
