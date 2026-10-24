-- Base data: roles, actions, system menus, base profiles, configuration and the initial superuser.
-- Codes must match packages/shared/src/permissions.ts.

-- Roles (fixed) -------------------------------------------------------------------------------
insert into app.roles (id, code, name, rank, mfa_required) values
  (1, 'superuser', '{"es": "Superusuario", "en": "Superuser"}', 1, true),
  (2, 'admin', '{"es": "Administrador", "en": "Administrator"}', 2, true),
  (3, 'client', '{"es": "Usuario cliente", "en": "Client user"}', 3, false);

-- Initial superuser (local only; dev/prod use the install script with a real email) ------------
insert into app.users (id, email, first_name, last_name, role_id, status, must_change_password)
values ('00000000-0000-0000-0000-000000000001', 'superadmin@local.test', 'Super', 'Admin', 1, 'active', true);

-- Actions -------------------------------------------------------------------------------------
insert into app.actions (id, code, name, is_standard, sort_order) values
  (1, 'view', '{"es": "Ver", "en": "View"}', true, 10),
  (2, 'create', '{"es": "Crear", "en": "Create"}', true, 20),
  (3, 'edit', '{"es": "Editar", "en": "Edit"}', true, 30),
  (4, 'delete', '{"es": "Eliminar", "en": "Delete"}', true, 40),
  (5, 'export', '{"es": "Exportar", "en": "Export"}', true, 50),
  (10, 'unlock', '{"es": "Desbloquear", "en": "Unlock"}', false, 100),
  (11, 'reset_password', '{"es": "Restablecer contraseña", "en": "Reset password"}', false, 110),
  (12, 'revoke_sessions', '{"es": "Cerrar sesiones", "en": "Revoke sessions"}', false, 120);

select setval(pg_get_serial_sequence('app.actions', 'id'), (select max(id) from app.actions));

-- System menus --------------------------------------------------------------------------------
insert into app.menus (id, parent_id, kind, code, name, icon, route, sort_order, superuser_only, is_system) values
  ('10000000-0000-0000-0000-000000000001', null, 'module', 'security',
    '{"es": "Seguridad", "en": "Security"}', 'mdi-shield-account', null, 10, false, true),
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'menu', 'security.users',
    '{"es": "Usuarios", "en": "Users"}', 'mdi-account-multiple', '/security/users', 10, false, true),
  ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'menu', 'security.profiles',
    '{"es": "Perfiles", "en": "Profiles"}', 'mdi-account-key', '/security/profiles', 20, false, true),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'menu', 'security.audit',
    '{"es": "Auditoría", "en": "Audit"}', 'mdi-clipboard-text-clock', '/security/audit', 30, false, true),
  ('10000000-0000-0000-0000-000000000002', null, 'module', 'config',
    '{"es": "Configuración", "en": "Settings"}', 'mdi-cog', null, 20, true, true),
  ('10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', 'menu', 'config.settings',
    '{"es": "Parámetros generales", "en": "General settings"}', 'mdi-tune', '/config/settings', 10, true, true),
  ('10000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000002', 'menu', 'config.menus',
    '{"es": "Menús y módulos", "en": "Menus and modules"}', 'mdi-file-tree', '/config/menus', 20, true, true),
  ('10000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000002', 'menu', 'config.security_policy',
    '{"es": "Políticas de seguridad", "en": "Security policies"}', 'mdi-lock-check', '/config/security-policy', 30, true, true),
  ('10000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000002', 'menu', 'config.email_templates',
    '{"es": "Plantillas de email", "en": "Email templates"}', 'mdi-email-edit', '/config/email-templates', 40, true, true);

insert into app.menu_actions (menu_id, action_id)
select m.id, a.id
from (values
  ('security.users', array['view', 'create', 'edit', 'export', 'unlock', 'reset_password', 'revoke_sessions']),
  ('security.profiles', array['view', 'create', 'edit', 'delete', 'export']),
  ('security.audit', array['view', 'export']),
  ('config.settings', array['view', 'edit']),
  ('config.menus', array['view', 'create', 'edit', 'delete']),
  ('config.security_policy', array['view', 'edit']),
  ('config.email_templates', array['view', 'edit'])
) as x (menu_code, action_codes)
join app.menus m on m.code = x.menu_code
join app.actions a on a.code = any (x.action_codes);

-- Base profiles -------------------------------------------------------------------------------
insert into app.profiles (id, name, description) values
  ('20000000-0000-0000-0000-000000000001', 'Gestión de usuarios', 'Administra usuarios y consulta perfiles'),
  ('20000000-0000-0000-0000-000000000002', 'Auditor', 'Consulta y exporta la auditoría de seguridad'),
  ('20000000-0000-0000-0000-000000000003', 'Consulta', 'Solo lectura de seguridad');

