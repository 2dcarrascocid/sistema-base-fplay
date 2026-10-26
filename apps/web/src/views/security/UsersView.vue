<script setup lang="ts">
import { formatRut } from '@base/shared';
import { AppPageHeader, AppStatusChip } from '@base/ui';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { adminApi, type UserFilters } from '../../services/api';
import type { UserDetail, UserListItem } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import { downloadBlob, formatDateTime, fullName, stateTone, userState } from '../../utils/format';
import UserDetailDialog from './UserDetailDialog.vue';
import UserFormDialog from './UserFormDialog.vue';

const { t, locale } = useI18n();
const session = useSessionStore();
const { loading, run } = useApiAction();

const items = ref<UserListItem[]>([]);
const total = ref(0);
const search = ref('');
const status = ref<string | null>(null);
const role = ref<string | null>(null);
const page = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>([]);

const detailOpen = ref(false);
const detailId = ref<string | null>(null);
const formOpen = ref(false);
const editing = ref<UserDetail | null>(null);

const headers = computed(() => [
  { title: t('users.columns.name'), key: 'name', sortable: true },
  { title: t('users.columns.email'), key: 'email', sortable: true },
  { title: t('users.columns.rut'), key: 'rut', sortable: false },
  { title: t('users.columns.role'), key: 'role', sortable: false },
  { title: t('users.columns.status'), key: 'status', sortable: false },
  { title: t('users.columns.lastLogin'), key: 'last_login_at', sortable: true },
]);
const statusItems = computed(() => ['active', 'invited', 'inactive', 'locked'].map((value) => ({ title: t(`status.${value}`), value })));
const roleItems = computed(() => ['superuser', 'admin', 'client'].map((value) => ({ title: t(`roles.${value}`), value })));

function filters(): UserFilters {
  const sort = sortBy.value[0];
  return {
    search: search.value.trim() || undefined,
    status: status.value ?? undefined,
    role: role.value ?? undefined,
    page: page.value,
    pageSize: itemsPerPage.value,
    sort: sort?.key,
    order: sort?.order,
  };
}

async function load() {
  const result = await run(() => adminApi.users(filters()));
  if (result) {
    items.value = result.items;
    total.value = result.total;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 350);
});
watch([status, role], () => {
  page.value = 1;
  void load();
});

function onOptions(options: { page: number; itemsPerPage: number; sortBy: { key: string; order: 'asc' | 'desc' }[] }) {
  page.value = options.page;
  itemsPerPage.value = options.itemsPerPage;
  sortBy.value = options.sortBy;
  void load();
}

function openDetail(_event: unknown, row: { item: UserListItem }) {
  detailId.value = row.item.id;
  detailOpen.value = true;
}

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(detail: UserDetail) {
  editing.value = detail;
  detailOpen.value = false;
  formOpen.value = true;
}

async function exportCsv() {
  const blob = await run(() => adminApi.exportUsers({ ...filters(), page: undefined, pageSize: undefined }));
  if (blob) downloadBlob(blob, 'usuarios.csv');
}

// The data table emits update:options on mount, which triggers the first load.
</script>

<template>
  <div>
    <AppPageHeader :title="t('users.title')" :subtitle="t('users.subtitle')">
      <template #actions>
        <v-btn v-if="session.can('security.users:export')" variant="outlined" prepend-icon="mdi-download" :loading="loading" @click="exportCsv">
          {{ t('app.export') }}
        </v-btn>
        <v-btn v-if="session.can('security.users:create')" color="primary" prepend-icon="mdi-account-plus" @click="openCreate">
          {{ t('users.new') }}
        </v-btn>
      </template>
    </AppPageHeader>

    <v-card>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="6">
            <v-text-field v-model="search" :label="t('app.search')" :placeholder="t('users.searchHint')" prepend-inner-icon="mdi-magnify" clearable hide-details />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="status" :items="statusItems" :label="t('users.columns.status')" clearable hide-details />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="role" :items="roleItems" :label="t('users.columns.role')" clearable hide-details />
          </v-col>
        </v-row>
      </v-card-text>

      <v-data-table-server
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
        :items-per-page="itemsPerPage"
        :items-per-page-options="[10, 20, 50, 100]"
        item-value="id"
        hover
        class="users-table"
        @update:options="onOptions"
        @click:row="openDetail"
      >
        <template #[`item.name`]="{ item }">
          <span class="font-weight-medium">{{ fullName(item) }}</span>
        </template>
        <template #[`item.rut`]="{ item }">{{ item.rut ? formatRut(item.rut) : '—' }}</template>
        <template #[`item.role`]="{ item }">{{ t(`roles.${item.role}`) }}</template>
        <template #[`item.status`]="{ item }">
          <AppStatusChip :tone="stateTone(userState(item))" :label="t(`status.${userState(item)}`)" />
        </template>
        <template #[`item.last_login_at`]="{ item }">
          {{ formatDateTime(item.last_login_at, locale) ?? t('app.never') }}
        </template>
      </v-data-table-server>
    </v-card>

    <UserDetailDialog v-model="detailOpen" :user-id="detailId" @changed="load" @edit="openEdit" />
    <UserFormDialog v-model="formOpen" :user="editing" @saved="load" />
  </div>
</template>

<style scoped>
.users-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
