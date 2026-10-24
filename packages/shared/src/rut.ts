/**
 * Chilean RUT helpers. Canonical form: body without dots + "-" + check digit
 * (uppercase K), e.g. "12345678-5". Must match app.is_valid_rut() in the database.
 */

const CANONICAL_RUT = /^[1-9][0-9]{0,7}-[0-9K]$/;

export function computeRutCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

/** Validates a RUT already in canonical form. */
export function isValidRut(rut: string): boolean {
  if (!CANONICAL_RUT.test(rut)) return false;
  const [body, dv] = rut.split('-') as [string, string];
  return computeRutCheckDigit(body) === dv;
}

/** Returns the canonical RUT or null when the input is malformed or the check digit is wrong. */
export function normalizeRut(input: string): string | null {
  const compact = input.replace(/[.\s-]/g, '').toUpperCase();
  if (compact.length < 2) return null;
  const candidate = `${compact.slice(0, -1)}-${compact.slice(-1)}`;
  return isValidRut(candidate) ? candidate : null;
}

/** Formats a canonical RUT for display: "12.345.678-5". */
export function formatRut(rut: string): string {
  const [body, dv] = rut.split('-') as [string, string];
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}
