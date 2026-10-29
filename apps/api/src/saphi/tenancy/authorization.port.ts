import type { CompanyScope, SaphiPermission } from '@base/saphi';

/** Obtained from Base Fairplay's authenticated actor, never from request.body. */
export interface SaphiActor { readonly userId: string }

/**
 * Phase 3 adapter must check active membership/company AND global/contextual permission
 * inside the existing actor transaction, then set transaction-local company context.
 * No implementation is provided before the schema and RLS exist.
 */
export interface CompanyAuthorization {
  requirePermission(actor: SaphiActor, scope: CompanyScope, permission: SaphiPermission): Promise<void>;
}
