import { describe, expect, it } from 'vitest';
import { escapeHtml, findUnknownVariables, renderTemplate } from './templates.js';

describe('renderTemplate', () => {
  it('replaces variables in text', () => {
    expect(renderTemplate('Hola {{first_name}}, {{ link }}', { first_name: 'Ana', link: 'https://x' }, false)).toBe(
      'Hola Ana, https://x',
    );
  });

  it('escapes values when rendering HTML', () => {
    expect(renderTemplate('<p>{{first_name}}</p>', { first_name: '<script>"x"</script>' }, true)).toBe(
      '<p>&lt;script&gt;&quot;x&quot;&lt;/script&gt;</p>',
    );
  });

  it('renders missing variables as empty', () => {
    expect(renderTemplate('a{{code}}b', {}, false)).toBe('ab');
  });
});

describe('findUnknownVariables', () => {
  it('lists placeholders not allowed for the template', () => {
    expect(findUnknownVariables('invitation', '{{first_name}} {{code}} {{code}} {{password}}')).toEqual(['code', 'password']);
    expect(findUnknownVariables('password_reset', '{{code}} {{expires_at}}')).toEqual([]);
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
