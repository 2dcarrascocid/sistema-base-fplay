<script setup lang="ts">
import type {ReadingDto} from '@base/saphi';
import {useI18n} from 'vue-i18n';
defineProps<{rows:ReadingDto[]}>();const {t}=useI18n();
</script>
<template><v-card variant="outlined"><v-table><thead><tr><th>{{t('saphi.metric')}}</th><th>{{t('saphi.value')}}</th><th>{{t('saphi.unit')}}</th><th>{{t('saphi.observedAt')}}</th><th>{{t('saphi.receivedAt')}}</th><th>{{t('saphi.quality')}}</th></tr></thead>
<tbody><tr v-for="row in rows" :key="row.id"><td>{{row.metricCode}}</td><td>{{row.value}}</td><td>{{row.unitCode}}</td><td>{{row.observedAt}}</td><td>{{row.receivedAt}}</td><td>{{row.qualityCode==='demo.simulator'?t('saphi.simulatorReading'):row.qualityCode??'—'}}</td></tr></tbody></v-table>
<v-card-text v-if="!rows.length">{{t('saphi.noReadings')}}</v-card-text></v-card></template>
