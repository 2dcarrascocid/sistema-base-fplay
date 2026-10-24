-- Access-control functions, integrity guards, row level security and grants.
-- The backend is the first layer (it checks every request); this is the second layer.
-- SECURITY DEFINER functions are owned by the migration role, which is never used by the
-- application, so they read through RLS; app_api / app_auth never own tables.

-- ---------------------------------------------------------------------------------------------
-- Actor helpers
-- ---------------------------------------------------------------------------------------------

create function app.current_role_rank() returns smallint
language sql stable security definer
set search_path = ''
as $$
  select r.rank
  from app.users u
  join app.roles r on r.id = u.role_id
  where u.id = app.current_user_id() and u.status = 'active'
$$;

create function app.is_superuser() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.users u
    join app.roles r on r.id = u.role_id
    where u.id = app.current_user_id() and u.status = 'active' and r.code = 'superuser'
  )
$$;

create function app.has_permission(p_menu_code text, p_action_code text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.v_user_permissions
    where user_id = app.current_user_id() and menu_code = p_menu_code and action_code = p_action_code
  )
$$;

-- Role hierarchy: superuser manages everyone; otherwise only strictly lower roles
-- (admin -> client). Clients manage nobody.
create function app.can_manage_role(p_role_id smallint) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_superuser()
      or app.current_role_rank() < (select rank from app.roles where id = p_role_id)
$$;

create function app.can_manage_user(p_user_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.can_manage_role((select role_id from app.users where id = p_user_id))
$$;

-- A permission can go into a profile when it is not superuser-only and the actor holds it.
create function app.can_grant_menu_action(p_menu_action_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
      select 1
      from app.menu_actions ma
      join app.menus m on m.id = ma.menu_id
      left join app.menus p1 on p1.id = m.parent_id
      left join app.menus p2 on p2.id = p1.parent_id
      where ma.id = p_menu_action_id
        and not (m.superuser_only or coalesce(p1.superuser_only, false) or coalesce(p2.superuser_only, false))
    )
    and (
      app.is_superuser()
      or exists (
        select 1 from app.v_user_permissions
        where user_id = app.current_user_id() and menu_action_id = p_menu_action_id
      )
    )
$$;

-- An actor may assign, edit or remove a profile only if they hold every permission in it.
create function app.can_grant_profile(p_profile_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_superuser()
      or (
        app.current_role_rank() is not null
        and not exists (
          select 1
          from app.profile_permissions pp
          where pp.profile_id = p_profile_id
            and not exists (
              select 1 from app.v_user_permissions up
              where up.user_id = app.current_user_id() and up.menu_action_id = pp.menu_action_id
            )
        )
      )
$$;

-- Permissions of the current actor; the backend loads them on every request (no cache).
create function app.current_permissions() returns table (menu_code text, action_code text)
language sql stable security definer
set search_path = ''
as $$
  select menu_code, action_code from app.v_user_permissions where user_id = app.current_user_id()
$$;

create function app.user_effective_permissions(p_user_id uuid) returns table (menu_code text, action_code text)
language sql stable security definer
set search_path = ''
as $$
  select menu_code, action_code
  from app.v_user_permissions
  where user_id = p_user_id
    and (p_user_id = app.current_user_id() or app.has_permission('security.users', 'view'))
$$;

-- ---------------------------------------------------------------------------------------------
-- Login lockout (used by the auth flows)
-- ---------------------------------------------------------------------------------------------

-- Registers a failed login. Returns true when this failure locks the account.
create function app.register_login_failure(p_user_id uuid) returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_policy app.security_policy;
  v_count integer;
begin
  select * into v_policy from app.security_policy;

  update app.users set failed_login_count = failed_login_count + 1
  where id = p_user_id
  returning failed_login_count into v_count;

  if v_count >= v_policy.max_failed_attempts then
    update app.users
    set failed_login_count = 0,
        locked_until = now() + make_interval(mins => v_policy.lockout_minutes)
    where id = p_user_id;

    update app.user_sessions
    set revoked_at = now(), revoked_reason = 'locked'
    where user_id = p_user_id and revoked_at is null;
    return true;
  end if;
  return false;
end
$$;

create function app.register_login_success(p_user_id uuid) returns void
language sql volatile security definer
set search_path = ''
as $$
  update app.users
  set failed_login_count = 0, locked_until = null, last_login_at = now()
  where id = p_user_id
$$;

create function app.is_locked(p_user_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select locked_until > now() from app.users where id = p_user_id), false)
$$;

-- ---------------------------------------------------------------------------------------------
-- Integrity guards
-- ---------------------------------------------------------------------------------------------

-- There must always be at least one active superuser (checked at commit).
create function app.ensure_active_superuser() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.users u join app.roles r on r.id = u.role_id
    where r.code = 'superuser' and u.status = 'active'
  ) then
    raise exception 'at least one active superuser is required' using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger users_ensure_active_superuser
  after update of role_id, status or delete on app.users
  deferrable initially deferred
  for each row execute function app.ensure_active_superuser();

