-- Row level security and permission rules, acting as the app_api role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Lets the test session act as the application roles (all rolled back at the end).
grant app_api, app_auth to postgres with set true, inherit false;
grant usage on schema extensions to app_api, app_auth;
do $$
begin
  -- pgTAP keeps its state in session temp tables; the switched roles must be able to write it.
  execute format('grant all on all tables in schema %I to app_api, app_auth', pg_my_temp_schema()::regnamespace);
  execute format('grant all on all sequences in schema %I to app_api, app_auth', pg_my_temp_schema()::regnamespace);
end
$$;

create function pg_temp.menu_action(p_menu text, p_action text) returns uuid
language sql stable as $$
  select ma.id from app.menu_actions ma
  join app.menus m on m.id = ma.menu_id
  join app.actions a on a.id = ma.action_id
  where m.code = p_menu and a.code = p_action
$$;

-- Fixtures: two admins, two clients. Admin A has the base profile "Gestión de usuarios" plus a
-- profile-management profile (create/edit profiles), but nothing from security.audit.
insert into app.users (id, email, first_name, last_name, role_id, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'admin.a@test.cl', 'Admin', 'A', 2, 'active'),
  ('a0000000-0000-0000-0000-00000000000b', 'admin.b@test.cl', 'Admin', 'B', 2, 'active'),
  ('c0000000-0000-0000-0000-0000000000c1', 'client.1@test.cl', 'Client', 'One', 3, 'active'),
  ('c0000000-0000-0000-0000-0000000000c2', 'client.2@test.cl', 'Client', 'Two', 3, 'active');
insert into app.profiles (id, name) values ('30000000-0000-0000-0000-0000000000ff', 'Gestión de perfiles');
insert into app.profile_permissions (profile_id, menu_action_id) values
  ('30000000-0000-0000-0000-0000000000ff', pg_temp.menu_action('security.profiles', 'create')),
  ('30000000-0000-0000-0000-0000000000ff', pg_temp.menu_action('security.profiles', 'edit'));
insert into app.user_profiles (user_id, profile_id) values
  ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000ff');
insert into app.audit_log (event_type, result) values ('test.seed', 'success');
insert into app.user_sessions (user_id, client_type, origin_jti, expires_at) values
  ('c0000000-0000-0000-0000-0000000000c1', 'mobile', 'jti-c1', now() + interval '1 hour'),
  ('c0000000-0000-0000-0000-0000000000c2', 'mobile', 'jti-c2', now() + interval '1 hour');

-- Client C1 ----------------------------------------------------------------------------------
set local role app_api;
select set_config('app.user_id', 'c0000000-0000-0000-0000-0000000000c1', true);

select is((select count(*)::integer from app.users), 1, 'RLS: a client only reads their own user row');
select is((select count(*)::integer from app.audit_log), 0, 'RLS: a client cannot read the audit log');
select is((select count(*)::integer from app.user_sessions), 1, 'RLS: a client only reads their own sessions');
select ok(not app.has_permission('security.users', 'view'), 'a client without profiles has no permissions');
select is_empty(
  $$select * from app.user_effective_permissions('a0000000-0000-0000-0000-00000000000a')$$,
  'a client cannot read the permissions of another user'
);
select throws_ok(
  $$insert into app.audit_log (actor_user_id, event_type, result)
    values ('c0000000-0000-0000-0000-0000000000c2', 'test.forged', 'success')$$,
  '42501', null, 'audit entries cannot be written on behalf of another user'
);
update app.users set job_title = 'hacked' where id = 'c0000000-0000-0000-0000-0000000000c2';

reset role;
select is(
  (select job_title from app.users where id = 'c0000000-0000-0000-0000-0000000000c2'), null,
  'RLS: a client cannot update another user'
);

-- Admin A ------------------------------------------------------------------------------------
set local role app_api;
select set_config('app.user_id', 'a0000000-0000-0000-0000-00000000000a', true);

