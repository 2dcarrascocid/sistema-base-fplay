-- Phase 3: user and profile maintainers.

-- An actor who creates a user (and may manage it) also creates its native Cognito identity.
create policy user_identities_insert on app.user_identities for insert to app_api
  with check (
    provider = 'local'
    and (select app.has_permission('security.users', 'create'))
    and app.can_manage_user(user_id)
  );
grant insert on app.user_identities to app_api;

-- Profile maintainers count the users of each profile; user maintainers see profile names.
drop policy user_profiles_read on app.user_profiles;
create policy user_profiles_read on app.user_profiles for select to app_api
  using (
    user_id = app.current_user_id()
    or (select app.has_permission('security.users', 'view'))
    or (select app.has_permission('security.profiles', 'view'))
  );

drop policy profiles_read on app.profiles;
create policy profiles_read on app.profiles for select to app_api
  using (
    (select app.has_permission('security.profiles', 'view'))
    or (select app.has_permission('security.users', 'view'))
    or exists (
      select 1 from app.user_profiles up
      where up.profile_id = profiles.id and up.user_id = app.current_user_id()
    )
  );

-- Resetting a password or deactivating a user also closes that user's sessions.
drop policy user_sessions_update on app.user_sessions;
create policy user_sessions_update on app.user_sessions for update to app_api
  using (
    user_id = app.current_user_id()
    or (
      ((select app.has_permission('security.users', 'revoke_sessions'))
        or (select app.has_permission('security.users', 'reset_password'))
        or (select app.has_permission('security.users', 'edit')))
      and app.can_manage_user(user_id)
    )
  );

-- Re-sending an invitation (security.users:create) cancels the previous one.
drop policy invitations_update on app.invitations;
create policy invitations_update on app.invitations for update to app_api
  using (
    ((select app.has_permission('security.users', 'edit')) or (select app.has_permission('security.users', 'create')))
    and app.can_manage_user(user_id)
  );

-- Deactivating a profile is its "delete" action (no physical deletion).
drop policy profiles_update on app.profiles;
create policy profiles_update on app.profiles for update to app_api
  using (
    ((select app.has_permission('security.profiles', 'edit')) or (select app.has_permission('security.profiles', 'delete')))
    and app.can_grant_profile(id)
  );

-- Default ordering of the users list.
create index users_created_idx on app.users (created_at desc);
