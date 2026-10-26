<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TurnstileBox from '../../components/TurnstileBox.vue';
import { useRules } from '../../composables/useRules';
import { authApi } from '../../services/api';
import { errorMessage } from '../../utils/errors';

const { t, te } = useI18n();
const rules = useRules();
const email = ref('');
const firstName = ref('');
const lastName = ref('');
const sent = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const captcha = ref<InstanceType<typeof TurnstileBox> | null>(null);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

async function submit() {
  if (!(await form.value?.validate())?.valid) return;
  loading.value = true;
  error.value = null;
  try {
    await authApi.register({ email: email.value.trim(), firstName: firstName.value.trim(), lastName: lastName.value.trim(), captchaToken: captcha.value?.token ?? '' });
    sent.value = true;
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
      <v-card-title class="text-h5 font-weight-bold text-wrap">{{ t('auth.register.title') }}</v-card-title>
      <v-card-subtitle class="text-wrap">{{ t('auth.register.intro') }}</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-alert v-if="sent" type="success" variant="tonal" class="mb-4">{{ t('auth.register.sent') }}</v-alert>
      <v-form v-else ref="form" @submit.prevent="submit">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" role="alert">{{ error }}</v-alert>
        <v-text-field v-model="firstName" :label="t('auth.register.firstName')" autocomplete="given-name" :rules="[rules.required, rules.max(100)]" />
        <v-text-field v-model="lastName" :label="t('auth.register.lastName')" autocomplete="family-name" :rules="[rules.required, rules.max(100)]" />
        <v-text-field v-model="email" :label="t('auth.login.email')" type="email" autocomplete="email" :rules="[rules.required, rules.email]" />
        <TurnstileBox ref="captcha" />
        <v-btn type="submit" color="primary" size="large" block :loading="loading">{{ t('auth.register.submit') }}</v-btn>
      </v-form>
      <v-btn variant="text" block class="mt-2" :to="{ name: 'login' }">{{ t('auth.backToLogin') }}</v-btn>
    </v-card-text>
  </v-card>
</template>
