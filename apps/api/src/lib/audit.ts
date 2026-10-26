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

/** Appends to the immutable audit log. Old/new values go through the same redaction as logs. */
export async function audit(db: Db | Tx, origin: AuditOrigin, event: AuditEvent): Promise<void> {
  await db
    .insertInto('app.audit_log')
    .values({
      event_type: event.eventType,
      result: event.result,
      actor_user_id: event.actorUserId ?? null,
      actor_email: event.actorEmail ?? null,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      ip: origin.ip,
      user_agent: origin.userAgent,
      request_id: origin.requestId,
      old_value: event.oldValue === undefined ? null : JSON.stringify(redact(event.oldValue)),
      new_value: event.newValue === undefined ? null : JSON.stringify(redact(event.newValue)),
    })
    .execute();
}
