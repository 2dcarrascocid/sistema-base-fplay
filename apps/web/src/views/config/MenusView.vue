<script setup lang="ts">
import { AppPageHeader } from '@base/ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { useRules } from '../../composables/useRules';
import { buildMenuTree, childKind, flattenTree, moveSibling } from '../../models/menuTree';
import { configApi } from '../../services/api';
import type { ConfigAction, ConfigMenu, Locale } from '../../services/types';
import { useSessionStore } from '../../stores/session';
import MenuDialog from './MenuDialog.vue';

const { t, locale } = useI18n();
const rules = useRules();
const session = useSessionStore();
const { loading, run } = useApiAction();

const tab = ref<'menus' | 'actions'>('menus');
const menus = ref<ConfigMenu[]>([]);
const actions = ref<ConfigAction[]>([]);
const dialogOpen = ref(false);
const editing = ref<ConfigMenu | null>(null);
const parent = ref<ConfigMenu | null>(null);

const rows = computed(() => flattenTree(buildMenuTree(menus.value)));
const actionNames = computed(() => new Map(actions.value.map((a) => [a.id, a.name[locale.value as Locale]])));
const label = (name: { es: string; en: string }) => name[locale.value as Locale];

async function load() {
  const [m, a] = await Promise.all([run(() => configApi.menus()), run(() => configApi.actions())]);
  if (m) menus.value = m.menus;
  if (a) actions.value = a.actions;
}

function openCreate(under: ConfigMenu | null) {
  editing.value = null;
  parent.value = under;
  dialogOpen.value = true;
}

function openEdit(menu: ConfigMenu) {
  editing.value = menu;
  parent.value = null;
  dialogOpen.value = true;
}

async function move(menu: ConfigMenu, direction: -1 | 1) {
  const order = moveSibling(menus.value, menu.id, direction);
  if (order && (await run(() => configApi.reorderMenus(order.parentId, order.orderedIds).then(() => true)))) {
    await load();
    await session.loadMe();
  }
}

async function afterSave() {
  await load();
  await session.loadMe();
}

// Special actions -----------------------------------------------------------------------------
const actionForm = ref<{ validate: () => Promise<{ valid: boolean }>; reset: () => void } | null>(null);
const newAction = ref({ code: '', es: '', en: '' });
const actionCodeRule = (value: unknown) => /^[a-z][a-z0-9_]*$/.test(String(value)) || t('config.menus.codeHint');
async function addAction() {
  if (!(await actionForm.value?.validate())?.valid) return;
  const created = await run(
    () => configApi.createAction(newAction.value.code.trim(), { es: newAction.value.es.trim(), en: newAction.value.en.trim() }),
    t('config.menus.actionSaved'),
  );
  if (created) {
    actionForm.value?.reset();
    await load();
  }
}

onMounted(load);
</script>

<template>
  <div>
    <AppPageHeader :title="t('config.menus.title')" :subtitle="t('config.menus.subtitle')">
      <template #actions>
        <v-btn v-if="tab === 'menus'" color="primary" prepend-icon="mdi-plus" @click="openCreate(null)">{{ t('config.menus.newModule') }}</v-btn>
      </template>
    </AppPageHeader>

    <v-card>
      <v-tabs v-model="tab" color="primary">
        <v-tab value="menus">{{ t('config.menus.title') }}</v-tab>
        <v-tab value="actions">{{ t('config.menus.actionsTab') }}</v-tab>
      </v-tabs>
      <v-divider />
      <v-window v-model="tab">
        <v-window-item value="menus">
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>{{ t('fields.name') }}</th>
                <th>{{ t('config.menus.code') }}</th>
                <th>{{ t('config.menus.route') }}</th>
                <th>{{ t('config.menus.actions') }}</th>
                <th class="text-right">{{ t('app.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" :class="{ 'text-disabled': !row.is_active }">
                <td :style="{ paddingLeft: `${16 + row.depth * 24}px` }">
                  <div class="d-flex align-center ga-2">
                    <v-icon :icon="row.icon ?? 'mdi-circle-small'" size="small" />
                    <span :class="row.kind === 'module' ? 'font-weight-bold' : ''">{{ label(row.name) }}</span>
                    <v-chip v-if="row.is_system" size="x-small" variant="tonal">{{ t('config.menus.system') }}</v-chip>
                    <v-chip v-if="row.superuser_only" size="x-small" color="warning" variant="tonal">{{ t('config.menus.superuserOnly') }}</v-chip>
                    <v-icon v-if="row.show_in_mobile" icon="mdi-cellphone" size="x-small" :title="t('config.menus.showInMobile')" />
                  </div>
                </td>
                <td><code class="text-caption">{{ row.code }}</code></td>
                <td class="text-caption">{{ row.route ?? '—' }}</td>
                <td class="text-caption">{{ row.action_ids.map((id) => actionNames.get(id)).join(', ') || '—' }}</td>
                <td class="text-right text-no-wrap">
                  <v-btn icon="mdi-arrow-up" size="small" variant="text" :aria-label="t('config.menus.moveUp')" :disabled="loading" @click="move(row, -1)" />
                  <v-btn icon="mdi-arrow-down" size="small" variant="text" :aria-label="t('config.menus.moveDown')" :disabled="loading" @click="move(row, 1)" />
                  <v-btn v-if="childKind(row)" icon="mdi-plus" size="small" variant="text" :aria-label="t('config.menus.addChild')" :title="t('config.menus.addChild')" @click="openCreate(row)" />
                  <v-btn icon="mdi-pencil" size="small" variant="text" :aria-label="t('config.menus.edit')" @click="openEdit(row)" />
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>

        <v-window-item value="actions">
          <v-card-text>
            <v-table density="compact" class="mb-6">
              <thead>
                <tr>
                  <th>{{ t('config.menus.actionCode') }}</th>
                  <th>{{ t('config.menus.nameEs') }}</th>
                  <th>{{ t('config.menus.nameEn') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="action in actions" :key="action.id">
                  <td><code>{{ action.code }}</code></td>
                  <td>{{ action.name.es }}</td>
                  <td>{{ action.name.en }}</td>
                  <td>
                    <v-chip size="x-small" :color="action.is_standard ? undefined : 'primary'" variant="tonal">
                      {{ action.is_standard ? t('config.menus.standard') : t('config.menus.special') }}
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
            <h3 class="text-subtitle-1 mb-2">{{ t('config.menus.newAction') }}</h3>
            <v-form ref="actionForm" @submit.prevent="addAction">
              <v-row dense>
                <v-col cols="12" sm="4"><v-text-field v-model="newAction.code" :label="t('config.menus.actionCode')" placeholder="approve" :rules="[rules.required, actionCodeRule]" /></v-col>
                <v-col cols="12" sm="4"><v-text-field v-model="newAction.es" :label="t('config.menus.nameEs')" :rules="[rules.required, rules.max(100)]" /></v-col>
                <v-col cols="12" sm="4"><v-text-field v-model="newAction.en" :label="t('config.menus.nameEn')" :rules="[rules.required, rules.max(100)]" /></v-col>
              </v-row>
              <v-btn type="submit" color="primary" :loading="loading">{{ t('app.create') }}</v-btn>
            </v-form>
          </v-card-text>
        </v-window-item>
      </v-window>
    </v-card>

    <MenuDialog v-model="dialogOpen" :menu="editing" :parent="parent" :actions="actions" @saved="afterSave" />
  </div>
</template>