-- Column rules RLS cannot express. Not SECURITY DEFINER: it inspects the calling role.
create function app.users_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'app_auth' then
    if new.status is distinct from old.status and not (old.status = 'invited' and new.status = 'active') then
      raise exception 'invalid status change' using errcode = '42501';
    end if;
  elsif current_user = 'app_api' and old.id = app.current_user_id() then
    if new.role_id <> old.role_id
       or new.status <> old.status
       or new.failed_login_count <> old.failed_login_count
       or new.locked_until is distinct from old.locked_until then
      raise exception 'users cannot change their own role, status or lock' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create trigger users_guard before update on app.users
  for each row execute function app.users_guard();

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table app.roles enable row level security;
alter table app.users enable row level security;
alter table app.user_identities enable row level security;
alter table app.user_sessions enable row level security;
alter table app.invitations enable row level security;
alter table app.profiles enable row level security;
alter table app.user_profiles enable row level security;
alter table app.menus enable row level security;
alter table app.actions enable row level security;
alter table app.menu_actions enable row level security;
alter table app.profile_permissions enable row level security;
alter table app.app_settings enable row level security;
alter table app.security_policy enable row level security;
alter table app.email_templates enable row level security;
alter table app.rate_limits enable row level security;
alter table app.audit_log enable row level security;

-- roles
create policy roles_read on app.roles for select to app_api, app_auth using (true);
create policy roles_update on app.roles for update to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));

-- users
create policy users_read on app.users for select to app_api
  using (id = app.current_user_id() or (select app.has_permission('security.users', 'view')));
create policy users_insert on app.users for insert to app_api
  with check ((select app.has_permission('security.users', 'create')) and app.can_manage_role(role_id));
create policy users_update on app.users for update to app_api
  using (
    id = app.current_user_id()
    or (
      ((select app.has_permission('security.users', 'edit'))
        or (select app.has_permission('security.users', 'unlock'))
        or (select app.has_permission('security.users', 'reset_password')))
      and app.can_manage_role(role_id)
    )
  )
  with check (id = app.current_user_id() or app.can_manage_role(role_id));

create policy users_auth_read on app.users for select to app_auth using (true);
create policy users_auth_update on app.users for update to app_auth using (true) with check (true);
create policy users_auth_self_register on app.users for insert to app_auth
  with check (
    role_id = (select id from app.roles where code = 'client')
    and status = 'active'
    and (select self_registration_enabled from app.app_settings)
  );

-- user_identities (linked accounts are created by the auth flows only)
create policy user_identities_read on app.user_identities for select to app_api
  using (user_id = app.current_user_id() or (select app.has_permission('security.users', 'view')));
create policy user_identities_auth_read on app.user_identities for select to app_auth using (true);
create policy user_identities_auth_insert on app.user_identities for insert to app_auth with check (true);
create policy user_identities_auth_update on app.user_identities for update to app_auth using (true) with check (true);

-- user_sessions
create policy user_sessions_read on app.user_sessions for select to app_api
  using (user_id = app.current_user_id() or (select app.has_permission('security.users', 'view')));
create policy user_sessions_insert on app.user_sessions for insert to app_api
  with check (user_id = app.current_user_id());
create policy user_sessions_update on app.user_sessions for update to app_api
  using (
    user_id = app.current_user_id()
    or ((select app.has_permission('security.users', 'revoke_sessions')) and app.can_manage_user(user_id))
  );
create policy user_sessions_auth_read on app.user_sessions for select to app_auth using (true);
create policy user_sessions_auth_insert on app.user_sessions for insert to app_auth with check (true);
create policy user_sessions_auth_update on app.user_sessions for update to app_auth using (true) with check (true);

-- invitations
create policy invitations_read on app.invitations for select to app_api
  using ((select app.has_permission('security.users', 'view')));
create policy invitations_insert on app.invitations for insert to app_api
  with check ((select app.has_permission('security.users', 'create')) and app.can_manage_user(user_id));
create policy invitations_update on app.invitations for update to app_api
  using ((select app.has_permission('security.users', 'edit')) and app.can_manage_user(user_id));
create policy invitations_auth_read on app.invitations for select to app_auth using (true);
create policy invitations_auth_update on app.invitations for update to app_auth using (true) with check (true);

-- profiles
create policy profiles_read on app.profiles for select to app_api
  using (
    (select app.has_permission('security.profiles', 'view'))
    or exists (
      select 1 from app.user_profiles up
      where up.profile_id = profiles.id and up.user_id = app.current_user_id()
    )
  );
create policy profiles_insert on app.profiles for insert to app_api
  with check ((select app.has_permission('security.profiles', 'create')));
create policy profiles_update on app.profiles for update to app_api
  using ((select app.has_permission('security.profiles', 'edit')) and app.can_grant_profile(id));

-- user_profiles
create policy user_profiles_read on app.user_profiles for select to app_api
  using (user_id = app.current_user_id() or (select app.has_permission('security.users', 'view')));
create policy user_profiles_insert on app.user_profiles for insert to app_api
  with check (
    (select app.has_permission('security.users', 'edit'))
    and app.can_manage_user(user_id)
    and app.can_grant_profile(profile_id)
  );
