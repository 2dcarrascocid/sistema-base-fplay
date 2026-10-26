<script setup lang="ts">
import { AppPageHeader, AppStatusChip } from '@base/ui';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useApiAction } from '../../composables/useApiAction';
import { adminApi } from '../../services/api';
import type { ProfileListItem } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import ProfileInfoDialog from './ProfileInfoDialog.vue';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const { loading, run } = useApiAction();

const items = ref<ProfileListItem[]>([]);
const total = ref(0);
const search = ref('');
const status = ref<string | null>(null);
const page = ref(1);
const itemsPerPage = ref(20);
const createOpen = ref(false);

const headers = computed(() => [
  { title: t('profiles.columns.name'), key: 'name', sortable: false },
  { title: t('profiles.columns.description'), key: 'description', sortable: false },
  { title: t('profiles.columns.users'), key: 'user_count', sortable: false, align: 'end' as const },
  { title: t('profiles.columns.permissions'), key: 'permission_count', sortable: false, align: 'end' as const },
  { title: t('profiles.columns.status'), key: 'is_active', sortable: false },
]);
const statusItems = computed(() => [
  { title: t('profiles.active'), value: 'active' },
  { title: t('profiles.inactive'), value: 'inactive' },
]);

async function load() {
  const result = await run(() =>
    adminApi.profiles({ search: search.value.trim() || undefined, status: status.value ?? undefined, page: page.value, pageSize: itemsPerPage.value }),
  );
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
watch(status, () => {
  page.value = 1;
  void load();
});

function onOptions(options: { page: number; itemsPerPage: number }) {
  page.value = options.page;
  itemsPerPage.value = options.itemsPerPage;
  void load();
}

async function create(value: { name: string; description: string | null }) {
  const created = await run(() => adminApi.createProfile({ ...value, menuActionIds: [] }), t('profiles.created'));
  if (created) {
    createOpen.value = false;
    await router.push({ name: 'profile', params: { id: created.id } });
  }
}

// The data table emits update:options on mount, which triggers the first load.
</script>

<template>
  <div>
    <AppPageHeader :title="t('profiles.title')" :subtitle="t('profiles.subtitle')">
      <template #actions>
        <v-btn v-if="session.can('security.profiles:create')" color="primary" prepend-icon="mdi-plus" @click="createOpen = true">
          {{ t('profiles.new') }}
        </v-btn>
      </template>
    </AppPageHeader>

    <v-card>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="8">
            <v-text-field v-model="search" :label="t('app.search')" prepend-inner-icon="mdi-magnify" clearable hide-details />
          </v-col>
          <v-col cols="12" md="4">
            <v-select v-model="status" :items="statusItems" :label="t('profiles.columns.status')" clearable hide-details />
          </v-col>
        </v-row>
      </v-card-text>
      <v-data-table-server
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
        :items-per-page="itemsPerPage"
        item-value="id"
        hover
        class="profiles-table"
        @update:options="onOptions"
        @click:row="(_e: unknown, row: { item: ProfileListItem }) => router.push({ name: 'profile', params: { id: row.item.id } })"
      >
        <template #[`item.name`]="{ item }"><span class="font-weight-medium">{{ item.name }}</span></template>
        <template #[`item.description`]="{ item }"><span class="text-medium-emphasis">{{ item.description ?? '—' }}</span></template>
        <template #[`item.is_active`]="{ item }">
          <AppStatusChip :tone="item.is_active ? 'success' : 'neutral'" :label="item.is_active ? t('profiles.active') : t('profiles.inactive')" />
        </template>
      </v-data-table-server>
    </v-card>

    <ProfileInfoDialog v-model="createOpen" :title="t('profiles.new')" :submit-text="t('app.create')" with-description :loading="loading" @submit="create" />
  </div>
</template>

<style scoped>
.profiles-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
