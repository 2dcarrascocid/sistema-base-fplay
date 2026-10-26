/**
 * Mounts the real application (App, layouts, router, Vuetify, i18n, Pinia) against a fake API
 * served from a fetch mock, so view tests exercise the same code paths as the browser.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { vi } from 'vitest';
import App from '../src/App.vue';
import { i18n } from '../src/plugins/i18n';
import { vuetify } from '../src/plugins/vuetify';
import { router } from '../src/router';
import type { Me, MenuNode } from '../src/services/types';
import { useSessionStore } from '../src/stores/session';

// Load every lazy route up front: the router's dynamic imports then resolve within settle().
import.meta.glob('../src/views/**/*.vue', { eager: true });

export class Reply {
  constructor(
    readonly status: number,
    readonly body?: unknown,
  ) {}
}

/** A non-2xx answer in the API's error format, or a custom status. */
export const reply = (status: number, body?: unknown) => new Reply(status, body);
export const apiError = (status: number, code: string, details?: unknown) => reply(status, { error: { code, details } });

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: any;
}

type Handler = (call: Call, params: string[]) => unknown;
export type Routes = Record<string, Handler | object | string>;

const node = (code: string, kind: MenuNode['kind'], es: string, route: string | null, children: MenuNode[] = []): MenuNode => ({
  code,
  kind,
  name: { es, en: es },
  icon: null,
  route,
  children,
});

export const ME: Me = {
  user: {
    id: 'u-1',
    email: 'super@test.cl',
    first_name: 'Ana',
    last_name: 'Pérez',
    second_last_name: null,
    rut: null,
    phone: null,
    job_title: null,
    locale: 'es',
    time_zone: 'America/Santiago',
    mfa_enabled: true,
    must_change_password: false,
    last_login_at: '2026-10-20T12:00:00Z',
    photoUrl: null,
  },
  role: 'superuser',
  permissions: [],
  menu: [
    node('security', 'module', 'Seguridad', null, [
      node('security.users', 'menu', 'Usuarios', '/security/users'),
      node('security.access', 'menu', 'Accesos', null, [node('security.profiles', 'submenu', 'Perfiles', '/security/profiles')]),
    ]),
    node('reports', 'menu', 'Reportes', null),
  ],
  settings: {
    system_name: 'Sistema Base',
    logo_key: null,
    primary_color: '#1565C0',
    secondary_color: '#424242',
    default_locale: 'es',
    default_time_zone: 'America/Santiago',
    logoUrl: 'https://bucket.test/logo.png',
  },
  pending: { passwordChange: false, mfaSetup: false },
};

export const PUBLIC_CONFIG = {
  systemName: 'Sistema Base',
  logoUrl: null,
  primaryColor: '#1565C0',
  secondaryColor: '#424242',
  defaultLocale: 'es',
  selfRegistration: true,
  providers: ['google'],
};

export interface Backend {
  calls: Call[];
  /** Calls to "METHOD /path" (path without /api and query). */
  called(key: string): Call[];
  routes: Routes;
}

/**
 * Installs the fake API. Keys are "METHOD /path" with ":param" segments; values are the JSON body,
 * a Reply, or a handler. Unknown routes answer 404 so a missing fixture fails loudly in assertions.
 */
