import { sql } from 'kysely';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import { toCsv } from '../lib/csv.js';
import type { Tx } from '../lib/db.js';
import { notFound } from '../lib/errors.js';
import { json, parse, type HttpResponse, type Request } from '../lib/http.js';

const EXPORT_LIMIT = 50_000;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const Filters = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  eventType: z.string().max(100).optional(),
  actor: z.string().trim().max(254).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(128).optional(),
  result: z.enum(['success', 'failure']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
type AuditFilters = z.infer<typeof Filters>;

const IdParam = z.object({ id: z.string().regex(/^\d{1,18}$/) });

function filtered(tx: Tx, filters: AuditFilters) {
  let query = tx.selectFrom('app.audit_log as a').leftJoin('app.users as u', 'u.id', 'a.actor_user_id');
  if (filters.from) query = query.where('a.occurred_at', '>=', new Date(filters.from));
  if (filters.to) query = query.where('a.occurred_at', '<', new Date(filters.to));
  if (filters.eventType) query = query.where('a.event_type', '=', filters.eventType);
  if (filters.entityType) query = query.where('a.entity_type', '=', filters.entityType);
  if (filters.entityId) query = query.where('a.entity_id', '=', filters.entityId);
  if (filters.result) query = query.where('a.result', '=', filters.result);
  if (filters.actor) {
    const term = `%${escapeLike(filters.actor.toLowerCase())}%`;
    query = query.where((eb) => eb.or([eb('a.actor_email', 'like', term), eb('u.email', 'like', term)]));
  }
  return query;
}

const COLUMNS = [
  'a.id',
  'a.occurred_at',
  'a.actor_user_id',
  sql<string | null>`coalesce(a.actor_email, u.email)`.as('actor_email'),
  'a.event_type',
  'a.entity_type',
  'a.entity_id',
  'a.result',
  'a.ip',
] as const;

export async function listEvents(request: Request, tx: Tx): Promise<HttpResponse> {
  const filters = parse(Filters, request.query);
  const { total } = await filtered(tx, filters)
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  const items = await filtered(tx, filters)
    .select(COLUMNS)
    .orderBy('a.id', 'desc')
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize)
    .execute();
  return json({ items, total: Number(total), page: filters.page, pageSize: filters.pageSize });
}

export async function getEvent(request: Request, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const event = await tx
    .selectFrom('app.audit_log as a')
    .leftJoin('app.users as u', 'u.id', 'a.actor_user_id')
    .select([...COLUMNS, 'a.user_agent', 'a.request_id', 'a.old_value', 'a.new_value'])
    .where('a.id', '=', id)
    .executeTakeFirst();
  if (!event) throw notFound();
  return json({ event });
}

export async function eventTypes(tx: Tx): Promise<HttpResponse> {
  const rows = await tx.selectFrom('app.audit_log').select('event_type').distinct().orderBy('event_type').execute();
  return json({ eventTypes: rows.map((row) => row.event_type) });
}

export async function integrity(tx: Tx): Promise<HttpResponse> {
  const { rows } = await sql<{ valid: boolean; broken_id: string | null; total: string }>`
    select * from app.audit_chain_status()
  `.execute(tx);
  const status = rows[0]!;
  return json({ valid: status.valid, brokenId: status.broken_id, total: Number(status.total) });
}

export async function exportEvents(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const filters = parse(Filters, request.query);
  const rows = await filtered(tx, filters)
    .select([...COLUMNS, 'a.user_agent', 'a.request_id', 'a.old_value', 'a.new_value'])
    .orderBy('a.id', 'desc')
    .limit(EXPORT_LIMIT)
    .execute();
  await audit(tx, originOf(request), {
    eventType: 'audit.export',
    result: 'success',
    actorUserId: actor.userId,
    newValue: { filters: { ...filters, page: undefined, pageSize: undefined }, rows: rows.length },
  });
  const csv = toCsv(
    ['id', 'fecha', 'actor', 'evento', 'entidad', 'id_entidad', 'resultado', 'ip', 'user_agent', 'request_id', 'valor_anterior', 'valor_nuevo'],
    rows.map((r) => [
      r.id,
      r.occurred_at,
      r.actor_email,
      r.event_type,
      r.entity_type,
      r.entity_id,
      r.result,
      r.ip,
      r.user_agent,
      r.request_id,
      r.old_value === null ? '' : JSON.stringify(r.old_value),
      r.new_value === null ? '' : JSON.stringify(r.new_value),
    ]),
  );
  return {
    status: 200,
    text: csv,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="auditoria.csv"' },
  };
}
