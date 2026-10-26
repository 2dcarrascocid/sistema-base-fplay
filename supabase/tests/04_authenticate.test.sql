-- app.authenticate(): per-request checks of user, role, client and session.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Lets the test session act as the application roles (all rolled back at the end).
grant app_api to postgres with set true, inherit false;
grant usage on schema extensions to app_api;
do $$
begin
  execute format('grant all on all tables in schema %I to app_api', pg_my_temp_schema()::regnamespace);
  execute format('grant all on all sequences in schema %I to app_api', pg_my_temp_schema()::regnamespace);
end
$$;

insert into app.users (id, email, first_name, last_name, role_id, status, must_change_password, mfa_enabled) values
  ('c0000000-0000-0000-0000-0000000000c1', 'client@test.cl', 'Client', 'One', 3, 'active', false, false),
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test.cl', 'Admin', 'A', 2, 'active', false, false);
insert into app.user_identities (user_id, provider, cognito_sub, provider_subject) values
  ('c0000000-0000-0000-0000-0000000000c1', 'local', 'sub-client', 'sub-client'),
  ('a0000000-0000-0000-0000-00000000000a', 'local', 'sub-admin', 'sub-admin');
insert into app.user_sessions (user_id, client_type, origin_jti, expires_at) values
  ('c0000000-0000-0000-0000-0000000000c1', 'web', 'jti-web', now() + interval '1 hour'),
  ('a0000000-0000-0000-0000-00000000000a', 'web', 'jti-admin', now() + interval '1 hour');

set local role app_api;

select is((app.authenticate('sub-client', 'jti-web', 'web')).outcome, 'ok', 'a valid web session is accepted');
select is((app.authenticate('sub-client', 'jti-web', 'web')).must_change_password, false, 'no password change pending');
select is((app.authenticate('nobody', 'jti-web', 'web')).outcome, 'unknown_user', 'an unknown Cognito user is rejected');
select is((app.authenticate('sub-client', 'jti-unknown', 'web')).outcome, 'session_revoked', 'web sessions must be created by login');
select is((app.authenticate('sub-admin', 'jti-web', 'web')).outcome, 'session_revoked', 'a session belongs to one user only');
select is((app.authenticate('sub-client', 'jti-mobile', 'mobile')).outcome, 'ok', 'a mobile session is registered on first use');
select is((app.authenticate('sub-client', 'jti-web', 'mobile')).outcome, 'session_revoked', 'a web session cannot be used from mobile');
select is((app.authenticate('sub-admin', 'jti-admin-m', 'mobile')).outcome, 'role_not_allowed', 'administrators cannot use the mobile app');
select is((app.authenticate('sub-admin', 'jti-admin', 'web')).mfa_setup_required, true, 'an administrator without MFA must set it up');

reset role;
update app.user_sessions set revoked_at = now(), revoked_reason = 'admin' where origin_jti = 'jti-web';
set local role app_api;
select is((app.authenticate('sub-client', 'jti-web', 'web')).outcome, 'session_revoked', 'a revoked session is rejected immediately');

reset role;
update app.user_sessions set last_seen_at = now() - interval '1 day' where origin_jti = 'jti-mobile';
set local role app_api;
select is((app.authenticate('sub-client', 'jti-mobile', 'mobile')).outcome, 'session_expired', 'an idle session expires');
reset role;
select is((select revoked_reason from app.user_sessions where origin_jti = 'jti-mobile'), 'idle', 'the idle session is revoked');

update app.security_policy set password_max_age_days = 30;
update app.users set password_changed_at = now() - interval '31 days' where id = 'a0000000-0000-0000-0000-00000000000a';
set local role app_api;
select is((app.authenticate('sub-admin', 'jti-admin', 'web')).must_change_password, true, 'an expired password must be changed');

reset role;
update app.users set locked_until = now() + interval '5 minutes' where id = 'a0000000-0000-0000-0000-00000000000a';
set local role app_api;
select is((app.authenticate('sub-admin', 'jti-admin', 'web')).outcome, 'locked', 'a locked user is rejected');

reset role;
update app.users set status = 'inactive' where id = 'c0000000-0000-0000-0000-0000000000c1';
set local role app_api;
select is((app.authenticate('sub-client', 'jti-x', 'mobile')).outcome, 'inactive', 'an inactive user is rejected');

reset role;
select * from finish();
rollback;
