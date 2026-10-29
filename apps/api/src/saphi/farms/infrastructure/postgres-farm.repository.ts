import type { CompanyScope, CreateFarmInput, UpdateFarmInput } from '@base/saphi';
import type { Tx } from '../../../lib/db.js';
import { AppError } from '../../../lib/errors.js';
import { farmDto } from '../../persistence/mappers.js';
import { paginate, slice, type KeysetPage } from '../../persistence/pagination.js';
import type { FarmRepository } from '../domain/farm.repository.js';

export class PostgresFarmRepository implements FarmRepository {
  constructor(private readonly tx: Tx) {}
  async list(scope: CompanyScope, page: KeysetPage) {
    let query = this.tx.selectFrom('saphi.farms').selectAll().where('company_id', '=', scope.companyId);
    if (page.status) query = query.where('status', '=', page.status);
    return slice(await paginate(query, page).execute(), page.limit, farmDto);
  }
  async find(scope: CompanyScope, id: string) {
    const row = await this.tx.selectFrom('saphi.farms').selectAll().where('company_id', '=', scope.companyId).where('id', '=', id).executeTakeFirst();
    return row ? farmDto(row) : null;
  }
  async create(scope: CompanyScope, input: CreateFarmInput) {
    const row = await this.tx.insertInto('saphi.farms').values({ company_id: scope.companyId, code: input.code,
      name: input.name, area_ha: input.areaHa ?? null, status: input.status }).returningAll().executeTakeFirstOrThrow();
    return farmDto(row);
  }
  async update(scope: CompanyScope, id: string, input: UpdateFarmInput) {
    const row = await this.tx.updateTable('saphi.farms').set({ name: input.name, area_ha: input.areaHa, status: input.status })
      .where('company_id', '=', scope.companyId).where('id', '=', id).where('version', '=', String(input.expectedVersion))
      .returningAll().executeTakeFirst();
    if (!row) throw new AppError(409, 'VERSION_CONFLICT');
    return farmDto(row);
  }
}
