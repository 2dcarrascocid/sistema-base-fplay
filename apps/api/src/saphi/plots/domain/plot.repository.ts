import type { CompanyScope, CreatePlotInput, PlotDto, UpdatePlotInput } from '@base/saphi';
import type { KeysetPage, Slice } from '../../domain/pagination.js';

export interface PlotRepository {
  list(scope: CompanyScope, farmId: string | undefined, page: KeysetPage): Promise<Slice<PlotDto>>;
  find(scope: CompanyScope, id: string): Promise<PlotDto | null>;
  create(scope: CompanyScope, input: CreatePlotInput): Promise<PlotDto>;
  update(scope: CompanyScope, id: string, input: UpdatePlotInput): Promise<PlotDto>;
}
