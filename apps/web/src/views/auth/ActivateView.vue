<script setup lang="ts">
import { AppPasswordField } from '@base/ui';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TurnstileBox from '../../components/TurnstileBox.vue';
import { useRules } from '../../composables/useRules';
import { authApi } from '../../services/api';
import { errorMessage } from '../../utils/errors';

const { t, te } = useI18n();
const rules = useRules();
const token = ref<string | null>(null);
const password = ref('');
const confirmPassword = ref('');
const done = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const captcha = ref<InstanceType<typeof TurnstileBox> | null>(null);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

onMounted(() => {
  // The token comes in the URL fragment (never sent to servers); remove it from the address bar and history.
  const match = /(?:^|&)token=([^&]+)/.exec(window.location.hash.slice(1));
  token.value = match ? decodeURIComponent(match[1]!) : null;
  history.replaceState(null, '', window.location.pathname);
});

async function submit() {
  if (!token.value || !(await form.value?.validate())?.valid) return;
  loading.value = true;
  error.value = null;
  try {
    await authApi.acceptInvitation(token.value, password.value, captcha.value?.token ?? '');
    done.value = true;
    token.value = null;
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
      <v-card-title class="text-h5 font-weight-bold text-wrap">{{ t('auth.activate.title') }}</v-card-title>
    </v-card-item>
    <v-card-text>
      <v-alert v-if="done" type="success" variant="tonal" class="mb-4">{{ t('auth.activate.done') }}</v-alert>
      <v-alert v-else-if="!token" type="warning" variant="tonal" class="mb-4">{{ t('auth.activate.missingToken') }}</v-alert>
      <template v-else>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" role="alert">{{ error }}</v-alert>
        <p class="mb-4">{{ t('auth.activate.intro') }}</p>
        <v-form ref="form" @submit.prevent="submit">
          <AppPasswordField v-model="password" :label="t('auth.newPassword')" autocomplete="new-password" :toggle-label="t('auth.newPassword')" :rules="[rules.required]" />
          <AppPasswordField
            v-model="confirmPassword"
            :label="t('auth.confirmPassword')"
            autocomplete="new-password"
            :toggle-label="t('auth.confirmPassword')"
            :rules="[rules.required, rules.sameAs(() => password)]"
          />
          <p class="text-caption text-medium-emphasis mb-3">{{ t('auth.passwordHint') }}</p>
          <TurnstileBox ref="captcha" />
          <v-btn type="submit" color="primary" size="large" block :loading="loading">{{ t('auth.activate.submit') }}</v-btn>
        </v-form>
      </template>
      <v-btn variant="text" block class="mt-2" :to="{ name: 'login' }">{{ t('auth.backToLogin') }}</v-btn>
    </v-card-text>
  </v-card>
</template>
