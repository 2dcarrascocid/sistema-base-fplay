import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** PKCE S256 code challenge (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Cognito SECRET_HASH for confidential app clients. */
export function cognitoSecretHash(clientSecret: string, username: string, clientId: string): string {
  return createHmac('sha256', clientSecret).update(username + clientId).digest('base64');
}

/**
 * Authenticated encryption (AES-256-GCM) of short-lived server state handed to the client
 * (login challenges, OAuth state). The purpose is bound as AAD so a value sealed for one use
 * cannot be replayed for another.
 */
export function seal(key: Buffer, purpose: string, data: unknown, ttlSeconds: number, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const payload = JSON.stringify({ exp: now + ttlSeconds * 1000, data });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function open<T>(key: Buffer, purpose: string, sealed: string, now = Date.now()): T | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(raw.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as {
      exp: number;
      data: T;
    };
    return payload.exp > now ? payload.data : null;
  } catch {
    return null;
  }
}
