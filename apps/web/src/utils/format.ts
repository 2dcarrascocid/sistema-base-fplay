import type { StatusTone } from '@base/ui';
import type { UserStatus } from '../services/types';

export function fullName(user: { first_name: string; last_name: string; second_last_name?: string | null }): string {
  return [user.first_name, user.last_name, user.second_last_name].filter(Boolean).join(' ');
}

export function initials(user: { first_name: string; last_name: string }): string {
  return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
}

export function formatDateTime(value: string | Date | null | undefined, locale: string, timeZone?: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(
    typeof value === 'string' ? new Date(value) : value,
  );
}

export function isLocked(user: { locked_until: string | null }, now = Date.now()): boolean {
  return user.locked_until !== null && new Date(user.locked_until).getTime() > now;
}

/** Status shown for a user: a lock takes precedence over the account status. */
export function userState(user: { status: UserStatus; locked_until: string | null }, now = Date.now()): UserStatus | 'locked' {
  return isLocked(user, now) ? 'locked' : user.status;
}

export function stateTone(state: UserStatus | 'locked'): StatusTone {
  return { active: 'success', invited: 'info', inactive: 'neutral', locked: 'error' }[state] as StatusTone;
}

/** Saves a Blob as a file (CSV export). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
