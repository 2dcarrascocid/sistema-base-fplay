import { http } from './http';
import type {
  AppSettings,
  AuditEntry,
  AuditEntryDetail,
  AuditFilters,
  ConfigAction,
  ConfigMenu,
  EmailTemplate,
  EmailTemplateSummary,
  SecurityPolicy,
  TemplateCode,
  ChallengeName,
  LoginOutcome,
  Me,
  MfaSetup,
  Page,
  PermissionCatalog,
  ProfileDetail,
  ProfileListItem,
  ProfileUser,
  Provider,
  PublicConfig,
  RoleOption,
  Session,
  TokenResponse,
  UserDetail,
  UserInput,
  UserListItem,
} from './types';

const pub = { auth: false } as const;

export const authApi = {
  config: () => http.get<PublicConfig>('/auth/config', pub),
  login: (email: string, password: string, captchaToken: string) =>
    http.post<LoginOutcome>('/auth/login', { email, password, captchaToken }, pub),
  challenge: (session: string, challenge: ChallengeName, answer: { code?: string; newPassword?: string }) =>
    http.post<LoginOutcome>('/auth/challenge', { session, challenge, ...answer }, pub),
  mfaSetup: (session: string) => http.post<MfaSetup>('/auth/mfa/setup', { session }, pub),
  refresh: () => http.post<TokenResponse>('/auth/refresh', undefined, { auth: false, csrf: true }),
  logout: () => http.post<void>('/auth/logout', undefined, { auth: false, csrf: true }),
  forgot: (email: string, captchaToken: string) => http.post<void>('/auth/password/forgot', { email, captchaToken }, pub),
  reset: (email: string, code: string, newPassword: string, captchaToken: string) =>
    http.post<void>('/auth/password/reset', { email, code, newPassword, captchaToken }, pub),
  acceptInvitation: (token: string, password: string, captchaToken: string) =>
    http.post<void>('/auth/invitations/accept', { token, password, captchaToken }, pub),
  register: (body: { email: string; firstName: string; lastName: string; captchaToken: string }) =>
    http.post<void>('/auth/register', body, pub),
  /** Full-page navigation: the API redirects to the identity provider. */
  federatedStartUrl: (provider: Provider) => `/api/auth/federated/${provider}/start`,
};

