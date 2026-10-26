import type { Deps } from '../lib/deps.js';
import type { HttpResponse } from '../lib/http.js';

/** GET /auth/config — what the login page needs before there is a session. Nothing sensitive. */
export async function publicConfig(deps: Deps): Promise<HttpResponse> {
  const settings = await deps.db
    .selectFrom('app.app_settings')
    .select(['system_name', 'logo_key', 'primary_color', 'secondary_color', 'default_locale', 'self_registration_enabled'])
    .executeTakeFirstOrThrow();
  return {
    status: 200,
    body: {
      systemName: settings.system_name,
      logoUrl: settings.logo_key ? await deps.storage.downloadUrl(settings.logo_key) : null,
      primaryColor: settings.primary_color,
      secondaryColor: settings.secondary_color,
      defaultLocale: settings.default_locale,
      selfRegistration: settings.self_registration_enabled,
      providers: deps.config.federatedProviders,
    },
    headers: { 'Cache-Control': 'no-cache' },
  };
}
