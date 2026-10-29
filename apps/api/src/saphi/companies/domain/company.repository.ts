import type { CompanyDto } from '@base/saphi';
import type { KeysetPage, Slice } from '../../domain/pagination.js';

/** Discovery adapter must be restricted to the current actor, without a company selector. */
export interface CompanyRepository {
  listAccessible(page: KeysetPage): Promise<Slice<CompanyDto>>;
}