export const accountApi = {
  me: () => http.get<Me>('/me'),
  update: (changes: Partial<{ firstName: string; lastName: string; secondLastName: string | null; phone: string | null; locale: 'es' | 'en' | null; timeZone: string | null }>) =>
    http.patch<{ user: Me['user'] }>('/me', changes),
  changePassword: (currentPassword: string, newPassword: string) => http.post<void>('/me/password', { currentPassword, newPassword }),
  sessions: () => http.get<{ sessions: Session[] }>('/me/sessions'),
  revokeSession: (id: string) => http.delete<void>(`/me/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: () => http.post<void>('/me/sessions/revoke-others'),
  mfaSetup: () => http.post<MfaSetup>('/me/mfa/setup'),
  mfaVerify: (code: string) => http.post<void>('/me/mfa/verify', { code }),
  mfaDisable: () => http.delete<void>('/me/mfa'),
  photoUploadUrl: (contentType: string) =>
    http.post<{ url: string; fields: Record<string, string>; key: string; maxBytes: number }>('/me/photo/upload-url', { contentType }),
  setPhoto: (key: string) => http.put<{ photoUrl: string }>('/me/photo', { key }),
};

export interface UserFilters {
  search?: string;
  status?: string;
  role?: string;
  profileId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

const id = (value: string) => encodeURIComponent(value);

export const adminApi = {
  roles: () => http.get<{ roles: RoleOption[] }>('/admin/roles'),
  users: (filters: UserFilters) => http.get<Page<UserListItem>>('/admin/users', { query: { ...filters } }),
  exportUsers: (filters: UserFilters) => http.get<Blob>('/admin/users/export', { query: { ...filters }, blob: true }),
  user: (userId: string) => http.get<UserDetail>(`/admin/users/${id(userId)}`),
  userPermissions: (userId: string) => http.get<{ permissions: string[] }>(`/admin/users/${id(userId)}/permissions`),
  createUser: (input: UserInput) => http.post<{ id: string }>('/admin/users', input),
  updateUser: (userId: string, input: Partial<UserInput>) => http.patch<{ id: string }>(`/admin/users/${id(userId)}`, input),
  setUserProfiles: (userId: string, profileIds: string[]) => http.put<void>(`/admin/users/${id(userId)}/profiles`, { profileIds }),
  userAction: (userId: string, action: 'activate' | 'deactivate' | 'unlock' | 'reset-password' | 'revoke-sessions' | 'invitation') =>
    http.post<unknown>(`/admin/users/${id(userId)}/${action}`),

  catalog: () => http.get<PermissionCatalog>('/admin/permission-catalog'),
  profiles: (filters: { search?: string; status?: string; page?: number; pageSize?: number }) =>
    http.get<Page<ProfileListItem>>('/admin/profiles', { query: { ...filters } }),
  profile: (profileId: string) => http.get<ProfileDetail>(`/admin/profiles/${id(profileId)}`),
  profileUsers: (profileId: string) => http.get<{ users: ProfileUser[] }>(`/admin/profiles/${id(profileId)}/users`),
  createProfile: (input: { name: string; description: string | null; menuActionIds: string[] }) =>
    http.post<{ id: string }>('/admin/profiles', input),
  updateProfile: (profileId: string, input: { name?: string; description?: string | null }) =>
    http.patch<{ id: string }>(`/admin/profiles/${id(profileId)}`, input),
  setProfilePermissions: (profileId: string, menuActionIds: string[]) =>
    http.put<void>(`/admin/profiles/${id(profileId)}/permissions`, { menuActionIds }),
  duplicateProfile: (profileId: string, name: string) => http.post<{ id: string }>(`/admin/profiles/${id(profileId)}/duplicate`, { name }),
  setProfileActive: (profileId: string, active: boolean) =>
    http.post<void>(`/admin/profiles/${id(profileId)}/${active ? 'activate' : 'deactivate'}`),
};


export interface SettingsInput {
  systemName: string;
  primaryColor: string;
  secondaryColor: string;
  defaultLocale: 'es' | 'en';
  defaultTimeZone: string;
  selfRegistrationEnabled: boolean;
}

export interface MenuInput {
  code?: string;
  name?: { es: string; en: string };
  icon?: string | null;
  route?: string | null;
  showInMobile?: boolean;
  superuserOnly?: boolean;
  isActive?: boolean;
}

export interface PolicyInput {
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSymbol: boolean;
  passwordMaxAgeDays: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  idleTimeoutMinutes: number;
  sessionMaxHours: number;
  invitationTtlHours: number;
  clientMfaRequired: boolean;
}

export interface TemplateInput {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export const configApi = {
  settings: () => http.get<{ settings: AppSettings; logoUrl: string | null }>('/config/settings'),
  updateSettings: (input: SettingsInput) => http.put<{ settings: AppSettings }>('/config/settings', input),
  logoUploadUrl: (contentType: string) =>
    http.post<{ url: string; fields: Record<string, string>; key: string; maxBytes: number }>('/config/settings/logo/upload-url', { contentType }),
  setLogo: (key: string | null) => http.put<{ logoUrl: string | null }>('/config/settings/logo', { key }),

  menus: () => http.get<{ menus: ConfigMenu[] }>('/config/menus'),
  createMenu: (input: MenuInput & { parentId: string | null; code: string; name: { es: string; en: string }; actionIds: number[] }) =>
    http.post<{ id: string }>('/config/menus', input),
  updateMenu: (menuId: string, input: MenuInput) => http.patch<{ id: string }>(`/config/menus/${id(menuId)}`, input),
  setMenuActions: (menuId: string, actionIds: number[]) => http.put<void>(`/config/menus/${id(menuId)}/actions`, { actionIds }),
  reorderMenus: (parentId: string | null, orderedIds: string[]) => http.post<void>('/config/menus/reorder', { parentId, orderedIds }),
  actions: () => http.get<{ actions: ConfigAction[] }>('/config/actions'),
  createAction: (code: string, name: { es: string; en: string }) => http.post<{ id: number }>('/config/actions', { code, name }),
  updateAction: (actionId: number, name: { es: string; en: string }) => http.patch<{ id: number }>(`/config/actions/${actionId}`, { name }),

  policy: () => http.get<{ policy: SecurityPolicy; roles: { code: string; mfa_required: boolean }[] }>('/config/security-policy'),
  updatePolicy: (input: PolicyInput) =>
    http.put<{ policy: SecurityPolicy; roles: { code: string; mfa_required: boolean }[] }>('/config/security-policy', input),

  templates: () => http.get<{ templates: EmailTemplateSummary[]; variables: Record<TemplateCode, string[]> }>('/config/email-templates'),
  template: (templateId: string) => http.get<{ template: EmailTemplate; variables: string[] }>(`/config/email-templates/${id(templateId)}`),
  updateTemplate: (templateId: string, input: TemplateInput) =>
    http.put<{ template: EmailTemplate; sanitized: boolean }>(`/config/email-templates/${id(templateId)}`, input),
  previewTemplate: (code: TemplateCode, input: TemplateInput) =>
    http.post<{ subject: string; html: string; text: string }>('/config/email-templates/preview', { code, ...input }),
};

export const auditApi = {
  events: (filters: AuditFilters) => http.get<Page<AuditEntry>>('/audit/events', { query: { ...filters } }),
  event: (eventId: string) => http.get<{ event: AuditEntryDetail }>(`/audit/events/${id(eventId)}`),
  exportEvents: (filters: AuditFilters) => http.get<Blob>('/audit/events/export', { query: { ...filters }, blob: true }),
  eventTypes: () => http.get<{ eventTypes: string[] }>('/audit/event-types'),
  integrity: () => http.get<{ valid: boolean; brokenId: string | null; total: number }>('/audit/integrity'),
};
