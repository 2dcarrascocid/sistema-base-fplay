<script setup lang="ts">
import type { FieldEvent } from '../types/dashboard.types';
defineProps<{ events: FieldEvent[] }>();
</script>
<template><section class="saphi-card saphi-activity"><div class="saphi-section-heading"><div><h2>Actividad del campo</h2><p>Últimos eventos · DEMO</p></div><v-icon icon="mdi-history" aria-hidden="true" /></div><ul v-if="events.length"><li v-for="event in events" :key="event.id"><span class="saphi-event-icon"><v-icon :icon="event.icon" aria-hidden="true" /></span><div><h3>{{ event.title }}</h3><p>{{ event.description }}</p><small>{{ event.date }} · {{ event.status }}</small></div></li></ul><p v-else class="saphi-empty">Sin actividad para mostrar.</p><p class="saphi-activity-footer">Eventos de ejemplo. Sin notificaciones reales.</p></section></template>
