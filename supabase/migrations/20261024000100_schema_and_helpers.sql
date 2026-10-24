-- Schema, application database roles and generic helpers.
-- Portable PostgreSQL (>= 15). No Supabase-specific objects.

create schema app;
revoke all on schema app from public;

-- Application roles. NOLOGIN here; each environment enables them with
-- ALTER ROLE app_api LOGIN PASSWORD '...' (never a separate member role: policies and
-- guards rely on current_user being exactly app_api / app_auth).
--   app_api  : authenticated API Lambdas. Always runs with app.user_id set.
--   app_auth : unauthenticated auth flows (Cognito triggers, login failures, invitation acceptance).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then
    create role app_api nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_auth') then
    create role app_auth nologin;
  end if;
end
$$;

grant usage on schema app to app_api, app_auth;

-- Current actor, set by the backend per transaction: select set_config('app.user_id', '<uuid>', true)
create function app.current_user_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- {"es": "...", "en": "..."} with both languages non-empty.
create function app.is_i18n(value jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
     and length(trim(coalesce(value ->> 'es', ''))) > 0
     and length(trim(coalesce(value ->> 'en', ''))) > 0
$$;

-- Canonical Chilean RUT "12345678-5". Must match packages/shared/src/rut.ts.
create function app.is_valid_rut(rut text) returns boolean
language plpgsql immutable strict
set search_path = ''
as $$
declare
  body text;
  total integer := 0;
  factor integer := 2;
  remainder integer;
begin
  if rut !~ '^[1-9][0-9]{0,7}-[0-9K]$' then
    return false;
  end if;
  body := split_part(rut, '-', 1);
  for i in reverse length(body)..1 loop
    total := total + substr(body, i, 1)::integer * factor;
    factor := case when factor = 7 then 2 else factor + 1 end;
  end loop;
  remainder := 11 - (total % 11);
  return split_part(rut, '-', 2) = case remainder when 11 then '0' when 10 then 'K' else remainder::text end;
end
$$;

create function app.is_valid_time_zone(tz text) returns boolean
language plpgsql stable strict
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end
$$;

-- Keeps updated_at / updated_by current on every UPDATE.
create function app.set_updated() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := app.current_user_id();
  return new;
end
$$;
