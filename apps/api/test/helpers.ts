import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Config } from '../src/lib/config.js';
import { createDb, type Db } from '../src/lib/db.js';
import type { Deps } from '../src/lib/deps.js';
import { createRouter, type Route } from '../src/lib/http.js';
import {
  CognitoError,
  type AccessClaims,
  type AuthResult,
  type CognitoPort,
  type CognitoTokens,
  type EmailMessage,
  type PhotoStorage,
} from '../src/lib/ports.js';

/** Local Supabase container (pnpm db:start). Roles enabled by supabase/seed.local.sql. */
const connection = { host: '127.0.0.1', port: 54322, database: 'postgres', ssl: false };
export const apiDb: Db = createDb({ ...connection, user: 'app_api', password: 'app_api_local' });
export const authDb: Db = createDb({ ...connection, user: 'app_auth', password: 'app_auth_local' });
/** Owner connection, only to arrange fixtures and inspect results. */
export const ownerDb: Db = createDb({ ...connection, user: 'postgres', password: 'postgres' });

export const SUPERUSER_ID = '00000000-0000-0000-0000-000000000001';
export const PROFILE_USER_MANAGEMENT = '20000000-0000-0000-0000-000000000001';
export const WEB_URL = 'https://app.example.test';

export const config: Config = {
  stage: 'test',
  region: 'us-east-1',
  cognito: {
    userPoolId: 'us-east-1_test',
    webClientId: 'web-client',
    mobileClientId: 'mobile-client',
    domain: 'https://auth.example.test',
  },
  webUrl: WEB_URL,
  apiUrl: `${WEB_URL}/api`,
  db: { ...connection },
  emailFrom: 'no-reply@example.test',
  photoBucket: 'photos',
  turnstileHostname: undefined,
};

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

/** Fake access tokens are "sub|origin_jti|client_id". */
export function tokensFor(sub: string, clientId = 'web-client', jti = randomUUID()): CognitoTokens {
  return { accessToken: `${sub}|${jti}|${clientId}`, idToken: 'id-token', refreshToken: `rt-${randomUUID()}`, expiresIn: 600 };
}

export const fakeVerifier = {
  async verifyAccess(token: string): Promise<AccessClaims> {
    const [sub, originJti, clientId] = token.split('|');
    if (!sub || !originJti || !clientId) throw new Error('invalid token');
    return { sub, originJti, clientId, exp: Math.floor(Date.now() / 1000) + 600 };
  },
};

type Handler<K extends keyof CognitoPort> = CognitoPort[K];

