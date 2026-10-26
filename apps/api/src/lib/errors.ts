/** Errors safe to show to clients. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    /** Extra machine-readable data safe for clients (e.g. password policy codes). */
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export const badRequest = (code = 'BAD_REQUEST', details?: unknown) => new AppError(400, code, undefined, details);
export const unauthorized = (code = 'UNAUTHORIZED') => new AppError(401, code);
export const forbidden = (code = 'FORBIDDEN') => new AppError(403, code);
export const notFound = (code = 'NOT_FOUND') => new AppError(404, code);
export const tooManyRequests = () => new AppError(429, 'RATE_LIMITED');

/** Generic login failure: never reveals whether the user exists, is locked or the password is wrong. */
export const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS');
