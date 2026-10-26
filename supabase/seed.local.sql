-- LOCAL CONTAINER ONLY. Never run this outside the local Supabase container.

-- Application roles with well-known development passwords, so the API connects exactly as in AWS
-- (in dev/prod the passwords are generated and stored in AWS Secrets Manager).
alter role app_api with login password 'app_api_local';
alter role app_auth with login password 'app_auth_local';

-- Local superuser (dev/prod: apps/api/scripts/create-superuser.ts).
insert into app.users (id, email, first_name, last_name, role_id, status, must_change_password, mfa_enabled)
values ('00000000-0000-0000-0000-000000000001', 'superadmin@local.test', 'Super', 'Admin', 1, 'active', false, true);
insert into app.user_identities (user_id, provider, cognito_sub, provider_subject)
values ('00000000-0000-0000-0000-000000000001', 'local', 'local-superadmin-sub', 'local-superadmin-sub');
