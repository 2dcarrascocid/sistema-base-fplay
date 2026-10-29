import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import SaphiDashboardPreview from './SaphiDashboardPreview.vue';

// Dedicated HTML entry; does not boot App.vue, the router, session or global theme.
createApp(SaphiDashboardPreview).use(createVuetify()).mount('#saphi-preview');