export function installBackend(routes: Routes = {}, options: { anonymous?: boolean; me?: Me } = {}): Backend {
  const all: Routes = {
    'GET /auth/config': PUBLIC_CONFIG,
    'POST /auth/refresh': options.anonymous ? apiError(401, 'SESSION_INVALID') : { accessToken: 'token-1', expiresIn: 600 },
    'GET /me': options.me ?? ME,
    'POST /auth/logout': reply(204),
    ...routes,
  };
  const calls: Call[] = [];
  const matchers = Object.keys(all).map((key) => {
    const [method, pattern] = key.split(' ') as [string, string];
    const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, '([^/]+)')}$`);
    return { key, method, regex };
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const call: Call = { method, path, query: url.searchParams, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body };
      calls.push(call);
      for (const matcher of matchers) {
        const match = matcher.method === method ? matcher.regex.exec(path) : null;
        if (!match) continue;
        const value = all[matcher.key];
        const result = typeof value === 'function' ? await (value as Handler)(call, match.slice(1).map(decodeURIComponent)) : value;
        return toResponse(result);
      }
      return toResponse(apiError(404, 'NOT_FOUND'));
    }),
  );

  return {
    calls,
    routes: all,
    called: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

function toResponse(result: unknown): Response {
  if (result instanceof Reply) {
    if (result.body === undefined) return new Response(null, { status: result.status });
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof result === 'string') return new Response(result, { status: 200, headers: { 'Content-Type': 'text/csv' } });
  return new Response(JSON.stringify(result ?? {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

let wrapper: VueWrapper | null = null;

/** Lets requests, Vue updates and Vuetify's async validation finish. */
export async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Mounts the app at path with a fresh Pinia (the router runs its guards as in the browser). */
export async function mountApp(path: string): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().attach();
  i18n.global.locale.value = 'es';
  // Leave the current route first so the guards run even when the target is the same path.
  await router.replace('/__reset__');
  await router.replace(path);
  wrapper = mount(App, { global: { plugins: [pinia, i18n, vuetify, router] }, attachTo: document.body });
  await settle();
  return wrapper;
}

export function unmountApp(): void {
  wrapper?.unmount();
  wrapper = null;
  useSessionStore().sessionLost();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
}

// DOM helpers (dialogs and menus are teleported to <body>, so everything is queried from there).

export const pageText = () => document.body.textContent ?? '';

export function button(label: string | RegExp): HTMLElement {
  const buttons = [...document.body.querySelectorAll<HTMLElement>('button, a.v-btn, .v-list-item')];
  const found = buttons.find((b) => (typeof label === 'string' ? b.textContent?.trim() === label : label.test(b.textContent ?? '')));
  if (!found) throw new Error(`button "${label}" not found in: ${buttons.map((b) => b.textContent?.trim()).join(' | ')}`);
  return found;
}

export async function click(target: string | RegExp | Element): Promise<void> {
  const element = target instanceof Element ? target : button(target);
  (element as HTMLElement).click();
  await settle();
}

/** Clicks the button with this aria-label (icon buttons); index picks among several. */
export async function clickLabel(label: string, index = 0): Promise<void> {
  const found = [...document.body.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)][index];
  if (!found) throw new Error(`aria-label "${label}" not found`);
  found.click();
  await settle();
}

export function field(label: string, index = 0): HTMLInputElement {
  // An open dialog takes precedence over the page behind it (both may have a "Rol" field).
  const dialogs = document.body.querySelectorAll('.v-overlay--active.v-dialog');
  const scope = dialogs[dialogs.length - 1] ?? document.body;
  // Outlined fields render the label twice (one floating copy has no "for").
  const labels = [...scope.querySelectorAll('label[for]')].filter((l) => l.textContent?.trim() === label);
  const forId = labels[index]?.getAttribute('for');
  const input = forId ? document.getElementById(forId) : null;
  if (!input) throw new Error(`field "${label}" not found`);
  return input as HTMLInputElement;
}

export async function fill(label: string, value: string, index = 0): Promise<void> {
  const input = field(label, index);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(1);
}

/** Submits the (last) form on the page, as pressing Enter or a submit button would. */
export async function submit(): Promise<void> {
  const forms = document.body.querySelectorAll('form');
  forms[forms.length - 1]!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
}

export const currentPath = () => router.currentRoute.value.fullPath;

/** Clicks the last button with this text (e.g. a dialog's button over the menu item that opened it). */
export async function clickLast(label: string): Promise<void> {
  const buttons = [...document.body.querySelectorAll<HTMLElement>('button, .v-list-item')].filter((b) => b.textContent?.trim() === label);
  if (!buttons.length) throw new Error(`button "${label}" not found`);
  await click(buttons[buttons.length - 1]!);
}

/** Confirms the open AppConfirmDialog. */
export async function confirmDialog(): Promise<void> {
  const buttons = document.body.querySelectorAll('[data-test="confirm"]');
  await click(buttons[buttons.length - 1]!);
}

export const rows = () => [...document.body.querySelectorAll<HTMLElement>('tbody tr')];

/** Real wait (debounced inputs), then settle. */
export async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await settle();
}

/** Picks an option of a v-select / v-autocomplete by its label and the option text. */
export async function choose(label: string, option: string): Promise<void> {
  const input = field(label);
  const control = input.closest('.v-field') as HTMLElement;
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  control.click();
  await settle();
  const items = [...document.body.querySelectorAll<HTMLElement>('.v-overlay--active .v-list-item')];
  const item = items.find((i) => i.textContent?.trim() === option);
  if (!item) throw new Error(`option "${option}" not found in: ${items.map((i) => i.textContent?.trim()).join(' | ')}`);
  await click(item);
}
