export interface DiffRow {
  key: string;
  before: string;
  after: string;
  changed: boolean;
}

function show(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Side-by-side rows for an audit entry's old and new values (union of keys, changed ones flagged). */
export function auditDiff(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null): DiffRow[] {
  const before = oldValue ?? {};
  const after = newValue ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.map((key) => {
    const a = show(before[key]);
    const b = show(after[key]);
    return { key, before: a, after: b, changed: a !== b };
  });
}

/** Turns date inputs (yyyy-mm-dd, local) into the API's ISO range; "to" is inclusive of that day. */
export function dateRange(from: string | null, to: string | null): { from?: string; to?: string } {
  const range: { from?: string; to?: string } = {};
  if (from) range.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    range.to = end.toISOString();
  }
  return range;
}
