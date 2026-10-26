/**
 * Password policy (ASVS V2.1). The policy values come from app.security_policy.
 * Length is counted in Unicode code points; spaces and any printable character are allowed.
 */

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

export const PASSWORD_MAX_LENGTH = 128;

export type PasswordError =
  | 'too_short'
  | 'too_long'
  | 'missing_upper'
  | 'missing_lower'
  | 'missing_digit'
  | 'missing_symbol'
  | 'contains_email';

export function validatePassword(password: string, policy: PasswordPolicy, email?: string): PasswordError[] {
  const errors: PasswordError[] = [];
  const length = [...password].length;
  if (length < policy.minLength) errors.push('too_short');
  if (length > PASSWORD_MAX_LENGTH) errors.push('too_long');
  if (policy.requireUpper && !/\p{Lu}/u.test(password)) errors.push('missing_upper');
  if (policy.requireLower && !/\p{Ll}/u.test(password)) errors.push('missing_lower');
  if (policy.requireDigit && !/\p{Nd}/u.test(password)) errors.push('missing_digit');
  if (policy.requireSymbol && !/[^\p{L}\p{Nd}\s]/u.test(password)) errors.push('missing_symbol');

  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    errors.push('contains_email');
  }
  return errors;
}
