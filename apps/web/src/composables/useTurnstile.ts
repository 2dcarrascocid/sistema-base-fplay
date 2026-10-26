import { onBeforeUnmount, ref, type Ref } from 'vue';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile unavailable'));
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Cloudflare Turnstile widget. Without a site key (local development) it yields a placeholder
 * token immediately; the local API accepts any token, the deployed API never does.
 */
export function useTurnstile(container: Ref<HTMLElement | null>, siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '') {
  const token = ref<string>(siteKey ? '' : 'local-development');
  let widgetId: string | null = null;

  async function mount(locale: string): Promise<void> {
    if (!siteKey || !container.value) return;
    await loadScript();
    widgetId = window.turnstile!.render(container.value, {
      sitekey: siteKey,
      language: locale,
      callback: (value: string) => (token.value = value),
      'expired-callback': () => (token.value = ''),
      'error-callback': () => (token.value = ''),
    });
  }

  /** Tokens are single use: get a new one after every submit. */
  function reset(): void {
    if (widgetId && window.turnstile) {
      token.value = '';
      window.turnstile.reset(widgetId);
    }
  }

  onBeforeUnmount(() => {
    if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
  });

  return { token, mount, reset, enabled: Boolean(siteKey) };
}
