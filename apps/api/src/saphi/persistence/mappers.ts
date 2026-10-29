import type { CompanyDto, FarmDto, PlotDto, SamplingPointDto } from '@base/saphi';
import type { Selectable } from 'kysely';
import type { Database } from '../../lib/db-types.js';

export const companyDto = (r: Selectable<Database['saphi.companies']>): CompanyDto => ({
  id: r.id, rut: r.rut, legalName: r.legal_name, tradeName: r.trade_name,
  contactEmail: r.contact_email, contactPhone: r.contact_phone, status: r.status, version: Number(r.version),
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
export const farmDto = (r: Selectable<Database['saphi.farms']>): FarmDto => ({
  id: r.id, companyId: r.company_id, code: r.code, name: r.name, areaHa: r.area_ha,
  status: r.status, version: Number(r.version), createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
export const plotDto = (r: Selectable<Database['saphi.plots']>): PlotDto => ({
  ...farmDto(r), farmId: r.farm_id, grapeVariety: r.grape_variety, plantingYear: r.planting_year, soilType: r.soil_type,
});
export const pointDto = (r: Selectable<Database['saphi.sampling_points']>): SamplingPointDto => ({
  id: r.id, companyId: r.company_id, plotId: r.plot_id, code: r.code, location: r.location,
  status: r.status, version: Number(r.version), createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
