import type { CompanyRepository } from './companies/domain/company.repository.js';
import type { FarmRepository } from './farms/domain/farm.repository.js';
import type { PlotRepository } from './plots/domain/plot.repository.js';
import type { CompanyAuthorization } from './tenancy/authorization.port.js';

/** Future composition builds these ports inside the SAME transaction supplied by authed(). */
export interface SaphiTransactionPorts {
  authorization: CompanyAuthorization;
  companies: CompanyRepository;
  farms: FarmRepository;
  plots: PlotRepository;
}

// Intentionally no default adapters, singleton repositories or permissive authorization fallback.