create policy user_profiles_delete on app.user_profiles for delete to app_api
  using (
    (select app.has_permission('security.users', 'edit'))
    and app.can_manage_user(user_id)
    and app.can_grant_profile(profile_id)
  );

-- menus, actions, menu_actions: readable by every authenticated user, maintained by superuser
create policy menus_read on app.menus for select to app_api using (true);
create policy menus_write on app.menus for all to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));
create policy actions_read on app.actions for select to app_api using (true);
create policy actions_write on app.actions for all to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));
create policy menu_actions_read on app.menu_actions for select to app_api using (true);
create policy menu_actions_write on app.menu_actions for all to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));

-- profile_permissions: an actor never grants what they do not hold
create policy profile_permissions_read on app.profile_permissions for select to app_api
  using ((select app.has_permission('security.profiles', 'view')));
create policy profile_permissions_insert on app.profile_permissions for insert to app_api
  with check (
    (select app.has_permission('security.profiles', 'edit'))
    and app.can_grant_profile(profile_id)
    and app.can_grant_menu_action(menu_action_id)
  );
create policy profile_permissions_delete on app.profile_permissions for delete to app_api
  using ((select app.has_permission('security.profiles', 'edit')) and app.can_grant_profile(profile_id));

-- configuration
create policy app_settings_read on app.app_settings for select to app_api, app_auth using (true);
create policy app_settings_update on app.app_settings for update to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));
create policy security_policy_read on app.security_policy for select to app_api, app_auth using (true);
create policy security_policy_update on app.security_policy for update to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));
create policy email_templates_read on app.email_templates for select to app_api, app_auth using (true);
create policy email_templates_update on app.email_templates for update to app_api
  using ((select app.is_superuser())) with check ((select app.is_superuser()));

-- audit_log: append by everyone (as themselves), read with security.audit:view
create policy audit_log_read on app.audit_log for select to app_api
  using ((select app.has_permission('security.audit', 'view')));
create policy audit_log_insert on app.audit_log for insert to app_api
  with check (actor_user_id is null or actor_user_id = app.current_user_id());
create policy audit_log_auth_insert on app.audit_log for insert to app_auth with check (true);

-- rate_limits: no policies; only reachable through app.hit_rate_limit()

-- ---------------------------------------------------------------------------------------------
-- Grants (least privilege)
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema app from public;
revoke execute on all functions in schema app from public;

-- Pure helpers used by defaults, checks, triggers and policies.
grant execute on function
  app.current_user_id(), app.is_i18n(jsonb), app.is_valid_rut(text), app.is_valid_time_zone(text),
  app.current_role_rank(), app.is_superuser(), app.has_permission(text, text),
  app.can_manage_role(smallint), app.can_manage_user(uuid),
  app.can_grant_menu_action(uuid), app.can_grant_profile(uuid)
to app_api, app_auth;

grant execute on function
  app.current_permissions(), app.user_effective_permissions(uuid), app.hit_rate_limit(text, integer, integer)
to app_api;

grant execute on function
  app.register_login_failure(uuid), app.register_login_success(uuid), app.is_locked(uuid),
  app.hit_rate_limit(text, integer, integer)
to app_auth;

-- app_api
grant select on
  app.roles, app.users, app.user_identities, app.user_sessions, app.invitations,
  app.profiles, app.user_profiles, app.menus, app.actions, app.menu_actions, app.profile_permissions,
  app.app_settings, app.security_policy, app.email_templates, app.audit_log,
  app.v_effective_menus, app.v_user_permissions
to app_api;
grant update (mfa_required) on app.roles to app_api;
grant insert on app.users to app_api;
grant update (
  email, first_name, last_name, second_last_name, rut, phone, job_title, photo_key, role_id, status,
  failed_login_count, locked_until, must_change_password, password_changed_at, mfa_enabled,
  locale, time_zone
) on app.users to app_api;
grant insert on app.user_sessions to app_api;
grant update (last_seen_at, revoked_at, revoked_by, revoked_reason) on app.user_sessions to app_api;
grant insert on app.invitations to app_api;
grant update (revoked_at) on app.invitations to app_api;
grant insert, update on app.profiles to app_api;
grant insert, delete on app.user_profiles to app_api;
grant insert, update, delete on app.menus, app.menu_actions to app_api;
grant insert, update on app.actions to app_api;
grant insert, delete on app.profile_permissions to app_api;
grant update on app.app_settings, app.security_policy to app_api;
grant update (subject, body_html, body_text) on app.email_templates to app_api;
grant insert on app.audit_log to app_api;

-- app_auth
grant select on
  app.roles, app.users, app.user_identities, app.user_sessions, app.invitations,
  app.app_settings, app.security_policy, app.email_templates
to app_auth;
grant insert on app.users, app.user_identities, app.user_sessions, app.audit_log to app_auth;
grant update (status, mfa_enabled, must_change_password, password_changed_at) on app.users to app_auth;
grant update (last_used_at) on app.user_identities to app_auth;
grant update (last_seen_at, revoked_at, revoked_reason) on app.user_sessions to app_auth;
grant update (accepted_at) on app.invitations to app_auth;
