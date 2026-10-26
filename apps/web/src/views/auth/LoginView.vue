<script setup lang="ts">
import { AppPasswordField } from '@base/ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import MfaQr from '../../components/MfaQr.vue';
import TurnstileBox from '../../components/TurnstileBox.vue';
import { useRules } from '../../composables/useRules';
import { safeRedirect } from '../../router/guards';
import { authApi } from '../../services/api';
import type { ChallengeName, LoginOutcome, MfaSetup, Provider, PublicConfig } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import { errorMessage } from '../../utils/errors';

type Step = 'credentials' | ChallengeName;

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const rules = useRules();

const step = ref<Step>('credentials');
const email = ref('');
const password = ref('');
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const challengeSession = ref('');
const mfaSetup = ref<MfaSetup | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const config = ref<PublicConfig | null>(null);
const captcha = ref<InstanceType<typeof TurnstileBox> | null>(null);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

const providerIcons: Record<Provider, string> = { google: 'mdi-google', facebook: 'mdi-facebook', apple: 'mdi-apple' };

const RETRY_KEY = 'federated-retry';

/** Remembers the provider so a Cognito "RETRY" (first sign-in right after linking) can be retried once. */
function startFederated(provider: Provider) {
  try {
    sessionStorage.setItem(RETRY_KEY, JSON.stringify({ provider, retried: false }));
  } catch {
    // storage unavailable: no automatic retry
  }
  window.location.assign(authApi.federatedStartUrl(provider));
}

function retryFederated(): boolean {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETRY_KEY) ?? 'null') as { provider: Provider; retried: boolean } | null;
    if (!saved || saved.retried || !Object.keys(providerIcons).includes(saved.provider)) return false;
    sessionStorage.setItem(RETRY_KEY, JSON.stringify({ ...saved, retried: true }));
    window.location.assign(authApi.federatedStartUrl(saved.provider));
    return true;
  } catch {
    return false;
  }
}

onMounted(async () => {
  const code = route.query['error'];
  if (code === 'RETRY' && retryFederated()) return;
  if (typeof code === 'string') {
    error.value = te(`errors.${code}`) ? t(`errors.${code}`) : t('errors.LOGIN_FAILED');
    void router.replace({ query: {} });
  }
  try {
    config.value = await authApi.config();
  } catch {
    config.value = null;
  }
});

const title = computed(
  () =>
    ({
      credentials: t('auth.login.title'),
      SOFTWARE_TOKEN_MFA: t('auth.mfa.title'),
      MFA_SETUP: t('auth.mfaSetup.title'),
      PASSWORD_CHANGE: t('auth.passwordChange.title'),
      NEW_PASSWORD_REQUIRED: t('auth.passwordChange.title'),
    })[step.value],
);

async function handle(outcome: LoginOutcome) {
  if (outcome.status === 'authenticated') {
    await router.replace(safeRedirect(route.query['redirect']));
    return;
  }
  challengeSession.value = outcome.session;
  code.value = '';
  step.value = outcome.challenge;
  if (outcome.challenge === 'MFA_SETUP') mfaSetup.value = await authApi.mfaSetup(outcome.session);
}

async function submit() {
  if (!(await form.value?.validate())?.valid) return;
  loading.value = true;
  error.value = null;
  try {
    if (step.value === 'credentials') {
      await handle(await session.login(email.value.trim(), password.value, captcha.value?.token ?? ''));
    } else if (step.value === 'SOFTWARE_TOKEN_MFA' || step.value === 'MFA_SETUP') {
      await handle(await session.answerChallenge(challengeSession.value, step.value, { code: code.value }));
    } else {
      await handle(await session.answerChallenge(challengeSession.value, step.value, { newPassword: newPassword.value }));
    }
  } catch (caught) {
    error.value = errorMessage(caught, t, te);
    if (step.value === 'credentials') password.value = '';
  } finally {
    loading.value = false;
    captcha.value?.reset();
  }
}

function restart() {
  step.value = 'credentials';
  password.value = '';
  error.value = null;
}
</script>

