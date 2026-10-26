import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import { createVuetify, type ThemeInstance } from 'vuetify';
import { en, es } from 'vuetify/locale';

export const vuetify = createVuetify({
  locale: { locale: 'es', fallback: 'es', messages: { es, en } },
  theme: {
    defaultTheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    themes: {
      light: {
        colors: { primary: '#1565C0', secondary: '#424242', background: '#F5F7FA', surface: '#FFFFFF' },
      },
      dark: {
        dark: true,
        colors: { primary: '#64A6F0', secondary: '#B0BEC5', background: '#111418', surface: '#1A1F25' },
      },
    },
  },
  defaults: {
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VSelect: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VAutocomplete: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VBtn: { style: 'text-transform: none; letter-spacing: normal;' },
    VCard: { rounded: 'lg' },
  },
});

/** Applies the brand colors configured in app_settings to the light theme. */
export function applyBrand(theme: ThemeInstance, primary: string, secondary: string): void {
  const light = theme.themes.value['light'];
  if (light) {
    light.colors.primary = primary;
    light.colors.secondary = secondary;
  }
}
