import { sql } from 'kysely';
import type { CompanyScope, SaphiPermission } from '@base/saphi';
import type { Tx } from '../../lib/db.js';
import { forbidden, notFound } from '../../lib/errors.js';
import type { CompanyAuthorization, SaphiActor } from './authorization.port.js';

export class PostgresCompanyAuthorization implements CompanyAuthorization {
  constructor(private readonly tx: Tx, private readonly sharedLock = true) {}
  async requirePermission(actor: SaphiActor, scope: CompanyScope, permission: SaphiPermission) {
    const { rows } = await sql<{ actor: string; member: boolean }>`select app.current_user_id() as actor,
      saphi.is_member(${scope.companyId}::uuid) as member`.execute(this.tx);
    if (rows[0]?.actor !== actor.userId) throw forbidden();
    if (!rows[0].member) throw notFound();
    if (this.sharedLock) await sql`select saphi.set_company_context(${scope.companyId}::uuid)`.execute(this.tx);
    const [menu, action] = permission.split(':') as [string, string];
    const result = await sql<{ allowed: boolean }>`select saphi.has_permission(${scope.companyId}::uuid,${menu},${action})
      and saphi.has_permission(${scope.companyId}::uuid,${menu},'view') as allowed`.execute(this.tx);
    if (!result.rows[0]?.allowed) throw forbidden();
  }
}
