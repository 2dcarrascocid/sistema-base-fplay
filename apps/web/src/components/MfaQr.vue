<script setup lang="ts">
import QRCode from 'qrcode';
import { ref, watchEffect } from 'vue';

/** QR for an otpauth:// URI plus the manual key. Rendered locally: the secret never leaves the browser. */
const props = defineProps<{ uri: string; secret: string; manualLabel: string }>();
const image = ref('');

watchEffect(async () => {
  image.value = await QRCode.toDataURL(props.uri, { margin: 1, width: 200 });
});
</script>

<template>
  <div class="d-flex flex-column align-center ga-3 my-2">
    <img v-if="image" :src="image" width="200" height="200" alt="QR" class="rounded" style="background: #fff" />
    <div class="text-caption text-medium-emphasis">{{ manualLabel }}</div>
    <code class="text-body-2" style="word-break: break-all">{{ secret }}</code>
  </div>
</template>
