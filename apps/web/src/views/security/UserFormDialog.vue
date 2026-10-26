<script setup lang="ts">
import { formatRut } from '@base/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { useRules } from '../../composables/useRules';
import { adminApi } from '../../services/api';
import type { RoleOption, UserDetail } from '../../services/types';
import { useSessionStore } from '../../stores/session';

/** Create (sends the invitation) or edit a user. Email is fixed after creation. */
const props = defineProps<{ user: UserDetail | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [id: string] }>();

const { t, locale } = useI18n();
const rules = useRules();
const session = useSessionStore();
const { loading, run } = useApiAction();

const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const roles = ref<RoleOption[]>([]);
const profiles = ref<{ title: string; value: string }[]>([]);
const model = ref({
  email: '',
  firstName: '',
  lastName: '',
  secondLastName: '',
  rut: '',
  phone: '',
  jobTitle: '',
  role: 'client' as RoleOption['code'],
  profileIds: [] as string[],
});

const editing = computed(() => props.user !== null);
const canAssignProfiles = computed(() => session.can('security.profiles:view'));
const roleItems = computed(() =>
  roles.value
    .filter((role) => role.can_assign || role.code === model.value.role)
    .map((role) => ({ title: role.name[locale.value as 'es' | 'en'], value: role.code, props: { disabled: !role.can_assign } })),
);

watch(open, async (isOpen) => {
  if (!isOpen) return;
  const detail = props.user;
  model.value = {
    email: detail?.user.email ?? '',
    firstName: detail?.user.first_name ?? '',
    lastName: detail?.user.last_name ?? '',
    secondLastName: detail?.user.second_last_name ?? '',
    rut: detail?.user.rut ? formatRut(detail.user.rut) : '',
    phone: detail?.user.phone ?? '',
    jobTitle: detail?.user.job_title ?? '',
    role: detail?.user.role ?? 'client',
    profileIds: detail?.profiles.map((p) => p.id) ?? [],
  };
  roles.value = (await run(() => adminApi.roles()))?.roles ?? [];
  if (canAssignProfiles.value) {
    const page = await run(() => adminApi.profiles({ status: 'active', pageSize: 100 }));
    profiles.value = (page?.items ?? []).map((p) => ({ title: p.name, value: p.id }));
  }
});

const blankToNull = (value: string) => value.trim() || null;

async function save() {
  if (!(await form.value?.validate())?.valid) return;
  const input = {
    firstName: model.value.firstName.trim(),
    lastName: model.value.lastName.trim(),
    secondLastName: blankToNull(model.value.secondLastName),
    rut: blankToNull(model.value.rut),
    phone: blankToNull(model.value.phone),
    jobTitle: blankToNull(model.value.jobTitle),
    role: model.value.role,
  };

  if (!props.user) {
    const created = await run(
      () => adminApi.createUser({ ...input, email: model.value.email.trim(), profileIds: model.value.profileIds }),
      t('users.created'),
    );
    if (created) {
      open.value = false;
      emit('saved', created.id);
    }
    return;
  }

  const id = props.user.user.id;
  const original = props.user.profiles.map((p) => p.id).sort().join();
  const ok = await run(async () => {
    await adminApi.updateUser(id, input.role === props.user!.user.role ? { ...input, role: undefined } : input);
    if (canAssignProfiles.value && [...model.value.profileIds].sort().join() !== original) {
      await adminApi.setUserProfiles(id, model.value.profileIds);
    }
    return true;
  }, t('users.updated'));
  if (ok) {
    open.value = false;
    emit('saved', id);
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="760" scrollable>
    <v-card>
      <v-card-title>{{ editing ? t('users.editTitle') : t('users.createTitle') }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-form ref="form" @submit.prevent="save">
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                v-model="model.email"
                :label="t('fields.email')"
                type="email"
                :readonly="editing"
                :hint="editing ? t('users.emailLocked') : ''"
                :persistent-hint="editing"
                :rules="[rules.required, rules.email]"
              />
            </v-col>
            <v-col cols="12" sm="4"><v-text-field v-model="model.firstName" :label="t('fields.firstName')" :rules="[rules.required, rules.max(100)]" /></v-col>
            <v-col cols="12" sm="4"><v-text-field v-model="model.lastName" :label="t('fields.lastName')" :rules="[rules.required, rules.max(100)]" /></v-col>
            <v-col cols="12" sm="4"><v-text-field v-model="model.secondLastName" :label="t('fields.secondLastName')" :rules="[rules.max(100)]" /></v-col>
            <v-col cols="12" sm="4"><v-text-field v-model="model.rut" :label="t('fields.rut')" placeholder="12.345.678-5" :rules="[rules.rut]" /></v-col>
            <v-col cols="12" sm="4"><v-text-field v-model="model.phone" :label="t('fields.phone')" placeholder="+56912345678" :rules="[rules.phone]" /></v-col>
            <v-col cols="12" sm="4"><v-text-field v-model="model.jobTitle" :label="t('fields.jobTitle')" :rules="[rules.max(100)]" /></v-col>
            <v-col cols="12" sm="4"><v-select v-model="model.role" :items="roleItems" :label="t('fields.role')" :rules="[rules.required]" /></v-col>
            <v-col v-if="canAssignProfiles" cols="12" sm="8">
              <v-autocomplete v-model="model.profileIds" :items="profiles" :label="t('fields.profiles')" multiple chips closable-chips />
            </v-col>
          </v-row>
          <v-alert v-if="!editing" type="info" variant="tonal" density="compact">{{ t('users.invitationNote') }}</v-alert>
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="open = false">{{ t('app.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="loading" @click="save">{{ editing ? t('app.save') : t('app.create') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
