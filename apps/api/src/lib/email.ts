import { renderTemplate, type TemplateCode } from '@base/shared';
import type { Db, Tx } from './db.js';
import type { Mailer } from './ports.js';

export interface Recipient {
  email: string;
  first_name: string;
  locale: 'es' | 'en' | null;
  time_zone: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Renders a template from app.email_templates in the user's locale (or the system default). */
export async function renderEmail(
  db: Db | Tx,
  code: TemplateCode,
  recipient: Recipient,
  variables: Record<string, string>,
): Promise<RenderedEmail> {
  const settings = await db.selectFrom('app.app_settings').select(['system_name', 'default_locale']).executeTakeFirstOrThrow();
  const template = await db
    .selectFrom('app.email_templates')
    .select(['subject', 'body_html', 'body_text'])
    .where('code', '=', code)
    .where('locale', '=', recipient.locale ?? settings.default_locale)
    .executeTakeFirstOrThrow();

  const vars = { system_name: settings.system_name, first_name: recipient.first_name, ...variables };
  return {
    subject: renderTemplate(template.subject, vars, false),
    html: renderTemplate(template.body_html, vars, true),
    text: renderTemplate(template.body_text, vars, false),
  };
}

export async function sendTemplatedEmail(
  db: Db | Tx,
  mailer: Mailer,
  code: TemplateCode,
  recipient: Recipient,
  variables: Record<string, string>,
): Promise<void> {
  await mailer.send({ to: recipient.email, ...(await renderEmail(db, code, recipient, variables)) });
}

/** Human-readable date in the recipient's language and time zone. */
export async function formatDateFor(db: Db | Tx, recipient: Recipient, date: Date): Promise<string> {
  const settings = await db
    .selectFrom('app.app_settings')
    .select(['default_locale', 'default_time_zone'])
    .executeTakeFirstOrThrow();
  return new Intl.DateTimeFormat(recipient.locale ?? settings.default_locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: recipient.time_zone ?? settings.default_time_zone,
  }).format(date);
}
