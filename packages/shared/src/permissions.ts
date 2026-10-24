/**
 * Permission keys are "<menu.code>:<action.code>", e.g. "security.users:unlock".
 * Codes must match the seed data in supabase/seed.sql.
 */

export const ROLES = ['superuser', 'admin', 'client'] as const;
export type Role = (typeof ROLES)[number];

export const STANDARD_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export const SPECIAL_ACTIONS = ['unlock', 'reset_password', 'revoke_sessions'] as const;
export type ActionCode = (typeof STANDARD_ACTIONS)[number] | (typeof SPECIAL_ACTIONS)[number];

export const MENUS = {
  users: 'security.users',
  profiles: 'security.profiles',
  audit: 'security.audit',
  settings: 'config.settings',
  menus: 'config.menus',
  securityPolicy: 'config.security_policy',
  emailTemplates: 'config.email_templates',
} as const;

const CODE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export type PermissionKey = `${string}:${string}`;

export function permissionKey(menuCode: string, actionCode: string): PermissionKey {
  if (!CODE.test(menuCode) || !CODE.test(actionCode)) {
    throw new Error('Invalid menu or action code');
  }
  return `${menuCode}:${actionCode}`;
}

export function parsePermissionKey(key: string): { menuCode: string; actionCode: string } | null {
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  const [menuCode, actionCode] = parts as [string, string];
  if (!CODE.test(menuCode) || !CODE.test(actionCode)) return null;
  return { menuCode, actionCode };
}

/** Superusers hold every permission implicitly; everyone else needs the explicit key. */
export function hasPermission(role: Role, granted: ReadonlySet<string>, key: PermissionKey): boolean {
  return role === 'superuser' || granted.has(key);
}

/** Returns the keys the actor is not allowed to grant (empty array = allowed). */
export function ungrantablePermissions(
  actorRole: Role,
  actorGranted: ReadonlySet<string>,
  requested: Iterable<string>,
): string[] {
  if (actorRole === 'superuser') return [];
  if (actorRole !== 'admin') return [...requested];
  return [...requested].filter((key) => !actorGranted.has(key));
}
