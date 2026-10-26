import { sql } from 'kysely';
import type { Db, Tx } from './db.js';
import type { Request } from './http.js';
import { redact } from './logger.js';

export interface AuditEvent {
  eventType: string;
  result: 'success' | 'failure';
  actorUserId?: string | null;
  actorEmail?: string | null;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/** Request metadata recorded with every audit row (null for Cognito triggers). */
export interface AuditOrigin {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const originOf = (request: Request): AuditOrigin => ({
  ip: request.ip,
  userAgent: request.userAgent || null,
  requestId: request.requestId,
});

export const NO_ORIGIN: AuditOrigin = { ip: null, userAgent: null, requestId: null };

/**
 * Secrets never stored in audit values. Narrower than the log redaction: audit entries legitimately
 * contain keys such as "code" (menu and action codes) or "sessions" (revoked session ids).
 */
const AUDIT_SENSITIVE = /pass(word)?|token|secret|authorization|cookie|otp|verifier/i;

/** Appends to the immutable audit log. */
export async function audit(db: Db | Tx, origin: AuditOrigin, event: AuditEvent): Promise<void> {
  await db
    .insertInto('app.audit_log')
    .values({
      event_type: event.eventType,
      result: event.result,
      actor_user_id: event.actorUserId ?? null,
      // The actor email is copied into the row so the audit screen never needs to read app.users.
      actor_email:
        event.actorEmail ??
        (event.actorUserId ? sql<string>`(select email from app.users where id = ${event.actorUserId})` : null),
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      ip: origin.ip,
      user_agent: origin.userAgent,
      request_id: origin.requestId,
      old_value: event.oldValue === undefined ? null : JSON.stringify(redact(event.oldValue, 0, AUDIT_SENSITIVE)),
      new_value: event.newValue === undefined ? null : JSON.stringify(redact(event.newValue, 0, AUDIT_SENSITIVE)),
    })
    .execute();
}
