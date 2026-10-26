import { createHash } from 'node:crypto';
import { logger } from './logger.js';
import type { BreachedPasswordChecker, CaptchaVerifier } from './ports.js';

const TIMEOUT_MS = 3_000;

/** Cloudflare Turnstile server-side validation. */
export function turnstileVerifier(secret: string, expectedHostname: string | undefined, fetchFn = fetch): CaptchaVerifier {
  return {
    async verify(token, ip) {
      if (!token || token.length > 2048) return false;
      try {
        const response = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret, response: token, remoteip: ip }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const result = (await response.json()) as { success?: boolean; hostname?: string };
        return result.success === true && (!expectedHostname || result.hostname === expectedHostname);
      } catch (error) {
        logger.warn('turnstile verification failed', { error });
        return false;
      }
    },
  };
}

/**
 * Have I Been Pwned range API (k-anonymity: only 5 hex chars of the SHA-1 leave the server).
 * Fails open: an outage must not block every password change; it is logged.
 */
export function pwnedPasswordsChecker(fetchFn = fetch): BreachedPasswordChecker {
  return {
    async isBreached(password) {
      const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      try {
        const response = await fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'Add-Padding': 'true' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const body = await response.text();
        return body.split('\n').some((line) => {
          const [candidate, count] = line.trim().split(':');
          return candidate === suffix && Number(count) > 0;
        });
      } catch (error) {
        logger.warn('breached password check unavailable', { error });
        return false;
      }
    },
  };
}
