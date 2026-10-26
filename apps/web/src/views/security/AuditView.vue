<script setup lang="ts">
import { AppPageHeader, AppStatusChip } from '@base/ui';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { auditDiff, dateRange } from '../../models/auditDiff';
import { auditApi } from '../../services/api';
import type { AuditEntry, AuditEntryDetail, AuditFilters } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import { downloadBlob, formatDateTime } from '../../utils/format';

const { t, locale } = useI18n();
const session = useSessionStore();
const { loading, run } = useApiAction();

const items = ref<AuditEntry[]>([]);
const total = ref(0);
const page = ref(1);
const itemsPerPage = ref(50);
const eventTypes = ref<string[]>([]);
const integrity = ref<{ valid: boolean; brokenId: string | null; total: number } | null>(null);
const filters = ref({ from: null as string | null, to: null as string | null, eventType: null as string | null, actor: '', entityType: '', entityId: '', result: null as 'success' | 'failure' | null });
const detail = ref<AuditEntryDetail | null>(null);
const detailOpen = ref(false);

const headers = computed(() => [
  { title: t('audit.columns.date'), key: 'occurred_at', sortable: false },
  { title: t('audit.columns.actor'), key: 'actor_email', sortable: false },
  { title: t('audit.columns.event'), key: 'event_type', sortable: false },
  { title: t('audit.columns.entity'), key: 'entity', sortable: false },
  { title: t('audit.columns.result'), key: 'result', sortable: false },
  { title: t('audit.columns.ip'), key: 'ip', sortable: false },
]);
const resultItems = computed(() => (['success', 'failure'] as const).map((value) => ({ title: t(`audit.results.${value}`), value })));
const rows = computed(() => (detail.value ? auditDiff(detail.value.old_value, detail.value.new_value) : []));

function query(): AuditFilters {
  const f = filters.value;
  return {
    ...dateRange(f.from, f.to),
    eventType: f.eventType ?? undefined,
    actor: f.actor.trim() || undefined,
    entityType: f.entityType.trim() || undefined,
    entityId: f.entityId.trim() || undefined,
    result: f.result ?? undefined,
  };
}

async function load() {
  const result = await run(() => auditApi.events({ ...query(), page: page.value, pageSize: itemsPerPage.value }));
  if (result) {
    items.value = result.items;
    total.value = result.total;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  filters,
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      page.value = 1;
      void load();
    }, 350);
  },
  { deep: true },
);

function onOptions(options: { page: number; itemsPerPage: number }) {
  page.value = options.page;
  itemsPerPage.value = options.itemsPerPage;
  void load();
}

async function openDetail(_event: unknown, row: { item: AuditEntry }) {
  const result = await run(() => auditApi.event(row.item.id));
  if (result) {
    detail.value = result.event;
    detailOpen.value = true;
  }
}

async function exportCsv() {
  const blob = await run(() => auditApi.exportEvents(query()));
  if (blob) downloadBlob(blob, 'auditoria.csv');
}

onMounted(async () => {
  const [types, status] = await Promise.all([run(() => auditApi.eventTypes()), run(() => auditApi.integrity())]);
  eventTypes.value = types?.eventTypes ?? [];
  integrity.value = status ?? null;
});
</script>

