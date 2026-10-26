import type { PermissionKey } from '@base/shared';
import { authed, type AuthedRoute } from '../lib/authenticate.js';
import type { Deps } from '../lib/deps.js';
import type { Route } from '../lib/http.js';
import {
  createProfile,
  duplicateProfile,
  getProfile,
  listProfiles,
  permissionCatalog,
  profileUsers,
  setProfileActive,
  setProfilePermissions,
  updateProfile,
} from './profiles.js';
import {
  createUser,
  exportUsers,
  getUser,
  listRoles,
  listUsers,
  resendInvitation,
  resetUserPassword,
  revokeUserSessions,
  setUserProfiles,
  setUserStatus,
  unlockUser,
  updateUser,
  userPermissions,
} from './users.js';

/** User and profile maintainers (database role: app_api). Every route requires a permission. */
export function adminRoutes(deps: Deps): Record<string, Route> {
  const route = (permission: PermissionKey, handler: AuthedRoute) => authed(deps, handler, { permission });

  return {
    'GET /admin/roles': route('security.users:view', (_r, _a, tx) => listRoles(tx)),
    'GET /admin/users': route('security.users:view', (r, _a, tx) => listUsers(r, tx)),
    'GET /admin/users/export': route('security.users:export', exportUsers),
    'GET /admin/users/{id}': route('security.users:view', (r, _a, tx) => getUser(r, tx)),
    'GET /admin/users/{id}/permissions': route('security.users:view', (r, _a, tx) => userPermissions(r, tx)),
    'POST /admin/users': route('security.users:create', (r, a, tx) => createUser(deps, r, a, tx)),
    'PATCH /admin/users/{id}': route('security.users:edit', updateUser),
    'PUT /admin/users/{id}/profiles': route('security.users:edit', setUserProfiles),
    'POST /admin/users/{id}/activate': route('security.users:edit', (r, a, tx) => setUserStatus(deps, r, a, tx, 'active')),
    'POST /admin/users/{id}/deactivate': route('security.users:edit', (r, a, tx) => setUserStatus(deps, r, a, tx, 'inactive')),
    'POST /admin/users/{id}/unlock': route('security.users:unlock', unlockUser),
    'POST /admin/users/{id}/reset-password': route('security.users:reset_password', (r, a, tx) => resetUserPassword(deps, r, a, tx)),
    'POST /admin/users/{id}/revoke-sessions': route('security.users:revoke_sessions', (r, a, tx) => revokeUserSessions(deps, r, a, tx)),
    'POST /admin/users/{id}/invitation': route('security.users:create', (r, a, tx) => resendInvitation(deps, r, a, tx)),

    'GET /admin/permission-catalog': route('security.profiles:view', (_r, a, tx) => permissionCatalog(a, tx)),
    'GET /admin/profiles': route('security.profiles:view', (r, _a, tx) => listProfiles(r, tx)),
    'GET /admin/profiles/{id}': route('security.profiles:view', (r, _a, tx) => getProfile(r, tx)),
    'GET /admin/profiles/{id}/users': route('security.profiles:view', profileUsers),
    'POST /admin/profiles': route('security.profiles:create', createProfile),
    'PATCH /admin/profiles/{id}': route('security.profiles:edit', updateProfile),
    'PUT /admin/profiles/{id}/permissions': route('security.profiles:edit', setProfilePermissions),
    'POST /admin/profiles/{id}/duplicate': route('security.profiles:create', duplicateProfile),
    'POST /admin/profiles/{id}/activate': route('security.profiles:edit', (r, a, tx) => setProfileActive(r, a, tx, true)),
    'POST /admin/profiles/{id}/deactivate': route('security.profiles:delete', (r, a, tx) => setProfileActive(r, a, tx, false)),
  };
}
