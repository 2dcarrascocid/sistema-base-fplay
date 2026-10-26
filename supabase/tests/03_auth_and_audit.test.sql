-- Auth flows (app_auth role): lockout, linked accounts, self registration, rate limiting.
-- Immutable, hash-chained audit log.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

update app.security_policy set max_failed_attempts = 3, lockout_minutes = 15;
insert into app.users (id, email, first_name, last_name, role_id, status) values
  ('c0000000-0000-0000-0000-0000000000c1', 'client.1@test.cl', 'Client', 'One', 3, 'active'),
  ('c0000000-0000-0000-0000-0000000000c3', 'invited@test.cl', 'Invited', 'User', 3, 'invited');
insert into app.user_sessions (user_id, client_type, origin_jti, expires_at)
values ('c0000000-0000-0000-0000-0000000000c1', 'web', 'jti-lock', now() + interval '1 hour');

set local role app_auth;

-- Lockout after failed attempts (max 3). Each attempt not followed by a success counts as failed.
select is(app.register_login_attempt('c0000000-0000-0000-0000-0000000000c1'), 'allowed', 'attempt 1 allowed');
select app.register_login_attempt('c0000000-0000-0000-0000-0000000000c1');
select is(app.register_login_attempt('c0000000-0000-0000-0000-0000000000c1'), 'allowed', 'attempt 3 allowed');
select is(
  app.register_login_attempt('c0000000-0000-0000-0000-0000000000c1'), 'just_locked',
  'after 3 failed attempts the next one locks the account'
);
select is(app.register_login_attempt('c0000000-0000-0000-0000-0000000000c1'), 'locked', 'a locked account rejects attempts');
select is(
  (select revoked_reason from app.user_sessions where origin_jti = 'jti-lock'), 'locked',
  'locking revokes the active sessions'
);
select app.register_login_success('c0000000-0000-0000-0000-0000000000c1');
select ok(not app.is_locked('c0000000-0000-0000-0000-0000000000c1'), 'a successful login (after unlock) clears the lock');

-- app_auth limits ----------------------------------------------------------------------------
select throws_ok(
  $$update app.users set first_name = 'X' where id = 'c0000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'app_auth cannot edit user data'
);
select lives_ok(
  $$update app.users set status = 'active' where id = 'c0000000-0000-0000-0000-0000000000c3'$$,
  'app_auth activates an invited user'
);
select throws_ok(
  $$update app.users set status = 'inactive' where id = 'c0000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'app_auth cannot deactivate users'
);

-- Linked accounts: same email, several providers, one user ------------------------------------
select lives_ok(
  $$insert into app.user_identities (user_id, provider, cognito_sub, provider_subject) values
    ('c0000000-0000-0000-0000-0000000000c1', 'local', 'sub-local-1', 'sub-local-1'),
    ('c0000000-0000-0000-0000-0000000000c1', 'google', 'sub-google-1', 'google-123')$$,
  'local and Google identities link to the same user'
);
select is(
  (select count(distinct user_id)::integer from app.user_identities where cognito_sub in ('sub-local-1', 'sub-google-1')),
  1, 'both identities resolve to a single user'
);
select throws_ok(
  $$insert into app.user_identities (user_id, provider, cognito_sub, provider_subject)
    values ('c0000000-0000-0000-0000-0000000000c1', 'google', 'sub-google-2', 'google-456')$$,
  '23505', null, 'a user has at most one identity per provider'
);
select throws_ok(
  $$insert into app.user_identities (user_id, provider, cognito_sub, provider_subject)
    values ('c0000000-0000-0000-0000-0000000000c3', 'google', 'sub-google-3', 'google-123')$$,
  '23505', null, 'an external account links to only one user'
);

-- Self registration is off by default --------------------------------------------------------
select throws_ok(
  $$insert into app.users (email, first_name, last_name, role_id, status) values ('self@test.cl', 'S', 'R', 3, 'active')$$,
  '42501', null, 'self registration is rejected while disabled'
);
reset role;
update app.app_settings set self_registration_enabled = true;
set local role app_auth;
select throws_ok(
  $$insert into app.users (email, first_name, last_name, role_id, status) values ('self.admin@test.cl', 'S', 'A', 2, 'active')$$,
  '42501', null, 'self registration can never create administrators'
);
select lives_ok(
  $$insert into app.users (email, first_name, last_name, role_id, status) values ('self@test.cl', 'S', 'R', 3, 'active')$$,
  'self registration creates clients when enabled'
);

-- Rate limiting ------------------------------------------------------------------------------
select ok(app.hit_rate_limit('test:ip:1', 3600, 2) and app.hit_rate_limit('test:ip:1', 3600, 2), 'hits within the limit are allowed');
select ok(not app.hit_rate_limit('test:ip:1', 3600, 2), 'the hit over the limit is rejected');

-- Audit log ----------------------------------------------------------------------------------
insert into app.audit_log (event_type, result, ip) values ('auth.login.failure', 'failure', '10.0.0.1');
reset role;
-- app_auth cannot read the audit log, so the id of the row just written is read as the owner.
select max(id) as failure_id from app.audit_log where event_type = 'auth.login.failure' \gset
insert into app.audit_log (actor_user_id, event_type, result, old_value, new_value)
values ('c0000000-0000-0000-0000-0000000000c1', 'user.update', 'success', '{"job_title": null}', '{"job_title": "x"}');

select is(app.verify_audit_chain(), null, 'the audit hash chain verifies');
select throws_ok($$update app.audit_log set result = 'success'$$, '42501', null, 'audit rows cannot be updated, even by the owner');
select throws_ok($$delete from app.audit_log$$, '42501', null, 'audit rows cannot be deleted, even by the owner');

alter table app.audit_log disable trigger audit_log_no_update_delete;
update app.audit_log set result = 'success' where id = :failure_id;
alter table app.audit_log enable trigger audit_log_no_update_delete;
select is(app.verify_audit_chain(), :failure_id::bigint, 'tampering is detected by the hash chain');

select * from finish();
rollback;
