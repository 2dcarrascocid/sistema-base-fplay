-- Dedicated machine identity. Credentials and LOGIN are provisioned separately, never in migrations.
do $$ begin if not exists(select 1 from pg_roles where rolname='saphi_ingest') then create role saphi_ingest nologin nosuperuser nobypassrls; end if; end $$;
create table saphi.iot_bindings (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,device_id uuid not null,
  account_id text not null check(account_id ~ '^\d{12}$'),principal text not null check(principal ~ '^[a-f0-9]{64}$'),
  client_id text not null check(length(client_id) between 1 and 128),external_device_id text not null,
  topic text not null check(length(topic) between 1 and 256),active boolean not null default true,
  version bigint not null default 1 check(version>0),
  temperature_metric text not null check(temperature_metric in ('temperature.unspecified','air_temperature','soil_temperature')),
  max_past_seconds integer not null check(max_past_seconds between 1 and 31536000),
  max_future_seconds integer not null check(max_future_seconds between 0 and 86400),
  foreign key(company_id,device_id) references saphi.devices(company_id,id),
  unique(account_id,principal,client_id,external_device_id),unique(device_id)
);
alter table saphi.iot_bindings enable row level security;
revoke all on saphi.iot_bindings from public,app_api,app_auth,saphi_ingest;
create function saphi.stamp_iot_binding() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.company_id,new.device_id,new.external_device_id) is distinct from (old.company_id,old.device_id,old.external_device_id) then
    raise exception 'binding destination is immutable' using errcode='42501';
  end if;
  new.version:=old.version+1;return new;
end $$;
revoke all on function saphi.stamp_iot_binding() from public;
create trigger stamp_binding before update on saphi.iot_bindings for each row execute function saphi.stamp_iot_binding();
create trigger audit_row after insert or update on saphi.iot_bindings for each row execute function saphi.audit_row();
create table saphi.iot_receipts (
  binding_id uuid not null references saphi.iot_bindings,id uuid not null,payload_hash text not null,
  received_at timestamptz not null default now(),source text not null check(source in ('simulator','device')),
  primary key(binding_id,id)
);
alter table saphi.iot_receipts enable row level security;
revoke all on saphi.iot_receipts from public,app_api,app_auth,saphi_ingest;
-- Narrow SECURITY DEFINER boundary: no table privileges or tenant selector for the service role.
create function saphi.ingest_iot(e jsonb,h text) returns text
language plpgsql security definer set search_path='' as $$
declare b saphi.iot_bindings; p jsonb:=e->'payload'; m jsonb; old_hash text; at_time timestamptz; received timestamptz;
  i integer; metric text; unit text; val numeric;
begin
  if e is null or h !~ '^[a-f0-9]{64}$' or p->>'schemaVersion'<>'1' or p->>'source' not in ('simulator','device')
    or jsonb_typeof(p->'measurements')<>'object' then raise exception 'invalid message' using errcode='22023'; end if;
  select x.* into b from saphi.iot_bindings x join saphi.devices d on d.id=x.device_id and d.company_id=x.company_id
    join saphi.companies c on c.id=x.company_id
    where x.account_id=e#>>'{broker,accountId}' and x.principal=e#>>'{broker,principal}'
      and x.client_id=e#>>'{broker,clientId}' and x.external_device_id=p->>'deviceId'
      and x.topic=e#>>'{broker,topic}' and x.active and d.status='active' and c.status='active'
      and d.provider_code='aws.iot' and d.external_device_id=x.external_device_id
    for share of x,d,c;
  if not found then raise exception 'binding unavailable' using errcode='42501'; end if;
  at_time:=(p->>'timestamp')::timestamptz;
  received:=pg_catalog.to_timestamp((e#>>'{broker,receivedAt}')::numeric/1000);
  if at_time is null or not isfinite(at_time) or received is null or not isfinite(received)
    or at_time<now()-pg_catalog.make_interval(secs=>b.max_past_seconds)
    or at_time>now()+pg_catalog.make_interval(secs=>b.max_future_seconds)
    or received>now()+interval '5 minutes' or received<at_time-pg_catalog.make_interval(secs=>b.max_future_seconds)
    then raise exception 'timestamp rejected' using errcode='22023'; end if;
  insert into saphi.iot_receipts(binding_id,id,payload_hash,source,received_at)
    values(b.id,(p->>'messageId')::uuid,h,p->>'source',received) on conflict do nothing;
  if not found then
    select payload_hash into old_hash from saphi.iot_receipts where binding_id=b.id and id=(p->>'messageId')::uuid;
    if old_hash<>h then raise exception 'message identity conflict' using errcode='23505'; end if;
    return 'duplicate';
  end if;
  m:=p->'measurements';
  if m-'temperature'-'soilMoisture'<>'{}'::jsonb or m='{}'::jsonb then raise exception 'metrics rejected' using errcode='22023'; end if;
  for i in 0..1 loop
    if (i=0 and not m?'temperature') or (i=1 and not m?'soilMoisture') then continue; end if;
    metric:=case when i=0 then b.temperature_metric else 'soil_moisture' end;
    unit:=case when i=0 then 'C' else '%' end;
    val:=(m->(case when i=0 then 'temperature' else 'soilMoisture' end)->>'value')::numeric;
    if val is null or val::text in ('NaN','Infinity','-Infinity') or
      m->(case when i=0 then 'temperature' else 'soilMoisture' end)->>'unit' is distinct from unit
      then raise exception 'measurement rejected' using errcode='22023'; end if;
    insert into saphi.sensor_readings(company_id,device_id,source_message_id,sample_index,metric_code,value,unit_code,observed_at,received_at,quality_code,payload_hash,binding_version)
      values(b.company_id,b.device_id,p->>'messageId',i,metric,val,unit,at_time,received,
        case when p->>'source'='simulator' then 'demo.simulator' else 'source.device' end,h,b.version);
  end loop;
  return 'accepted';
end $$;
revoke all on function saphi.ingest_iot(jsonb,text) from public,app_api,app_auth;
grant usage on schema saphi to saphi_ingest;
grant execute on function saphi.ingest_iot(jsonb,text) to saphi_ingest;
