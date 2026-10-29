import type { ColumnType, Generated } from 'kysely';

/** PostgreSQL bigint/numeric are read as strings; never silently coerce to JS number. */
type Defaulted<T> = ColumnType<T, T | undefined, T>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;

interface StampedRow {
  version: Generated<string>;
  created_at: Generated<Date>;
  created_by: Defaulted<string | null>;
  updated_at: Generated<Date>;
  updated_by: Defaulted<string | null>;
}

interface CompanyRow extends StampedRow {
  id: Generated<string>;
  rut: string;
  legal_name: string;
  trade_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: Defaulted<'active' | 'inactive'>;
}

interface CompanyUserRow extends StampedRow {
  company_id: string;
  user_id: string;
  status: Defaulted<'active' | 'inactive'>;
}

interface CompanyPermissionRow {
  company_id: string;
  user_id: string;
  menu_action_id: string;
  granted_at: Generated<Date>;
  granted_by: Defaulted<string | null>;
}

interface FarmRow extends StampedRow {
  id: Generated<string>;
  company_id: string;
  code: string;
  name: string;
  area_ha: string | null;
  status: Defaulted<'active' | 'inactive'>;
}

interface PlotRow extends FarmRow {
  farm_id: string;
  grape_variety: string | null;
  planting_year: number | null;
  soil_type: string | null;
}

interface SamplingPointRow extends StampedRow {
  id: Generated<string>;
  company_id: string;
  plot_id: string;
  code: string;
  location: ColumnType<{ type: 'Point'; coordinates: [number, number] }, string, string>;
  status: Defaulted<'active' | 'inactive'>;
}

interface SoilSampleRow extends StampedRow {
  id: Generated<string>;
  company_id: string;
  plot_id: string;
  sampling_point_id: string | null;
  code: string;
  sampled_at: Timestamp;
  notes: string | null;
}

interface DeviceRow extends StampedRow {
  id:Generated<string>;company_id:string;plot_id:string;code:string;provider_code:string;external_device_id:string;
  status:Defaulted<'active'|'inactive'>;metadata:ColumnType<import('@base/saphi').DeviceMetadata,string,string>;
}
interface ReadingRow {
  id:Generated<string>;company_id:string;device_id:string;source_message_id:string;sample_index:number;
  metric_code:string;value:string;unit_code:string;observed_at:Timestamp;received_at:ColumnType<Date,Date|string|undefined,Date|string>;
  quality_code:string|null;payload_hash:string;binding_version:string;
}
interface ObservationRow {
  id:Generated<string>;company_id:string;plot_id:string;provider_code:string;source_observation_id:string;
  product_reference:string;licence_reference:string;acquired_at:Timestamp;received_at:ColumnType<Date,Date|string|undefined,Date|string>;
  quality_code:string|null;coverage_text:string|null;
}
interface SatelliteAssetRow {id:Generated<string>;company_id:string;observation_id:string;source_asset_reference:string}

/** Schema bindings only; this creates no repository or route. */
export interface SaphiDatabase {
  'saphi.companies': CompanyRow;
  'saphi.company_users': CompanyUserRow;
  'saphi.company_user_permissions': CompanyPermissionRow;
  'saphi.farms': FarmRow;
  'saphi.plots': PlotRow;
  'saphi.sampling_points': SamplingPointRow;
  'saphi.soil_samples': SoilSampleRow;
  'saphi.devices':DeviceRow;
  'saphi.sensor_readings':ReadingRow;
  'saphi.satellite_observations':ObservationRow;
  'saphi.satellite_assets':SatelliteAssetRow;
}
