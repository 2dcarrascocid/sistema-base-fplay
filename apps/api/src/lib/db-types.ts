import type { ColumnType, Generated, Selectable } from 'kysely';
import type { SaphiDatabase } from './saphi-db-types.js';

/** Read as Date, written as Date or ISO string. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type Defaulted<T> = ColumnType<T, T | undefined, T>;

export type UserStatus = 'invited' | 'active' | 'inactive';
export type Provider = 'local' | 'google' | 'facebook' | 'apple';
export type ClientType = 'web' | 'mobile';
export type RevokedReason = 'logout' | 'admin' | 'password_change' | 'idle' | 'expired' | 'locked' | 'deactivated';

export interface RolesTable {
  id: number;
  code: 'superuser' | 'admin' | 'client';
  name: { es: string; en: string };
  rank: number;
  mfa_required: boolean;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  first_name: string;
  last_name: string;
  second_last_name: string | null;
  rut: string | null;
  phone: string | null;
  job_title: string | null;
  photo_key: string | null;
  role_id: number;
  status: Defaulted<UserStatus>;
  failed_login_count: Defaulted<number>;
  locked_until: Timestamp | null;
  must_change_password: Defaulted<boolean>;
  password_changed_at: Timestamp | null;
  mfa_enabled: Defaulted<boolean>;
  locale: 'es' | 'en' | null;
  time_zone: string | null;
  last_login_at: Timestamp | null;
  created_at: Generated<Date>;
  created_by: Defaulted<string | null>;
  updated_at: Generated<Date>;
  updated_by: Defaulted<string | null>;
}

export interface UserIdentitiesTable {
  id: Generated<string>;
  user_id: string;
  provider: Provider;
  cognito_sub: string;
  provider_subject: string;
  linked_at: Generated<Date>;
  last_used_at: Timestamp | null;
}

export interface UserSessionsTable {
  id: Generated<string>;
  user_id: string;
  client_type: ClientType;
  origin_jti: string;
  refresh_token_hash: Buffer | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
  last_seen_at: Generated<Date>;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  revoked_by: string | null;
  revoked_reason: RevokedReason | null;
}

export interface InvitationsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: Buffer;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  revoked_at: Timestamp | null;
  invited_by: Defaulted<string | null>;
  created_at: Generated<Date>;
}

export interface MenusTable {
  id: Generated<string>;
  parent_id: string | null;
  kind: 'module' | 'menu' | 'submenu';
  code: string;
  name: { es: string; en: string };
  icon: string | null;
  route: string | null;
  sort_order: number;
  show_in_mobile: boolean;
  superuser_only: boolean;
  is_system: boolean;
  is_active: boolean;
  updated_at: Generated<Date>;
  updated_by: Defaulted<string | null>;
}

export interface ActionsTable {
  id: Generated<number>;
  code: string;
  name: { es: string; en: string };
  is_standard: boolean;
  sort_order: number;
}

export interface MenuActionsTable {
  id: Generated<string>;
  menu_id: string;
  action_id: number;
}

export interface ProfilesTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  is_active: Defaulted<boolean>;
  created_at: Generated<Date>;
  created_by: Defaulted<string | null>;
  updated_at: Generated<Date>;
  updated_by: Defaulted<string | null>;
}

export interface UserProfilesTable {
  user_id: string;
  profile_id: string;
  granted_at: Generated<Date>;
  granted_by: Defaulted<string | null>;
}

export interface ProfilePermissionsTable {
  profile_id: string;
  menu_action_id: string;
  granted_at: Generated<Date>;
  granted_by: Defaulted<string | null>;
}

export interface EffectiveMenusView {
  id: string;
  code: string;
  superuser_only: boolean;
}

export interface AppSettingsTable {
  id: Generated<boolean>;
  system_name: string;
  logo_key: string | null;
  primary_color: string;
  secondary_color: string;
  default_locale: 'es' | 'en';
  default_time_zone: string;
  self_registration_enabled: boolean;
  updated_at: Generated<Date>;
  updated_by: Defaulted<string | null>;
}

export interface SecurityPolicyTable {
  id: Generated<boolean>;
  password_min_length: number;
  password_require_upper: boolean;
  password_require_lower: boolean;
  password_require_digit: boolean;
  password_require_symbol: boolean;
  password_max_age_days: number;
  max_failed_attempts: number;
  lockout_minutes: number;
  idle_timeout_minutes: number;
  session_max_hours: number;
  invitation_ttl_hours: number;
}

export type SecurityPolicy = Selectable<SecurityPolicyTable>;

export interface EmailTemplatesTable {
  id: Generated<string>;
  code: 'invitation' | 'activation' | 'password_reset' | 'account_locked';
  locale: 'es' | 'en';
  subject: string;
  body_html: string;
  body_text: string;
  updated_at: Generated<Date>;
  updated_by: Defaulted<string | null>;
}

export interface AuditLogTable {
  id: Generated<string>;
  occurred_at: Generated<Date>;
  actor_user_id: string | null;
  actor_email: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  result: 'success' | 'failure';
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  old_value: unknown;
  new_value: unknown;
}

export interface Database extends SaphiDatabase {
  'app.roles': RolesTable;
  'app.users': UsersTable;
  'app.user_identities': UserIdentitiesTable;
  'app.user_sessions': UserSessionsTable;
  'app.invitations': InvitationsTable;
  'app.menus': MenusTable;
  'app.actions': ActionsTable;
  'app.menu_actions': MenuActionsTable;
  'app.profiles': ProfilesTable;
  'app.user_profiles': UserProfilesTable;
  'app.profile_permissions': ProfilePermissionsTable;
  'app.v_effective_menus': EffectiveMenusView;
  'app.app_settings': AppSettingsTable;
  'app.security_policy': SecurityPolicyTable;
  'app.email_templates': EmailTemplatesTable;
  'app.audit_log': AuditLogTable;
}
