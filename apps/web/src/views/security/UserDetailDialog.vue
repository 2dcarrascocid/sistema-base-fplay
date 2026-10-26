<script setup lang="ts">
import { formatRut } from '@base/shared';
import { AppConfirmDialog, AppStatusChip } from '@base/ui';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { adminApi } from '../../services/api';
import type { UserDetail } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import { formatDateTime, fullName, isLocked, stateTone, userState } from '../../utils/format';

type Action = 'activate' | 'deactivate' | 'unlock' | 'reset-password' | 'revoke-sessions' | 'invitation';

const props = defineProps<{ userId: string | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ changed: []; edit: [detail: UserDetail] }>();

const { t, locale } = useI18n();
const session = useSessionStore();
const { loading, run } = useApiAction();
const detail = ref<UserDetail | null>(null);
const confirming = ref<Action | null>(null);
const permissions = ref<string[] | null>(null);

async function load() {
  if (props.userId) detail.value = (await run(() => adminApi.user(props.userId!))) ?? null;
}
watch(open, (isOpen) => {
  permissions.value = null;
  if (isOpen) void load();
  else detail.value = null;
});

const user = computed(() => detail.value?.user ?? null);
const isSelf = computed(() => user.value?.id === session.me?.user.id);
const date = (value: string | null) => formatDateTime(value, locale.value) ?? t('app.never');

/** Actions shown according to permissions and the user's state; the API enforces them again. */
const actions = computed(() => {
  const u = user.value;
  if (!u || !detail.value?.canManage) return [];
  const list: { action: Action; label: string; icon: string; danger?: boolean }[] = [];
  if (session.can('security.users:edit') && !isSelf.value) {
    if (u.status === 'inactive') list.push({ action: 'activate', label: t('users.actions.activate'), icon: 'mdi-account-check' });
    else list.push({ action: 'deactivate', label: t('users.actions.deactivate'), icon: 'mdi-account-off', danger: true });
  }
  if (session.can('security.users:unlock') && isLocked(u) && !isSelf.value) {
    list.push({ action: 'unlock', label: t('users.actions.unlock'), icon: 'mdi-lock-open-variant' });
  }
  if (session.can('security.users:reset_password') && u.status === 'active' && !isSelf.value) {
    list.push({ action: 'reset-password', label: t('users.actions.resetPassword'), icon: 'mdi-lock-reset', danger: true });
  }
  if (session.can('security.users:revoke_sessions') && detail.value.activeSessions > 0) {
    list.push({ action: 'revoke-sessions', label: t('users.actions.revokeSessions'), icon: 'mdi-logout-variant', danger: true });
  }
  if (session.can('security.users:create') && u.status === 'invited') {
    list.push({ action: 'invitation', label: t('users.actions.resendInvitation'), icon: 'mdi-email-fast' });
  }
  return list;
});

const confirmMessages: Partial<Record<Action, string>> = {
  deactivate: 'users.confirm.deactivate',
  activate: 'users.confirm.activate',
  'reset-password': 'users.confirm.resetPassword',
  'revoke-sessions': 'users.confirm.revokeSessions',
};

function request(action: Action) {
  if (confirmMessages[action]) confirming.value = action;
  else void perform(action);
}

async function perform(action: Action) {
  const id = user.value!.id;
  const ok = await run(() => adminApi.userAction(id, action).then(() => true), t(`users.done.${action}`));
  confirming.value = null;
  if (ok) {
    await load();
    emit('changed');
  }
}

