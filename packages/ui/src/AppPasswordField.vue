<script setup lang="ts">
import { ref } from 'vue';

/** Password input with a show/hide toggle. Autocomplete must say whether it is the current or a new password. */
defineProps<{
  label: string;
  autocomplete: 'current-password' | 'new-password';
  rules?: ((value: string) => true | string)[];
  toggleLabel: string;
}>();

const model = defineModel<string>({ default: '' });
const visible = ref(false);
</script>

<template>
  <v-text-field
    v-model="model"
    :label="label"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :rules="rules"
    spellcheck="false"
    maxlength="128"
  >
    <template #append-inner>
      <v-btn
        :icon="visible ? 'mdi-eye-off' : 'mdi-eye'"
        :aria-label="toggleLabel"
        variant="text"
        size="small"
        density="comfortable"
        data-test="toggle"
        @click="visible = !visible"
      />
    </template>
  </v-text-field>
</template>
