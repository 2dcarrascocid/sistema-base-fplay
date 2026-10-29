import { z } from 'zod';

// Base Fairplay also has fixed UUID seeds without RFC version/variant bits.
export const entityIdSchema = z.guid();
export const versionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const statusSchema = z.enum(['active', 'inactive']);
export const nameSchema = z.string().trim().min(1).max(200);
export const codeSchema = z.string().trim().min(1).max(64);

/** Decimal strings preserve precision across JSON/pg; no agronomic range is implied. */
export const positiveAreaSchema = z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/)
  .refine((value) => /[1-9]/.test(value), 'Area must be positive');

export const paginationSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  // Opaque input only: verification/signing belongs to the future server implementation.
  cursor: z.string().min(1).max(2048).optional(),
});

export const companyScopeSchema = z.strictObject({ companyId: entityIdSchema });
