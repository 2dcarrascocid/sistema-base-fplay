<script setup lang="ts">
/** Confirmation dialog for actions with consequences (deactivate, reset password...). */
defineProps<{
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  loading?: boolean;
}>();

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <v-dialog v-model="open" max-width="460" :persistent="loading">
    <v-card>
      <v-card-title class="text-wrap">{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" data-test="cancel" @click="open = false">{{ cancelText }}</v-btn>
        <v-btn
          :color="danger ? 'error' : 'primary'"
          variant="flat"
          :loading="loading"
          data-test="confirm"
          @click="emit('confirm')"
        >
          {{ confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
