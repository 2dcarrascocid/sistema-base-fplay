import { z } from 'zod';
import { SAPHI_PERMISSIONS } from '../constants/permissions.js';
import { entityIdSchema, nameSchema, statusSchema, versionSchema } from './common.js';
import { companyRutSchema } from './masters.js';

export const reasonSchema = z.string().trim().min(1).max(500);
export const permissionsSchema = z.array(z.enum(SAPHI_PERMISSIONS)).max(SAPHI_PERMISSIONS.length)
  .refine((keys) => new Set(keys).size === keys.length, 'Duplicate permissions');
const contact = {
  tradeName: nameSchema.nullable().optional(),
  contactEmail: z.email().max(254).nullable().optional(),
  contactPhone: z.string().trim().min(1).max(40).nullable().optional(),
};
export const createCompanySchema = z.strictObject({
  rut: companyRutSchema, legalName: nameSchema, ...contact,
  initialUserId: entityIdSchema, initialPermissions: permissionsSchema, reason: reasonSchema,
});
export const updateCompanySchema = z.strictObject({
  expectedVersion: versionSchema, legalName: nameSchema.optional(), ...contact,
  status: statusSchema.optional(), reason: reasonSchema,
}).refine(({ expectedVersion: _v, reason: _r, ...changes }) => Object.values(changes).some((v) => v !== undefined), 'At least one change is required');
export const membershipSchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), status: statusSchema, reason: reasonSchema,
});
export const membershipPermissionsSchema = z.strictObject({
  expectedVersion: versionSchema, permissions: permissionsSchema, reason: reasonSchema,
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type MembershipInput = z.infer<typeof membershipSchema>;
export type MembershipPermissionsInput = z.infer<typeof membershipPermissionsSchema>;
