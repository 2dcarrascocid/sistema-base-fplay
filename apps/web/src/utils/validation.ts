import { normalizeRut } from '@base/shared';

/** A rule returns true or an i18n key (with optional params) describing the problem. */
export type RuleResult = true | { key: string; params?: Record<string, unknown> };
export type Rule = (value: unknown) => RuleResult;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value));

export const required: Rule = (value) =>
  (Array.isArray(value) ? value.length > 0 : text(value).length > 0) || { key: 'validation.required' };

export const email: Rule = (value) =>
  !text(value) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(value)) || { key: 'validation.email' };

export const rut: Rule = (value) => !text(value) || normalizeRut(text(value)) !== null || { key: 'validation.rut' };

export const phone: Rule = (value) => !text(value) || /^\+[1-9][0-9]{7,14}$/.test(text(value)) || { key: 'validation.phone' };

export const totp: Rule = (value) => /^\d{6}$/.test(text(value)) || { key: 'validation.totp' };

export const maxLength =
  (max: number): Rule =>
  (value) =>
    text(value).length <= max || { key: 'validation.max', params: { max } };

export const sameAs =
  (other: () => string): Rule =>
  (value) =>
    text(value) === other() || { key: 'validation.match' };
