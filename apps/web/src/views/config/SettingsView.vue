<script setup lang="ts">
import { AppPageHeader } from '@base/ui';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { useRules } from '../../composables/useRules';
import { configApi, type SettingsInput } from '../../services/api';
import { useNotifyStore } from '../../stores/notify';
import { useSessionStore } from '../../stores/session';

const LOGO_MAX_BYTES = 512 * 1024;
const { t } = useI18n();
const rules = useRules();
const session = useSessionStore();
const notify = useNotifyStore();
const { loading, run } = useApiAction();

const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const model = ref<SettingsInput | null>(null);
const logoUrl = ref<string | null>(null);
const logoInput = ref<HTMLInputElement | null>(null);
const timeZones = Intl.supportedValuesOf('timeZone');
const locales = [
  { title: 'Español', value: 'es' },
  { title: 'English', value: 'en' },
];
const hex = (value: unknown) => /^#[0-9A-Fa-f]{6}$/.test(String(value)) || t('validation.required');

onMounted(async () => {
  const result = await run(() => configApi.settings());
  if (!result) return;
  const s = result.settings;
  logoUrl.value = result.logoUrl;
  model.value = {
    systemName: s.system_name,
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    defaultLocale: s.default_locale,
    defaultTimeZone: s.default_time_zone,
    selfRegistrationEnabled: s.self_registration_enabled,
  };
});

async function save() {
  if (!model.value || !(await form.value?.validate())?.valid) return;
  if (await run(() => configApi.updateSettings(model.value!), t('app.saved'))) await session.loadMe();
}

async function uploadLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > LOGO_MAX_BYTES) {
    notify.show(t('errors.INVALID_LOGO'), 'error');
    return;
  }
  const result = await run(async () => {
    const upload = await configApi.logoUploadUrl(file.type);
    const body = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) body.append(key, value);
    body.append('file', file);
    if (!(await fetch(upload.url, { method: 'POST', body })).ok) throw new Error('upload failed');
    return configApi.setLogo(upload.key);
  }, t('config.settings.logoUpdated'));
  if (result) logoUrl.value = result.logoUrl;
  if (logoInput.value) logoInput.value.value = '';
}

async function removeLogo() {
  const result = await run(() => configApi.setLogo(null), t('app.saved'));
  if (result) logoUrl.value = null;
}
</script>

<template>
  <div>
    <AppPageHeader :title="t('config.settings.title')" :subtitle="t('config.settings.subtitle')" />
    <v-row v-if="model">
      <v-col cols="12" lg="8">
        <v-card>
          <v-card-text>
            <v-form ref="form" @submit.prevent="save">
              <v-row dense>
                <v-col cols="12"><v-text-field v-model="model.systemName" :label="t('config.settings.systemName')" :rules="[rules.required, rules.max(100)]" /></v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="model.primaryColor" :label="t('config.settings.primaryColor')" :rules="[hex]" maxlength="7">
                    <template #append-inner><input v-model="model.primaryColor" type="color" class="swatch" :aria-label="t('config.settings.primaryColor')" /></template>
                  </v-text-field>
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="model.secondaryColor" :label="t('config.settings.secondaryColor')" :rules="[hex]" maxlength="7">
                    <template #append-inner><input v-model="model.secondaryColor" type="color" class="swatch" :aria-label="t('config.settings.secondaryColor')" /></template>
                  </v-text-field>
                </v-col>
                <v-col cols="12" sm="6"><v-select v-model="model.defaultLocale" :items="locales" :label="t('config.settings.defaultLocale')" /></v-col>
                <v-col cols="12" sm="6"><v-autocomplete v-model="model.defaultTimeZone" :items="timeZones" :label="t('config.settings.defaultTimeZone')" :rules="[rules.required]" /></v-col>
                <v-col cols="12">
                  <v-switch v-model="model.selfRegistrationEnabled" color="primary" :label="t('config.settings.selfRegistration')" :hint="t('config.settings.selfRegistrationHint')" persistent-hint inset />
                </v-col>
              </v-row>
              <v-btn type="submit" color="primary" class="mt-4" :loading="loading">{{ t('app.save') }}</v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" lg="4" class="d-flex flex-column ga-4">
        <v-card>
          <v-card-title class="text-subtitle-1">{{ t('config.settings.logo') }}</v-card-title>
          <v-card-text class="d-flex flex-column align-start ga-3">
            <img v-if="logoUrl" :src="logoUrl" alt="Logo" class="logo" />
            <input ref="logoInput" type="file" accept="image/png,image/svg+xml,image/webp" hidden @change="uploadLogo" />
            <div class="d-flex flex-wrap ga-2">
              <v-btn variant="outlined" prepend-icon="mdi-upload" :loading="loading" @click="logoInput?.click()">{{ t('config.settings.logoChoose') }}</v-btn>
              <v-btn v-if="logoUrl" variant="text" color="error" @click="removeLogo">{{ t('config.settings.logoRemove') }}</v-btn>
            </div>
            <p class="text-caption text-medium-emphasis">{{ t('config.settings.logoHint') }}</p>
          </v-card-text>
        </v-card>
        <v-card>
          <v-card-title class="text-subtitle-1">{{ t('config.settings.preview') }}</v-card-title>
          <v-card-text>
            <div class="brand-preview" :style="{ background: model.primaryColor }">
              <span>{{ model.systemName }}</span>
            </div>
            <div class="d-flex ga-2 mt-3">
              <v-btn :color="model.primaryColor" variant="flat" size="small">{{ t('app.save') }}</v-btn>
              <v-btn :color="model.secondaryColor" variant="outlined" size="small">{{ t('app.cancel') }}</v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.swatch {
  width: 28px;
  height: 28px;
  border: none;
  padding: 0;
  background: none;
  cursor: pointer;
}
.logo {
  max-width: 100%;
  max-height: 96px;
  object-fit: contain;
}
.brand-preview {
  color: #fff;
  border-radius: 8px;
  padding: 14px 16px;
  font-weight: 700;
}
</style>
