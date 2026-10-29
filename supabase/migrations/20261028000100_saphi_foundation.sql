-- Saphi Phase 3: tenant foundation only. No HTTP routes, providers or agronomic rules.
-- Schema, policies and grants are applied together. Runtime never owns these objects.
create schema saphi;
revoke all on schema saphi from public;
grant usage on schema saphi to app_api;

create function saphi.current_company_id() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  return nullif(current_setting('saphi.company_id', true), '')::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

-- Point exchange format only; does not validate polygons or install a GIS extension.
create function saphi.is_point(value jsonb) returns boolean
language plpgsql immutable strict set search_path = '' as $$
begin
  return coalesce(jsonb_typeof(value) = 'object'
    and value - 'type' - 'coordinates' = '{}'::jsonb
    and value ->> 'type' = 'Point'
    and jsonb_typeof(value -> 'coordinates') = 'array'
    and jsonb_array_length(value -> 'coordinates') = 2
    and jsonb_typeof(value #> '{coordinates,0}') = 'number'
    and jsonb_typeof(value #> '{coordinates,1}') = 'number'
    and (value #>> '{coordinates,0}')::numeric between -180 and 180
    and (value #>> '{coordinates,1}')::numeric between -90 and 90, false);
exception when others then
  return false;
end
$$;

create table saphi.companies (
  id uuid primary key default gen_random_uuid(),
  rut text not null unique check (app.is_valid_rut(rut)),
  legal_name text not null check (length(trim(legal_name)) between 1 and 200),
  trade_name text check (length(trim(trade_name)) between 1 and 200),
  contact_email text check (length(contact_email) between 3 and 254),
  contact_phone text check (length(contact_phone) between 1 and 40),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users default app.current_user_id()
);

create table saphi.company_users (
  company_id uuid not null references saphi.companies,
  user_id uuid not null references app.users,
  status text not null default 'active' check (status in ('active', 'inactive')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users default app.current_user_id(),
  primary key (company_id, user_id)
);
create index company_users_user_idx on saphi.company_users (user_id, company_id);

create table saphi.company_user_permissions (
  company_id uuid not null,
  user_id uuid not null,
  menu_action_id uuid not null references app.menu_actions,
  granted_at timestamptz not null default now(),
  granted_by uuid references app.users default app.current_user_id(),
  primary key (company_id, user_id, menu_action_id),
  foreign key (company_id, user_id) references saphi.company_users (company_id, user_id)
);
create index company_user_permissions_action_idx on saphi.company_user_permissions (menu_action_id);

create table saphi.farms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references saphi.companies,
  code text not null check (length(trim(code)) between 1 and 64),
  name text not null check (length(trim(name)) between 1 and 200),
  -- Unconstrained scale + explicit check avoids silently rounding an over-precise input.
  area_ha numeric check (area_ha > 0 and area_ha < 10000000000 and scale(area_ha) <= 4),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users default app.current_user_id(),
  unique (company_id, id), unique (company_id, code)
);

create table saphi.plots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references saphi.companies,
  farm_id uuid not null,
  code text not null check (length(trim(code)) between 1 and 64),
  name text not null check (length(trim(name)) between 1 and 200),
  area_ha numeric check (area_ha > 0 and area_ha < 10000000000 and scale(area_ha) <= 4),
  grape_variety text check (length(trim(grape_variety)) between 1 and 200),
  planting_year integer check (planting_year between 1 and 9999),
  soil_type text check (length(trim(soil_type)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users default app.current_user_id(),
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, farm_id) references saphi.farms (company_id, id)
);
create index plots_farm_idx on saphi.plots (company_id, farm_id);

create table saphi.sampling_points (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references saphi.companies,
  plot_id uuid not null,
  code text not null check (length(trim(code)) between 1 and 64),
  location jsonb not null check (saphi.is_point(location) is true),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users default app.current_user_id(),
  unique (company_id, id), unique (company_id, plot_id, id), unique (company_id, code),
  foreign key (company_id, plot_id) references saphi.plots (company_id, id)
);
create index sampling_points_plot_idx on saphi.sampling_points (company_id, plot_id);

create table saphi.soil_samples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references saphi.companies,
  plot_id uuid not null,
  sampling_point_id uuid,
  code text not null check (length(trim(code)) between 1 and 64),
  sampled_at timestamptz not null check (isfinite(sampled_at)),
  notes text check (length(notes) <= 2000),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  created_by uuid references app.users default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users default app.current_user_id(),
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, plot_id) references saphi.plots (company_id, id),
  foreign key (company_id, plot_id, sampling_point_id)
    references saphi.sampling_points (company_id, plot_id, id)
);
create index soil_samples_plot_date_idx on saphi.soil_samples (company_id, plot_id, sampled_at desc, id desc);

-- One set of permission definitions: catalogue remains in app, scope lives in saphi.
insert into app.menus (kind, code, name, sort_order, is_system)
values ('module', 'saphi', '{"es":"Saphi Chile","en":"Saphi Chile"}', 30, true);

insert into app.menus (parent_id, kind, code, name, sort_order, is_system)
select m.id, 'menu', 'saphi.' || x.code, jsonb_build_object('es', x.es, 'en', x.en), x.ord, true
from app.menus m cross join (values
  ('companies','Empresas','Companies',10), ('memberships','Miembros','Members',20),
  ('farms','Predios','Farms',30), ('plots','Cuarteles','Plots',40),
  ('samples','Muestras','Samples',50), ('laboratory','Laboratorio','Laboratory',60),
  ('devices','Dispositivos','Devices',70), ('telemetry','Telemetría','Telemetry',80),
  ('satellite','Satélite','Satellite',90), ('irrigation','Riego','Irrigation',100),
  ('indicators','Indicadores','Indicators',110), ('dashboard','Dashboard','Dashboard',120)
) as x(code, es, en, ord) where m.code = 'saphi';
-- Routes deliberately NULL: no broken links or agricultural menus in /me yet.

create function saphi.catalog_actions() returns table (menu_code text, action_code text)
language sql immutable set search_path = '' as $$
  select 'saphi.' || x.menu, unnest(x.actions) from (values
    ('companies',array['view','create','edit']), ('memberships',array['view','edit']),
    ('farms',array['view','create','edit']), ('plots',array['view','create','edit']),
    ('samples',array['view','create','edit']), ('laboratory',array['view','create','edit']),
    ('devices',array['view','create','edit']), ('telemetry',array['view']),
    ('satellite',array['view']), ('irrigation',array['view','create','edit']),
    ('indicators',array['view']), ('dashboard',array['view'])
  ) as x(menu, actions)
$$;

-- Fresh installs load base actions in seed.sql AFTER migrations. Existing installations
-- already have them. This fixed, narrow trigger supports both orders without editing seeds.
create function saphi.attach_catalog_action() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.menu_actions (menu_id, action_id)
  select m.id, new.id from saphi.catalog_actions() c
    join app.menus m on m.code = c.menu_code where c.action_code = new.code
  on conflict (menu_id, action_id) do nothing;
  return new;
end
$$;
create trigger saphi_attach_catalog_action after insert on app.actions
  for each row execute function saphi.attach_catalog_action();
insert into app.menu_actions (menu_id, action_id)
select m.id, a.id from saphi.catalog_actions() c
join app.menus m on m.code = c.menu_code join app.actions a on a.code = c.action_code
on conflict (menu_id, action_id) do nothing;

-- Helpers read through RLS only to answer questions about the CURRENT actor.
-- No caller-selected user id and no implicit superuser membership.
create function saphi.is_member(p_company_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from saphi.company_users cu
    join saphi.companies c on c.id = cu.company_id and c.status = 'active'
    join app.users u on u.id = cu.user_id and u.status = 'active'
    where cu.company_id = p_company_id and cu.user_id = app.current_user_id() and cu.status = 'active'
  )
$$;

create function saphi.has_permission(p_company_id uuid, p_menu text, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select saphi.is_member(p_company_id) and exists (
    select 1 from saphi.company_user_permissions cp
    join app.v_user_permissions vp on vp.user_id = cp.user_id and vp.menu_action_id = cp.menu_action_id
    join saphi.catalog_actions() cat on cat.menu_code = vp.menu_code and cat.action_code = vp.action_code
    where cp.company_id = p_company_id and cp.user_id = app.current_user_id()
      and vp.menu_code = p_menu and vp.action_code = p_action
  )
$$;

create function saphi.can_access(p_company_id uuid, p_menu text, p_action text) returns boolean
language sql stable set search_path = '' as $$
  select p_company_id = saphi.current_company_id() and saphi.has_permission(p_company_id, p_menu, p_action)
$$;

create function saphi.set_company_context(p_company_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not saphi.is_member(p_company_id) then
    raise exception 'company not accessible' using errcode = '42501';
  end if;
  if saphi.current_company_id() is not null and saphi.current_company_id() <> p_company_id then
    raise exception 'company context cannot change within transaction' using errcode = '42501';
  end if;
  -- Held until transaction end; administrative revocation must wait for authorized writes.
  perform 1 from saphi.companies c join saphi.company_users cu on cu.company_id = c.id
    where c.id = p_company_id and c.status = 'active'
      and cu.user_id = app.current_user_id() and cu.status = 'active'
    for share of c, cu;
  if not found then
    raise exception 'company not accessible' using errcode = '42501';
  end if;
  perform set_config('saphi.company_id', p_company_id::text, true);
end
$$;

-- A FK to app.menu_actions alone would also allow unrelated Base Fairplay permissions.
create function saphi.permission_catalog_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from app.menu_actions ma join app.menus m on m.id = ma.menu_id
    join app.actions a on a.id = ma.action_id
    join saphi.catalog_actions() c on c.menu_code = m.code and c.action_code = a.code
    where ma.id = new.menu_action_id
  ) then
    raise exception 'permission outside Saphi catalogue' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger permission_catalog_guard before insert or update on saphi.company_user_permissions
  for each row execute function saphi.permission_catalog_guard();

-- Database stamps are not caller-controlled; identity/parent columns are immutable.
create function saphi.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['name','legal_name','trade_name','contact_email','contact_phone',
       'area_ha','status','grape_variety','planting_year','soil_type','location','notes',
       'version','created_at','created_by','updated_at','updated_by']) is distinct from
       (to_jsonb(old) - array['name','legal_name','trade_name','contact_email','contact_phone',
       'area_ha','status','grape_variety','planting_year','soil_type','location','notes',
       'version','created_at','created_by','updated_at','updated_by']) then
      raise exception 'identity and parent columns are immutable' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  else
    new.version := 1;
    new.created_at := now();
    new.created_by := app.current_user_id();
  end if;
  new.updated_at := now();
  new.updated_by := app.current_user_id();
  return new;
end
$$;

-- Mutations are low-volume masters, not telemetry. Append to the existing immutable chain.
create function saphi.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
begin
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;
  insert into app.audit_log (actor_user_id, actor_email, event_type, entity_type, entity_id, result, old_value, new_value)
  values (app.current_user_id(), (select email from app.users where id = app.current_user_id()),
    'saphi.' || tg_table_name || case when tg_op = 'INSERT' then '.created' else '.updated' end,
    'saphi.' || tg_table_name, coalesce(v_new ->> 'id', v_new ->> 'user_id'), 'success',
    case when v_old is null then null else jsonb_build_object('companyId', coalesce(v_old ->> 'company_id', v_old ->> 'id'), 'record', v_old) end,
    jsonb_build_object('companyId', coalesce(v_new ->> 'company_id', v_new ->> 'id'), 'record', v_new));
  return new;
end
$$;

do $$
declare v_table text; v_menu text;
begin
  foreach v_table in array array['companies','company_users','farms','plots','sampling_points','soil_samples'] loop
    execute format('create trigger stamp_row before insert or update on saphi.%I for each row execute function saphi.stamp_row()', v_table);
    execute format('create trigger audit_row after insert or update on saphi.%I for each row execute function saphi.audit_row()', v_table);
  end loop;
  foreach v_table in array array['companies','company_users','company_user_permissions','farms','plots','sampling_points','soil_samples'] loop
    execute format('alter table saphi.%I enable row level security', v_table);
  end loop;
  foreach v_table in array array['farms','plots','sampling_points','soil_samples'] loop
    v_menu := case when v_table in ('sampling_points','soil_samples') then 'saphi.samples' else 'saphi.' || v_table end;
    execute format('create policy read_rows on saphi.%I for select to app_api using (saphi.can_access(company_id, %L, ''view''))', v_table, v_menu);
    execute format('create policy insert_rows on saphi.%I for insert to app_api with check (saphi.can_access(company_id, %L, ''create''))', v_table, v_menu);
    if v_table <> 'soil_samples' then
      execute format('create policy update_rows on saphi.%I for update to app_api using (saphi.can_access(company_id, %L, ''edit'')) with check (saphi.can_access(company_id, %L, ''edit''))', v_table, v_menu, v_menu);
    end if;
  end loop;
end
$$;

-- Discovery is restricted to the actor's own permitted companies, even without a selector.
create policy read_companies on saphi.companies for select to app_api
  using (saphi.has_permission(id, 'saphi.companies', 'view')
    and (saphi.current_company_id() is null or id = saphi.current_company_id()));
create policy read_memberships on saphi.company_users for select to app_api
  using (saphi.is_member(company_id) and (user_id = app.current_user_id()
    or saphi.can_access(company_id, 'saphi.memberships', 'view')));
create policy read_scoped_permissions on saphi.company_user_permissions for select to app_api
  using (saphi.is_member(company_id) and (user_id = app.current_user_id()
    or saphi.can_access(company_id, 'saphi.memberships', 'view')));

revoke all on all tables in schema saphi from public;
revoke execute on all functions in schema saphi from public;
grant execute on function saphi.current_company_id(), saphi.is_point(jsonb), saphi.is_member(uuid),
  saphi.has_permission(uuid,text,text), saphi.can_access(uuid,text,text), saphi.set_company_context(uuid) to app_api;
grant select on all tables in schema saphi to app_api;
-- Membership/company administration remains closed until its reviewed functions exist.
grant insert (company_id,code,name,area_ha,status) on saphi.farms to app_api;
grant update (name,area_ha,status) on saphi.farms to app_api;
grant insert (company_id,farm_id,code,name,area_ha,grape_variety,planting_year,soil_type,status) on saphi.plots to app_api;
grant update (name,area_ha,grape_variety,planting_year,soil_type,status) on saphi.plots to app_api;
grant insert (company_id,plot_id,code,location,status) on saphi.sampling_points to app_api;
grant update (location,status) on saphi.sampling_points to app_api;
grant insert (company_id,plot_id,sampling_point_id,code,sampled_at,notes) on saphi.soil_samples to app_api;
-- No DELETE, TRUNCATE, company/membership DML, or historical sample UPDATE grants.
