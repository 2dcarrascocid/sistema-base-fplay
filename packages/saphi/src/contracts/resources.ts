import type { SaphiPermission } from '../constants/permissions.js';
import type { DeviceMetadata } from '../schemas/iot.js';

export type DashboardSectionKey = 'farms'|'plots'|'devices'|'samples'|'telemetry'|'satellite'|'laboratory'|'indicators';
export interface DashboardItem { id: string; label: string; at?: string; value?: string; unit?: string }
export type DashboardSection = { status: 'available'; data: DashboardItem[]; hasMore: boolean }
  | { status: 'no_data'|'forbidden'|'pending_definition' };
export interface DashboardDto {
  companyId: string; plotId: string|null; period: { from: string; to: string }; generatedAt: string; limit: number;
  sections: Record<DashboardSectionKey, DashboardSection>;
}

export interface DeviceDto {
  id:string;companyId:string;plotId:string;code:string;providerCode:string;externalDeviceId:string;
  status:'active'|'inactive';metadata:DeviceMetadata;version:number;createdAt:string;updatedAt:string;
}
export interface ReadingDto {
  id:string;companyId:string;deviceId:string;metricCode:string;value:string;unitCode:string;
  observedAt:string;receivedAt:string;qualityCode:string|null;
}
export interface ObservationDto {
  id:string;companyId:string;plotId:string;providerCode:string;sourceObservationId:string;
  productReference:string;licenceReference:string;acquiredAt:string;receivedAt:string;
  qualityCode:string|null;coverageText:string|null;assetIds:string[];
  indicesStatus:'pending_definition';downloadStatus:'pending_definition';
}

export interface CompanyScope { readonly companyId: string }
export interface SoilSampleDto {
  id:string;companyId:string;plotId:string;samplingPointId:string|null;code:string;
  sampledAt:string;notes:string|null;version:number;createdAt:string;updatedAt:string;
}
export interface ResourceResponse<T> { data: T }
export interface Page<T> { data: T[]; page: { nextCursor: string | null; hasMore: boolean } }
export interface PageInput { limit: number; cursor?: string }

export interface CompanyDto {
  id: string;
  rut: string;
  legalName: string;
  tradeName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: 'active' | 'inactive';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FarmDto {
  id: string;
  companyId: string;
  code: string;
  name: string;
  areaHa: string | null;
  status: 'active' | 'inactive';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlotDto extends FarmDto {
  farmId: string;
  grapeVariety: string | null;
  plantingYear: number | null;
  soilType: string | null;
}

/** Informational snapshot for UI; never accepted as server authorization evidence. */
export interface CompanyCapabilitiesDto {
  companyId: string;
  membershipVersion: number;
  effectivePermissions: SaphiPermission[];
  menu: CompanyMenuNode[];
}

/** Same navigation shape as Base Fairplay; only the Saphi subtree belongs in this response. */
export interface CompanyMenuNode {
  code: string;
  kind: 'module' | 'menu' | 'submenu';
  name: { es: string; en: string };
  icon: string | null;
  route: string | null;
  children: CompanyMenuNode[];
}

export interface MembershipDto {
  userId: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'inactive';
  version: number;
  permissions: SaphiPermission[];
}

export interface SamplingPointDto {
  id: string;
  companyId: string;
  plotId: string;
  code: string;
  location: { type: 'Point'; coordinates: [number, number] };
  status: 'active' | 'inactive';
  version: number;
  createdAt: string;
  updatedAt: string;
}
