import type { DashboardPreviewData } from '../types/dashboard.types';

/** Presentation fixtures only. No agronomic thresholds or validated measurements. */
export const dashboardPreviewData: DashboardPreviewData = {
  demoLabel: 'DEMO / DATOS SIMULADOS',
  estate: 'Viña Santa Emilia', location: 'Valle de Colchagua, Chile',
  date: '27 de octubre de 2026', time: '10:42',
  user: { name: 'Catalina Rojas', role: 'Administración del predio', initials: 'CR' },
  navigation: [
    { label: 'Resumen', icon: 'mdi-view-dashboard-outline' },
    { label: 'Parcelas', icon: 'mdi-map-outline' },
    { label: 'Salud del suelo', icon: 'mdi-sprout-outline' },
    { label: 'Riego', icon: 'mdi-water-outline' },
    { label: 'Operaciones', icon: 'mdi-tractor-variant' },
    { label: 'Analítica', icon: 'mdi-chart-box-outline' },
    { label: 'Informes', icon: 'mdi-file-chart-outline' },
    { label: 'Configuración', icon: 'mdi-cog-outline' },
  ],
  metrics: [
    { title: 'Humedad del suelo', value: '28,4', unit: '%', status: 'Óptimo', detail: 'Promedio del predio · actualización demo 10:40', icon: 'mdi-water-percent', bars: [34, 49, 42, 62, 53, 72, 65, 83, 70, 88, 77, 84] },
    { title: 'Reducción de consumo de agua', value: '19,7', unit: '%', status: 'En objetivo', detail: 'Objetivo ilustrativo: 15–25 % · frente al período anterior', icon: 'mdi-water-minus-outline', progress: 66 },
    { title: 'Eficiencia de riego', value: '94', unit: '%', status: 'Eficiente', detail: '6 zonas ilustrativas · flujo simulado: 12,8 m³/h', icon: 'mdi-sprinkler-variant', progress: 94 },
  ],
  blocks: [
    { id: 'C-01', variety: 'Cabernet Sauvignon', moisture: '29,2 %', state: 'optimal', points: '110,95 290,70 308,175 130,202', labelX: 209, labelY: 140 },
    { id: 'C-02', variety: 'Carménère', moisture: '27,6 %', state: 'optimal', points: '308,69 473,47 499,145 327,173', labelX: 403, labelY: 113 },
    { id: 'C-03', variety: 'Merlot', moisture: '23,1 %', state: 'moderate', points: '493,49 652,81 679,177 519,148', labelX: 588, labelY: 111 },
    { id: 'C-04', variety: 'Cabernet Sauvignon', moisture: '30,4 %', state: 'optimal', points: '132,221 310,194 337,310 153,337', labelX: 234, labelY: 267 },
    { id: 'C-05', variety: 'Syrah', moisture: '18,8 %', state: 'low', points: '331,192 502,165 534,278 357,308', labelX: 432, labelY: 241 },
    { id: 'C-06', variety: 'Carménère', moisture: '28,9 %', state: 'optimal', points: '522,168 682,197 714,311 552,280', labelX: 617, labelY: 241 },
  ],
  legend: [{ state: 'optimal', label: 'Óptimo' }, { state: 'moderate', label: 'Moderado' }, { state: 'low', label: 'Bajo' }],
  weather: { temperature: '24°', condition: 'Parcialmente despejado', details: [{ label: 'Humedad', value: '56 %' }, { label: 'Viento SO', value: '8 km/h' }, { label: 'Precipitación', value: '0 mm' }] },
  analytics: [
    { label: 'Lun', water: 72, moisture: 28 }, { label: 'Mar', water: 65, moisture: 29 },
    { label: 'Mié', water: 78, moisture: 27 }, { label: 'Jue', water: 58, moisture: 30 },
    { label: 'Vie', water: 62, moisture: 29 }, { label: 'Sáb', water: 49, moisture: 28 },
    { label: 'Dom', water: 53, moisture: 28.4 },
  ],
  activity: [
    { id: 'sensor', icon: 'mdi-access-point', title: 'Chequeo de sensores', description: 'Revisión ilustrativa del cuartel C-01.', date: '27 oct · 10:40', status: 'Completado' },
    { id: 'irrigation', icon: 'mdi-water-outline', title: 'Evento de riego', description: 'Registro simulado de riego en C-04.', date: '27 oct · 09:15', status: 'Finalizado' },
    { id: 'weather', icon: 'mdi-weather-partly-cloudy', title: 'Alerta meteorológica', description: 'Ejemplo de aviso por aumento de temperatura.', date: '27 oct · 08:30', status: 'Informativo' },
  ],
};
