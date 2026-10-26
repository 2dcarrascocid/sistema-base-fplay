<script setup lang="ts">
import { computed } from 'vue';

/** Status pill. The tone carries the meaning (good / warning / critical / neutral); the label is translated by the caller. */
export type StatusTone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

const props = defineProps<{ tone: StatusTone; label: string }>();

const color = computed(() => (props.tone === 'neutral' ? 'grey' : props.tone));
</script>

<template>
  <v-chip :color="color" size="small" variant="tonal" label>
    <v-icon start icon="mdi-circle" size="8" />
    {{ label }}
  </v-chip>
</template>
