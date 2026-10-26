<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTheme } from 'vuetify';
import LanguageMenu from '../components/LanguageMenu.vue';
import { applyBrand } from '../plugins/vuetify';
import { authApi } from '../services/api';

const systemName = ref('');
const logoUrl = ref<string | null>(null);
const theme = useTheme();

onMounted(async () => {
  try {
    const config = await authApi.config();
    systemName.value = config.systemName;
    logoUrl.value = config.logoUrl;
    document.title = config.systemName;
    applyBrand(theme, config.primaryColor, config.secondaryColor);
  } catch {
    // branding is optional on public pages
  }
});
</script>

<template>
  <v-main class="auth-layout">
    <div class="auth-layout__top">
      <div class="d-flex align-center ga-2">
        <img v-if="logoUrl" :src="logoUrl" alt="" class="auth-layout__logo" />
        <v-icon v-else icon="mdi-shield-account" color="primary" />
        <span class="text-subtitle-1 font-weight-bold">{{ systemName }}</span>
      </div>
      <LanguageMenu />
    </div>
    <div class="auth-layout__content">
      <slot />
    </div>
  </v-main>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}
.auth-layout__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px max(16px, env(safe-area-inset-left));
}
.auth-layout__logo {
  height: 28px;
  max-width: 140px;
  object-fit: contain;
}
.auth-layout__content {
  display: flex;
  justify-content: center;
  padding: 24px 16px 64px;
}
.auth-layout__content > :deep(*) {
  width: 100%;
  max-width: 440px;
}
</style>
