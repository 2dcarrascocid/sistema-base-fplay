import { z } from 'zod';

const ConfigSchema = z.object({
  STAGE: z.string().min(1),
  AWS_REGION: z.string().min(1),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_WEB_CLIENT_ID: z.string().min(1),
  COGNITO_MOBILE_CLIENT_ID: z.string().min(1),
  COGNITO_DOMAIN: z.url(),
  WEB_URL: z.url(),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_SSL: z.enum(['require', 'disable']).default('require'),
  EMAIL_FROM: z.string().min(3),
  PHOTO_BUCKET: z.string().min(1),
  TURNSTILE_HOSTNAME: z.string().min(1).optional(),
  /** Comma-separated subset of google,facebook,apple enabled in Cognito. */
  FEDERATED_PROVIDERS: z.string().default(''),
});

export type EnvConfig = z.infer<typeof ConfigSchema>;

export interface Config {
  stage: string;
  region: string;
  cognito: { userPoolId: string; webClientId: string; mobileClientId: string; domain: string };
  webUrl: string;
  /** Same origin as the web app: CloudFront routes /api/* to API Gateway. */
  apiUrl: string;
  db: { host: string; port: number; database: string; ssl: boolean };
  emailFrom: string;
  photoBucket: string;
  turnstileHostname: string | undefined;
  federatedProviders: ('google' | 'facebook' | 'apple')[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = ConfigSchema.parse(env);
  const webUrl = e.WEB_URL.replace(/\/$/, '');
  return {
    stage: e.STAGE,
    region: e.AWS_REGION,
    cognito: {
      userPoolId: e.COGNITO_USER_POOL_ID,
      webClientId: e.COGNITO_WEB_CLIENT_ID,
      mobileClientId: e.COGNITO_MOBILE_CLIENT_ID,
      domain: e.COGNITO_DOMAIN.replace(/\/$/, ''),
    },
    webUrl,
    apiUrl: `${webUrl}/api`,
    db: { host: e.DB_HOST, port: e.DB_PORT, database: e.DB_NAME, ssl: e.DB_SSL === 'require' },
    emailFrom: e.EMAIL_FROM,
    photoBucket: e.PHOTO_BUCKET,
    turnstileHostname: e.TURNSTILE_HOSTNAME,
    federatedProviders: e.FEDERATED_PROVIDERS.split(',')
      .map((p) => p.trim())
      .filter((p): p is 'google' | 'facebook' | 'apple' => p === 'google' || p === 'facebook' || p === 'apple'),
  };
}
