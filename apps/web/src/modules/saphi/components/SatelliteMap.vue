<script setup lang="ts">
import {nextTick,onBeforeUnmount,onMounted,reactive,ref,watch} from 'vue';
import {useI18n} from 'vue-i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {satelliteMapQuerySchema,type SatelliteMapDto} from '@base/saphi';
import {saphiApi} from '../services/api';
import {useSaphiCompanyStore} from '../stores/company';
import {ApiError} from '../../../services/http';
const props=defineProps<{plotId:string}>();const {t}=useI18n();const store=useSaphiCompanyStore();
const canvas=ref<HTMLElement|null>(null),result=ref<SatelliteMapDto|null>(null),busy=ref(false),error=ref('');
const filters=reactive({index:'NDVI' as 'NDVI'|'NDWI',start:new Date(Date.now()-30*86400000).toISOString().slice(0,10),end:new Date().toISOString().slice(0,10),cloud:30});
let map:L.Map|undefined,layer:L.TileLayer|undefined,observer:ResizeObserver|undefined,controller:AbortController|undefined;
let generation=0,timer:ReturnType<typeof setTimeout>|undefined,enabled=false;
function clear(){generation++;clearTimeout(timer);controller?.abort();layer?.remove();layer?.off();layer=undefined;result.value=null;error.value='';busy.value=false;}
async function load(){
  const companyId=store.companyId;if(!companyId)return;
  clear();const request=generation;
  const parsed=satelliteMapQuerySchema.safeParse({plotId:props.plotId,...filters});
  if(!parsed.success){error.value=t('saphi.mapInvalid');return;}
  if(!store.can('saphi.samples:view')){error.value=t('saphi.mapPointsRequired');return;}
  enabled=true;busy.value=true;const active=new AbortController();controller=active;
  try{
    const response=await saphiApi.satelliteMap(companyId,parsed.data,active.signal);
    if(request!==generation||store.companyId!==companyId)return;
    const data=response.data;await nextTick();if(!map||request!==generation)return;
    result.value=data;
    layer=L.tileLayer(data.tileUrl,{maxZoom:18,noWrap:true,opacity:.9,attribution:'Sentinel-2 / Copernicus · Google Earth Engine',
      bounds:[[data.bbox[1],data.bbox[0]],[data.bbox[3],data.bbox[2]]]});
    layer.on('tileerror',()=>{if(request===generation)error.value=t('saphi.mapTileError');});
    layer.addTo(map);map.invalidateSize();map.fitBounds([[data.bbox[1],data.bbox[0]],[data.bbox[3],data.bbox[2]]],{maxZoom:16});
  }catch(reason){
    if(request!==generation||active.signal.aborted)return;
    error.value=reason instanceof ApiError?t(`errors.${reason.code}`):t('saphi.unavailable');
    if(reason instanceof ApiError&&reason.status===403){try{await store.activate(companyId);}catch{/* clears inaccessible context */}}
  }finally{if(request===generation)busy.value=false;}
}
watch(()=>[props.plotId,store.companyId,store.capabilities],()=>{enabled=false;clear();},{flush:'sync'});
watch(()=>[filters.index,filters.start,filters.end,filters.cloud],()=>{
  const reload=enabled;clear();if(reload)timer=setTimeout(()=>{void load();},500);
},{flush:'sync'});
onMounted(()=>{
  if(!canvas.value)return;map=L.map(canvas.value,{minZoom:3,maxZoom:18}).setView([-35.4264,-71.6554],10);
  observer=new ResizeObserver(()=>map?.invalidateSize({pan:false}));observer.observe(canvas.value);
});
onBeforeUnmount(()=>{enabled=false;clear();observer?.disconnect();map?.remove();map=undefined;});
</script>
<template><v-card variant="outlined" class="mb-6"><v-card-title tag="h2">{{t('saphi.mapTitle')}}</v-card-title><v-card-text>
  <p class="mb-3">{{t('saphi.mapScope')}}</p>
  <v-alert v-if="!store.can('saphi.samples:view')" type="info" class="mb-3">{{t('saphi.mapPointsRequired')}}</v-alert>
  <v-row><v-col cols="12" md="3"><v-select v-model="filters.index" :items="['NDVI','NDWI']" :label="t('saphi.mapIndex')" /></v-col>
    <v-col cols="12" md="3"><v-text-field v-model="filters.start" type="date" :label="t('saphi.mapStart')" /></v-col>
    <v-col cols="12" md="3"><v-text-field v-model="filters.end" type="date" :label="t('saphi.mapEnd')" /></v-col>
    <v-col cols="12" md="3"><v-text-field v-model.number="filters.cloud" type="number" min="0" max="100" :label="t('saphi.mapCloud')" /></v-col></v-row>
  <v-btn color="primary" :loading="busy" :disabled="!props.plotId||!store.can('saphi.samples:view')" @click="load">{{t('saphi.mapLoad')}}</v-btn>
  <p class="my-3 text-body-2">{{filters.index==='NDVI'?'NDVI = (B8 − B4) / (B8 + B4)':'NDWI (McFeeters) = (B3 − B8) / (B3 + B8)'}}</p>
  <div aria-live="polite"><v-alert v-if="error" type="error" class="mb-3">{{error}}</v-alert>
    <p v-if="result" class="mb-3">{{t('saphi.mapScenes',{count:result.sceneCount})}} · {{result.start}} / {{result.endExclusive}} · UTC</p></div>
  <div ref="canvas" class="satellite-map" :aria-label="t('saphi.mapTitle')" />
  <div v-if="result" class="satellite-legend"><span>−1</span><div :style="{background:`linear-gradient(90deg,${result.visualization.palette.map(color=>'#'+color).join(',')})`}" /><span>+1</span></div>
  <p class="mt-3 text-body-2">{{t('saphi.mapNotice')}}</p>
</v-card-text></v-card></template>
<style scoped>.satellite-map{height:480px;max-height:65vh;min-height:300px;width:100%;background:#e2e9e4;z-index:0}.satellite-legend{display:flex;align-items:center;gap:12px;margin-top:12px}.satellite-legend div{width:220px;max-width:60%;height:14px;border:1px solid #879b8d}</style>
