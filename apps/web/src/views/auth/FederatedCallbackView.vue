<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../../stores/session';

/** Landing page after Google/Facebook/Apple: the API already set the refresh cookie; no token is in the URL. */
const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();

onMounted(async () => {
  const ok = await session.completeFederated();
  await router.replace(ok ? { name: 'home' } : { name: 'login', query: { error: 'LOGIN_FAILED' } });
});
</script>

<template>
  <div class="d-flex flex-column align-center ga-4 py-12">
    <v-progress-circular indeterminate color="primary" />
    <p>{{ t('auth.callback.processing') }}</p>
  </div>
</template>
