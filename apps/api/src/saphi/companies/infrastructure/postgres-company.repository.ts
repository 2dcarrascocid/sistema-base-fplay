import type { Tx } from '../../../lib/db.js';
import { companyDto } from '../../persistence/mappers.js';
import { paginate, slice, type KeysetPage } from '../../persistence/pagination.js';
import type { CompanyRepository } from '../domain/company.repository.js';
import { sql } from 'kysely';

export class PostgresCompanyRepository implements CompanyRepository {
  constructor(private readonly tx: Tx) {}
  async listAccessible(page: KeysetPage) {
    const query=this.tx.selectFrom('saphi.companies as c').innerJoin('saphi.company_users as cu','cu.company_id','c.id')
      .selectAll('c').where('cu.user_id','=',sql<string>`app.current_user_id()`).where('cu.status','=','active');
    const rows = await paginate(query, page,'c').execute();
    return slice(rows, page.limit, companyDto);
  }
  async find(id: string) {
    const row = await this.tx.selectFrom('saphi.companies').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? companyDto(row) : null;
  }
}