select is((select count(*)::integer from app.users), 5, 'an admin with security.users:view reads all users');
update app.users set job_title = 'changed' where id = 'a0000000-0000-0000-0000-00000000000b';
update app.users set job_title = 'Analista' where id = 'c0000000-0000-0000-0000-0000000000c1';

select throws_ok(
  $$insert into app.users (email, first_name, last_name, role_id, status) values ('new.admin@test.cl', 'N', 'A', 2, 'active')$$,
  '42501', null, 'an admin cannot create administrators'
);
select throws_ok(
  $$update app.users set role_id = 2 where id = 'c0000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'an admin cannot promote a client to administrator'
);
select throws_ok(
  $$update app.users set role_id = 1 where id = 'a0000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'users cannot change their own role'
);
select lives_ok(
  $$insert into app.profiles (id, name) values ('30000000-0000-0000-0000-000000000001', 'Perfil de prueba')$$,
  'an admin with security.profiles:create can create profiles'
);
select throws_ok(
  $$insert into app.profile_permissions (profile_id, menu_action_id)
    values ('30000000-0000-0000-0000-000000000001', pg_temp.menu_action('security.audit', 'view'))$$,
  '42501', null, 'an admin cannot grant a permission they do not hold'
);
select lives_ok(
  $$insert into app.profile_permissions (profile_id, menu_action_id)
    values ('30000000-0000-0000-0000-000000000001', pg_temp.menu_action('security.users', 'view'))$$,
  'an admin can grant a permission they hold'
);
select throws_ok(
  $$insert into app.user_profiles (user_id, profile_id)
    values ('c0000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'an admin cannot assign a profile with permissions they do not hold'
);
select lives_ok(
  $$insert into app.user_profiles (user_id, profile_id)
    values ('c0000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000000001')$$,
  'an admin can assign a profile whose permissions they hold'
);

reset role;
select is(
  (select job_title from app.users where id = 'a0000000-0000-0000-0000-00000000000b'), null,
  'an admin cannot edit another administrator'
);
select is(
  (select job_title from app.users where id = 'c0000000-0000-0000-0000-0000000000c1'), 'Analista',
  'an admin can edit a client'
);

-- Profile permissions reach the client; deactivating the profile removes them -----------------
set local role app_api;
select set_config('app.user_id', 'c0000000-0000-0000-0000-0000000000c1', true);
select ok(app.has_permission('security.users', 'view'), 'a client gets the permissions of their profiles');
reset role;
update app.profiles set is_active = false where id = '30000000-0000-0000-0000-000000000001';
set local role app_api;
select ok(not app.has_permission('security.users', 'view'), 'an inactive profile grants nothing');

-- Superuser ----------------------------------------------------------------------------------
select set_config('app.user_id', '00000000-0000-0000-0000-000000000001', true);
select ok(app.has_permission('config.menus', 'edit'), 'the superuser holds every permission implicitly');
select throws_ok(
  $$insert into app.profile_permissions (profile_id, menu_action_id)
    values ('30000000-0000-0000-0000-000000000001', pg_temp.menu_action('config.settings', 'view'))$$,
  '42501', null, 'superuser-only permissions cannot be put in a profile'
);

-- A removed permission applies on the next request (no cache) --------------------------------
reset role;
delete from app.profile_permissions
where profile_id = '20000000-0000-0000-0000-000000000001'
  and menu_action_id = pg_temp.menu_action('security.users', 'view');

set local role app_api;
select set_config('app.user_id', 'a0000000-0000-0000-0000-00000000000a', true);
select ok(not app.has_permission('security.users', 'view'), 'a removed permission no longer applies');
select is((select count(*)::integer from app.users), 1, 'without security.users:view the admin only reads their own row');

-- Inactive users get nothing -----------------------------------------------------------------
reset role;
update app.users set status = 'inactive' where id = 'a0000000-0000-0000-0000-00000000000a';
set local role app_api;
select is((select count(*)::integer from app.current_permissions()), 0, 'an inactive user has no permissions');

reset role;
select * from finish();
rollback;
