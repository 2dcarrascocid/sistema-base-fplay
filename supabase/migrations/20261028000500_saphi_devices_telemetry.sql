-- Phase 6: informational device registry and read-only telemetry for human runtime.
create function saphi.valid_device_metadata(value jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(value)<>'object' then false else octet_length(value::text)<=4096
    and value-array['manufacturer','model','serialNumber']='{}'::jsonb
    and not exists(select 1 from jsonb_each(case when jsonb_typeof(value)='object' then value else '{}'::jsonb end) x
      where jsonb_typeof(x.value)<>'string' or length(trim(x.value#>>'{}')) not between 1 and 100) end
$$;
revoke all on function saphi.valid_device_metadata(jsonb) from public;
grant execute on function saphi.valid_device_metadata(jsonb) to app_api;

create table saphi.devices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references saphi.companies,
  plot_id uuid not null, code text not null check(length(trim(code)) between 1 and 64),
  provider_code text not null check(provider_code ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  external_device_id text not null check(length(external_device_id)<=200 and length(trim(external_device_id))>0),
  status text not null default 'active' check(status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb check(saphi.valid_device_metadata(metadata) is true),
  version bigint not null default 1 check(version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),updated_by uuid references app.users default app.current_user_id(),
  unique(company_id,id),unique(company_id,code),foreign key(company_id,plot_id) references saphi.plots(company_id,id)
);
create index devices_page_idx on saphi.devices(company_id,created_at desc,id desc);
create index devices_plot_idx on saphi.devices(company_id,plot_id);

create function saphi.stamp_device() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (to_jsonb(new)-array['status','metadata','version','created_at','created_by','updated_at','updated_by'])
      is distinct from (to_jsonb(old)-array['status','metadata','version','created_at','created_by','updated_at','updated_by']) then
      raise exception 'device identity is immutable' using errcode='42501';
    end if;
    new.version:=old.version+1;new.created_at:=old.created_at;new.created_by:=old.created_by;
  else
    new.version:=1;new.created_at:=now();new.created_by:=app.current_user_id();
  end if;
  new.updated_at:=now();new.updated_by:=app.current_user_id();return new;
end $$;
revoke all on function saphi.stamp_device() from public;
create trigger stamp_device before insert or update on saphi.devices for each row execute function saphi.stamp_device();
create trigger audit_row after insert or update on saphi.devices for each row execute function saphi.audit_row();
alter table saphi.devices enable row level security;
create policy read_rows on saphi.devices for select to app_api using(saphi.can_access(company_id,'saphi.devices','view'));
create policy insert_rows on saphi.devices for insert to app_api with check(saphi.can_access(company_id,'saphi.devices','create'));
create policy update_rows on saphi.devices for update to app_api using(saphi.can_access(company_id,'saphi.devices','edit')) with check(saphi.can_access(company_id,'saphi.devices','edit'));
revoke all on saphi.devices from public,app_api,app_auth;
grant select on saphi.devices to app_api;
grant insert(company_id,plot_id,code,provider_code,external_device_id,status,metadata) on saphi.devices to app_api;
grant update(status,metadata) on saphi.devices to app_api;

create table saphi.sensor_readings (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references saphi.companies,device_id uuid not null,
  source_message_id text not null check(length(source_message_id) between 1 and 255),
  sample_index integer not null check(sample_index>=0),
  metric_code text not null check(metric_code ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
  value numeric not null check(value::text not in ('NaN','Infinity','-Infinity')),
  unit_code text not null check(length(trim(unit_code)) between 1 and 64),
  observed_at timestamptz not null check(isfinite(observed_at)),
  received_at timestamptz not null default now() check(isfinite(received_at)),
  quality_code text check(length(trim(quality_code)) between 1 and 64),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  binding_version bigint not null check(binding_version between 1 and 9007199254740991),
  foreign key(company_id,device_id) references saphi.devices(company_id,id),
  unique(company_id,device_id,source_message_id,sample_index)
);
create index sensor_readings_history_idx on saphi.sensor_readings(company_id,device_id,observed_at desc,id desc);
create index sensor_readings_metric_idx on saphi.sensor_readings(company_id,device_id,metric_code,observed_at desc,id desc);
alter table saphi.sensor_readings enable row level security;
create policy read_rows on saphi.sensor_readings for select to app_api using(
  saphi.can_access(company_id,'saphi.telemetry','view') and saphi.has_permission(company_id,'saphi.devices','view'));
-- Intentionally no ingestion role, function, INSERT/UPDATE/DELETE or PUBLIC access.
revoke all on saphi.sensor_readings from public,app_api,app_auth;
grant select on saphi.sensor_readings to app_api;

update app.menus set route='/saphi/devices' where code='saphi.devices';
update app.menus set route='/saphi/telemetry' where code='saphi.telemetry';
