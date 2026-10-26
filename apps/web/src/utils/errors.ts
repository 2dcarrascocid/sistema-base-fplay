import { ApiError } from '../services/http';

type Translate = (key: string, params?: Record<string, unknown>) => string;
type Exists = (key: string) => boolean;

/** Turns an API error into a readable message, including password rule details. */
export function errorMessage(error: unknown, t: Translate, te: Exists): string {
  if (!(error instanceof ApiError)) return t('errors.default');
  const base = te(`errors.${error.code}`) ? t(`errors.${error.code}`) : t('errors.default');
  if (error.code === 'PASSWORD_POLICY' && Array.isArray(error.details)) {
    const rules = error.details.filter((rule): rule is string => typeof rule === 'string' && te(`passwordRules.${rule}`));
    if (rules.length > 0) return `${base} ${rules.map((rule) => t(`passwordRules.${rule}`)).join(' ')}`;
  }
  return base;
}
