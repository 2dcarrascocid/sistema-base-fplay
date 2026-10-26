<script setup lang="ts">
import { AppPageHeader } from '@base/ui';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { configApi, type PolicyInput } from '../../services/api';
import type { SecurityPolicy } from '../../services/types';

const { t } = useI18n();
const { loading, run } = useApiAction();
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const model = ref<PolicyInput | null>(null);

/** Same ranges as the API and the database CHECK constraints. */
const RANGES = {
  passwordMinLength: [12, 128],
  passwordMaxAgeDays: [0, 365],
  maxFailedAttempts: [3, 10],
  lockoutMinutes: [1, 1440],
  idleTimeoutMinutes: [5, 120],
  sessionMaxHours: [1, 720],
  invitationTtlHours: [1, 168],
} as const;
type NumericField = keyof typeof RANGES;

const inRange = (field: NumericField) => (value: unknown) => {
  const [min, max] = RANGES[field];
  const n = Number(value);
  return (Number.isInteger(n) && n >= min && n <= max) || t('config.policy.range', { min, max });
};

function fromApi(policy: SecurityPolicy, clientMfa: boolean): PolicyInput {
  return {
    passwordMinLength: policy.password_min_length,
    passwordRequireUpper: policy.password_require_upper,
    passwordRequireLower: policy.password_require_lower,
    passwordRequireDigit: policy.password_require_digit,
    passwordRequireSymbol: policy.password_require_symbol,
    passwordMaxAgeDays: policy.password_max_age_days,
    maxFailedAttempts: policy.max_failed_attempts,
    lockoutMinutes: policy.lockout_minutes,
    idleTimeoutMinutes: policy.idle_timeout_minutes,
    sessionMaxHours: policy.session_max_hours,
    invitationTtlHours: policy.invitation_ttl_hours,
    clientMfaRequired: clientMfa,
  };
}

async function load() {
  const result = await run(() => configApi.policy());
  if (result) model.value = fromApi(result.policy, result.roles.find((r) => r.code === 'client')?.mfa_required ?? false);
}

async function save() {
  if (!model.value || !(await form.value?.validate())?.valid) return;
  const numbers = Object.fromEntries((Object.keys(RANGES) as NumericField[]).map((key) => [key, Number(model.value![key])]));
  const result = await run(() => configApi.updatePolicy({ ...model.value!, ...numbers }), t('config.policy.saved'));
  if (result) model.value = fromApi(result.policy, result.roles.find((r) => r.code === 'client')?.mfa_required ?? false);
}

onMounted(load);
</script>

<template>
  <div>
    <AppPageHeader :title="t('config.policy.title')" :subtitle="t('config.policy.subtitle')" />
    <v-form v-if="model" ref="form" @submit.prevent="save">
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="h-100">
            <v-card-title class="text-subtitle-1">{{ t('config.policy.passwords') }}</v-card-title>
            <v-card-text>
              <v-text-field v-model.number="model.passwordMinLength" type="number" :label="t('config.policy.minLength')" :rules="[inRange('passwordMinLength')]" />
              <v-checkbox v-model="model.passwordRequireUpper" :label="t('config.policy.requireUpper')" hide-details density="compact" />
              <v-checkbox v-model="model.passwordRequireLower" :label="t('config.policy.requireLower')" hide-details density="compact" />
              <v-checkbox v-model="model.passwordRequireDigit" :label="t('config.policy.requireDigit')" hide-details density="compact" />
              <v-checkbox v-model="model.passwordRequireSymbol" :label="t('config.policy.requireSymbol')" density="compact" />
              <v-text-field v-model.number="model.passwordMaxAgeDays" type="number" :label="t('config.policy.maxAge')" :rules="[inRange('passwordMaxAgeDays')]" />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="6" class="d-flex flex-column ga-4">
          <v-card>
            <v-card-title class="text-subtitle-1">{{ t('config.policy.lockout') }}</v-card-title>
            <v-card-text>
              <v-text-field v-model.number="model.maxFailedAttempts" type="number" :label="t('config.policy.maxAttempts')" :rules="[inRange('maxFailedAttempts')]" />
              <v-text-field v-model.number="model.lockoutMinutes" type="number" :label="t('config.policy.lockoutMinutes')" :rules="[inRange('lockoutMinutes')]" />
            </v-card-text>
          </v-card>
          <v-card>
            <v-card-title class="text-subtitle-1">{{ t('config.policy.sessions') }}</v-card-title>
            <v-card-text>
              <v-text-field v-model.number="model.idleTimeoutMinutes" type="number" :label="t('config.policy.idle')" :rules="[inRange('idleTimeoutMinutes')]" />
              <v-text-field v-model.number="model.sessionMaxHours" type="number" :label="t('config.policy.sessionMax')" :rules="[inRange('sessionMaxHours')]" />
              <v-text-field v-model.number="model.invitationTtlHours" type="number" :label="t('config.policy.invitationTtl')" :rules="[inRange('invitationTtlHours')]" />
            </v-card-text>
          </v-card>
          <v-card>
            <v-card-title class="text-subtitle-1">{{ t('config.policy.mfa') }}</v-card-title>
            <v-card-text>
              <p class="text-medium-emphasis mb-2">{{ t('config.policy.mfaAlways') }}</p>
              <v-switch v-model="model.clientMfaRequired" color="primary" :label="t('config.policy.clientMfa')" inset hide-details />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-btn type="submit" color="primary" class="mt-4" :loading="loading">{{ t('app.save') }}</v-btn>
    </v-form>
  </div>
</template>
