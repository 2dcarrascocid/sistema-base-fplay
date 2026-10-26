<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildColumns, buildRows, rowState, setRow, toggle, type MatrixRow } from '../../models/permissionMatrix';
import type { Locale, PermissionCatalog } from '../../services/types';

/** Menus in rows, actions in columns. Cells the actor cannot grant (or that do not exist) are disabled. */
const props = defineProps<{ catalog: PermissionCatalog; readonly?: boolean }>();
const selected = defineModel<Set<string>>({ required: true });
const { t, locale } = useI18n();

const rows = computed(() => buildRows(props.catalog.menus));
const columns = computed(() => buildColumns(props.catalog, rows.value));
const label = (name: { es: string; en: string }) => name[locale.value as Locale];

function canEditRow(row: MatrixRow): boolean {
  return !props.readonly && Object.values(row.cells).some((cell) => cell.grantable);
}
</script>

<template>
  <div class="matrix-wrap">
    <table class="matrix">
      <thead>
        <tr>
          <th class="matrix__menu">{{ t('profiles.matrix.menu') }}</th>
          <th v-for="column in columns" :key="column.code" class="matrix__action">{{ label(column.name) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :class="{ 'matrix__module': row.kind === 'module' }">
          <th class="matrix__menu" :style="{ paddingLeft: `${12 + row.depth * 20}px` }" scope="row">
            <div class="d-flex align-center ga-1">
              <v-checkbox-btn
                v-if="Object.keys(row.cells).length > 0"
                :model-value="rowState(selected, row) === 'all'"
                :indeterminate="rowState(selected, row) === 'some'"
                :disabled="!canEditRow(row)"
                :aria-label="`${t('profiles.matrix.selectRow')}: ${label(row.name)}`"
                density="compact"
                @update:model-value="(checked: unknown) => (selected = setRow(selected, row, Boolean(checked)))"
              />
              <span :class="row.kind === 'module' ? 'font-weight-bold' : ''">{{ label(row.name) }}</span>
            </div>
          </th>
          <td v-for="column in columns" :key="column.code" class="matrix__cell">
            <template v-if="row.cells[column.code]">
              <v-checkbox-btn
                :model-value="selected.has(row.cells[column.code]!.menuActionId)"
                :disabled="readonly || !row.cells[column.code]!.grantable"
                :title="row.cells[column.code]!.grantable ? undefined : t('profiles.matrix.notGrantable')"
                :aria-label="`${label(row.name)}: ${label(column.name)}`"
                density="compact"
                class="justify-center"
                @update:model-value="selected = toggle(selected, row.cells[column.code]!.menuActionId)"
              />
            </template>
            <span v-else class="text-disabled" :title="t('profiles.matrix.notAvailable')">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.matrix-wrap {
  overflow-x: auto;
}
.matrix {
  border-collapse: collapse;
  width: 100%;
  min-width: 640px;
  font-size: 0.875rem;
}
.matrix th,
.matrix td {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px 8px;
}
.matrix__menu {
  text-align: left;
  position: sticky;
  left: 0;
  background: rgb(var(--v-theme-surface));
  min-width: 220px;
  font-weight: normal;
}
.matrix__action {
  text-align: center;
  font-weight: 600;
  white-space: nowrap;
}
.matrix__cell {
  text-align: center;
}
.matrix__module th,
.matrix__module td {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
