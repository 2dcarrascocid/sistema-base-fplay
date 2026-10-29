import type { CompanyScope, CreateSamplingPointInput, UpdateSamplingPointInput } from '@base/saphi';
import type { Tx } from '../../../lib/db.js';
import { AppError } from '../../../lib/errors.js';
import { pointDto } from '../../persistence/mappers.js';
import { paginate, slice, type KeysetPage } from '../../persistence/pagination.js';

export class PostgresPointRepository {
  constructor(private readonly tx: Tx) {}
  async list(scope: CompanyScope, plotId: string | undefined, page: KeysetPage) {
    let query = this.tx.selectFrom('saphi.sampling_points').selectAll().where('company_id', '=', scope.companyId);
    if (plotId) query = query.where('plot_id', '=', plotId);
    if (page.status) query = query.where('status', '=', page.status);
    return slice(await paginate(query, page).execute(), page.limit, pointDto);
  }
  async find(scope: CompanyScope, id: string) {
    const row = await this.tx.selectFrom('saphi.sampling_points').selectAll().where('company_id', '=', scope.companyId).where('id', '=', id).executeTakeFirst();
    return row ? pointDto(row) : null;
  }
  async create(scope: CompanyScope, input: CreateSamplingPointInput) {
    const row = await this.tx.insertInto('saphi.sampling_points').values({ company_id: scope.companyId, plot_id: input.plotId,
      code: input.code, location: JSON.stringify(input.location), status: input.status }).returningAll().executeTakeFirstOrThrow();
    return pointDto(row);
  }
  async update(scope: CompanyScope, id: string, input: UpdateSamplingPointInput) {
    const row = await this.tx.updateTable('saphi.sampling_points').set({
      location: input.location === undefined ? undefined : JSON.stringify(input.location), status: input.status })
      .where('company_id', '=', scope.companyId).where('id', '=', id).where('version', '=', String(input.expectedVersion))
      .returningAll().executeTakeFirst();
    if (!row) throw new AppError(409, 'VERSION_CONFLICT');
    return pointDto(row);
  }
}
