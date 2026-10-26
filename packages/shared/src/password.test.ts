import { describe, expect, it } from 'vitest';
import { validatePassword, type PasswordPolicy } from './password.js';

const strict: PasswordPolicy = {
  minLength: 12,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: true,
};

describe('validatePassword', () => {
  it('accepts a password that meets the policy', () => {
    expect(validatePassword('Correct-Horse-9-Battery', strict)).toEqual([]);
  });

  it('accepts unicode letters and spaces', () => {
    expect(validatePassword('Ñandú corre 42 veces!', strict)).toEqual([]);
  });

  it('reports every unmet rule', () => {
    expect(validatePassword('short', strict)).toEqual(['too_short', 'missing_upper', 'missing_digit', 'missing_symbol']);
    expect(validatePassword('ALLUPPERCASE123!', strict)).toEqual(['missing_lower']);
  });

  it('rejects passwords over 128 characters', () => {
    expect(validatePassword(`Aa1!${'x'.repeat(125)}`, strict)).toEqual(['too_long']);
  });

  it('counts code points, not UTF-16 units', () => {
    const relaxed = { ...strict, requireUpper: false, requireDigit: false, requireSymbol: false, requireLower: false };
    expect(validatePassword('😀'.repeat(12), relaxed)).toEqual([]);
  });

  it('rejects passwords containing the email local part', () => {
    expect(validatePassword('Juan.perez-2026!', strict, 'juan.perez@test.cl')).toEqual(['contains_email']);
    expect(validatePassword('Abc-defgh-123!', strict, 'abc@test.cl')).toEqual([]);
  });
});
