<script setup lang="ts">
import { AppPageHeader } from '@base/ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiAction } from '../../composables/useApiAction';
import { useRules } from '../../composables/useRules';
import { configApi } from '../../services/api';
import type { EmailTemplate, EmailTemplateSummary, TemplateCode } from '../../services/types';
import { useNotifyStore } from '../../stores/notify';
import { formatDateTime } from '../../utils/format';

const { t, locale } = useI18n();
const rules = useRules();
const notify = useNotifyStore();
const { loading, run } = useApiAction();

const templates = ref<EmailTemplateSummary[]>([]);
const selectedId = ref<string | null>(null);
const editing = ref<EmailTemplate | null>(null);
const variables = ref<string[]>([]);
const draft = ref({ subject: '', bodyHtml: '', bodyText: '' });
const preview = ref<{ subject: string; html: string; text: string } | null>(null);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

const grouped = computed(() => {
  const codes = [...new Set(templates.value.map((tpl) => tpl.code))];
  return codes.map((code) => ({ code, items: templates.value.filter((tpl) => tpl.code === code) }));
});

async function loadList() {
  templates.value = (await run(() => configApi.templates()))?.templates ?? [];
  if (!selectedId.value && templates.value[0]) await select(templates.value[0].id);
}

async function select(id: string) {
  const result = await run(() => configApi.template(id));
  if (!result) return;
  selectedId.value = id;
  editing.value = result.template;
  variables.value = result.variables;
  draft.value = { subject: result.template.subject, bodyHtml: result.template.body_html, bodyText: result.template.body_text };
  preview.value = null;
}

async function showPreview() {
  if (!editing.value) return;
  preview.value = (await run(() => configApi.previewTemplate(editing.value!.code as TemplateCode, draft.value))) ?? null;
}

async function save() {
  if (!editing.value || !(await form.value?.validate())?.valid) return;
  const result = await run(() => configApi.updateTemplate(editing.value!.id, draft.value), t('config.templates.saved'));
  if (!result) return;
  if (result.sanitized) notify.show(t('config.templates.sanitized'), 'info');
  editing.value = result.template;
  draft.value.bodyHtml = result.template.body_html;
  await loadList();
}

/** "{{name}}" built in code: a literal double brace would confuse the template compiler. */
const placeholder = (name: string) => `${'{{'}${name}${'}}'}`;

async function copyVariable(name: string) {
  try {
    await navigator.clipboard.writeText(placeholder(name));
    notify.show(t('config.templates.copied'), 'info');
  } catch {
    // clipboard unavailable: the variable stays visible to copy by hand
  }
}

onMounted(loadList);
</script>

<template>
  <div>
    <AppPageHeader :title="t('config.templates.title')" :subtitle="t('config.templates.subtitle')" />
    <v-row>
      <v-col cols="12" md="3">
        <v-card>
          <v-list density="compact" nav>
            <template v-for="group in grouped" :key="group.code">
              <v-list-subheader>{{ t(`config.templates.codes.${group.code}`) }}</v-list-subheader>
              <v-list-item
                v-for="item in group.items"
                :key="item.id"
                :active="item.id === selectedId"
                :title="t(`locales.${item.locale}`)"
                :subtitle="formatDateTime(item.updated_at, locale) ?? ''"
                @click="select(item.id)"
              />
            </template>
          </v-list>
        </v-card>
      </v-col>
      <v-col v-if="editing" cols="12" md="9">
        <v-card>
          <v-card-title class="text-wrap">
            {{ t(`config.templates.codes.${editing.code}`) }} · {{ t(`locales.${editing.locale}`) }}
          </v-card-title>
          <v-card-text>
            <div class="mb-4">
              <div class="text-caption text-medium-emphasis mb-1">{{ t('config.templates.variables') }} · {{ t('config.templates.variablesHint') }}</div>
              <div class="d-flex flex-wrap ga-2">
                <v-chip v-for="name in variables" :key="name" size="small" variant="outlined" @click="copyVariable(name)">{{ placeholder(name) }}</v-chip>
              </div>
            </div>
            <v-form ref="form" @submit.prevent="save">
              <v-text-field v-model="draft.subject" :label="t('config.templates.subject')" :rules="[rules.required, rules.max(200)]" />
              <v-textarea v-model="draft.bodyHtml" :label="t('config.templates.html')" rows="8" auto-grow class="code" :rules="[rules.required]" />
              <v-textarea v-model="draft.bodyText" :label="t('config.templates.text')" rows="4" auto-grow class="code" :rules="[rules.required]" />
              <div class="d-flex flex-wrap ga-2">
                <v-btn variant="outlined" prepend-icon="mdi-eye" :loading="loading" @click="showPreview">{{ t('config.templates.preview') }}</v-btn>
                <v-btn type="submit" color="primary" :loading="loading">{{ t('app.save') }}</v-btn>
              </div>
            </v-form>

            <template v-if="preview">
              <v-divider class="my-4" />
              <h3 class="text-subtitle-1 mb-2">{{ preview.subject }}</h3>
              <!-- Rendered in a sandbox: no scripts, no navigation, isolated from the app. -->
              <iframe class="preview" sandbox="" :srcdoc="preview.html" :title="t('config.templates.preview')" />
              <pre class="text-preview">{{ preview.text }}</pre>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.code :deep(textarea) {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.85rem;
}
.preview {
  width: 100%;
  min-height: 240px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: #fff;
}
.text-preview {
  white-space: pre-wrap;
  font-size: 0.85rem;
  margin-top: 12px;
}
</style>
