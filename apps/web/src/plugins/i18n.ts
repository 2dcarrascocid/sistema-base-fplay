import { createI18n } from 'vue-i18n';
import en from '../locales/en';
import es from '../locales/es';
import type { Locale } from '../services/types';

const LOCALE_KEY = 'locale';

/** Remembered language (a per-browser convenience; the account preference wins after sign-in). */
export function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return value === 'es' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // storage unavailable: the choice only lasts for this page
  }
}

function browserLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export const i18n = createI18n({
  legacy: false,
  locale: storedLocale() ?? browserLocale(),
  fallbackLocale: 'es',
  messages: { es, en },
});

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  rememberLocale(locale);
}
