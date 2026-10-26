import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Config } from '../config.js';
import type { Mailer, PhotoStorage, TokenVerifier } from '../ports.js';

export function jwtVerifier(config: Config): TokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: config.cognito.userPoolId,
    tokenUse: 'access',
    clientId: [config.cognito.webClientId, config.cognito.mobileClientId],
  });
  return {
    async verifyAccess(token) {
      const payload = await verifier.verify(token);
      const originJti = payload['origin_jti'];
      if (typeof originJti !== 'string') throw new Error('missing origin_jti');
      return { sub: payload.sub, originJti, clientId: payload.client_id, exp: payload.exp };
    },
  };
}

export function sesMailer(config: Config): Mailer {
  const client = new SESv2Client({ region: config.region });
  return {
    async send(message) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: config.emailFrom,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: { Html: { Data: message.html, Charset: 'UTF-8' }, Text: { Data: message.text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
    },
  };
}

const URL_TTL_SECONDS = 300;

export function s3PhotoStorage(config: Config): PhotoStorage {
  const client = new S3Client({ region: config.region });
  const Bucket = config.photoBucket;
  return {
    async createUpload(key, contentType, maxBytes) {
      return createPresignedPost(client, {
        Bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 1, maxBytes],
          ['eq', '$Content-Type', contentType],
        ],
        Fields: { 'Content-Type': contentType },
        Expires: URL_TTL_SECONDS,
      });
    },
    async objectSize(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.ContentLength ?? null;
      } catch (error) {
        if ((error as Error).name === 'NotFound') return null;
        throw error;
      }
    },
    async downloadUrl(key) {
      // attachment: <img> still renders it, but opening the URL directly never runs an SVG's scripts.
      const command = new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: 'attachment' });
      return getSignedUrl(client, command, { expiresIn: URL_TTL_SECONDS });
    },
  };
}

const secretsClient = new SecretsManagerClient({});
const secretCache = new Map<string, Promise<Record<string, string>>>();

/** JSON secret from Secrets Manager, cached for the life of the Lambda container. */
export function getJsonSecret(arn: string): Promise<Record<string, string>> {
  let secret = secretCache.get(arn);
  if (!secret) {
    secret = secretsClient
      .send(new GetSecretValueCommand({ SecretId: arn }))
      .then((response) => JSON.parse(response.SecretString ?? '{}') as Record<string, string>);
    secretCache.set(arn, secret);
  }
  return secret;
}
