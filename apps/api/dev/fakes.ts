/**
 * LOCAL DEVELOPMENT ONLY. Simulated Cognito, SES and S3 so the web app can be used without AWS.
 * Never imported by a Lambda entry point.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { safeEqual } from '../src/lib/crypto.js';
import type { Db } from '../src/lib/db.js';
import { CognitoError, type AccessClaims, type CognitoPort, type CognitoTokens, type EmailMessage, type Mailer, type PhotoStorage, type TokenVerifier } from '../src/lib/ports.js';

export const DEV_PASSWORD = 'Local-Dev-2026!';
export const DEV_CODE = '123456';
const ACCESS_TTL_SECONDS = 600;
const signingKey = randomBytes(32);

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `dev.${body}.${createHmac('sha256', signingKey).update(body).digest('base64url')}`;
}

export const devVerifier: TokenVerifier = {
  async verifyAccess(token): Promise<AccessClaims> {
    const [prefix, body, signature] = token.split('.');
    if (prefix !== 'dev' || !body || !signature) throw new Error('invalid token');
    if (!safeEqual(signature, createHmac('sha256', signingKey).update(body).digest('base64url'))) throw new Error('bad signature');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as AccessClaims;
    if (claims.exp < Date.now() / 1000) throw new Error('expired');
    return claims;
  },
};

export interface DevTriggers {
  preAuthentication(sub: string, clientId: string): Promise<void>;
  postAuthentication(sub: string, clientId: string): Promise<void>;
}

/** Cognito simulator. Passwords: DEV_PASSWORD for seeded users, or the one set through the flows. TOTP: DEV_CODE. */
export class DevCognito implements CognitoPort {
  triggers: DevTriggers | undefined;
  private passwords = new Map<string, string | null>(); // sub -> password (null = none set yet)
  private mfa = new Map<string, boolean>();
  private disabled = new Set<string>();
  private refreshTokens = new Map<string, { sub: string; jti: string; clientId: string }>();
  private challenges = new Map<string, string>(); // session -> sub

  constructor(
    private readonly db: Db,
    private readonly webClientId: string,
  ) {}

  private async subFor(email: string): Promise<{ sub: string; mfaEnabled: boolean } | undefined> {
    const row = await this.db
      .selectFrom('app.users as u')
      .innerJoin('app.user_identities as i', (join) => join.onRef('i.user_id', '=', 'u.id').on('i.provider', '=', 'local'))
      .select(['i.cognito_sub', 'u.mfa_enabled'])
      .where('u.email', '=', email.toLowerCase())
      .executeTakeFirst();
    return row ? { sub: row.cognito_sub, mfaEnabled: row.mfa_enabled } : undefined;
  }

