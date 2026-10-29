-- Phase 7 catalogue only. No importer, object store, presigner, service principal or formulas.
create table saphi.satellite_observations (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references saphi.companies,plot_id uuid not null,
  provider_code text not null check(provider_code ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  source_observation_id text not null check(length(trim(source_observation_id)) between 1 and 255),
  product_reference text not null check(length(trim(product_reference)) between 1 and 255),
  licence_reference text not null check(length(trim(licence_reference)) between 1 and 500),
  acquired_at timestamptz not null check(isfinite(acquired_at)),received_at timestamptz not null default now() check(isfinite(received_at)),
  quality_code text check(length(trim(quality_code)) between 1 and 100),
  coverage_text text check(length(trim(coverage_text)) between 1 and 500),
  foreign key(company_id,plot_id) references saphi.plots(company_id,id),
  unique(company_id,id),unique(company_id,plot_id,provider_code,source_observation_id)
);
create index satellite_observations_history_idx on saphi.satellite_observations(company_id,plot_id,acquired_at desc,id desc);

create table saphi.satellite_assets (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references saphi.companies,observation_id uuid not null,
  source_asset_reference text not null check(length(trim(source_asset_reference)) between 1 and 512),
  foreign key(company_id,observation_id) references saphi.satellite_observations(company_id,id),
  unique(company_id,observation_id,source_asset_reference)
);
create index satellite_assets_observation_idx on saphi.satellite_assets(company_id,observation_id,id);
alter table saphi.satellite_observations enable row level security;
alter table saphi.satellite_assets enable row level security;
create policy read_rows on saphi.satellite_observations for select to app_api using(
  saphi.can_access(company_id,'saphi.satellite','view') and saphi.has_permission(company_id,'saphi.plots','view'));
create policy read_rows on saphi.satellite_assets for select to app_api using(
  saphi.can_access(company_id,'saphi.satellite','view') and saphi.has_permission(company_id,'saphi.plots','view'));
revoke all on saphi.satellite_observations,saphi.satellite_assets from public,app_api,app_auth;
grant select on saphi.satellite_observations to app_api;
-- Runtime cannot read private source references even with table scope. Only opaque IDs.
grant select(id,company_id,observation_id) on saphi.satellite_assets to app_api;
update app.menus set route='/saphi/satellite' where code='saphi.satellite';
