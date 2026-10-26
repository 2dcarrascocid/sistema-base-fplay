-- app.audit_chain_status(): integrity check for the audit screen, behind security.audit:view.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

grant app_api to postgres with set true, inherit false;
grant usage on schema extensions to app_api;
do $$
begin
  execute format('grant all on all tables in schema %I to app_api', pg_my_temp_schema()::regnamespace);
  execute format('grant all on all sequences in schema %I to app_api', pg_my_temp_schema()::regnamespace);
end
$$;

insert into app.users (id, email, first_name, last_name, role_id, status) values
  ('c0000000-0000-0000-0000-0000000000c1', 'client@test.cl', 'Client', 'One', 3, 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'auditor@test.cl', 'Audit', 'Or', 2, 'active');
insert into app.user_profiles (user_id, profile_id)
values ('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002');
insert into app.audit_log (event_type, result) values ('test.event', 'success');

set local role app_api;
select set_config('app.user_id', 'c0000000-0000-0000-0000-0000000000c1', true);
select throws_ok($$select * from app.audit_chain_status()$$, '42501', null, 'a user without security.audit:view cannot check integrity');

select set_config('app.user_id', 'a0000000-0000-0000-0000-00000000000a', true);
select is((select valid from app.audit_chain_status()), true, 'the auditor sees a valid chain');
select ok((select total from app.audit_chain_status()) >= 1, 'and the number of entries');

reset role;
select * from finish();
rollback;
