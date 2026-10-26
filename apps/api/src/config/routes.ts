import type { PermissionKey } from '@base/shared';
import { eventTypes, exportEvents, getEvent, integrity, listEvents } from '../audit/events.js';
import { authed, type AuthedRoute } from '../lib/authenticate.js';
import type { Deps } from '../lib/deps.js';
import type { Route } from '../lib/http.js';
import { createAction, createMenu, listActions, listMenus, reorderMenus, setMenuActions, updateAction, updateMenu } from './menus.js';
import { getPolicy, updatePolicy } from './policy.js';
import { getSettings, logoUploadUrl, setLogo, updateSettings } from './settings.js';
import { getTemplate, listTemplates, previewTemplate, updateTemplate } from './templates.js';

/**
 * Configuration maintainers (superuser-only menus: their permissions cannot be put in profiles)
 * and the audit screen (security.audit). Database role: app_api.
 */
export function configRoutes(deps: Deps): Record<string, Route> {
  const route = (permission: PermissionKey, handler: AuthedRoute) => authed(deps, handler, { permission });

  return {
    'GET /config/settings': route('config.settings:view', (_r, _a, tx) => getSettings(deps, tx)),
    'PUT /config/settings': route('config.settings:edit', updateSettings),
    'POST /config/settings/logo/upload-url': route('config.settings:edit', (r) => logoUploadUrl(deps, r)),
    'PUT /config/settings/logo': route('config.settings:edit', (r, a, tx) => setLogo(deps, r, a, tx)),

    'GET /config/menus': route('config.menus:view', (_r, _a, tx) => listMenus(tx)),
    'POST /config/menus': route('config.menus:create', createMenu),
    'PATCH /config/menus/{id}': route('config.menus:edit', updateMenu),
    'PUT /config/menus/{id}/actions': route('config.menus:edit', setMenuActions),
    'POST /config/menus/reorder': route('config.menus:edit', reorderMenus),
    'GET /config/actions': route('config.menus:view', (_r, _a, tx) => listActions(tx)),
    'POST /config/actions': route('config.menus:create', createAction),
    'PATCH /config/actions/{id}': route('config.menus:edit', updateAction),

    'GET /config/security-policy': route('config.security_policy:view', (_r, _a, tx) => getPolicy(tx)),
    'PUT /config/security-policy': route('config.security_policy:edit', updatePolicy),

    'GET /config/email-templates': route('config.email_templates:view', (_r, _a, tx) => listTemplates(tx)),
    'GET /config/email-templates/{id}': route('config.email_templates:view', (r, _a, tx) => getTemplate(r, tx)),
    'PUT /config/email-templates/{id}': route('config.email_templates:edit', updateTemplate),
    'POST /config/email-templates/preview': route('config.email_templates:view', (r) => previewTemplate(r)),

    'GET /audit/events': route('security.audit:view', (r, _a, tx) => listEvents(r, tx)),
    'GET /audit/events/export': route('security.audit:export', exportEvents),
    'GET /audit/events/{id}': route('security.audit:view', (r, _a, tx) => getEvent(r, tx)),
    'GET /audit/event-types': route('security.audit:view', (_r, _a, tx) => eventTypes(tx)),
    'GET /audit/integrity': route('security.audit:view', (_r, _a, tx) => integrity(tx)),
  };
}
