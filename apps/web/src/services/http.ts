/**
 * HTTP client for the API (same origin, /api).
 * - The access token lives only in memory and is sent as a Bearer header.
 * - On 401 it refreshes once (HttpOnly cookie) and retries; if that fails the session ends.
 * - Cookie-authenticated calls (refresh, logout) send the double-submit CSRF header.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface AuthHooks {
  getToken(): string | null;
  /** Obtains a new access token; resolves false when the session is gone. */
  refresh(): Promise<boolean>;
  onSessionLost(): void;
}

let hooks: AuthHooks | null = null;

export function configureAuth(next: AuthHooks | null): void {
  hooks = next;
}

export const CSRF_COOKIE = '__Secure-bf_csrf';

export function readCookie(name: string, source: string = document.cookie): string | null {
  for (const part of source.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export interface RequestOptions {
  signal?: AbortSignal;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send the Bearer token and refresh on 401 (default true). */
  auth?: boolean;
  /** Send X-CSRF-Token from the CSRF cookie. */
  csrf?: boolean;
  /** Return the raw Blob (downloads). */
  blob?: boolean;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `/api${path}${search ? `?${search}` : ''}`;
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; details?: unknown; requestId?: string } };
    return new ApiError(response.status, body.error?.code ?? 'HTTP_ERROR', body.error?.details, body.error?.requestId);
  } catch {
    return new ApiError(response.status, response.status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');
  }
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { body, query, auth = true, csrf = false, blob = false } = options;
  const headers: Record<string, string> = { Accept: blob ? '*/*' : 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? hooks?.getToken() : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (csrf) headers['X-CSRF-Token'] = readCookie(CSRF_COOKIE) ?? '';

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    ...(options.signal?{signal:options.signal}:{}),
  });

  if (response.status === 401 && auth && hooks) {
    if (!retried && (await hooks.refresh())) return request<T>(method, path, options, true);
    hooks.onSessionLost();
  }
  if (!response.ok) throw await toError(response);
  if (blob) return (await response.blob()) as T;
  if (response.status === 204 || response.headers.get('Content-Length') === '0') return undefined as T;
  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