/** Cognito fake: every method records its call; behaviour is overridden per test. */
export class FakeCognito implements CognitoPort {
  calls: { method: string; args: unknown[] }[] = [];
  passwords = new Map<string, string>(); // email -> password
  subs = new Map<string, string>(); // email -> sub
  challengeFor = new Map<string, string>(); // email -> challenge name
  validTotp = '123456';
  failNext: CognitoError | null = null;

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args });
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  called(method: string) {
    return this.calls.filter((call) => call.method === method);
  }

  initiatePasswordAuth: Handler<'initiatePasswordAuth'> = async (email, password) => {
    this.record('initiatePasswordAuth', [email]);
    if (this.passwords.get(email) !== password) throw new CognitoError('not_authorized');
    const sub = this.subs.get(email)!;
    const challenge = this.challengeFor.get(email);
    if (challenge) return { kind: 'challenge', name: challenge, session: `cognito-session-${sub}`, username: sub };
    return { kind: 'tokens', tokens: tokensFor(sub) };
  };

  respondToChallenge: Handler<'respondToChallenge'> = async (name, session, username, responses): Promise<AuthResult> => {
    this.record('respondToChallenge', [name, session, username, Object.keys(responses)]);
    if (name === 'SOFTWARE_TOKEN_MFA' && responses['SOFTWARE_TOKEN_MFA_CODE'] !== this.validTotp) {
      throw new CognitoError('code_mismatch');
    }
    return { kind: 'tokens', tokens: tokensFor(username) };
  };

  refresh: Handler<'refresh'> = async (refreshToken, username) => {
    this.record('refresh', [refreshToken, username]);
    const { refreshToken: _, ...tokens } = tokensFor(username);
    return tokens;
  };

  exchangeCode: Handler<'exchangeCode'> = async (code, verifier, redirectUri) => {
    this.record('exchangeCode', [code, verifier, redirectUri]);
    return tokensFor(code.replace(/^code-/, ''));
  };

  revokeToken: Handler<'revokeToken'> = async (...args) => this.record('revokeToken', args);
  forgotPassword: Handler<'forgotPassword'> = async (...args) => this.record('forgotPassword', args);
  confirmForgotPassword: Handler<'confirmForgotPassword'> = async (email, code, password) => {
    this.record('confirmForgotPassword', [email, code]);
    if (code !== '654321') throw new CognitoError('code_mismatch');
    this.passwords.set(email, password);
  };
  changePassword: Handler<'changePassword'> = async (accessToken, previous) => {
    this.record('changePassword', [accessToken]);
    if (previous !== 'Current-Pass-123!') throw new CognitoError('not_authorized');
  };
  associateSoftwareToken: Handler<'associateSoftwareToken'> = async (...args) => {
    this.record('associateSoftwareToken', args);
    return 'JBSWY3DPEHPK3PXP';
  };
  verifySoftwareToken: Handler<'verifySoftwareToken'> = async (accessToken, code) => {
    this.record('verifySoftwareToken', [accessToken]);
    return code === this.validTotp;
  };
  setTotpPreference: Handler<'setTotpPreference'> = async (...args) => this.record('setTotpPreference', args);
  adminCreateUser: Handler<'adminCreateUser'> = async (email, verified) => {
    this.record('adminCreateUser', [email, verified]);
    const sub = randomUUID();
    this.subs.set(email, sub);
    return sub;
  };
  adminDeleteUser: Handler<'adminDeleteUser'> = async (...args) => this.record('adminDeleteUser', args);
  adminSetPassword: Handler<'adminSetPassword'> = async (username) => this.record('adminSetPassword', [username]);
  adminMarkEmailVerified: Handler<'adminMarkEmailVerified'> = async (...args) => this.record('adminMarkEmailVerified', args);
  adminGlobalSignOut: Handler<'adminGlobalSignOut'> = async (...args) => this.record('adminGlobalSignOut', args);
  adminLinkProvider: Handler<'adminLinkProvider'> = async (...args) => this.record('adminLinkProvider', args);
}

