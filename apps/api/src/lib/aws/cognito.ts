import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminLinkProviderForUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  AssociateSoftwareTokenCommand,
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
  type AuthenticationResultType,
  type ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { Config } from '../config.js';
import { cognitoSecretHash } from '../crypto.js';
import { CognitoError, type AuthResult, type CognitoPort, type CognitoTokens } from '../ports.js';

const REASONS: Record<string, CognitoError['reason']> = {
  NotAuthorizedException: 'not_authorized',
  PasswordResetRequiredException: 'not_authorized',
  UserNotConfirmedException: 'not_authorized',
  UserNotFoundException: 'user_not_found',
  CodeMismatchException: 'code_mismatch',
  EnableSoftwareTokenMFAException: 'code_mismatch',
  ExpiredCodeException: 'expired_code',
  InvalidPasswordException: 'invalid_password',
  UserLambdaValidationException: 'lambda_rejected',
  TooManyRequestsException: 'too_many_requests',
  TooManyFailedAttemptsException: 'too_many_requests',
  LimitExceededException: 'too_many_requests',
  UsernameExistsException: 'username_exists',
};

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const name = (error as Error).name;
    throw new CognitoError(REASONS[name] ?? 'unknown', name);
  }
}

function toTokens(result: AuthenticationResultType | undefined): CognitoTokens {
  if (!result?.AccessToken || !result.IdToken) throw new CognitoError('unknown', 'missing tokens');
  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn ?? 600,
  };
}

/** Cognito User Pool adapter for the confidential web client (secret hash on every call). */
export function cognitoAdapter(config: Config, webClientSecret: string): CognitoPort {
  const client = new CognitoIdentityProviderClient({ region: config.region });
  const { userPoolId, webClientId, domain } = config.cognito;
  const hash = (username: string) => cognitoSecretHash(webClientSecret, username, webClientId);

  const toAuthResult = (
    response: {
      AuthenticationResult?: AuthenticationResultType | undefined;
      ChallengeName?: ChallengeNameType | undefined;
      Session?: string | undefined;
      ChallengeParameters?: Record<string, string> | undefined;
    },
    username: string,
  ): AuthResult =>
    response.AuthenticationResult
      ? { kind: 'tokens', tokens: toTokens(response.AuthenticationResult) }
      : {
          kind: 'challenge',
          name: response.ChallengeName ?? 'UNKNOWN',
          session: response.Session ?? '',
          username: response.ChallengeParameters?.['USER_ID_FOR_SRP'] ?? username,
        };

  return {
    async initiatePasswordAuth(email, password) {
      const response = await call(() =>
        client.send(
          new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: webClientId,
            AuthParameters: { USERNAME: email, PASSWORD: password, SECRET_HASH: hash(email) },
          }),
        ),
      );
      return toAuthResult(response, email);
    },

    async respondToChallenge(name, session, username, responses) {
      const response = await call(() =>
        client.send(
          new RespondToAuthChallengeCommand({
            ClientId: webClientId,
            ChallengeName: name as ChallengeNameType,
            Session: session,
            ChallengeResponses: { USERNAME: username, SECRET_HASH: hash(username), ...responses },
          }),
        ),
      );
      return toAuthResult(response, username);
    },

    async refresh(refreshToken, username) {
      const response = await call(() =>
        client.send(
          new InitiateAuthCommand({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: webClientId,
            AuthParameters: { REFRESH_TOKEN: refreshToken, SECRET_HASH: hash(username) },
          }),
        ),
      );
      return toTokens(response.AuthenticationResult);
    },

    async revokeToken(refreshToken) {
      await call(() => client.send(new RevokeTokenCommand({ Token: refreshToken, ClientId: webClientId, ClientSecret: webClientSecret })));
    },

    async exchangeCode(code, codeVerifier, redirectUri) {
      const response = await fetch(`${domain}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${webClientId}:${webClientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: webClientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new CognitoError('not_authorized', `token endpoint ${response.status}`);
      const body = (await response.json()) as { access_token: string; id_token: string; refresh_token?: string; expires_in: number };
      return { accessToken: body.access_token, idToken: body.id_token, refreshToken: body.refresh_token, expiresIn: body.expires_in };
    },

    async forgotPassword(email) {
      await call(() => client.send(new ForgotPasswordCommand({ ClientId: webClientId, Username: email, SecretHash: hash(email) })));
    },

    async confirmForgotPassword(email, code, password) {
      await call(() =>
        client.send(
          new ConfirmForgotPasswordCommand({
            ClientId: webClientId,
            Username: email,
            ConfirmationCode: code,
            Password: password,
            SecretHash: hash(email),
          }),
        ),
      );
    },

    async changePassword(accessToken, previous, proposed) {
      await call(() => client.send(new ChangePasswordCommand({ AccessToken: accessToken, PreviousPassword: previous, ProposedPassword: proposed })));
    },

    async associateSoftwareToken(accessToken) {
      const response = await call(() => client.send(new AssociateSoftwareTokenCommand({ AccessToken: accessToken })));
      if (!response.SecretCode) throw new CognitoError('unknown', 'missing secret');
      return response.SecretCode;
    },

    async verifySoftwareToken(accessToken, code) {
      try {
        const response = await call(() =>
          client.send(new VerifySoftwareTokenCommand({ AccessToken: accessToken, UserCode: code, FriendlyDeviceName: 'TOTP' })),
        );
        return response.Status === 'SUCCESS';
      } catch (error) {
        if (error instanceof CognitoError && error.reason === 'code_mismatch') return false;
        throw error;
      }
    },

    async setTotpPreference(accessToken, enabled) {
      await call(() =>
        client.send(
          new SetUserMFAPreferenceCommand({
            AccessToken: accessToken,
            SoftwareTokenMfaSettings: { Enabled: enabled, PreferredMfa: enabled },
          }),
        ),
      );
    },

    async adminCreateUser(email, emailVerified) {
      const response = await call(() =>
        client.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            MessageAction: 'SUPPRESS',
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: String(emailVerified) },
            ],
          }),
        ),
      );
      const sub = response.User?.Attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
      if (!sub) throw new CognitoError('unknown', 'missing sub');
      return sub;
    },

    async adminDeleteUser(username) {
      await call(() => client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username })));
    },

    async adminSetPassword(username, password) {
      await call(() =>
        client.send(new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: username, Password: password, Permanent: true })),
      );
    },

    async adminMarkEmailVerified(username) {
      await call(() =>
        client.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: username,
            UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
          }),
        ),
      );
    },

    async adminGlobalSignOut(username) {
      await call(() => client.send(new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId, Username: username })));
    },

    async adminLinkProvider(nativeUsername, providerName, providerSubject) {
      await call(() =>
        client.send(
          new AdminLinkProviderForUserCommand({
            UserPoolId: userPoolId,
            DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: nativeUsername },
            SourceUser: { ProviderName: providerName, ProviderAttributeName: 'Cognito_Subject', ProviderAttributeValue: providerSubject },
          }),
        ),
      );
    },

    async adminDisableUser(username) {
      await call(() => client.send(new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: username })));
    },

    async adminEnableUser(username) {
      await call(() => client.send(new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: username })));
    },

    async adminResetUserPassword(username) {
      await call(() => client.send(new AdminResetUserPasswordCommand({ UserPoolId: userPoolId, Username: username })));
    },
  };
}