<template>
  <v-card class="pa-2" elevation="2">
    <v-card-item>
      <v-card-title class="text-h5 font-weight-bold text-wrap">{{ title }}</v-card-title>
      <v-card-subtitle v-if="step === 'credentials'" class="text-wrap">{{ t('auth.login.subtitle') }}</v-card-subtitle>
    </v-card-item>

    <v-card-text>
      <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" role="alert">{{ error }}</v-alert>

      <v-form ref="form" @submit.prevent="submit">
        <template v-if="step === 'credentials'">
          <v-text-field
            v-model="email"
            :label="t('auth.login.email')"
            type="email"
            autocomplete="username"
            :rules="[rules.required, rules.email]"
            autofocus
          />
          <AppPasswordField
            v-model="password"
            :label="t('auth.login.password')"
            autocomplete="current-password"
            :toggle-label="t('auth.login.password')"
            :rules="[rules.required]"
          />
          <TurnstileBox ref="captcha" />
          <v-btn type="submit" color="primary" size="large" block :loading="loading">{{ t('auth.login.submit') }}</v-btn>
          <div class="d-flex justify-space-between flex-wrap ga-2 mt-3">
            <router-link :to="{ name: 'forgot-password' }" class="text-body-2">{{ t('auth.login.forgot') }}</router-link>
            <router-link v-if="config?.selfRegistration" :to="{ name: 'register' }" class="text-body-2">
              {{ t('auth.login.register') }}
            </router-link>
          </div>

          <template v-if="config && config.providers.length > 0">
            <div class="d-flex align-center ga-3 my-5">
              <v-divider />
              <span class="text-caption text-medium-emphasis text-no-wrap">{{ t('auth.login.or') }}</span>
              <v-divider />
            </div>
            <div class="d-flex flex-column ga-2">
              <v-btn
                v-for="provider in config.providers"
                :key="provider"
                :prepend-icon="providerIcons[provider]"
                @click="startFederated(provider)"
                variant="outlined"
                block
              >
                {{ t(`auth.providers.${provider}`) }}
              </v-btn>
            </div>
          </template>
        </template>

        <template v-else-if="step === 'SOFTWARE_TOKEN_MFA' || step === 'MFA_SETUP'">
          <p class="mb-4">{{ step === 'MFA_SETUP' ? t('auth.mfaSetup.intro') : t('auth.mfa.intro') }}</p>
          <MfaQr v-if="step === 'MFA_SETUP' && mfaSetup" :uri="mfaSetup.otpauthUri" :secret="mfaSetup.secretCode" :manual-label="t('auth.mfaSetup.manual')" />
          <v-text-field
            v-model="code"
            :label="t('auth.mfa.code')"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :rules="[rules.totp]"
            autofocus
          />
          <v-btn type="submit" color="primary" size="large" block :loading="loading">
            {{ step === 'MFA_SETUP' ? t('auth.mfaSetup.submit') : t('auth.mfa.submit') }}
          </v-btn>
        </template>

        <template v-else>
          <p class="mb-4">{{ t('auth.passwordChange.intro') }}</p>
          <AppPasswordField
            v-model="newPassword"
            :label="t('auth.newPassword')"
            autocomplete="new-password"
            :toggle-label="t('auth.newPassword')"
            :rules="[rules.required]"
            :hint="t('auth.passwordHint')"
          />
          <AppPasswordField
            v-model="confirmPassword"
            :label="t('auth.confirmPassword')"
            autocomplete="new-password"
            :toggle-label="t('auth.confirmPassword')"
            :rules="[rules.required, rules.sameAs(() => newPassword)]"
          />
          <p class="text-caption text-medium-emphasis mb-3">{{ t('auth.passwordHint') }}</p>
          <v-btn type="submit" color="primary" size="large" block :loading="loading">{{ t('auth.passwordChange.submit') }}</v-btn>
        </template>
      </v-form>

      <v-btn v-if="step !== 'credentials'" variant="text" block class="mt-2" @click="restart">{{ t('auth.backToLogin') }}</v-btn>
    </v-card-text>
  </v-card>
</template>
