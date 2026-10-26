import { hasPermission, type PermissionKey, type Role } from '@base/shared';
import { sql } from 'kysely';
import { withActor, type Tx } from './db.js';
import type { ClientType } from './db-types.js';
import type { Deps } from './deps.js';
import { forbidden, unauthorized } from './errors.js';
import type { HttpResponse, Request, Route } from './http.js';
import { rejectionFor } from './security.js';

export interface Actor {
  userId: string;
  role: Role;
  sessionId: string;
  clientType: ClientType;
  cognitoSub: string;
  /** The caller's Cognito access token (needed for self-service Cognito calls). */
  accessToken: string;
  permissions: ReadonlySet<string>;
  /** Pending steps (only reachable on routes with allowPending). */
  mustChangePassword: boolean;
  mfaSetupRequired: boolean;
}

export type AuthedRoute = (request: Request, actor: Actor, tx: Tx) => Promise<HttpResponse>;

export interface AuthedOptions {
  /** Required permission; checked against the database on every request (no cache). */
  permission?: PermissionKey;
  /** Allowed while a password change or MFA setup is pending (Mi cuenta essentials). */
  allowPending?: boolean;
}

interface AuthenticationRow {
  outcome: string;
  user_id: string;
  role_code: Role;
  session_id: string;
  must_change_password: boolean;
  mfa_setup_required: boolean;
}

/**
 * Wraps a route with authentication and authorization:
 * 1. verifies the Cognito access token (signature, expiry, issuer, client);
 * 2. app.authenticate(): user active and unlocked, session not revoked/idle, role allowed for the client;
 * 3. loads the current permissions and checks the required one (403);
 * 4. runs the route in a transaction where RLS sees the user as the actor.
 */
export function authed(deps: Pick<Deps, 'db' | 'verifier' | 'config'>, route: AuthedRoute, options: AuthedOptions = {}): Route {
  return async (request) => {
    const header = request.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token) throw unauthorized('SESSION_INVALID');

    const claims = await deps.verifier.verifyAccess(token).catch(() => {
      throw unauthorized('SESSION_INVALID');
    });
    const { webClientId, mobileClientId } = deps.config.cognito;
    const clientType: ClientType | null =
      claims.clientId === webClientId ? 'web' : claims.clientId === mobileClientId ? 'mobile' : null;
    if (!clientType) throw unauthorized('SESSION_INVALID');

    // Separate statement (autocommit): revocations done by authenticate() persist even if we reject.
    const { rows } = await sql<AuthenticationRow>`
      select * from app.authenticate(${claims.sub}, ${claims.originJti}, ${clientType}, ${request.ip}::inet, ${request.userAgent})
    `.execute(deps.db);
    const auth = rows[0]!;
    const rejection = rejectionFor(auth.outcome);
    if (rejection) throw rejection;

    if (!options.allowPending) {
      if (auth.must_change_password) throw forbidden('PASSWORD_CHANGE_REQUIRED');
      if (auth.mfa_setup_required) throw forbidden('MFA_SETUP_REQUIRED');
    }

    return withActor(deps.db, auth.user_id, async (tx) => {
      const granted = await sql<{ menu_code: string; action_code: string }>`
        select menu_code, action_code from app.current_permissions()
      `.execute(tx);
      const permissions = new Set(granted.rows.map((p) => `${p.menu_code}:${p.action_code}`));
      if (options.permission && !hasPermission(auth.role_code, permissions, options.permission)) {
        throw forbidden();
      }
      return route(
        request,
        {
          userId: auth.user_id,
          role: auth.role_code,
          sessionId: auth.session_id,
          clientType,
          cognitoSub: claims.sub,
          accessToken: token,
          permissions,
          mustChangePassword: auth.must_change_password,
          mfaSetupRequired: auth.mfa_setup_required,
        },
        tx,
      );
    });
  };
}
