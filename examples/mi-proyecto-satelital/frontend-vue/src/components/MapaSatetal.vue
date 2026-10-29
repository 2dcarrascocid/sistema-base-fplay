<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const endpoint=import.meta.env.VITE_SENTINEL_API_URL || 'http://localhost:3000/dev/procesar-sentinel';
const container=ref(null),index=ref('NDVI'),cloud=ref(30),bbox=ref('');
const today=new Date();
const end=ref(today.toISOString().slice(0,10));
const start=ref(new Date(today.getTime()-30*86400000).toISOString().slice(0,10));
const loading=ref(false),error=ref(''),metadata=ref(null);
const formula=computed(()=>index.value==='NDVI'?'(B8 − B4) / (B8 + B4)':'(B3 − B8) / (B3 + B8) · McFeeters');
const gradient=computed(()=>metadata.value?`linear-gradient(90deg,${metadata.value.visualization.palette.map(color=>`#${color}`).join(',')})`:'none');
let map,layer,observer,controller,timer,sequence=0;

function removeLayer(){if(layer){layer.off();layer.remove();layer=undefined;}}
function updateBounds(){
  const bounds=map.getBounds();
  bbox.value=[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()].map(n=>n.toFixed(6)).join(',');
}
function invalidate(){
  sequence++;clearTimeout(timer);controller?.abort();removeLayer();metadata.value=null;error.value='';loading.value=false;
}
function schedule(){invalidate();const request=sequence;timer=setTimeout(()=>load(request),600);}
async function load(request=sequence){
  if(!map||!bbox.value)return;
  if(!start.value||!end.value||start.value>=end.value){error.value='Desde debe ser anterior a Hasta (excluido).';return;}
  const active=new AbortController();controller=active;loading.value=true;error.value='';
  const deadline=setTimeout(()=>active.abort(),55_000);
  try{
    const query=new URLSearchParams({index:index.value,start:start.value,end:end.value,cloud:String(cloud.value),bbox:bbox.value});
    const response=await fetch(`${endpoint}?${query}`,{signal:active.signal,credentials:'omit',cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error?.message || `La API respondió HTTP ${response.status}.`);
    if(request!==sequence)return;
    const url=new URL(data.tileUrl);
    if(url.protocol!=='https:'||url.hostname!=='earthengine.googleapis.com'||
       !['{z}','{x}','{y}'].every(part=>data.tileUrl.includes(part)))throw new Error('La API devolvió una URL de teselas no válida.');
    removeLayer();
    layer=L.tileLayer(data.tileUrl,{opacity:0.85,maxZoom:18,noWrap:true,
      bounds:[[data.bbox[1],data.bbox[0]],[data.bbox[3],data.bbox[2]]],
      attribution:'Sentinel-2 / Copernicus · Google Earth Engine'});
    layer.on('tileerror',()=>{
      if(request===sequence)error.value='No se pudo descargar alguna tesela. Comprueba la conexión o pulsa Actualizar para renovar la URL.';
    });
    layer.addTo(map);metadata.value=data;
  }catch(reason){
    if(request!==sequence)return;
    error.value=active.signal.aborted?'La consulta excedió el tiempo de espera. Reduce el área o el período y vuelve a intentar.':
      reason instanceof Error?reason.message:'No se pudo consultar el satélite.';
  }finally{
    clearTimeout(deadline);
    if(request===sequence)loading.value=false;
  }
}
function refresh(){invalidate();void load(sequence);}
watch([index,start,end,cloud,bbox],schedule,{flush:'sync'});
onMounted(()=>{
  // Initial location is a navigation example near Talca, not a registered farm boundary.
  map=L.map(container.value,{minZoom:8,maxZoom:18,worldCopyJump:false}).setView([-35.4264,-71.6554],12);
  L.control.scale({imperial:false}).addTo(map);
  map.on('moveend',updateBounds);updateBounds();
  observer=new ResizeObserver(()=>map?.invalidateSize({pan:false}));observer.observe(container.value);
});
onBeforeUnmount(()=>{invalidate();observer?.disconnect();map?.off();map?.remove();map=undefined;});
</script>

<template>
  <section aria-labelledby="viewer-title">
    <header><p class="eyebrow">SENTINEL-2 · EXPLORACIÓN ESPECTRAL</p><h1 id="viewer-title">Vegetación y agua desde el satélite</h1>
      <p>Consulta Earth Engine para el área visible. Mueve el mapa o cambia los filtros para actualizar la capa.</p></header>
    <form class="controls" @submit.prevent="refresh">
      <label>Índice<select v-model="index"><option value="NDVI">NDVI · vegetación</option><option value="NDWI">NDWI · agua (McFeeters)</option></select></label>
      <label>Desde (UTC)<input v-model="start" type="date" min="2017-03-28" :max="end" required></label>
      <label>Hasta (UTC, excluido)<input v-model="end" type="date" :min="start" required></label>
      <label>Nubosidad máxima de escena (%)<input v-model.number="cloud" type="number" min="0" max="100" step="1" required></label>
      <button type="submit" :disabled="loading">{{loading?'Consultando…':'Actualizar'}}</button>
    </form>
    <p class="formula">{{index}} = {{formula}}</p>
    <div aria-live="polite" aria-atomic="true" class="status">
      <p v-if="loading" role="status">Buscando escenas y preparando teselas…</p>
      <p v-if="error" role="alert" class="error">{{error}}</p>
      <p v-if="metadata">{{metadata.sceneCount}} escenas seleccionadas · mediana de índices por escena · {{metadata.start}} a {{metadata.endExclusive}} (excluido).</p>
    </div>
    <div ref="container" class="map" aria-label="Mapa interactivo Sentinel-2; usa flechas y controles de zoom" />
    <div v-if="metadata" class="legend" aria-label="Escala del índice">
      <span>−1</span><div :style="{background:gradient}" /><span>+1</span><strong>{{metadata.index}}</strong>
    </div>
    <footer><p>Gris o transparencia significa ausencia de píxeles válidos, no un índice igual a cero. La máscara elimina sombras, nubes medias/altas, cirros, nieve y píxeles defectuosos; puede quedar nubosidad residual.</p>
      <p>La API se ejecuta localmente; Earth Engine y sus teselas necesitan Internet. No hay mapa base externo ni almacenamiento de teselas o credenciales en el navegador.</p></footer>
  </section>
</template>

<style scoped>
header{max-width:850px}h1{font-size:clamp(1.75rem,3vw,2.6rem);line-height:1.15;margin:.4rem 0 1rem}p{line-height:1.55}.eyebrow{font-size:.8rem;letter-spacing:.13em;font-weight:750;color:#366a51}.controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:14px;align-items:end;padding:20px;margin:24px 0 12px;border:1px solid #ceddd3;border-radius:12px;background:white}label{display:grid;gap:7px;font-size:.85rem;font-weight:650}input,select{width:100%;min-width:0;min-height:44px;padding:8px;border:1px solid #9eb6a8;border-radius:6px;color:inherit;background:white}button{min-height:44px;padding:10px 20px;background:#195b3e;color:white;border:0;border-radius:6px;font-weight:650}button:disabled{opacity:.65;cursor:wait}.formula{font-family:ui-monospace,monospace}.map{height:min(65vh,650px);min-height:350px;width:100%;border:1px solid #b5c9bc;border-radius:12px;background:#e2e9e4;z-index:0}.status{min-height:40px}.error{background:#fff0ee;border-left:4px solid #b93d30;padding:12px;color:#83271f}.legend{display:flex;gap:12px;align-items:center;margin:14px 0;font-size:.9rem}.legend div{height:14px;max-width:280px;flex:1;border:1px solid #879b8d;border-radius:4px}footer{font-size:.85rem;color:#405b4b}footer p{margin:.6rem 0}@media(max-width:1000px){.controls{grid-template-columns:repeat(2,minmax(0,1fr))}.controls button{grid-column:1/-1}}@media(max-width:540px){.controls{grid-template-columns:1fr;padding:14px}.map{min-height:330px}h1{font-size:1.8rem}}
</style>
