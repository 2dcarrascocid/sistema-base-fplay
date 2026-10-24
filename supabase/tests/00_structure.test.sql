-- Schema structure, RLS coverage and least-privilege grants.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_schema('app');

select tables_are('app', array[
  'roles', 'users', 'user_identities', 'user_sessions', 'invitations',
  'profiles', 'user_profiles', 'menus', 'actions', 'menu_actions', 'profile_permissions',
  'app_settings', 'security_policy', 'email_templates', 'rate_limits', 'audit_log'
]);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every table'
);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and pg_get_userbyid(c.relowner) in ('app_api', 'app_auth')),
  0, 'application roles own no objects (so RLS always applies to them)'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'app' and grantee = 'PUBLIC'),
  0, 'nothing is granted to PUBLIC'
);

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and has_function_privilege('public', p.oid, 'EXECUTE')),
  0, 'no function is executable by PUBLIC'
);

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')),
  0, 'every SECURITY DEFINER function pins search_path'
);

select ok(not has_schema_privilege('app_api', 'app', 'CREATE'), 'app_api cannot create objects');
select ok(not has_table_privilege('app_api', 'app.users', 'DELETE'), 'users are never physically deleted');
select ok(not has_table_privilege('app_api', 'app.audit_log', 'UPDATE'), 'app_api cannot update audit_log');
select ok(not has_table_privilege('app_api', 'app.audit_log', 'DELETE'), 'app_api cannot delete audit_log');
select ok(not has_table_privilege('app_api', 'app.rate_limits', 'SELECT'), 'rate_limits only through functions');
select ok(not has_table_privilege('app_auth', 'app.audit_log', 'SELECT'), 'app_auth cannot read audit_log');
select ok(not has_column_privilege('app_auth', 'app.users', 'first_name', 'UPDATE'), 'app_auth cannot edit user data');
select ok(not has_column_privilege('app_auth', 'app.users', 'role_id', 'UPDATE'), 'app_auth cannot change roles');
select ok(not has_table_privilege('app_auth', 'app.profile_permissions', 'SELECT'), 'app_auth cannot read permissions');

select * from finish();
rollback;
