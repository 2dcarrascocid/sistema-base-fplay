import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import { json, parse, type HttpResponse, type Request } from '../lib/http.js';
import { loadSecurityPolicy } from '../lib/security.js';

/** Same ranges as the CHECK constraints of app.security_policy (answered as 400 instead of a DB error). */
const PolicyBody = z
  .object({
    passwordMinLength: z.number().int().min(12).max(128),
    passwordRequireUpper: z.boolean(),
    passwordRequireLower: z.boolean(),
    passwordRequireDigit: z.boolean(),
    passwordRequireSymbol: z.boolean(),
    passwordMaxAgeDays: z.number().int().min(0).max(365),
    maxFailedAttempts: z.number().int().min(3).max(10),
    lockoutMinutes: z.number().int().min(1).max(1440),
    idleTimeoutMinutes: z.number().int().min(5).max(120),
    sessionMaxHours: z.number().int().min(1).max(720),
    invitationTtlHours: z.number().int().min(1).max(168),
    clientMfaRequired: z.boolean(),
  })
  .strict();

async function clientMfa(tx: Tx): Promise<boolean> {
  const role = await tx.selectFrom('app.roles').select('mfa_required').where('code', '=', 'client').executeTakeFirstOrThrow();
  return role.mfa_required;
}

export async function getPolicy(tx: Tx): Promise<HttpResponse> {
  const roles = await tx.selectFrom('app.roles').select(['code', 'mfa_required']).orderBy('rank').execute();
  return json({ policy: await loadSecurityPolicy(tx), roles });
}

export async function updatePolicy(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const body = parse(PolicyBody, request.body);
  const before = { ...(await loadSecurityPolicy(tx)), client_mfa_required: await clientMfa(tx) };
  const changes = {
    password_min_length: body.passwordMinLength,
    password_require_upper: body.passwordRequireUpper,
    password_require_lower: body.passwordRequireLower,
    password_require_digit: body.passwordRequireDigit,
    password_require_symbol: body.passwordRequireSymbol,
    password_max_age_days: body.passwordMaxAgeDays,
    max_failed_attempts: body.maxFailedAttempts,
    lockout_minutes: body.lockoutMinutes,
    idle_timeout_minutes: body.idleTimeoutMinutes,
    session_max_hours: body.sessionMaxHours,
    invitation_ttl_hours: body.invitationTtlHours,
  };
  await tx.updateTable('app.security_policy').set(changes).execute();
  await tx.updateTable('app.roles').set({ mfa_required: body.clientMfaRequired }).where('code', '=', 'client').execute();

  const after = { ...changes, client_mfa_required: body.clientMfaRequired };
  const changed = Object.keys(after).filter((key) => before[key as keyof typeof before] !== after[key as keyof typeof after]);
  if (changed.length > 0) {
    await audit(tx, originOf(request), {
      eventType: 'config.security_policy.update',
      result: 'success',
      actorUserId: actor.userId,
      entityType: 'security_policy',
      oldValue: Object.fromEntries(changed.map((key) => [key, before[key as keyof typeof before]])),
      newValue: Object.fromEntries(changed.map((key) => [key, after[key as keyof typeof after]])),
    });
  }
  return getPolicy(tx);
}
