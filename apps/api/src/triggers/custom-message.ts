import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { renderEmail } from '../lib/email.js';
import type { TriggerDeps } from './pre-sign-up.js';

/** Cognito password reset codes are valid for one hour. */
const CODE_VALIDITY = { es: '1 hora', en: '1 hour' } as const;

/**
 * Custom message: the password recovery email uses our template (app.email_templates) in the
 * user's language. Other messages are not used (native users are created with MessageAction=SUPPRESS).
 */
export async function customMessage(deps: TriggerDeps, event: CustomMessageTriggerEvent): Promise<CustomMessageTriggerEvent> {
  if (event.triggerSource !== 'CustomMessage_ForgotPassword') return event;

  const user = await deps.db
    .selectFrom('app.user_identities as i')
    .innerJoin('app.users as u', 'u.id', 'i.user_id')
    .select(['u.email', 'u.first_name', 'u.locale', 'u.time_zone'])
    .where('i.provider', '=', 'local')
    .where('i.cognito_sub', '=', event.request.userAttributes['sub'] ?? '')
    .executeTakeFirst();
  if (!user) return event;

  const { default_locale } = await deps.db.selectFrom('app.app_settings').select('default_locale').executeTakeFirstOrThrow();
  const code = event.request.codeParameter;
  const email = await renderEmail(deps.db, 'password_reset', user, {
    code,
    expires_at: CODE_VALIDITY[user.locale ?? default_locale],
  });
  event.response.emailSubject = email.subject;
  // Cognito rejects messages without the code placeholder, so a template edited without it still works.
  event.response.emailMessage = email.html.includes(code) ? email.html : `${email.html}<p>${code}</p>`;
  return event;
}
