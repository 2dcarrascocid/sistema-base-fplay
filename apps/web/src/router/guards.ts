import type { RouteLocationRaw } from 'vue-router';

export interface RouteMetaInfo {
  /** Reachable without a session (login, recovery, activation…). */
  public?: boolean;
  /** Public pages that make no sense once signed in (login). */
  guestOnly?: boolean;
  /** Permission needed to open the page ("menu:action"). */
  permission?: string;
}

export interface SessionView {
  status: 'unknown' | 'authenticated' | 'anonymous';
  pending: { passwordChange: boolean; mfaSetup: boolean };
  can(permission: string): boolean;
}

/** Only internal paths are accepted as post-login redirects (no open redirect). */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

/**
 * Navigation decision. The UI only hides what the user cannot use: the API authorizes every request.
 */
export function resolveNavigation(
  to: { name?: string | symbol | null | undefined; fullPath: string; meta: RouteMetaInfo },
  session: SessionView,
): true | RouteLocationRaw {
  const signedIn = session.status === 'authenticated';
  if (to.meta.public) return signedIn && to.meta.guestOnly ? { name: 'home' } : true;
  if (!signedIn) return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };

  if ((session.pending.passwordChange || session.pending.mfaSetup) && to.name !== 'account') {
    return { name: 'account', query: { tab: session.pending.passwordChange ? 'password' : 'mfa' } };
  }
  if (to.meta.permission && !session.can(to.meta.permission)) return { name: 'forbidden' };
  return true;
}
