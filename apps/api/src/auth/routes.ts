import type { Deps } from '../lib/deps.js';
import type { Route } from '../lib/http.js';
import { callback, start } from './federated.js';
import { accept, register } from './invitation.js';
import { challenge, login, mfaSetup } from './login.js';
import { forgot, reset } from './password.js';
import { publicConfig } from './public-config.js';
import { logout, refresh } from './session.js';

/** Public auth endpoints (database role: app_auth). */
export function authRoutes(deps: Deps): Record<string, Route> {
  return {
    'GET /auth/config': () => publicConfig(deps),
    'POST /auth/login': (request) => login(deps, request),
    'POST /auth/challenge': (request) => challenge(deps, request),
    'POST /auth/mfa/setup': (request) => mfaSetup(deps, request),
    'POST /auth/refresh': (request) => refresh(deps, request),
    'POST /auth/logout': (request) => logout(deps, request),
    'GET /auth/federated/{provider}/start': (request) => start(deps, request),
    'GET /auth/federated/callback': (request) => callback(deps, request),
    'POST /auth/password/forgot': (request) => forgot(deps, request),
    'POST /auth/password/reset': (request) => reset(deps, request),
    'POST /auth/invitations/accept': (request) => accept(deps, request),
    'POST /auth/register': (request) => register(deps, request),
  };
}
