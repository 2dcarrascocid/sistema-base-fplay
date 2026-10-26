import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { parseCookies } from './cookies.js';
import { safeEqual } from './crypto.js';
import { mapDbError } from './db-errors.js';
import { AppError, badRequest, notFound } from './errors.js';
import { logger } from './logger.js';

const MAX_BODY_BYTES = 16 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export interface HttpResponse {
  status: number;
  /** Serialized as JSON. */
  body?: unknown;
  /** Raw text body (e.g. CSV); the route sets Content-Type. */
  text?: string;
  headers?: Record<string, string>;
  cookies?: string[];
}

export interface Request {
  method: string;
  /** API Gateway resource, e.g. "/me/sessions/{id}". */
  resource: string;
  requestId: string;
  ip: string;
  userAgent: string;
  /** Lowercased header names. */
  headers: Record<string, string>;
  cookies: Record<string, string>;
  pathParameters: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

export type Route = (request: Request) => Promise<HttpResponse>;

export const json = (body: unknown, status = 200, cookies?: string[]): HttpResponse =>
  cookies ? { status, body, cookies } : { status, body };

export const noContent = (cookies?: string[]): HttpResponse => (cookies ? { status: 204, cookies } : { status: 204 });

export const redirect = (location: string, cookies?: string[]): HttpResponse => {
  const response: HttpResponse = { status: 302, headers: { Location: location } };
  if (cookies) response.cookies = cookies;
  return response;
};

/** Validates input with Zod; the error lists offending fields but never echoes values. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      'VALIDATION_ERROR',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    );
  }
  return result.data;
}

function lowercaseKeys(input: Record<string, string | undefined> | null): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value !== undefined) output[key.toLowerCase()] = value;
  }
  return output;
}

function clientIp(event: APIGatewayProxyEvent, headers: Record<string, string>): string {
  // CloudFront adds CloudFront-Viewer-Address ("ip:port") when the origin request policy includes it.
  const viewer = headers['cloudfront-viewer-address'];
  if (viewer) return viewer.slice(0, viewer.lastIndexOf(':')).replace(/^\[|\]$/g, '');
  return event.requestContext.identity.sourceIp;
}

export function toRequest(event: APIGatewayProxyEvent): Request {
  const headers = lowercaseKeys(event.headers);
  const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new AppError(413, 'PAYLOAD_TOO_LARGE');

  let body: unknown = undefined;
  if (raw) {
    if (!headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE');
    try {
      body = JSON.parse(raw);
    } catch {
      throw badRequest('INVALID_JSON');
    }
  }

  return {
    method: event.httpMethod,
    resource: event.resource,
    requestId: event.requestContext.requestId,
    ip: clientIp(event, headers),
    userAgent: (headers['user-agent'] ?? '').slice(0, 500),
    headers,
    cookies: parseCookies(headers['cookie']),
    pathParameters: { ...(event.pathParameters ?? {}) } as Record<string, string>,
    query: { ...(event.queryStringParameters ?? {}) } as Record<string, string>,
    body,
  };
}

export function toResult(response: HttpResponse, requestId: string): APIGatewayProxyResult {
  const headers: Record<string, string> = { ...SECURITY_HEADERS };
  if (response.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  const result: APIGatewayProxyResult = {
    statusCode: response.status,
    headers: { ...headers, ...response.headers, 'X-Request-Id': requestId },
    body: response.text ?? (response.body === undefined ? '' : JSON.stringify(response.body)),
  };
  if (response.cookies?.length) result.multiValueHeaders = { 'Set-Cookie': response.cookies };
  return result;
}

export function errorResponse(caught: unknown, requestId: string): HttpResponse {
  const error = mapDbError(caught) ?? caught;
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error('request failed', { requestId, errorCode: error.code });
    const body: Record<string, unknown> = { code: error.code, requestId };
    if (error.details !== undefined) body.details = error.details;
    return { status: error.status, body: { error: body } };
  }
  logger.error('unhandled error', { requestId, error });
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', requestId } } };
}

export interface RouterOptions {
  /**
   * Secret CloudFront sends as X-Origin-Verify. When set, requests without it are refused, so the
   * API Gateway endpoint cannot be called directly (bypassing CloudFront and its WAF).
   */
  originSecret?: string | undefined;
}

/** Builds a Lambda handler that dispatches "METHOD /resource" to routes. */
export function createRouter(routes: Record<string, Route>, options: RouterOptions = {}) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const requestId = event.requestContext?.requestId ?? 'unknown';
    let response: HttpResponse;
    try {
      const request = toRequest(event);
      if (options.originSecret && !safeEqual(request.headers['x-origin-verify'] ?? '', options.originSecret)) {
        throw new AppError(403, 'FORBIDDEN');
      }
      const route = routes[`${request.method} ${request.resource}`];
      if (!route) throw notFound();
      response = await route(request);
    } catch (error) {
      response = errorResponse(error, requestId);
    }
    return toResult(response, requestId);
  };
}
