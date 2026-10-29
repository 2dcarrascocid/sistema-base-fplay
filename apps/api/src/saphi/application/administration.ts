import { SAPHI_PERMISSIONS, type CompanyCapabilitiesDto, type MembershipDto, type SaphiPermission,
  type CreateCompanyInput, type UpdateCompanyInput, type MembershipInput, type MembershipPermissionsInput } from '@base/saphi';
import { sql, type Selectable } from 'kysely';
import type { Actor } from '../../lib/authenticate.js';
import type { Database } from '../../lib/db-types.js';
import type { Tx } from '../../lib/db.js';
import { buildMenuTree } from '../../me/menu.js';
import { companyDto } from '../persistence/mappers.js';

export async function bootstrapCompany(tx: Tx, input: CreateCompanyInput) {
  const { rows } = await sql<Selectable<Database['saphi.companies']>>`select * from saphi.bootstrap_company(
    ${input.rut},${input.legalName},${input.tradeName ?? null},${input.contactEmail ?? null},${input.contactPhone ?? null},
    ${input.initialUserId}::uuid,${input.initialPermissions}::text[],${input.reason})`.execute(tx);
  return companyDto(rows[0]!);
}

export async function updateCompany(tx: Tx, companyId: string, input: UpdateCompanyInput) {
  const { expectedVersion, reason, ...changes } = input;
  const { rows } = await sql<Selectable<Database['saphi.companies']>>`select * from saphi.update_company(
    ${companyId}::uuid,${String(expectedVersion)}::bigint,${JSON.stringify(changes)}::jsonb,${reason})`.execute(tx);
  return companyDto(rows[0]!);
}

interface MemberRow { user_id: string; first_name: string; last_name: string; status: 'active'|'inactive'; version: string; permissions: SaphiPermission[] }
const memberDto = (r: MemberRow): MembershipDto => ({ userId: r.user_id, firstName: r.first_name, lastName: r.last_name,
  status: r.status, version: Number(r.version), permissions: r.permissions });

export async function listMembers(tx: Tx, companyId: string, limit: number, after?: {id:string;createdAt:string}, status?: 'active'|'inactive') {
  const { rows } = await sql<MemberRow & {cursor_created_at:string}>`select m.*,
      to_char(m.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at
    from saphi.members(${companyId}::uuid) m
    where (${after?.id ?? null}::uuid is null or (m.created_at,user_id) < (${after?.createdAt ?? null}::timestamptz,${after?.id ?? null}::uuid))
      and (${status ?? null}::text is null or m.status=${status ?? null}) order by m.created_at desc,user_id desc limit ${limit + 1}`.execute(tx);
  const visible = rows.slice(0, limit);
  return { items: visible.map(memberDto), next: rows.length > limit ? { id: visible.at(-1)!.user_id, createdAt: visible.at(-1)!.cursor_created_at } : null };
}

export async function setMembership(tx: Tx, companyId: string, userId: string, input: MembershipInput) {
  await sql`select * from saphi.set_membership(
    ${companyId}::uuid,${userId}::uuid,${String(input.expectedVersion)}::bigint,${input.status},${input.reason})`.execute(tx);
  const { rows }=await sql<MemberRow>`select * from saphi.members(${companyId}::uuid) where user_id=${userId}::uuid`.execute(tx);
  return memberDto(rows[0]!);
}

export async function setMemberPermissions(tx: Tx, companyId: string, userId: string, input: MembershipPermissionsInput) {
  await sql`select * from saphi.set_member_permissions(
    ${companyId}::uuid,${userId}::uuid,${String(input.expectedVersion)}::bigint,${input.permissions}::text[],${input.reason})`.execute(tx);
  const { rows }=await sql<MemberRow>`select * from saphi.members(${companyId}::uuid) where user_id=${userId}::uuid`.execute(tx);
  return memberDto(rows[0]!);
}

export async function capabilities(tx: Tx, companyId: string, actor: Actor): Promise<CompanyCapabilitiesDto> {
  const { rows } = await sql<{ menu_code: string; action_code: string }>`select menu_code,action_code from app.current_permissions()
    where saphi.has_permission(${companyId}::uuid,menu_code,action_code)
      and saphi.has_permission(${companyId}::uuid,menu_code,'view')`.execute(tx);
  const effectivePermissions = rows.map((r) => `${r.menu_code}:${r.action_code}`)
    .filter((key): key is SaphiPermission => SAPHI_PERMISSIONS.includes(key as SaphiPermission));
  const membership = await tx.selectFrom('saphi.company_users').select('version').where('company_id','=',companyId)
    .where('user_id','=',actor.userId).executeTakeFirstOrThrow();
  const menus = await tx.selectFrom('app.menus as m').innerJoin('app.v_effective_menus as em','em.id','m.id')
    .select(['m.id','m.parent_id','m.kind','m.code','m.name','m.icon','m.route','m.sort_order','m.show_in_mobile'])
    .where((eb) => eb.or([eb('m.code','=','saphi'),eb('m.code','like','saphi.%')])).execute();
  return { companyId, membershipVersion: Number(membership.version), effectivePermissions,
    menu: buildMenuTree(menus, 'client', new Set(effectivePermissions), actor.clientType) };
}
