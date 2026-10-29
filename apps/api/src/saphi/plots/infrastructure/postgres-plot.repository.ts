import type { CompanyScope, CreatePlotInput, UpdatePlotInput } from '@base/saphi';
import type { Tx } from '../../../lib/db.js';
import { AppError } from '../../../lib/errors.js';
import { plotDto } from '../../persistence/mappers.js';
import { paginate, slice, type KeysetPage } from '../../persistence/pagination.js';
import type { PlotRepository } from '../domain/plot.repository.js';

export class PostgresPlotRepository implements PlotRepository {
  constructor(private readonly tx: Tx) {}
  async list(scope: CompanyScope, farmId: string | undefined, page: KeysetPage) {
    let query = this.tx.selectFrom('saphi.plots').selectAll().where('company_id', '=', scope.companyId);
    if (farmId) query = query.where('farm_id', '=', farmId);
    if (page.status) query = query.where('status', '=', page.status);
    return slice(await paginate(query, page).execute(), page.limit, plotDto);
  }
  async find(scope: CompanyScope, id: string) {
    const row = await this.tx.selectFrom('saphi.plots').selectAll().where('company_id', '=', scope.companyId).where('id', '=', id).executeTakeFirst();
    return row ? plotDto(row) : null;
  }
  async create(scope: CompanyScope, input: CreatePlotInput) {
    const row = await this.tx.insertInto('saphi.plots').values({ company_id: scope.companyId, farm_id: input.farmId,
      code: input.code, name: input.name, area_ha: input.areaHa ?? null, grape_variety: input.grapeVariety ?? null,
      planting_year: input.plantingYear ?? null, soil_type: input.soilType ?? null, status: input.status }).returningAll().executeTakeFirstOrThrow();
    return plotDto(row);
  }
  async update(scope: CompanyScope, id: string, input: UpdatePlotInput) {
    const row = await this.tx.updateTable('saphi.plots').set({ name: input.name, area_ha: input.areaHa,
      grape_variety: input.grapeVariety, planting_year: input.plantingYear, soil_type: input.soilType, status: input.status })
      .where('company_id', '=', scope.companyId).where('id', '=', id).where('version', '=', String(input.expectedVersion))
      .returningAll().executeTakeFirst();
    if (!row) throw new AppError(409, 'VERSION_CONFLICT');
    return plotDto(row);
  }
}
