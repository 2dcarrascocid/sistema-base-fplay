<script setup lang="ts">
import { AppConfirmDialog, AppPageHeader, AppPasswordField } from '@base/ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import MfaQr from '../../components/MfaQr.vue';
import { useApiAction } from '../../composables/useApiAction';
import { useRules } from '../../composables/useRules';
import { accountApi } from '../../services/api';
import type { Locale, MfaSetup, Session } from '../../services/types';
import { useNotifyStore } from '../../stores/notify';
import { useSessionStore } from '../../stores/session';
import { formatDateTime, fullName, initials } from '../../utils/format';

type Tab = 'data' | 'photo' | 'password' | 'mfa' | 'sessions';
const TABS: Tab[] = ['data', 'photo', 'password', 'mfa', 'sessions'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const notify = useNotifyStore();
const rules = useRules();
const { loading, run } = useApiAction();

const tab = ref<Tab>(TABS.includes(route.query['tab'] as Tab) ? (route.query['tab'] as Tab) : 'data');
watch(tab, (value) => void router.replace({ query: { tab: value } }));

const me = computed(() => session.me!);
const timeZones = Intl.supportedValuesOf('timeZone');
const locales: { title: string; value: Locale }[] = [
  { title: 'Español', value: 'es' },
  { title: 'English', value: 'en' },
];

// Datos ---------------------------------------------------------------------------------------
const dataForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const data = ref({ firstName: '', lastName: '', secondLastName: '', phone: '', locale: null as Locale | null, timeZone: null as string | null });
function resetData() {
  const user = me.value.user;
  data.value = {
    firstName: user.first_name,
    lastName: user.last_name,
    secondLastName: user.second_last_name ?? '',
    phone: user.phone ?? '',
    locale: user.locale,
    timeZone: user.time_zone,
  };
}
async function saveData() {
  if (!(await dataForm.value?.validate())?.valid) return;
  const changes = {
    firstName: data.value.firstName.trim(),
    lastName: data.value.lastName.trim(),
    secondLastName: data.value.secondLastName.trim() || null,
    phone: data.value.phone.trim() || null,
    locale: data.value.locale,
    timeZone: data.value.timeZone,
  };
  if (await run(() => accountApi.update(changes), t('app.saved'))) await session.loadMe();
}

// Foto ----------------------------------------------------------------------------------------
const photoInput = ref<HTMLInputElement | null>(null);
async function uploadPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > PHOTO_MAX_BYTES) {
    notify.show(t('account.photo.tooLarge'), 'error');
    return;
  }
  const done = await run(async () => {
    const upload = await accountApi.photoUploadUrl(file.type);
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append('file', file);
    const response = await fetch(upload.url, { method: 'POST', body: form });
    if (!response.ok) throw new Error('upload failed');
    return accountApi.setPhoto(upload.key);
  }, t('account.photo.updated'));
  if (done) await session.loadMe();
  if (photoInput.value) photoInput.value.value = '';
}

// Contraseña ----------------------------------------------------------------------------------
const passwordForm = ref<{ validate: () => Promise<{ valid: boolean }>; reset: () => void } | null>(null);
const passwords = ref({ current: '', next: '', confirm: '' });
async function changePassword() {
  if (!(await passwordForm.value?.validate())?.valid) return;
  const ok = await run(() => accountApi.changePassword(passwords.value.current, passwords.value.next), t('account.password.changed'));
  if (ok !== undefined) {
    passwordForm.value?.reset();
    await session.loadMe();
  }
}

// MFA -----------------------------------------------------------------------------------------
const mfaSetup = ref<MfaSetup | null>(null);
const mfaCode = ref('');
const confirmDisable = ref(false);
const roleRequiresMfa = computed(() => me.value.role !== 'client' || me.value.pending.mfaSetup);
async function startMfa() {
  mfaSetup.value = (await run(() => accountApi.mfaSetup())) ?? null;
  mfaCode.value = '';
}
async function verifyMfa() {
  if (rules.totp(mfaCode.value) !== true) return;
  const ok = await run(() => accountApi.mfaVerify(mfaCode.value), t('account.mfa.activated'));
  if (ok !== undefined) {
    mfaSetup.value = null;
    await session.loadMe();
  }
}
async function disableMfa() {
  const ok = await run(() => accountApi.mfaDisable(), t('account.mfa.deactivated'));
  confirmDisable.value = false;
  if (ok !== undefined) await session.loadMe();
}

