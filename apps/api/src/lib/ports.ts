/**
 * Interfaces to external services. Real implementations live in src/lib/aws and
 * src/lib/*.ts; tests use fakes.
 */

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  /** Not returned by REFRESH_TOKEN_AUTH. */
  refreshToken?: string | undefined;
  expiresIn: number;
}

export type AuthResult =
  | { kind: 'tokens'; tokens: CognitoTokens }
  | { kind: 'challenge'; name: string; session: string; username: string };

/** Machine-readable Cognito failure, mapped from SDK exception names. */
export class CognitoError extends Error {
  constructor(
    readonly reason:
      | 'not_authorized'
      | 'user_not_found'
      | 'code_mismatch'
      | 'expired_code'
      | 'invalid_password'
      | 'lambda_rejected'
      | 'too_many_requests'
      | 'username_exists'
      | 'unknown',
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'CognitoError';
  }
}

export interface CognitoPort {
  initiatePasswordAuth(email: string, password: string): Promise<AuthResult>;
  respondToChallenge(name: string, session: string, username: string, responses: Record<string, string>): Promise<AuthResult>;
  refresh(refreshToken: string, username: string): Promise<CognitoTokens>;
  revokeToken(refreshToken: string): Promise<void>;
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<CognitoTokens>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(email: string, code: string, password: string): Promise<void>;
  changePassword(accessToken: string, previous: string, proposed: string): Promise<void>;
  associateSoftwareToken(accessToken: string): Promise<string>;
  verifySoftwareToken(accessToken: string, code: string): Promise<boolean>;
  setTotpPreference(accessToken: string, enabled: boolean): Promise<void>;
  adminCreateUser(email: string, emailVerified: boolean): Promise<string>;
  adminDeleteUser(username: string): Promise<void>;
  adminSetPassword(username: string, password: string): Promise<void>;
  adminMarkEmailVerified(username: string): Promise<void>;
  adminGlobalSignOut(username: string): Promise<void>;
  adminLinkProvider(nativeUsername: string, providerName: string, providerSubject: string): Promise<void>;
}

export interface AccessClaims {
  sub: string;
  originJti: string;
  clientId: string;
  exp: number;
}

export interface TokenVerifier {
  verifyAccess(token: string): Promise<AccessClaims>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface PhotoStorage {
  createUpload(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;
  /** Size in bytes, or null when the object does not exist. */
  objectSize(key: string): Promise<number | null>;
  downloadUrl(key: string): Promise<string>;
}

export interface CaptchaVerifier {
  verify(token: string, ip: string): Promise<boolean>;
}

export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}