  private issue(sub: string, clientId: string = this.webClientId, jti: string = randomUUID()): CognitoTokens {
    const refreshToken = randomBytes(32).toString('base64url');
    this.refreshTokens.set(refreshToken, { sub, jti, clientId });
    return {
      accessToken: sign({ sub, originJti: jti, clientId, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS }),
      idToken: 'dev-id-token',
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  private passwordMatches(sub: string, password: string): boolean {
    const stored = this.passwords.has(sub) ? this.passwords.get(sub) : DEV_PASSWORD;
    return stored !== null && stored !== undefined && stored === password;
  }

  async initiatePasswordAuth(email: string, password: string) {
    const user = await this.subFor(email);
    if (!user || this.disabled.has(user.sub)) throw new CognitoError('not_authorized');
    try {
      await this.triggers?.preAuthentication(user.sub, this.webClientId);
    } catch {
      throw new CognitoError('lambda_rejected');
    }
    if (!this.passwordMatches(user.sub, password)) throw new CognitoError('not_authorized');
    if (this.mfa.get(user.sub) ?? user.mfaEnabled) {
      const session = randomUUID();
      this.challenges.set(session, user.sub);
      return { kind: 'challenge' as const, name: 'SOFTWARE_TOKEN_MFA', session, username: user.sub };
    }
    await this.triggers?.postAuthentication(user.sub, this.webClientId);
    return { kind: 'tokens' as const, tokens: this.issue(user.sub) };
  }

  async respondToChallenge(name: string, session: string, _username: string, responses: Record<string, string>) {
    const sub = this.challenges.get(session);
    if (!sub || name !== 'SOFTWARE_TOKEN_MFA') throw new CognitoError('not_authorized');
    if (responses['SOFTWARE_TOKEN_MFA_CODE'] !== DEV_CODE) throw new CognitoError('code_mismatch');
    this.challenges.delete(session);
    await this.triggers?.postAuthentication(sub, this.webClientId);
    return { kind: 'tokens' as const, tokens: this.issue(sub) };
  }

  async refresh(refreshToken: string) {
    const entry = this.refreshTokens.get(refreshToken);
    if (!entry || this.disabled.has(entry.sub)) throw new CognitoError('not_authorized');
    const { refreshToken: _, ...tokens } = this.issue(entry.sub, entry.clientId, entry.jti);
    return tokens;
  }

  async revokeToken(refreshToken: string) {
    this.refreshTokens.delete(refreshToken);
  }

  /** Simulated federated login: the dev authorize page sends "dev-<email>" as the code. */
  async exchangeCode(code: string) {
    const user = await this.subFor(code.replace(/^dev-/, ''));
    if (!user) throw new CognitoError('not_authorized');
    return this.issue(user.sub);
  }

  async forgotPassword(email: string) {
    console.log(`\n[dev-cognito] Código de recuperación para ${email}: ${DEV_CODE}\n`);
  }

  async confirmForgotPassword(email: string, code: string, password: string) {
    const user = await this.subFor(email);
    if (!user || code !== DEV_CODE) throw new CognitoError('code_mismatch');
    this.passwords.set(user.sub, password);
  }

  async changePassword(accessToken: string, previous: string, proposed: string) {
    const { sub } = await devVerifier.verifyAccess(accessToken);
    if (!this.passwordMatches(sub, previous)) throw new CognitoError('not_authorized');
    this.passwords.set(sub, proposed);
  }

  async associateSoftwareToken() {
    return 'JBSWY3DPEHPK3PXP';
  }

  async verifySoftwareToken(_accessToken: string, code: string) {
    return code === DEV_CODE;
  }

  async setTotpPreference(accessToken: string, enabled: boolean) {
    this.mfa.set((await devVerifier.verifyAccess(accessToken)).sub, enabled);
  }

  async adminCreateUser() {
    const sub = randomUUID();
    this.passwords.set(sub, null);
    return sub;
  }

  async adminDeleteUser(username: string) {
    this.passwords.delete(username);
  }

  async adminSetPassword(username: string, password: string) {
    this.passwords.set(username, password);
  }

  async adminMarkEmailVerified() {}

  async adminGlobalSignOut(username: string) {
    for (const [token, entry] of this.refreshTokens) if (entry.sub === username) this.refreshTokens.delete(token);
  }

  async adminLinkProvider() {}

  async adminDisableUser(username: string) {
    this.disabled.add(username);
  }

  async adminEnableUser(username: string) {
    this.disabled.delete(username);
  }

  async adminResetUserPassword(username: string) {
    this.passwords.set(username, null);
    console.log(`\n[dev-cognito] Contraseña restablecida. Código de recuperación: ${DEV_CODE}\n`);
  }
}

/** Prints emails to the console (invitation links appear here). */
export const consoleMailer: Mailer = {
  async send(message: EmailMessage) {
    console.log(`\n──── email para ${message.to} ────\nAsunto: ${message.subject}\n${message.text}\n────────────────────────────\n`);
  },
};

/** Photos kept in memory and served by the dev server. */
export class MemoryStorage implements PhotoStorage {
  readonly objects = new Map<string, { type: string; data: Buffer }>();
  constructor(private readonly baseUrl: string) {}

  async createUpload(key: string, contentType: string) {
    return { url: `${this.baseUrl}/api/dev/uploads`, fields: { key, 'Content-Type': contentType } };
  }

  async objectSize(key: string) {
    return this.objects.get(key)?.data.length ?? null;
  }

  async downloadUrl(key: string) {
    return `${this.baseUrl}/api/dev/files/${key}`;
  }
}