// Sesiones ------------------------------------------------------------------------------------
const sessions = ref<Session[]>([]);
async function loadSessions() {
  sessions.value = (await run(() => accountApi.sessions()))?.sessions ?? [];
}
async function revoke(id: string) {
  if ((await run(() => accountApi.revokeSession(id), t('account.sessions.revoked'))) !== undefined) await loadSessions();
}
async function revokeOthers() {
  if ((await run(() => accountApi.revokeOtherSessions(), t('account.sessions.othersRevoked'))) !== undefined) await loadSessions();
}
const when = (value: string) => formatDateTime(value, locale.value, me.value.user.time_zone ?? undefined);

watch(tab, (value) => value === 'sessions' && void loadSessions());
onMounted(() => {
  resetData();
  if (tab.value === 'sessions') void loadSessions();
});
</script>

<template>
  <div>
    <AppPageHeader :title="t('account.title')" :subtitle="`${fullName(me.user)} · ${me.user.email}`" />

    <v-alert v-if="me.pending.passwordChange" type="warning" variant="tonal" class="mb-4">{{ t('account.pendingPassword') }}</v-alert>
    <v-alert v-if="me.pending.mfaSetup" type="warning" variant="tonal" class="mb-4">{{ t('account.pendingMfa') }}</v-alert>

    <v-card>
      <v-tabs v-model="tab" show-arrows color="primary">
        <v-tab v-for="name in TABS" :key="name" :value="name">{{ t(`account.tabs.${name}`) }}</v-tab>
      </v-tabs>
      <v-divider />

      <v-window v-model="tab">
        <v-window-item value="data">
          <v-card-text>
            <v-form ref="dataForm" class="account-form" @submit.prevent="saveData">
              <v-row>
                <v-col cols="12" md="4"><v-text-field v-model="data.firstName" :label="t('fields.firstName')" :rules="[rules.required, rules.max(100)]" /></v-col>
                <v-col cols="12" md="4"><v-text-field v-model="data.lastName" :label="t('fields.lastName')" :rules="[rules.required, rules.max(100)]" /></v-col>
                <v-col cols="12" md="4"><v-text-field v-model="data.secondLastName" :label="t('fields.secondLastName')" :rules="[rules.max(100)]" /></v-col>
                <v-col cols="12" md="4"><v-text-field :model-value="me.user.email" :label="t('fields.email')" readonly /></v-col>
                <v-col cols="12" md="4"><v-text-field :model-value="me.user.rut ?? ''" :label="t('fields.rut')" readonly /></v-col>
                <v-col cols="12" md="4"><v-text-field :model-value="t(`roles.${me.role}`)" :label="t('fields.role')" readonly /></v-col>
                <v-col cols="12" md="4"><v-text-field v-model="data.phone" :label="t('fields.phone')" placeholder="+56912345678" :rules="[rules.phone]" /></v-col>
                <v-col cols="12" md="4"><v-select v-model="data.locale" :items="locales" :label="t('fields.locale')" clearable /></v-col>
                <v-col cols="12" md="4"><v-autocomplete v-model="data.timeZone" :items="timeZones" :label="t('fields.timeZone')" clearable /></v-col>
              </v-row>
              <v-btn type="submit" color="primary" :loading="loading">{{ t('app.save') }}</v-btn>
            </v-form>
          </v-card-text>
        </v-window-item>

        <v-window-item value="photo">
          <v-card-text class="d-flex flex-wrap align-center ga-6">
            <v-avatar size="112" color="primary">
              <v-img v-if="me.user.photoUrl" :src="me.user.photoUrl" :alt="fullName(me.user)" />
              <span v-else class="text-h4">{{ initials(me.user) }}</span>
            </v-avatar>
            <div>
              <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="uploadPhoto" />
              <v-btn color="primary" prepend-icon="mdi-upload" :loading="loading" @click="photoInput?.click()">{{ t('account.photo.choose') }}</v-btn>
              <p class="text-caption text-medium-emphasis mt-2">{{ t('account.photo.hint') }}</p>
            </div>
          </v-card-text>
        </v-window-item>

        <v-window-item value="password">
          <v-card-text>
            <v-form ref="passwordForm" class="account-form account-form--narrow" @submit.prevent="changePassword">
              <AppPasswordField v-model="passwords.current" :label="t('account.password.current')" autocomplete="current-password" :toggle-label="t('account.password.current')" :rules="[rules.required]" />
              <AppPasswordField v-model="passwords.next" :label="t('auth.newPassword')" autocomplete="new-password" :toggle-label="t('auth.newPassword')" :rules="[rules.required]" />
              <AppPasswordField
                v-model="passwords.confirm"
                :label="t('auth.confirmPassword')"
                autocomplete="new-password"
                :toggle-label="t('auth.confirmPassword')"
                :rules="[rules.required, rules.sameAs(() => passwords.next)]"
              />
              <p class="text-caption text-medium-emphasis mb-3">{{ t('auth.passwordHint') }}</p>
              <v-btn type="submit" color="primary" :loading="loading">{{ t('auth.passwordChange.submit') }}</v-btn>
            </v-form>
          </v-card-text>
        </v-window-item>

        <v-window-item value="mfa">
          <v-card-text class="account-form account-form--narrow">
            <v-alert :type="me.user.mfa_enabled ? 'success' : 'info'" variant="tonal" class="mb-4">
              {{ me.user.mfa_enabled ? t('account.mfa.enabled') : t('account.mfa.disabled') }}
            </v-alert>
            <template v-if="!me.user.mfa_enabled">
              <v-btn v-if="!mfaSetup" color="primary" :loading="loading" @click="startMfa">{{ t('account.mfa.start') }}</v-btn>
              <template v-else>
                <p>{{ t('account.mfa.scan') }}</p>
                <MfaQr :uri="mfaSetup.otpauthUri" :secret="mfaSetup.secretCode" :manual-label="t('account.mfa.manual')" />
                <v-text-field v-model="mfaCode" :label="t('auth.mfa.code')" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :rules="[rules.totp]" />
                <v-btn color="primary" :loading="loading" @click="verifyMfa">{{ t('account.mfa.activate') }}</v-btn>
              </template>
            </template>
            <template v-else>
              <p v-if="roleRequiresMfa" class="text-medium-emphasis">{{ t('account.mfa.requiredByRole') }}</p>
              <v-btn v-else color="error" variant="outlined" @click="confirmDisable = true">{{ t('account.mfa.disable') }}</v-btn>
            </template>
          </v-card-text>
        </v-window-item>

        <v-window-item value="sessions">
          <v-card-text>
            <v-list lines="two">
              <v-list-item v-for="item in sessions" :key="item.id" :prepend-icon="item.client_type === 'web' ? 'mdi-monitor' : 'mdi-cellphone'">
                <v-list-item-title>
                  {{ t(`account.sessions.${item.client_type}`) }}
                  <v-chip v-if="item.current" size="x-small" color="primary" class="ml-2">{{ t('account.sessions.current') }}</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ item.ip }} · {{ t('account.sessions.lastSeen') }}: {{ when(item.last_seen_at) }} · {{ t('account.sessions.started') }}: {{ when(item.created_at) }}
                </v-list-item-subtitle>
                <template #append>
                  <v-btn v-if="!item.current" variant="text" color="error" size="small" @click="revoke(item.id)">{{ t('account.sessions.revoke') }}</v-btn>
                </template>
              </v-list-item>
            </v-list>
            <v-btn v-if="sessions.length > 1" variant="outlined" color="error" :loading="loading" @click="revokeOthers">{{ t('account.sessions.revokeOthers') }}</v-btn>
          </v-card-text>
        </v-window-item>
      </v-window>
    </v-card>

    <AppConfirmDialog
      v-model="confirmDisable"
      :title="t('account.mfa.disable')"
      :message="t('account.mfa.confirmDisable')"
      :confirm-text="t('account.mfa.disable')"
      :cancel-text="t('app.cancel')"
      danger
      :loading="loading"
      @confirm="disableMfa"
    />
  </div>
</template>

<style scoped>
.account-form {
  max-width: 960px;
}
.account-form--narrow {
  max-width: 440px;
}
</style>
