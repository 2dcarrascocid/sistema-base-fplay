<script setup lang="ts">
import type { DashboardPreviewData } from '../types/dashboard.types';
defineProps<{ data: DashboardPreviewData }>();
</script>

<template>
  <header class="saphi-header">
    <div class="saphi-brand"><v-icon icon="mdi-sprout" size="32" aria-hidden="true" /><div><strong>saphi<span>chile</span></strong><small>INTELIGENCIA PARA CULTIVAR</small></div></div>
    <div class="saphi-estate"><v-icon icon="mdi-map-marker-outline" aria-hidden="true" /><div><strong>{{ data.estate }}</strong><small>{{ data.location }}</small></div></div>
    <div class="saphi-header-date"><span>{{ data.date }}</span><small>{{ data.time }} · Hora de demostración</small></div>
    <span class="saphi-notifications" aria-label="Notificaciones de demostración, sin conexión"><v-icon icon="mdi-bell-outline" aria-hidden="true" /></span>
    <div class="saphi-user"><span class="saphi-avatar">{{ data.user.initials }}</span><div><strong>{{ data.user.name }}</strong><small>{{ data.user.role }}</small></div></div>
  </header>
</template>