async function showPermissions() {
  permissions.value = (await run(() => adminApi.userPermissions(user.value!.id)))?.permissions ?? [];
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable>
    <v-card :loading="loading && !detail">
      <template v-if="user && detail">
        <v-card-item>
          <v-card-title class="text-wrap">{{ fullName(user) }}</v-card-title>
          <v-card-subtitle>{{ user.email }}</v-card-subtitle>
          <template #append>
            <AppStatusChip :tone="stateTone(userState(user))" :label="t(`status.${userState(user)}`)" />
          </template>
        </v-card-item>
        <v-divider />
        <v-card-text class="d-flex flex-column ga-4">
          <v-alert v-if="!detail.canManage" type="info" variant="tonal" density="compact">{{ t('users.detail.readOnly') }}</v-alert>
          <v-alert v-if="detail.pendingInvitation" type="info" variant="tonal" density="compact">
            {{ t('users.detail.invitation', { date: date(detail.pendingInvitation.expires_at) }) }}
          </v-alert>
          <v-alert v-if="isLocked(user)" type="warning" variant="tonal" density="compact">
            {{ t('users.detail.lockedUntil', { date: date(user.locked_until) }) }}
          </v-alert>

          <v-table density="compact">
            <tbody>
              <tr><th>{{ t('fields.role') }}</th><td>{{ t(`roles.${user.role}`) }}</td></tr>
              <tr><th>{{ t('fields.rut') }}</th><td>{{ user.rut ? formatRut(user.rut) : '—' }}</td></tr>
              <tr><th>{{ t('fields.phone') }}</th><td>{{ user.phone ?? '—' }}</td></tr>
              <tr><th>{{ t('fields.jobTitle') }}</th><td>{{ user.job_title ?? '—' }}</td></tr>
              <tr><th>{{ t('users.columns.lastLogin') }}</th><td>{{ date(user.last_login_at) }}</td></tr>
              <tr><th>{{ t('users.detail.mfa') }}</th><td>{{ user.mfa_enabled ? '✓' : '—' }}</td></tr>
              <tr><th>{{ t('users.detail.sessions') }}</th><td>{{ detail.activeSessions }}</td></tr>
            </tbody>
          </v-table>

          <div>
            <h3 class="text-subtitle-2 mb-2">{{ t('users.detail.profiles') }}</h3>
            <div v-if="detail.profiles.length" class="d-flex flex-wrap ga-2">
              <v-chip v-for="profile in detail.profiles" :key="profile.id" size="small" :color="profile.is_active ? 'primary' : undefined" variant="tonal">
                {{ profile.name }}
              </v-chip>
            </div>
            <p v-else class="text-medium-emphasis">{{ t('users.detail.noProfiles') }}</p>
          </div>

          <div>
            <h3 class="text-subtitle-2 mb-2">{{ t('users.detail.identities') }}</h3>
            <div class="d-flex flex-wrap ga-2">
              <v-chip v-for="identity in detail.identities" :key="identity.provider" size="small" variant="outlined">
                {{ identity.provider === 'local' ? t('users.detail.local') : t(`auth.providers.${identity.provider}`) }}
              </v-chip>
            </div>
          </div>

          <div v-if="permissions">
            <h3 class="text-subtitle-2 mb-2">{{ t('users.permissionsTitle', { name: user.first_name }) }}</h3>
            <div v-if="permissions.length" class="d-flex flex-wrap ga-1">
              <code v-for="permission in permissions" :key="permission" class="text-caption">{{ permission }}</code>
            </div>
            <p v-else class="text-medium-emphasis">{{ t('users.permissionsNone') }}</p>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="flex-wrap ga-1">
          <v-btn v-if="!permissions" variant="text" prepend-icon="mdi-key-chain" @click="showPermissions">{{ t('users.actions.permissions') }}</v-btn>
          <v-spacer />
          <v-menu v-if="actions.length">
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" variant="tonal" append-icon="mdi-chevron-down">{{ t('app.actions') }}</v-btn>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="item in actions"
                :key="item.action"
                :prepend-icon="item.icon"
                :base-color="item.danger ? 'error' : undefined"
                :title="item.label"
                @click="request(item.action)"
              />
            </v-list>
          </v-menu>
          <v-btn v-if="detail.canManage && session.can('security.users:edit')" color="primary" variant="flat" @click="emit('edit', detail)">
            {{ t('app.edit') }}
          </v-btn>
          <v-btn variant="text" @click="open = false">{{ t('app.close') }}</v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>

  <AppConfirmDialog
    :model-value="confirming !== null"
    :title="confirming ? actions.find((a) => a.action === confirming)?.label ?? '' : ''"
    :message="confirming && confirmMessages[confirming] ? t(confirmMessages[confirming]!) : ''"
    :confirm-text="confirming ? actions.find((a) => a.action === confirming)?.label ?? '' : ''"
    :cancel-text="t('app.cancel')"
    :danger="confirming !== 'activate'"
    :loading="loading"
    @update:model-value="(value: boolean) => !value && (confirming = null)"
    @confirm="confirming && perform(confirming)"
  />
</template>
