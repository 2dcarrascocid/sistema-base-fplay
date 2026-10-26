import type { Config } from './config.js';
import type { Db } from './db.js';
import type {
  BreachedPasswordChecker,
  CaptchaVerifier,
  CognitoPort,
  Mailer,
  PhotoStorage,
  TokenVerifier,
} from './ports.js';

/** Everything a Lambda needs, built once per container (src/lib/aws/deps.ts) or faked in tests. */
export interface Deps {
  config: Config;
  /** Connected as app_api (authenticated Lambdas) or app_auth (auth flows and Cognito triggers). */
  db: Db;
  cognito: CognitoPort;
  verifier: TokenVerifier;
  mailer: Mailer;
  storage: PhotoStorage;
  captcha: CaptchaVerifier;
  breached: BreachedPasswordChecker;
  /** 32-byte AES key for sealed challenge/OAuth state (SHA-256 of the secret key material). */
  encryptionKey: Buffer;
}