insert into app.profile_permissions (profile_id, menu_action_id)
select p.id, ma.id
from (values
  ('20000000-0000-0000-0000-000000000001'::uuid, 'security.users', null::text),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'security.profiles', 'view'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'security.audit', null),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'security.users', 'view'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'security.profiles', 'view'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'security.audit', 'view')
) as x (profile_id, menu_code, action_code)  -- action_code null = every action of the menu
join app.profiles p on p.id = x.profile_id
join app.menus m on m.code = x.menu_code
join app.menu_actions ma on ma.menu_id = m.id
join app.actions a on a.id = ma.action_id and (x.action_code is null or a.code = x.action_code);

-- Configuration -------------------------------------------------------------------------------
insert into app.app_settings (system_name, primary_color, secondary_color, default_locale, default_time_zone)
values ('Sistema Base', '#1565C0', '#424242', 'es', 'America/Santiago');

insert into app.security_policy default values;

-- Email templates. Variables: {{system_name}}, {{first_name}}, {{link}}, {{expires_at}},
-- {{code}} (password_reset) and {{locked_until}} (account_locked).
insert into app.email_templates (code, locale, subject, body_html, body_text) values
  ('invitation', 'es', 'Invitación a {{system_name}}',
    '<p>Hola {{first_name}},</p><p>Has sido invitado a {{system_name}}. Activa tu cuenta aquí: <a href="{{link}}">activar cuenta</a>.</p><p>El enlace vence el {{expires_at}}.</p>',
    'Hola {{first_name}}, has sido invitado a {{system_name}}. Activa tu cuenta en {{link}}. El enlace vence el {{expires_at}}.'),
  ('invitation', 'en', 'Invitation to {{system_name}}',
    '<p>Hi {{first_name}},</p><p>You have been invited to {{system_name}}. Activate your account here: <a href="{{link}}">activate account</a>.</p><p>The link expires on {{expires_at}}.</p>',
    'Hi {{first_name}}, you have been invited to {{system_name}}. Activate your account at {{link}}. The link expires on {{expires_at}}.'),
  ('activation', 'es', 'Tu cuenta en {{system_name}} está activa',
    '<p>Hola {{first_name}},</p><p>Tu cuenta en {{system_name}} fue activada. Ingresa en <a href="{{link}}">{{system_name}}</a>.</p>',
    'Hola {{first_name}}, tu cuenta en {{system_name}} fue activada. Ingresa en {{link}}.'),
  ('activation', 'en', 'Your {{system_name}} account is active',
    '<p>Hi {{first_name}},</p><p>Your {{system_name}} account has been activated. Sign in at <a href="{{link}}">{{system_name}}</a>.</p>',
    'Hi {{first_name}}, your {{system_name}} account has been activated. Sign in at {{link}}.'),
  ('password_reset', 'es', 'Recuperación de contraseña en {{system_name}}',
    '<p>Hola {{first_name}},</p><p>Tu código para restablecer la contraseña es <strong>{{code}}</strong>. Vence el {{expires_at}}.</p><p>Si no lo solicitaste, ignora este mensaje.</p>',
    'Hola {{first_name}}, tu código para restablecer la contraseña es {{code}}. Vence el {{expires_at}}. Si no lo solicitaste, ignora este mensaje.'),
  ('password_reset', 'en', 'Password recovery for {{system_name}}',
    '<p>Hi {{first_name}},</p><p>Your password reset code is <strong>{{code}}</strong>. It expires on {{expires_at}}.</p><p>If you did not request it, ignore this message.</p>',
    'Hi {{first_name}}, your password reset code is {{code}}. It expires on {{expires_at}}. If you did not request it, ignore this message.'),
  ('account_locked', 'es', 'Tu cuenta en {{system_name}} fue bloqueada',
    '<p>Hola {{first_name}},</p><p>Tu cuenta fue bloqueada por intentos fallidos hasta el {{locked_until}}. Si no fuiste tú, contacta al administrador.</p>',
    'Hola {{first_name}}, tu cuenta fue bloqueada por intentos fallidos hasta el {{locked_until}}. Si no fuiste tú, contacta al administrador.'),
  ('account_locked', 'en', 'Your {{system_name}} account has been locked',
    '<p>Hi {{first_name}},</p><p>Your account has been locked after failed sign-in attempts until {{locked_until}}. If this was not you, contact your administrator.</p>',
    'Hi {{first_name}}, your account has been locked after failed sign-in attempts until {{locked_until}}. If this was not you, contact your administrator.');
