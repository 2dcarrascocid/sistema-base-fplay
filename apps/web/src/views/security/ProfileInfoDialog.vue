<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRules } from '../../composables/useRules';

/** Name and description of a profile (create, edit or duplicate). */
const props = defineProps<{ title: string; submitText: string; name?: string; description?: string | null; withDescription?: boolean; loading?: boolean }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ submit: [value: { name: string; description: string | null }] }>();

const { t } = useI18n();
const rules = useRules();
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const name = ref('');
const description = ref('');

watch(open, (isOpen) => {
  if (!isOpen) return;
  name.value = props.name ?? '';
  description.value = props.description ?? '';
});

async function submit() {
  if (!(await form.value?.validate())?.valid) return;
  emit('submit', { name: name.value.trim(), description: description.value.trim() || null });
}
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <v-form ref="form" @submit.prevent="submit">
          <v-text-field v-model="name" :label="t('fields.name')" :rules="[rules.required, rules.max(100)]" autofocus />
          <v-textarea v-if="withDescription" v-model="description" :label="t('fields.description')" :rules="[rules.max(500)]" rows="3" auto-grow />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="open = false">{{ t('app.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="loading" @click="submit">{{ submitText }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
