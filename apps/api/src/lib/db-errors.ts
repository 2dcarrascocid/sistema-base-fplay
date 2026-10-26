import { AppError } from './errors.js';

/** Unique constraints whose violation is a normal user mistake (409 with a specific code). */
const CONFLICTS: Record<string, string> = {
  users_email_key: 'EMAIL_TAKEN',
  users_rut_key: 'RUT_TAKEN',
  profiles_name_key: 'NAME_TAKEN',
};

interface PgError {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
}

/**
 * Translates PostgreSQL errors that come from our own rules into client errors:
 * RLS / guard violations (42501), unique violations (23505) and the last-superuser rule.
 */
export function mapDbError(error: unknown): AppError | null {
  if (!error || typeof error !== 'object') return null;
  const { code, constraint, message } = error as PgError;
  if (code === '42501') return new AppError(403, 'FORBIDDEN');
  if (code === '23505') return new AppError(409, (typeof constraint === 'string' && CONFLICTS[constraint]) || 'CONFLICT');
  if (code === '23514' && typeof message === 'string' && message.includes('active superuser')) {
    return new AppError(409, 'LAST_SUPERUSER');
  }
  return null;
}
