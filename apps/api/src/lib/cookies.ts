/** Cookie names. __Secure- requires the Secure attribute (HTTPS only). */
export const COOKIES = {
  refresh: '__Secure-bf_rt',
  csrf: '__Secure-bf_csrf',
  oauth: '__Secure-bf_oauth',
} as const;

export const COOKIE_PATHS = {
  refresh: '/api/auth',
  csrf: '/',
  oauth: '/api/auth/federated',
} as const;

export interface CookieOptions {
  path: string;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax';
  /** Seconds; 0 deletes the cookie. Omitted = session cookie. */
  maxAge?: number;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path}`, 'Secure', `SameSite=${options.sameSite}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

export function clearCookie(name: string, options: Omit<CookieOptions, 'maxAge'>): string {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // malformed value: ignore the cookie
    }
  }
  return cookies;
}
