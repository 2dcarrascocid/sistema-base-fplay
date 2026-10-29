<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import type { SaphiPermission } from '@base/saphi';
import { AppPageHeader } from '@base/ui';
import { useSaphiCompanyStore } from '../stores/company';
defineProps<{title:string}>();
const {t}=useI18n();const company=useSaphiCompanyStore();const route=useRoute();
const sections=computed(()=>[
  ['farms','farms'],['plots','plots'],['sampling-points','samples'],
  ['samples','samples'],['laboratory','laboratory'],['devices','devices'],['telemetry','telemetry'],
  ['satellite','satellite'],['dashboard','dashboard'],['memberships','memberships'],
].filter(([,permission])=>company.can(`saphi.${permission}:view` as SaphiPermission)));
</script>
<template>
  <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{name:'saphi-companies'}" class="mb-3">{{t('saphi.changeCompany')}}</v-btn>
  <AppPageHeader :title="title" :subtitle="company.company?.legalName??t('saphi.title')"><template #actions><slot /></template></AppPageHeader>
  <nav v-if="company.companyId" class="d-flex flex-wrap ga-2 mb-5" :aria-label="t('saphi.companySections')">
    <v-btn v-for="[section] in sections" :key="section" size="small" :variant="route.path.endsWith('/'+section)?'flat':'tonal'"
      :color="route.path.endsWith('/'+section)?'primary':undefined" :to="`/saphi/companies/${company.companyId}/${section}`">{{t(`saphi.${section}`)}}</v-btn>
  </nav>
</template>
