import { validatePassword, type PasswordPolicy } from '@base/shared';
import { sql } from 'kysely';
import { COOKIES } from './cookies.js';
import { safeEqual } from './crypto.js';
import type { Db, Tx } from './db.js';
import type { SecurityPolicy } from './db-types.js';
import { AppError, badRequest, forbidden, tooManyRequests } from './errors.js';
import type { Request } from './http.js';
import type { BreachedPasswordChecker, CaptchaVerifier } from './ports.js';

/** Fixed-window rate limit kept in PostgreSQL (complements the WAF rate rule). */
export async function enforceRateLimit(db: Db | Tx, key: string, windowSeconds: number, maxHits: number): Promise<void> {
  const { rows } = await sql<{ allowed: boolean }>`
    select app.hit_rate_limit(${key}, ${windowSeconds}, ${maxHits}) as allowed
  `.execute(db);
  if (!rows[0]?.allowed) throw tooManyRequests();
}

export async function requireCaptcha(captcha: CaptchaVerifier, token: string, ip: string): Promise<void> {
  if (!(await captcha.verify(token, ip))) throw badRequest('CAPTCHA_FAILED');
}

export async function loadSecurityPolicy(db: Db | Tx): Promise<SecurityPolicy> {
  return db.selectFrom('app.security_policy').selectAll().executeTakeFirstOrThrow();
}

export function toPasswordPolicy(policy: SecurityPolicy): PasswordPolicy {
  return {
    minLength: policy.password_min_length,
    requireUpper: policy.password_require_upper,
    requireLower: policy.password_require_lower,
    requireDigit: policy.password_require_digit,
    requireSymbol: policy.password_require_symbol,
  };
}

/** Policy + breached-password check (ASVS 2.1.1–2.1.9). Throws 400 PASSWORD_POLICY with rule codes. */
export async function assertAcceptablePassword(
  db: Db | Tx,
  breached: BreachedPasswordChecker,
  password: string,
  email?: string,
): Promise<void> {
  const errors: string[] = validatePassword(password, toPasswordPolicy(await loadSecurityPolicy(db)), email);
  if (errors.length === 0 && (await breached.isBreached(password))) errors.push('breached');
  if (errors.length > 0) throw badRequest('PASSWORD_POLICY', errors);
}

/**
 * CSRF defence for the cookie-authenticated endpoints (refresh, logout):
 * allowed Origin + double-submit token (cookie must equal the X-CSRF-Token header).
 */
export function assertCsrf(request: Request, allowedOrigin: string): void {
  const origin = request.headers['origin'];
  if (origin !== allowedOrigin) throw forbidden('CSRF_ORIGIN');
  const cookie = request.cookies[COOKIES.csrf];
  const header = request.headers['x-csrf-token'];
  if (!cookie || !header || !safeEqual(cookie, header)) throw forbidden('CSRF_TOKEN');
}

/** Maps app.authenticate() outcomes that reject the request. */
export function rejectionFor(outcome: string): AppError | null {
  switch (outcome) {
    case 'ok':
      return null;
    case 'role_not_allowed':
      return forbidden('ROLE_NOT_ALLOWED');
    default:
      return new AppError(401, 'SESSION_INVALID');
  }
}
