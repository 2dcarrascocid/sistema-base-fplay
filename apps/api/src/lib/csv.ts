/**
 * CSV for spreadsheet users. Cells that a spreadsheet would run as a formula (=, +, -, @, tab,
 * carriage return) are prefixed with a quote (OWASP CSV injection). Separator ";" and a UTF-8
 * BOM so Excel in Spanish locales opens it correctly.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
