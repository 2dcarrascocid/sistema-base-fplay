<script setup lang="ts">
import { AppPasswordField } from '@base/ui';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TurnstileBox from '../../components/TurnstileBox.vue';
import { useRules } from '../../composables/useRules';
import { authApi } from '../../services/api';
import { errorMessage } from '../../utils/errors';

/** Step 1: request a code by email. Step 2: code + new password. */
const { t, te } = useI18n();
const rules = useRules();
const step = ref<'request' | 'reset' | 'done'>('request');
const email = ref('');
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const info = ref<string | null>(null);
const captcha = ref<InstanceType<typeof TurnstileBox> | null>(null);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

async function submit() {
  if (!(await form.value?.validate())?.valid) return;
  loading.value = true;
  error.value = null;
  try {
    if (step.value === 'request') {
      await authApi.forgot(email.value.trim(), captcha.value?.token ?? '');
      info.value = t('auth.forgot.sent');
      step.value = 'reset';
    } else {
      await authApi.reset(email.value.trim(), code.value.trim(), newPassword.value, captcha.value?.token ?? '');
      step.value = 'done';
    }
  } catch (caught) {
    error.value = errorMessage(caught, t, te);
  } finally {
    loading.value = false;
    captcha.value?.reset();
  }
}
</script>

<template>
  <v-card class="pa-2" elevation="2">
    <v-card-item>
      <v-card-title class="text-h5 font-weight-bold text-wrap">
        {{ step === 'request' ? t('auth.forgot.title') : t('auth.reset.title') }}
      </v-card-title>
    </v-card-item>
    <v-card-text>
      <v-alert v-if="step === 'done'" type="success" variant="tonal" class="mb-4">{{ t('auth.reset.done') }}</v-alert>
      <template v-else>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" role="alert">{{ error }}</v-alert>
        <v-alert v-if="info && step === 'reset'" type="info" variant="tonal" density="compact" class="mb-4">{{ info }}</v-alert>
        <p v-if="step === 'request'" class="mb-4">{{ t('auth.forgot.intro') }}</p>
        <v-form ref="form" @submit.prevent="submit">
          <v-text-field v-model="email" :label="t('auth.login.email')" type="email" autocomplete="username" :rules="[rules.required, rules.email]" :readonly="step === 'reset'" />
          <template v-if="step === 'reset'">
            <v-text-field v-model="code" :label="t('auth.reset.code')" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :rules="[rules.totp]" autofocus />
            <AppPasswordField v-model="newPassword" :label="t('auth.newPassword')" autocomplete="new-password" :toggle-label="t('auth.newPassword')" :rules="[rules.required]" />
            <AppPasswordField
              v-model="confirmPassword"
              :label="t('auth.confirmPassword')"
              autocomplete="new-password"
              :toggle-label="t('auth.confirmPassword')"
              :rules="[rules.required, rules.sameAs(() => newPassword)]"
            />
            <p class="text-caption text-medium-emphasis mb-3">{{ t('auth.passwordHint') }}</p>
          </template>
          <TurnstileBox ref="captcha" />
          <v-btn type="submit" color="primary" size="large" block :loading="loading">
            {{ step === 'request' ? t('auth.forgot.submit') : t('auth.reset.submit') }}
          </v-btn>
        </v-form>
      </template>
      <v-btn variant="text" block class="mt-2" :to="{ name: 'login' }">{{ t('auth.backToLogin') }}</v-btn>
    </v-card-text>
  </v-card>
</template>
