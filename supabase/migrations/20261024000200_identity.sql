-- Roles, users, linked identities, sessions and invitations.
-- Passwords and MFA factors live only in Amazon Cognito.

create table app.roles (
  id smallint primary key,
  code text not null unique check (code in ('superuser', 'admin', 'client')),
  name jsonb not null check (app.is_i18n(name)),
  rank smallint not null unique,
  mfa_required boolean not null default false,
  constraint roles_privileged_mfa check (code = 'client' or mfa_required)
);

create table app.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  second_last_name text check (length(second_last_name) <= 100),
  rut text unique check (rut is null or app.is_valid_rut(rut)),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  job_title text check (length(job_title) <= 100),
  photo_key text check (length(photo_key) <= 500),
  role_id smallint not null references app.roles (id),
  status text not null default 'invited' check (status in ('invited', 'active', 'inactive')),
  failed_login_count integer not null default 0 check (failed_login_count >= 0),
  locked_until timestamptz,
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  mfa_enabled boolean not null default false,
  locale text check (locale in ('es', 'en')),
  time_zone text check (length(time_zone) <= 64),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references app.users (id) default app.current_user_id(),
  updated_at timestamptz not null default now(),
  updated_by uuid references app.users (id) default app.current_user_id()
);

create index users_role_status_idx on app.users (role_id, status);
create index users_name_idx on app.users (lower(last_name), lower(first_name));

create trigger users_set_updated before update on app.users
  for each row execute function app.set_updated();

create function app.users_validate_time_zone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.time_zone is not null and not app.is_valid_time_zone(new.time_zone) then
    raise exception 'invalid time zone' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger users_validate_time_zone before insert or update of time_zone on app.users
  for each row execute function app.users_validate_time_zone();

create table app.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  provider text not null check (provider in ('local', 'google', 'facebook', 'apple')),
  cognito_sub text not null unique check (length(cognito_sub) between 1 and 128),
  provider_subject text not null check (length(provider_subject) between 1 and 255),
  linked_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, provider_subject),
  unique (user_id, provider)
);

create table app.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  client_type text not null check (client_type in ('web', 'mobile')),
  origin_jti text not null unique check (length(origin_jti) between 1 and 128),
  refresh_token_hash bytea check (octet_length(refresh_token_hash) = 32),
  ip inet,
  user_agent text check (length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references app.users (id),
  revoked_reason text check (revoked_reason in ('logout', 'admin', 'password_change', 'idle', 'locked', 'deactivated')),
  check (revoked_at is null or revoked_reason is not null)
);

create index user_sessions_active_idx on app.user_sessions (user_id) where revoked_at is null;

create table app.invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid references app.users (id) default app.current_user_id(),
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);

create index invitations_user_idx on app.invitations (user_id);