<template>
  <div>
    <AppPageHeader :title="t('audit.title')" :subtitle="t('audit.subtitle')">
      <template #actions>
        <v-btn v-if="session.can('security.audit:export')" variant="outlined" prepend-icon="mdi-download" :loading="loading" @click="exportCsv">
          {{ t('app.export') }}
        </v-btn>
      </template>
    </AppPageHeader>

    <v-alert
      v-if="integrity"
      :type="integrity.valid ? 'success' : 'error'"
      variant="tonal"
      density="compact"
      class="mb-4"
      :icon="integrity.valid ? 'mdi-shield-check' : 'mdi-shield-alert'"
    >
      {{ integrity.valid ? t('audit.integrityOk', { total: integrity.total }) : t('audit.integrityBroken', { id: integrity.brokenId }) }}
    </v-alert>

    <v-card>
      <v-card-text>
        <v-row dense>
          <v-col cols="6" md="2"><v-text-field v-model="filters.from" type="date" :label="t('audit.from')" hide-details /></v-col>
          <v-col cols="6" md="2"><v-text-field v-model="filters.to" type="date" :label="t('audit.to')" hide-details /></v-col>
          <v-col cols="12" md="3"><v-autocomplete v-model="filters.eventType" :items="eventTypes" :label="t('audit.eventType')" clearable hide-details /></v-col>
          <v-col cols="12" md="3"><v-text-field v-model="filters.actor" :label="t('audit.actor')" clearable hide-details /></v-col>
          <v-col cols="12" md="2"><v-select v-model="filters.result" :items="resultItems" :label="t('audit.result')" clearable hide-details /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model="filters.entityType" :label="t('audit.entityType')" clearable hide-details /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model="filters.entityId" :label="t('audit.entityId')" clearable hide-details /></v-col>
        </v-row>
      </v-card-text>
      <v-data-table-server
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
        :items-per-page="itemsPerPage"
        :items-per-page-options="[25, 50, 100, 200]"
        item-value="id"
        hover
        density="compact"
        class="audit-table"
        @update:options="onOptions"
        @click:row="openDetail"
      >
        <template #[`item.occurred_at`]="{ item }"><span class="text-no-wrap">{{ formatDateTime(item.occurred_at, locale) }}</span></template>
        <template #[`item.actor_email`]="{ item }">{{ item.actor_email ?? t('audit.system') }}</template>
        <template #[`item.event_type`]="{ item }"><code class="text-caption">{{ item.event_type }}</code></template>
        <template #[`item.entity`]="{ item }">
          <span class="text-caption">{{ item.entity_type ?? '—' }}<template v-if="item.entity_id"> · {{ item.entity_id.slice(0, 8) }}</template></span>
        </template>
        <template #[`item.result`]="{ item }">
          <AppStatusChip :tone="item.result === 'success' ? 'success' : 'error'" :label="t(`audit.results.${item.result}`)" />
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="detailOpen" max-width="860" scrollable>
      <v-card v-if="detail">
        <v-card-title class="text-wrap">{{ t('audit.detail') }} #{{ detail.id }}</v-card-title>
        <v-card-subtitle class="text-wrap"><code>{{ detail.event_type }}</code> · {{ formatDateTime(detail.occurred_at, locale) }}</v-card-subtitle>
        <v-divider />
        <v-card-text class="d-flex flex-column ga-4">
          <v-table density="compact">
            <tbody>
              <tr><th>{{ t('audit.columns.actor') }}</th><td>{{ detail.actor_email ?? t('audit.system') }}</td></tr>
              <tr><th>{{ t('audit.columns.entity') }}</th><td>{{ detail.entity_type ?? '—' }} {{ detail.entity_id ?? '' }}</td></tr>
              <tr><th>{{ t('audit.columns.result') }}</th><td>{{ t(`audit.results.${detail.result}`) }}</td></tr>
              <tr><th>{{ t('audit.columns.ip') }}</th><td>{{ detail.ip ?? '—' }}</td></tr>
              <tr><th>{{ t('audit.userAgent') }}</th><td class="text-caption">{{ detail.user_agent ?? '—' }}</td></tr>
              <tr><th>{{ t('audit.requestId') }}</th><td class="text-caption">{{ detail.request_id ?? '—' }}</td></tr>
            </tbody>
          </v-table>
          <div class="diff-wrap">
            <v-table v-if="rows.length" density="compact">
              <thead>
                <tr><th>{{ t('audit.field') }}</th><th>{{ t('audit.before') }}</th><th>{{ t('audit.after') }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.key" :class="{ changed: row.changed }">
                  <td><code>{{ row.key }}</code></td>
                  <td class="value">{{ row.before }}</td>
                  <td class="value">{{ row.after }}</td>
                </tr>
              </tbody>
            </v-table>
            <p v-else class="text-medium-emphasis">{{ t('audit.noValues') }}</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="detailOpen = false">{{ t('app.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.audit-table :deep(tbody tr) {
  cursor: pointer;
}
.diff-wrap {
  overflow-x: auto;
}
.value {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.8rem;
  word-break: break-word;
  max-width: 340px;
}
.changed td {
  background: rgba(var(--v-theme-warning), 0.08);
}
</style>
