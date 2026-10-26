-- Data integrity rules: RUT, email, role MFA, security policy, menu hierarchy, last superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- RUT (same cases as packages/shared/src/rut.test.ts)
select ok(app.is_valid_rut('12345678-5'), 'valid RUT');
select ok(app.is_valid_rut('10000013-K'), 'valid RUT with K');
select ok(app.is_valid_rut('20000008-0'), 'valid RUT with 0');
select ok(not app.is_valid_rut('12345678-4'), 'wrong check digit');
select ok(not app.is_valid_rut('12.345.678-5'), 'non canonical RUT');

select throws_ok(
  $$insert into app.users (email, first_name, last_name, role_id, rut) values ('a@test.cl', 'A', 'B', 3, '12345678-4')$$,
  '23514', null, 'invalid RUT is rejected'
);
select throws_ok(
  $$insert into app.users (email, first_name, last_name, role_id) values ('Upper@test.cl', 'A', 'B', 3)$$,
  '23514', null, 'email must be stored in lowercase'
);
select throws_ok(
  $$insert into app.users (email, first_name, last_name, role_id) values ('superadmin@local.test', 'A', 'B', 3)$$,
  '23505', null, 'email is unique (one user per email)'
);

-- MFA is mandatory for privileged roles
select throws_ok(
  $$update app.roles set mfa_required = false where code = 'admin'$$,
  '23514', null, 'MFA cannot be disabled for administrators'
);

-- Security policy floor (ASVS 2.1.1)
select throws_ok(
  $$update app.security_policy set password_min_length = 8$$,
  '23514', null, 'password minimum length cannot go below 12'
);

-- Menus
select throws_ok(
  $$insert into app.menus (parent_id, kind, code, name) values
    ('10000000-0000-0000-0000-000000000001', 'submenu', 'security.bad', '{"es": "x", "en": "x"}')$$,
  '23514', null, 'a submenu cannot hang directly from a module'
);
select throws_ok(
  $$delete from app.menus where code = 'security.audit'$$,
  '42501', null, 'system menus cannot be deleted'
);
select throws_ok(
  $$update app.menus set code = 'security.renamed' where code = 'security.users'$$,
  '42501', null, 'system menu codes cannot change'
);

-- Configuration
select throws_ok(
  $$update app.app_settings set default_time_zone = 'Mars/Olympus'$$,
  '22023', null, 'invalid time zone is rejected'
);

-- Last active superuser (other superusers, e.g. left by API tests, are deactivated in this transaction)
update app.users set status = 'inactive'
where role_id = 1 and status = 'active' and id <> '00000000-0000-0000-0000-000000000001';
set constraints app.users_ensure_active_superuser immediate;

select throws_ok(
  $$update app.users set status = 'inactive' where id = '00000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'the last active superuser cannot be deactivated'
);
select throws_ok(
  $$update app.users set role_id = 2 where id = '00000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'the last active superuser cannot be demoted'
);

insert into app.users (email, first_name, last_name, role_id, status)
values ('second.super@test.cl', 'Second', 'Super', 1, 'active');

select lives_ok(
  $$update app.users set status = 'inactive' where id = '00000000-0000-0000-0000-000000000001'$$,
  'a superuser can be deactivated while another one remains active'
);

select * from finish();
rollback;
