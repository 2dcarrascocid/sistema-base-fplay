import type { Role } from '@base/shared';

export type Locale = 'es' | 'en';
export type I18nText = { es: string; en: string };
export type UserStatus = 'invited' | 'active' | 'inactive';
export type Provider = 'google' | 'facebook' | 'apple';

export interface PublicConfig {
  systemName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  defaultLocale: Locale;
  selfRegistration: boolean;
  providers: Provider[];
}

export type ChallengeName = 'SOFTWARE_TOKEN_MFA' | 'NEW_PASSWORD_REQUIRED' | 'MFA_SETUP' | 'PASSWORD_CHANGE';

export type LoginOutcome =
  | { status: 'authenticated'; accessToken: string; expiresIn: number }
  | { status: 'challenge'; challenge: ChallengeName; session: string };

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface MenuNode {
  code: string;
  kind: 'module' | 'menu' | 'submenu';
  name: I18nText;
  icon: string | null;
  route: string | null;
  children: MenuNode[];
}

export interface Me {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    second_last_name: string | null;
    rut: string | null;
    phone: string | null;
    job_title: string | null;
    locale: Locale | null;
    time_zone: string | null;
    mfa_enabled: boolean;
    must_change_password: boolean;
    last_login_at: string | null;
    photoUrl: string | null;
  };
  role: Role;
  permissions: string[];
  menu: MenuNode[];
  settings: {
    system_name: string;
    logo_key: string | null;
    primary_color: string;
    secondary_color: string;
    default_locale: Locale;
    default_time_zone: string;
    logoUrl: string | null;
  };
  pending: { passwordChange: boolean; mfaSetup: boolean };
}

export interface Session {
  id: string;
  client_type: 'web' | 'mobile';
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface MfaSetup {
  secretCode: string;
  otpauthUri: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserListItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  second_last_name: string | null;
  rut: string | null;
  status: UserStatus;
  locked_until: string | null;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  role: Role;
}

export interface UserDetail {
  user: UserListItem & {
    phone: string | null;
    job_title: string | null;
    locale: Locale | null;
    time_zone: string | null;
    must_change_password: boolean;
    updated_at: string;
  };
  profiles: { id: string; name: string; is_active: boolean }[];
  identities: { provider: 'local' | Provider; linked_at: string; last_used_at: string | null }[];
  activeSessions: number;
  pendingInvitation: { expires_at: string; created_at: string } | null;
  canManage: boolean;
}

export interface UserInput {
  email?: string;
  firstName: string;
  lastName: string;
  secondLastName: string | null;
  rut: string | null;
  phone: string | null;
  jobTitle: string | null;
  role: Role;
  profileIds?: string[];
}

export interface RoleOption {
  id: number;
  code: Role;
  name: I18nText;
  mfa_required: boolean;
  can_assign: boolean;
}

export interface ProfileListItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  user_count: number;
  permission_count: number;
}

export interface ProfileDetail {
  profile: { id: string; name: string; description: string | null; is_active: boolean; created_at: string; updated_at: string };
  menuActionIds: string[];
  canEdit: boolean;
}

export interface CatalogAction {
  menuActionId: string;
  code: string;
  name: I18nText;
  grantable: boolean;
}

export interface CatalogMenu {
  id: string;
  code: string;
  kind: 'module' | 'menu' | 'submenu';
  name: I18nText;
  actions: CatalogAction[];
  children: CatalogMenu[];
}

export interface PermissionCatalog {
  actions: { code: string; name: I18nText; is_standard: boolean; sort_order: number }[];
  menus: CatalogMenu[];
}

export interface ProfileUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: UserStatus;
  role: Role;
  granted_at: string;
}

// Phase 4: configuration and audit -------------------------------------------------------------

export interface AppSettings {
  system_name: string;
  logo_key: string | null;
  primary_color: string;
  secondary_color: string;
  default_locale: Locale;
  default_time_zone: string;
  self_registration_enabled: boolean;
  updated_at: string;
}

export interface ConfigMenu {
  id: string;
  parent_id: string | null;
  kind: 'module' | 'menu' | 'submenu';
  code: string;
  name: I18nText;
  icon: string | null;
  route: string | null;
  sort_order: number;
  show_in_mobile: boolean;
  superuser_only: boolean;
  is_system: boolean;
  is_active: boolean;
  action_ids: number[];
}

export interface ConfigAction {
  id: number;
  code: string;
  name: I18nText;
  is_standard: boolean;
  sort_order: number;
}

export interface SecurityPolicy {
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

export type TemplateCode = 'invitation' | 'activation' | 'password_reset' | 'account_locked';

export interface EmailTemplateSummary {
  id: string;
  code: TemplateCode;
  locale: Locale;
  subject: string;
  updated_at: string;
}

export interface EmailTemplate extends EmailTemplateSummary {
  body_html: string;
  body_text: string;
}

export interface AuditEntry {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  result: 'success' | 'failure';
  ip: string | null;
}

export interface AuditEntryDetail extends AuditEntry {
  user_agent: string | null;
  request_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

export interface AuditFilters {
  from?: string;
  to?: string;
  eventType?: string;
  actor?: string;
  entityType?: string;
  entityId?: string;
  result?: 'success' | 'failure';
  page?: number;
  pageSize?: number;
}
