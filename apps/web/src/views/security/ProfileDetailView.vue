<script setup lang="ts">
import { AppConfirmDialog, AppPageHeader, AppStatusChip } from '@base/ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useApiAction } from '../../composables/useApiAction';
import { diff } from '../../models/permissionMatrix';
import { adminApi } from '../../services/api';
import type { PermissionCatalog, ProfileDetail, ProfileUser } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import { fullName } from '../../utils/format';
import PermissionMatrix from './PermissionMatrix.vue';
import ProfileInfoDialog from './ProfileInfoDialog.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { loading, run } = useApiAction();

const id = computed(() => String(route.params['id']));
const detail = ref<ProfileDetail | null>(null);
const catalog = ref<PermissionCatalog | null>(null);
const original = ref(new Set<string>());
const selected = ref(new Set<string>());
const users = ref<ProfileUser[] | null>(null);
const tab = ref<'permissions' | 'users'>('permissions');
const editOpen = ref(false);
const duplicateOpen = ref(false);
const confirmDeactivate = ref(false);

const canEdit = computed(() => session.can('security.profiles:edit') && detail.value?.canEdit === true);
const canSeeUsers = computed(() => session.can('security.users:view'));
const changes = computed(() => diff(original.value, selected.value));
const dirty = computed(() => changes.value.added.length + changes.value.removed.length > 0);

async function load() {
  const [profile, permissions] = await Promise.all([run(() => adminApi.profile(id.value)), catalog.value ? catalog.value : run(() => adminApi.catalog())]);
  if (!profile || !permissions) return;
  detail.value = profile;
  catalog.value = permissions;
  original.value = new Set(profile.menuActionIds);
  selected.value = new Set(profile.menuActionIds);
  users.value = null;
}

async function loadUsers() {
  users.value = (await run(() => adminApi.profileUsers(id.value)))?.users ?? [];
}

async function savePermissions() {
  const ok = await run(() => adminApi.setProfilePermissions(id.value, [...selected.value]).then(() => true), t('profiles.matrix.saved'));
  if (ok) original.value = new Set(selected.value);
}

async function saveInfo(value: { name: string; description: string | null }) {
  if (await run(() => adminApi.updateProfile(id.value, value), t('app.saved'))) {
    editOpen.value = false;
    await load();
  }
}

async function duplicate(value: { name: string }) {
  const copy = await run(() => adminApi.duplicateProfile(id.value, value.name), t('profiles.duplicated'));
  if (copy) {
    duplicateOpen.value = false;
    await router.push({ name: 'profile', params: { id: copy.id } });
  }
}

async function setActive(active: boolean) {
  const ok = await run(() => adminApi.setProfileActive(id.value, active).then(() => true), t(active ? 'profiles.activated' : 'profiles.deactivated'));
  confirmDeactivate.value = false;
  if (ok) await load();
}

watch(tab, (value) => value === 'users' && users.value === null && void loadUsers());
watch(id, () => void load());
onMounted(load);
onBeforeRouteLeave(() => !dirty.value || window.confirm(t('profiles.matrix.unsaved')));
</script>

<template>
  <div v-if="detail && catalog">
    <AppPageHeader :title="detail.profile.name" :subtitle="detail.profile.description ?? undefined">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'profiles' }">{{ t('app.back') }}</v-btn>
        <v-btn v-if="canEdit" variant="outlined" prepend-icon="mdi-pencil" @click="editOpen = true">{{ t('profiles.editInfo') }}</v-btn>
        <v-btn v-if="session.can('security.profiles:create')" variant="outlined" prepend-icon="mdi-content-copy" @click="duplicateOpen = true">
          {{ t('profiles.duplicate') }}
        </v-btn>
        <v-btn v-if="detail.profile.is_active && detail.canEdit && session.can('security.profiles:delete')" color="error" variant="outlined" @click="confirmDeactivate = true">
          {{ t('profiles.deactivate') }}
        </v-btn>
        <v-btn v-if="!detail.profile.is_active && canEdit" color="primary" variant="outlined" :loading="loading" @click="setActive(true)">
          {{ t('profiles.activate') }}
        </v-btn>
      </template>
    </AppPageHeader>

    <div class="mb-4">
      <AppStatusChip :tone="detail.profile.is_active ? 'success' : 'neutral'" :label="detail.profile.is_active ? t('profiles.active') : t('profiles.inactive')" />
    </div>

    <v-card>
      <v-tabs v-model="tab" color="primary">
        <v-tab value="permissions">{{ t('profiles.tabs.permissions') }}</v-tab>
        <v-tab v-if="canSeeUsers" value="users">{{ t('profiles.tabs.users') }}</v-tab>
      </v-tabs>
      <v-divider />
      <v-window v-model="tab">
        <v-window-item value="permissions">
          <v-card-text>
            <v-alert v-if="!detail.canEdit" type="info" variant="tonal" density="compact" class="mb-4">{{ t('profiles.matrix.readOnly') }}</v-alert>
            <PermissionMatrix v-model="selected" :catalog="catalog" :readonly="!canEdit" />
          </v-card-text>
          <v-card-actions v-if="canEdit">
            <span v-if="dirty" class="text-caption text-warning ml-2">{{ t('profiles.matrix.unsaved') }}</span>
            <v-spacer />
            <v-btn :disabled="!dirty || loading" variant="text" @click="selected = new Set(original)">{{ t('app.cancel') }}</v-btn>
            <v-btn color="primary" variant="flat" :disabled="!dirty" :loading="loading" @click="savePermissions">{{ t('app.save') }}</v-btn>
          </v-card-actions>
        </v-window-item>
        <v-window-item value="users">
          <v-list v-if="users && users.length" lines="two">
            <v-list-item v-for="user in users" :key="user.id" :title="fullName(user)" :subtitle="`${user.email} · ${t(`roles.${user.role}`)}`" />
          </v-list>
          <v-card-text v-else-if="users" class="text-medium-emphasis">{{ t('profiles.noUsers') }}</v-card-text>
        </v-window-item>
      </v-window>
    </v-card>

    <ProfileInfoDialog
      v-model="editOpen"
      :title="t('profiles.editInfo')"
      :submit-text="t('app.save')"
      :name="detail.profile.name"
      :description="detail.profile.description"
      with-description
      :loading="loading"
      @submit="saveInfo"
    />
    <ProfileInfoDialog
      v-model="duplicateOpen"
      :title="t('profiles.duplicateTitle')"
      :submit-text="t('profiles.duplicate')"
      :name="`${detail.profile.name} ${t('profiles.copySuffix')}`"
      :loading="loading"
      @submit="duplicate"
    />
    <AppConfirmDialog
      v-model="confirmDeactivate"
      :title="t('profiles.deactivate')"
      :message="t('profiles.confirmDeactivate')"
      :confirm-text="t('profiles.deactivate')"
      :cancel-text="t('app.cancel')"
      danger
      :loading="loading"
      @confirm="setActive(false)"
    />
  </div>
  <div v-else class="d-flex justify-center py-12"><v-progress-circular indeterminate color="primary" /></div>
</template>
