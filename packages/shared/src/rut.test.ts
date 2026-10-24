import { describe, expect, it } from 'vitest';
import { computeRutCheckDigit, formatRut, isValidRut, normalizeRut } from './rut.js';

describe('computeRutCheckDigit', () => {
  it.each([
    ['12345678', '5'],
    ['11111111', '1'],
    ['10000013', 'K'],
    ['20000008', '0'],
  ])('body %s -> %s', (body, dv) => {
    expect(computeRutCheckDigit(body)).toBe(dv);
  });
});

describe('isValidRut', () => {
  it('accepts canonical valid RUTs', () => {
    expect(isValidRut('12345678-5')).toBe(true);
    expect(isValidRut('10000013-K')).toBe(true);
  });

  it('rejects wrong check digit, formatting and leading zeros', () => {
    expect(isValidRut('12345678-4')).toBe(false);
    expect(isValidRut('12.345.678-5')).toBe(false);
    expect(isValidRut('012345678-5')).toBe(false);
    expect(isValidRut('10000013-k')).toBe(false);
    expect(isValidRut('')).toBe(false);
  });
});

describe('normalizeRut', () => {
  it('normalizes common user input', () => {
    expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
    expect(normalizeRut(' 10000013k ')).toBe('10000013-K');
  });

  it('returns null for invalid input', () => {
    expect(normalizeRut('12.345.678-9')).toBeNull();
    expect(normalizeRut('K')).toBeNull();
    expect(normalizeRut('abc')).toBeNull();
  });
});

describe('formatRut', () => {
  it('adds thousands separators', () => {
    expect(formatRut('12345678-5')).toBe('12.345.678-5');
    expect(formatRut('1000005-K')).toBe('1.000.005-K');
  });
});
