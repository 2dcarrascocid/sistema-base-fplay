<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTurnstile } from '../composables/useTurnstile';

/** Cloudflare Turnstile widget; exposes the current token and reset() to the parent form. */
const container = ref<HTMLElement | null>(null);
const { locale } = useI18n();
const turnstile = useTurnstile(container);

onMounted(() => void turnstile.mount(locale.value));
defineExpose({ token: turnstile.token, reset: turnstile.reset });
</script>

<template>
  <div v-if="turnstile.enabled" ref="container" class="my-2" />
</template>
