<script setup lang="ts">
import { nextTick,onBeforeUnmount,onMounted,ref,watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props=defineProps<{longitude:string;latitude:string;label:string}>();
const emit=defineEmits<{select:[longitude:string,latitude:string]}>();
const canvas=ref<HTMLElement|null>(null);
let map:L.Map|undefined,marker:L.CircleMarker|undefined,observer:ResizeObserver|undefined;
const fallback:L.LatLngExpression=[-35.39,-71.74];
function position():L.LatLngExpression|null{
  const longitude=Number(props.longitude),latitude=Number(props.latitude);
  if(!props.longitude.trim()||!props.latitude.trim()||!Number.isFinite(longitude)||!Number.isFinite(latitude)
    ||longitude < -180||longitude > 180||latitude < -90||latitude > 90)return null;
  return [latitude,longitude];
}
function showMarker(point:L.LatLngExpression){
  if(!map)return;
  if(!marker)marker=L.circleMarker(point,{radius:9,color:'#175d42',fillColor:'#3aa879',fillOpacity:0.9,weight:2}).addTo(map);
  else marker.setLatLng(point);
}
watch(()=>[props.longitude,props.latitude],()=>{const point=position();if(point){showMarker(point);map?.panTo(point);}});
onMounted(async()=>{
  await nextTick();if(!canvas.value)return;
  map=L.map(canvas.value,{minZoom:3,maxZoom:18}).setView(position()??fallback,position()?15:10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const initial=position();if(initial)showMarker(initial);
  map.on('click',event=>{
    const longitude=event.latlng.lng.toFixed(6),latitude=event.latlng.lat.toFixed(6);
    showMarker(event.latlng);emit('select',longitude,latitude);
  });
  if(typeof ResizeObserver!=='undefined'){
    observer=new ResizeObserver(()=>map?.invalidateSize({pan:false}));observer.observe(canvas.value);
  }
  setTimeout(()=>map?.invalidateSize(),100);
});
onBeforeUnmount(()=>{observer?.disconnect();map?.remove();map=undefined;});
</script>
<template><div ref="canvas" class="sampling-point-map" role="application" :aria-label="label" /></template>
<style scoped>.sampling-point-map{height:300px;width:100%;background:#e2e9e4;z-index:0;border-radius:8px}</style>
