/**
 * Email templates use {{variable}} placeholders. Each template code accepts a fixed set of
 * variables (validated when a template is saved and when it is rendered).
 */

export const TEMPLATE_CODES = ['invitation', 'activation', 'password_reset', 'account_locked'] as const;
export type TemplateCode = (typeof TEMPLATE_CODES)[number];

export const TEMPLATE_VARIABLES: Record<TemplateCode, readonly string[]> = {
  invitation: ['system_name', 'first_name', 'link', 'expires_at'],
  activation: ['system_name', 'first_name', 'link'],
  password_reset: ['system_name', 'first_name', 'code', 'expires_at'],
  account_locked: ['system_name', 'first_name', 'locked_until'],
};

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function findUnknownVariables(code: TemplateCode, text: string): string[] {
  const allowed = TEMPLATE_VARIABLES[code];
  const unknown = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!allowed.includes(match[1]!)) unknown.add(match[1]!);
  }
  return [...unknown];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replaces placeholders; values are HTML-escaped when rendering HTML. Unknown placeholders render empty. */
export function renderTemplate(text: string, variables: Readonly<Record<string, string>>, html: boolean): string {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = variables[name] ?? '';
    return html ? escapeHtml(value) : value;
  });
}
