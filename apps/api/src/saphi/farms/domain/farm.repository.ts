import type { CompanyScope, CreateFarmInput, FarmDto, UpdateFarmInput } from '@base/saphi';
import type { KeysetPage, Slice } from '../../domain/pagination.js';

/** Bound to an already authorized transaction; scope is necessary but is not proof of access. */
export interface FarmRepository {
  list(scope: CompanyScope, page: KeysetPage): Promise<Slice<FarmDto>>;
  find(scope: CompanyScope, id: string): Promise<FarmDto | null>;
  create(scope: CompanyScope, input: CreateFarmInput): Promise<FarmDto>;
  update(scope: CompanyScope, id: string, input: UpdateFarmInput): Promise<FarmDto>;
}
