/**
 * Structured JSON logger. Values of sensitive keys are always redacted, at any depth, so
 * passwords, tokens, cookies, codes and secrets never reach CloudWatch.
 */

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|session|otp|^code$|verifier|key$/i;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0, sensitive: RegExp = SENSITIVE_KEY): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1, sensitive));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sensitive.test(k) ? '[REDACTED]' : redact(v, depth + 1, sensitive)]),
    );
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...(redact(fields ?? {}) as object) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
