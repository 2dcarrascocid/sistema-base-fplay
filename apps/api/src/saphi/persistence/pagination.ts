import type { SelectQueryBuilder } from 'kysely';
import { sql } from 'kysely';

import type { KeysetPage, Slice } from '../domain/pagination.js';
export type { Boundary, KeysetPage, Slice } from '../domain/pagination.js';

export function paginate<DB, TB extends keyof DB, O>(query: SelectQueryBuilder<DB, TB, O>, page: KeysetPage, alias?: string, orderColumn:'created_at'|'sampled_at'|'observed_at'|'acquired_at'='created_at') {
  const createdAt=sql.ref(alias?`${alias}.${orderColumn}`:orderColumn);
  const id=sql.ref(alias?`${alias}.id`:'id');
  if (page.after) query = query.where(sql<boolean>`(${createdAt},${id}) < (${page.after.createdAt}::timestamptz,${page.after.id}::uuid)`);
  // pg's Date decoder truncates microseconds. Keep the exact SQL ordering value for cursors.
  return query.select(sql<string>`to_char(${createdAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as('__cursorCreatedAt'))
    .orderBy(sql`${createdAt} desc, ${id} desc`).limit(page.limit + 1);
}

export function slice<T extends { id: string; __cursorCreatedAt: string }, R>(rows: T[], limit: number, map: (row: T) => R): Slice<R> {
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return { items: visible.map(map), next: rows.length > limit && last ? { createdAt: last.__cursorCreatedAt, id: last.id } : null };
}
