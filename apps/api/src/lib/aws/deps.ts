import { CognitoIdentityProviderClient, DescribeUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';
import { loadConfig, type Config } from '../config.js';
import { sha256 } from '../crypto.js';
import { createDb } from '../db.js';
import type { Deps } from '../deps.js';
import { pwnedPasswordsChecker, turnstileVerifier } from '../external.js';
import { cognitoAdapter } from './cognito.js';
import { getJsonSecret, jwtVerifier, s3PhotoStorage, sesMailer } from './services.js';

/**
 * Secrets (Secrets Manager, created per stage, see apps/api/README.md):
 *  - DB_SECRET_ARN  → {"username", "password", "ca"?}   one per database role (app_api / app_auth)
 *  - APP_SECRET_ARN → {"turnstileSecret", "encryptionKey"} only for the public auth Lambda
 *  - ORIGIN_SECRET_ARN → {"value"} header CloudFront sends as X-Origin-Verify (API Lambdas)
 * The web client secret is read from Cognito (DescribeUserPoolClient) and never stored.
 */
async function buildDeps(): Promise<Deps> {
  const config = loadConfig();
  const appSecretArn = process.env['APP_SECRET_ARN'];
  const originSecretArn = process.env['ORIGIN_SECRET_ARN'];
  const [dbSecret, appSecret, webClientSecret, originSecret] = await Promise.all([
    getJsonSecret(required('DB_SECRET_ARN')),
    appSecretArn ? getJsonSecret(appSecretArn) : Promise.resolve({} as Record<string, string>),
    process.env['NEEDS_WEB_CLIENT_SECRET'] === 'true' ? fetchWebClientSecret(config) : Promise.resolve(''),
    originSecretArn ? getJsonSecret(originSecretArn).then((secret) => secret['value']) : Promise.resolve(undefined),
  ]);
  if (originSecretArn && !originSecret) throw new Error('origin secret is empty');

  const keyMaterial = appSecret['encryptionKey'] ?? '';
  if (appSecretArn && keyMaterial.length < 32) throw new Error('encryptionKey must have at least 32 characters');

  return {
    config,
    db: createDb({
      ...config.db,
      user: dbSecret['username'] ?? '',
      password: dbSecret['password'] ?? '',
      ca: dbSecret['ca'],
    }),
    cognito: cognitoAdapter(config, webClientSecret),
    verifier: jwtVerifier(config),
    mailer: sesMailer(config),
    storage: s3PhotoStorage(config),
    captcha: turnstileVerifier(appSecret['turnstileSecret'] ?? '', config.turnstileHostname),
    breached: pwnedPasswordsChecker(),
    encryptionKey: sha256(keyMaterial),
    originSecret,
  };
}

async function fetchWebClientSecret(config: Config): Promise<string> {
  const client = new CognitoIdentityProviderClient({ region: config.region });
  const response = await client.send(
    new DescribeUserPoolClientCommand({ UserPoolId: config.cognito.userPoolId, ClientId: config.cognito.webClientId }),
  );
  const secret = response.UserPoolClient?.ClientSecret;
  if (!secret) throw new Error('web client secret not available');
  return secret;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let deps: Promise<Deps> | undefined;

/** Built once per Lambda container; a failed build is retried on the next invocation. */
export function getDeps(): Promise<Deps> {
  deps ??= buildDeps().catch((error: unknown) => {
    deps = undefined;
    throw error;
  });
  return deps;
}
