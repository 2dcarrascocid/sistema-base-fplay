import { z } from 'zod';
import { clearCookie, COOKIE_PATHS, COOKIES, serializeCookie } from '../lib/cookies.js';
import { open, pkceChallenge, randomToken, safeEqual, seal } from '../lib/crypto.js';
import type { Deps } from '../lib/deps.js';
import { AppError } from '../lib/errors.js';
import { parse, redirect, type HttpResponse, type Request } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { enforceRateLimit } from '../lib/security.js';
import { completeLogin } from './session.js';

/** Our provider names → Cognito identity provider names. */
export const PROVIDERS = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'SignInWithApple',
} as const;
export type FederatedProvider = keyof typeof PROVIDERS;

const OAUTH_PURPOSE = 'oauth-state';
const OAUTH_TTL_SECONDS = 600;

/** Error codes raised by our Pre sign-up trigger that the web shows as-is. */
const TRIGGER_ERRORS = ['NOT_REGISTERED', 'ACCOUNT_DISABLED', 'MFA_REQUIRED_USE_PASSWORD', 'EMAIL_NOT_VERIFIED'];

interface OAuthState {
  state: string;
  verifier: string;
  provider: FederatedProvider;
}

const ProviderParam = z.object({ provider: z.enum(['google', 'facebook', 'apple']) });
const CallbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
});

const callbackUrl = (deps: Pick<Deps, 'config'>) => `${deps.config.apiUrl}/auth/federated/callback`;
const oauthCookieOptions = { path: COOKIE_PATHS.oauth, httpOnly: true, sameSite: 'Lax' } as const;

function loginError(deps: Pick<Deps, 'config'>, code: string): HttpResponse {
  return redirect(`${deps.config.webUrl}/login?error=${encodeURIComponent(code)}`, [clearCookie(COOKIES.oauth, oauthCookieOptions)]);
}

/** GET /auth/federated/{provider}/start */
export async function start(deps: Deps, request: Request): Promise<HttpResponse> {
  const { provider } = parse(ProviderParam, request.pathParameters);
  await enforceRateLimit(deps.db, `federated:ip:${request.ip}`, 300, 30);
  const oauth: OAuthState = { state: randomToken(), verifier: randomToken(48), provider };

  const authorize = new URL(`${deps.config.cognito.domain}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: deps.config.cognito.webClientId,
    redirect_uri: callbackUrl(deps),
    identity_provider: PROVIDERS[provider],
    scope: 'openid email profile aws.cognito.signin.user.admin',
    state: oauth.state,
    code_challenge: pkceChallenge(oauth.verifier),
    code_challenge_method: 'S256',
  }).toString();

  return redirect(authorize.toString(), [
    serializeCookie(COOKIES.oauth, seal(deps.encryptionKey, OAUTH_PURPOSE, oauth, OAUTH_TTL_SECONDS), {
      ...oauthCookieOptions,
      maxAge: OAUTH_TTL_SECONDS,
    }),
  ]);
}

/** Maps the error Cognito forwards from the hosted UI / our triggers to a code for the web. */
export function federatedErrorCode(description: string | undefined): string {
  if (!description) return 'LOGIN_FAILED';
  const triggerError = TRIGGER_ERRORS.find((code) => description.includes(code));
  if (triggerError) return triggerError;
  // Cognito quirk: the first sign-in right after linking an identity may fail; the web retries once.
  if (description.includes('Already found an entry for username')) return 'RETRY';
  return 'LOGIN_FAILED';
}

/** GET /auth/federated/callback */
export async function callback(deps: Deps, request: Request): Promise<HttpResponse> {
  const query = parse(CallbackQuery, request.query);
  if (query.error) return loginError(deps, federatedErrorCode(query.error_description));

  const sealed = request.cookies[COOKIES.oauth];
  const oauth = sealed ? open<OAuthState>(deps.encryptionKey, OAUTH_PURPOSE, sealed) : null;
  if (!oauth || !query.state || !query.code || !safeEqual(oauth.state, query.state)) {
    return loginError(deps, 'INVALID_STATE');
  }

  try {
    const tokens = await deps.cognito.exchangeCode(query.code, oauth.verifier, callbackUrl(deps));
    const outcome = await completeLogin(deps, request, tokens, oauth.provider);
    if (outcome.status !== 'authenticated') return loginError(deps, 'LOGIN_FAILED');
    // The web app then calls /auth/refresh to obtain the access token: no token ever travels in a URL.
    return redirect(`${deps.config.webUrl}/auth/callback`, [clearCookie(COOKIES.oauth, oauthCookieOptions), ...outcome.cookies]);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return loginError(deps, error.code);
    logger.error('federated callback failed', { requestId: request.requestId, error });
    return loginError(deps, 'LOGIN_FAILED');
  }
}
