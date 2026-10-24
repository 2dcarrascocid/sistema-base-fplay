-- Application configuration (superuser only): general settings, security policy, email templates.

create table app.app_settings (
  id boolean primary key default true check (id),
  system_name text not null check (length(trim(system_name)) between 1 and 100),
  logo_key text check (length(logo_key) <= 500),
  primary_color text not null check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  default_locale text not null check (default_locale in ('es', 'en')),
  default_time_zone text not null check (length(default_time_zone) <= 64),
  self_registration_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users (id) default app.current_user_id()
);

create trigger app_settings_set_updated before update on app.app_settings
  for each row execute function app.set_updated();

create function app.app_settings_validate_time_zone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.is_valid_time_zone(new.default_time_zone) then
    raise exception 'invalid time zone' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger app_settings_validate_time_zone before insert or update of default_time_zone on app.app_settings
  for each row execute function app.app_settings_validate_time_zone();

create table app.security_policy (
  id boolean primary key default true check (id),
  password_min_length integer not null default 12 check (password_min_length between 12 and 128),
  password_require_upper boolean not null default true,
  password_require_lower boolean not null default true,
  password_require_digit boolean not null default true,
  password_require_symbol boolean not null default true,
  password_max_age_days integer not null default 0 check (password_max_age_days between 0 and 365),
  max_failed_attempts integer not null default 5 check (max_failed_attempts between 3 and 10),
  lockout_minutes integer not null default 15 check (lockout_minutes between 1 and 1440),
  idle_timeout_minutes integer not null default 15 check (idle_timeout_minutes between 5 and 120),
  session_max_hours integer not null default 12 check (session_max_hours between 1 and 720),
  invitation_ttl_hours integer not null default 72 check (invitation_ttl_hours between 1 and 168),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users (id) default app.current_user_id()
);

create trigger security_policy_set_updated before update on app.security_policy
  for each row execute function app.set_updated();

create table app.email_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in ('invitation', 'activation', 'password_reset', 'account_locked')),
  locale text not null check (locale in ('es', 'en')),
  subject text not null check (length(trim(subject)) between 1 and 200),
  body_html text not null check (length(body_html) between 1 and 100000),
  body_text text not null check (length(body_text) between 1 and 50000),
  created_at timestamptz not null default now(),
  created_by uuid references app.users (id) default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users (id) default app.current_user_id(),
  unique (code, locale)
);

create trigger email_templates_set_updated before update on app.email_templates
  for each row execute function app.set_updated();
