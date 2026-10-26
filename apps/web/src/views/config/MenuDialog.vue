<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { useRules } from '../../composables/useRules';
import { childKind } from '../../models/menuTree';
import { configApi } from '../../services/api';
import type { ConfigAction, ConfigMenu, Locale } from '../../services/types';

/** Create a menu under `parent` (null = module) or edit `menu`. */
const props = defineProps<{ menu: ConfigMenu | null; parent: ConfigMenu | null; actions: ConfigAction[] }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [] }>();

const { t, locale } = useI18n();
const rules = useRules();
const { loading, run } = useApiAction();
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const model = ref({ code: '', nameEs: '', nameEn: '', icon: '', route: '', showInMobile: false, superuserOnly: false, isActive: true, actionIds: [] as number[] });

const kind = computed(() => props.menu?.kind ?? childKind(props.parent));
const system = computed(() => props.menu?.is_system === true);
const actionItems = computed(() => props.actions.map((a) => ({ title: a.name[locale.value as Locale], value: a.id })));
const codeRule = (value: unknown) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(String(value)) || t('config.menus.codeHint');
const iconRule = (value: unknown) => !value || /^mdi-[a-z0-9-]+$/.test(String(value)) || t('config.menus.iconHint');
const routeRule = (value: unknown) => !value || /^\/[a-z0-9/_-]*$/.test(String(value)) || t('config.menus.routeHint');

watch(open, (isOpen) => {
  if (!isOpen) return;
  const m = props.menu;
  model.value = {
    code: m?.code ?? (props.parent ? `${props.parent.code}.` : ''),
    nameEs: m?.name.es ?? '',
    nameEn: m?.name.en ?? '',
    icon: m?.icon ?? '',
    route: m?.route ?? '',
    showInMobile: m?.show_in_mobile ?? false,
    superuserOnly: m?.superuser_only ?? false,
    isActive: m?.is_active ?? true,
    actionIds: m?.action_ids ?? [],
  };
});

async function save() {
  if (!(await form.value?.validate())?.valid) return;
  const m = model.value;
  const common = {
    name: { es: m.nameEs.trim(), en: m.nameEn.trim() },
    icon: m.icon.trim() || null,
    route: kind.value === 'module' ? null : m.route.trim() || null,
    showInMobile: m.showInMobile,
  };
  const ok = await run(async () => {
    if (!props.menu) {
      await configApi.createMenu({ ...common, parentId: props.parent?.id ?? null, code: m.code.trim(), superuserOnly: m.superuserOnly, isActive: m.isActive, actionIds: m.actionIds });
      return true;
    }
    await configApi.updateMenu(props.menu.id, system.value ? common : { ...common, code: m.code.trim(), superuserOnly: m.superuserOnly, isActive: m.isActive });
    if (!system.value && [...m.actionIds].sort().join() !== [...props.menu.action_ids].sort().join()) {
      await configApi.setMenuActions(props.menu.id, m.actionIds);
    }
    return true;
  }, t('config.menus.saved'));
  if (ok) {
    open.value = false;
    emit('saved');
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="680" scrollable>
    <v-card>
      <v-card-title>
        {{ menu ? t('config.menus.edit') : t('config.menus.create') }}
        <v-chip v-if="kind" size="small" class="ml-2">{{ t(`config.menus.kinds.${kind}`) }}</v-chip>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="system" type="info" variant="tonal" density="compact" class="mb-4">{{ t('config.menus.systemHint') }}</v-alert>
        <v-form ref="form" @submit.prevent="save">
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="model.code" :label="t('config.menus.code')" :hint="t('config.menus.codeHint')" persistent-hint :readonly="system" :rules="[rules.required, codeRule]" />
            </v-col>
            <v-col cols="12" sm="6"><v-text-field v-model="model.nameEs" :label="t('config.menus.nameEs')" :rules="[rules.required, rules.max(100)]" /></v-col>
            <v-col cols="12" sm="6"><v-text-field v-model="model.nameEn" :label="t('config.menus.nameEn')" :rules="[rules.required, rules.max(100)]" /></v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="model.icon" :label="t('config.menus.icon')" :hint="t('config.menus.iconHint')" persistent-hint :rules="[iconRule]">
                <template v-if="model.icon" #prepend-inner><v-icon :icon="model.icon" /></template>
              </v-text-field>
            </v-col>
            <v-col v-if="kind !== 'module'" cols="12" sm="6">
              <v-text-field v-model="model.route" :label="t('config.menus.route')" :hint="t('config.menus.routeHint')" persistent-hint :rules="[routeRule]" />
            </v-col>
            <v-col v-if="kind !== 'module'" cols="12">
              <v-autocomplete v-model="model.actionIds" :items="actionItems" :label="t('config.menus.actions')" multiple chips :disabled="system" />
            </v-col>
            <v-col cols="12" class="d-flex flex-wrap ga-4">
              <v-switch v-model="model.isActive" :label="t('config.menus.active')" color="primary" inset hide-details :disabled="system" />
              <v-switch v-model="model.showInMobile" :label="t('config.menus.showInMobile')" color="primary" inset hide-details />
              <v-switch v-model="model.superuserOnly" :label="t('config.menus.superuserOnly')" color="primary" inset hide-details :disabled="system" />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="open = false">{{ t('app.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="loading" @click="save">{{ t('app.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