export class FakeMailer {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

export class FakeStorage implements PhotoStorage {
  objects = new Map<string, number>();
  async createUpload(key: string) {
    return { url: 'https://photos.example.test', fields: { key } };
  }
  async objectSize(key: string) {
    return this.objects.get(key) ?? null;
  }
  async downloadUrl(key: string) {
    return `https://photos.example.test/${key}?signed`;
  }
}

export interface TestDeps extends Deps {
  cognito: FakeCognito;
  mailer: FakeMailer;
  storage: FakeStorage;
  breachedPasswords: Set<string>;
}

export function makeDeps(db: Db): TestDeps {
  const breachedPasswords = new Set<string>(['Password-1234!']);
  return {
    config,
    db,
    cognito: new FakeCognito(),
    verifier: fakeVerifier,
    mailer: new FakeMailer(),
    storage: new FakeStorage(),
    captcha: { verify: async (token) => token === 'captcha-ok' },
    breached: { isBreached: async (password) => breachedPasswords.has(password) },
    breachedPasswords,
    encryptionKey: randomBytes(32),
  };
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

export interface TestUser {
  id: string;
  email: string;
  sub: string;
}

export async function createUser(
  options: {
    role?: 'superuser' | 'admin' | 'client';
    status?: 'invited' | 'active' | 'inactive';
    mfaEnabled?: boolean;
    mustChangePassword?: boolean;
    profiles?: string[];
  } = {},
): Promise<TestUser> {
  const email = `user-${randomUUID()}@test.cl`;
  const sub = randomUUID();
  const roleId = { superuser: 1, admin: 2, client: 3 }[options.role ?? 'client'];
  const user = await ownerDb
    .insertInto('app.users')
    .values({
      email,
      first_name: 'Test',
      last_name: 'User',
      role_id: roleId,
      status: options.status ?? 'active',
      mfa_enabled: options.mfaEnabled ?? false,
      must_change_password: options.mustChangePassword ?? false,
      password_changed_at: new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await ownerDb.insertInto('app.user_identities').values({ user_id: user.id, provider: 'local', cognito_sub: sub, provider_subject: sub }).execute();
  for (const profileId of options.profiles ?? []) {
    await ownerDb.insertInto('app.user_profiles').values({ user_id: user.id, profile_id: profileId }).execute();
  }
  return { id: user.id, email, sub };
}

/** Creates an active session and returns an access token bound to it. */
export async function createSession(user: TestUser, clientType: 'web' | 'mobile' = 'web'): Promise<{ accessToken: string; sessionId: string }> {
  const jti = randomUUID();
  const session = await ownerDb
    .insertInto('app.user_sessions')
    .values({ user_id: user.id, client_type: clientType, origin_jti: jti, expires_at: new Date(Date.now() + 3_600_000) })
    .returning('id')
    .executeTakeFirstOrThrow();
  const clientId = clientType === 'web' ? 'web-client' : 'mobile-client';
  return { accessToken: `${user.sub}|${jti}|${clientId}`, sessionId: session.id };
}

export function randomIp(): string {
  return `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

export interface EventOptions {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  pathParameters?: Record<string, string>;
  query?: Record<string, string>;
  ip?: string;
  token?: string;
}

export function apiEvent(method: string, resource: string, options: EventOptions = {}): APIGatewayProxyEvent {
  const headers: Record<string, string> = { 'User-Agent': 'vitest', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.cookies) {
    headers['Cookie'] = Object.entries(options.cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ');
  }
  return {
    httpMethod: method,
    resource,
    path: resource,
    headers,
    multiValueHeaders: {},
    body: options.body === undefined ? null : JSON.stringify(options.body),
    isBase64Encoded: false,
    pathParameters: options.pathParameters ?? null,
    queryStringParameters: options.query ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: { requestId: `req-${randomUUID()}`, identity: { sourceIp: options.ip ?? randomIp() } },
  } as unknown as APIGatewayProxyEvent;
}

export interface TestResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
  cookies: string[];
}

export function caller(routes: Record<string, Route>) {
  const router = createRouter(routes);
  return async (method: string, resource: string, options: EventOptions = {}): Promise<TestResponse> => {
    const result: APIGatewayProxyResult = await router(apiEvent(method, resource, options));
    return {
      status: result.statusCode,
      body: result.body ? JSON.parse(result.body) : undefined,
      headers: (result.headers ?? {}) as Record<string, string>,
      cookies: (result.multiValueHeaders?.['Set-Cookie'] ?? []) as string[],
    };
  };
}

/** Value of a cookie in a Set-Cookie list (undefined when absent or cleared). */
export function cookieValue(cookies: string[], name: string): string | undefined {
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (!cookie || cookie.includes('Max-Age=0')) return undefined;
  return decodeURIComponent(cookie.slice(name.length + 1).split(';')[0]!);
}

export async function auditEvents(userId: string): Promise<string[]> {
  const rows = await ownerDb.selectFrom('app.audit_log').select('event_type').where('actor_user_id', '=', userId).orderBy('id').execute();
  return rows.map((row) => row.event_type);
}
