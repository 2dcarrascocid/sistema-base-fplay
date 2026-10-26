import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { useApiAction } from '../src/composables/useApiAction';
import { useRules } from '../src/composables/useRules';
import { useTurnstile } from '../src/composables/useTurnstile';
import en from '../src/locales/en';
import es from '../src/locales/es';
import { ApiError } from '../src/services/http';
import { useNotifyStore } from '../src/stores/notify';

/** Runs a composable inside a component with i18n and Pinia. */
function withSetup<T>(composable: () => T): T {
  let result!: T;
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createI18n({ legacy: false, locale: 'es', messages: { es, en } });
  mount(
    defineComponent({
      setup() {
        result = composable();
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n, pinia] } },
  );
  return result;
}

beforeEach(() => setActivePinia(createPinia()));

describe('useApiAction', () => {
  it('returns the result and notifies success', async () => {
    const action = withSetup(() => useApiAction());
    expect(await action.run(async () => 42, 'Listo')).toBe(42);
    expect(useNotifyStore().current).toMatchObject({ text: 'Listo', tone: 'success' });
    expect(action.loading.value).toBe(false);
  });

  it('turns API errors into a translated message', async () => {
    const action = withSetup(() => useApiAction());
    expect(await action.run(async () => Promise.reject(new ApiError(409, 'EMAIL_TAKEN')))).toBeUndefined();
    expect(action.error.value).toBe('Ya existe un usuario con ese email.');
    expect(useNotifyStore().current?.tone).toBe('error');
    useNotifyStore().dismiss();
    expect(useNotifyStore().current).toBeNull();
  });
});

describe('useRules', () => {
  it('returns translated messages for Vuetify', () => {
    const rules = withSetup(() => useRules());
    expect(rules.required('')).toBe('Campo obligatorio');
    expect(rules.rut('11.111.111-1')).toBe(true);
    expect(rules.max(2)('abc')).toBe('Máximo 2 caracteres');
    expect(rules.email('x')).toBe('Email no válido');
    expect(rules.phone('1')).toContain('+569');
    expect(rules.totp('1')).toBe('El código tiene 6 dígitos');
    expect(rules.sameAs(() => 'a')('b')).toBe('Las contraseñas no coinciden');
  });
});

describe('useTurnstile', () => {
  afterEach(() => {
    delete window.turnstile;
    vi.restoreAllMocks();
  });

  it('yields a placeholder token without a site key (local development)', () => {
    const turnstile = withSetup(() => useTurnstile(ref(null), ''));
    expect(turnstile.enabled).toBe(false);
    expect(turnstile.token.value).toBe('local-development');
  });

  it('renders the widget, stores the token and resets it after use', async () => {
    const container = ref<HTMLElement | null>(document.createElement('div'));
    const api = { render: vi.fn(() => 'w1'), reset: vi.fn(), remove: vi.fn() };
    const turnstile = withSetup(() => useTurnstile(container, 'site-key'));
    expect(turnstile.token.value).toBe('');

    // Capture the script tag instead of letting happy-dom fetch it.
    let script!: HTMLScriptElement;
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
      script = node as unknown as HTMLScriptElement;
      return node;
    });
    const mounting = turnstile.mount('es');
    expect(script.src).toContain('challenges.cloudflare.com/turnstile');
    window.turnstile = api;
    script.onload!(new Event('load'));
    await mounting;

    const options = (api.render.mock.calls[0] as unknown as [HTMLElement, Record<string, (value?: string) => void>])[1];
    options['callback']!('token-1');
    expect(turnstile.token.value).toBe('token-1');
    turnstile.reset();
    expect(api.reset).toHaveBeenCalledWith('w1');
    expect(turnstile.token.value).toBe('');
    options['expired-callback']!();
    options['error-callback']!();
  });
});
