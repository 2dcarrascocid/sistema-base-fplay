import { findUnknownVariables, renderTemplate, TEMPLATE_CODES, TEMPLATE_VARIABLES, type TemplateCode } from '@base/shared';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { audit, originOf } from '../lib/audit.js';
import type { Actor } from '../lib/authenticate.js';
import type { Tx } from '../lib/db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { json, parse, type HttpResponse, type Request } from '../lib/http.js';

const IdParam = z.object({ id: z.guid() });
const TemplateBody = z
  .object({
    subject: z.string().trim().min(1).max(200),
    bodyHtml: z.string().min(1).max(100_000),
    bodyText: z.string().min(1).max(50_000),
  })
  .strict();
const PreviewBody = TemplateBody.extend({ code: z.enum(TEMPLATE_CODES) }).strict();

/** Example values for the preview. */
const SAMPLE: Record<string, string> = {
  system_name: 'Sistema Base',
  first_name: 'Ana',
  link: 'https://app.example.cl/activate#token=ejemplo',
  expires_at: '28 de octubre de 2026, 10:00',
  code: '123456',
  locked_until: '25 de octubre de 2026, 18:15',
};

/**
 * Email HTML allowlist: formatting tags, links (https/mailto only), images (https only), tables and
 * inline styles. No scripts, event handlers, forms, iframes or javascript: URLs.
 */
export function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'span',
      'center',
    ],
    allowedAttributes: {
      '*': ['style', 'align', 'width', 'height'],
      a: ['href', 'title', 'target'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan', 'valign'],
      table: ['cellpadding', 'cellspacing', 'border', 'role'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    // Placeholders like {{link}} must survive inside href.
    allowedSchemesAppliedToAttributes: ['href', 'src'],
  });
}

/** Unknown {{variables}} in any part of the template → 400 with the offending names. */
function assertKnownVariables(code: TemplateCode, body: z.infer<typeof TemplateBody>): void {
  const unknown = [...new Set([body.subject, body.bodyHtml, body.bodyText].flatMap((part) => findUnknownVariables(code, part)))];
  if (unknown.length > 0) throw badRequest('UNKNOWN_VARIABLES', unknown);
}

export async function listTemplates(tx: Tx): Promise<HttpResponse> {
  const templates = await tx
    .selectFrom('app.email_templates')
    .select(['id', 'code', 'locale', 'subject', 'updated_at'])
    .orderBy('code')
    .orderBy('locale')
    .execute();
  return json({ templates, variables: TEMPLATE_VARIABLES });
}

async function loadTemplate(tx: Tx, id: string) {
  const template = await tx
    .selectFrom('app.email_templates')
    .select(['id', 'code', 'locale', 'subject', 'body_html', 'body_text', 'updated_at'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (!template) throw notFound();
  return template;
}

export async function getTemplate(request: Request, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const template = await loadTemplate(tx, id);
  return json({ template, variables: TEMPLATE_VARIABLES[template.code] });
}

export async function updateTemplate(request: Request, actor: Actor, tx: Tx): Promise<HttpResponse> {
  const { id } = parse(IdParam, request.pathParameters);
  const body = parse(TemplateBody, request.body);
  const before = await loadTemplate(tx, id);
  assertKnownVariables(before.code, body);
  const html = sanitizeTemplateHtml(body.bodyHtml);

  await tx.updateTable('app.email_templates').set({ subject: body.subject, body_html: html, body_text: body.bodyText }).where('id', '=', id).execute();
  await audit(tx, originOf(request), {
    eventType: 'config.email_template.update',
    result: 'success',
    actorUserId: actor.userId,
    entityType: 'email_template',
    entityId: id,
    oldValue: { subject: before.subject, body_html: before.body_html, body_text: before.body_text },
    newValue: { subject: body.subject, body_html: html, body_text: body.bodyText },
  });
  return json({ template: await loadTemplate(tx, id), sanitized: html !== body.bodyHtml });
}

/** Renders the (sanitized) draft with example values. Nothing is stored. */
export async function previewTemplate(request: Request): Promise<HttpResponse> {
  const body = parse(PreviewBody, request.body);
  assertKnownVariables(body.code, body);
  return json({
    subject: renderTemplate(body.subject, SAMPLE, false),
    html: renderTemplate(sanitizeTemplateHtml(body.bodyHtml), SAMPLE, true),
    text: renderTemplate(body.bodyText, SAMPLE, false),
  });
}
