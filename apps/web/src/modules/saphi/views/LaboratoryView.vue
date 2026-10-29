<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import CompanyHeader from '../components/CompanyHeader.vue';
const {t}=useI18n();
</script>
<template><div><CompanyHeader :title="t('saphi.laboratory')" /><v-alert type="info" variant="tonal">{{t('saphi.pendingCatalogue')}}</v-alert></div></template>
