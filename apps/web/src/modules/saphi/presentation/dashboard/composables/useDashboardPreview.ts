import { computed, ref } from 'vue';
import type { VineyardBlock } from '../types/dashboard.types';

/** Local presentation state; intentionally has no stores, persistence or requests. */
export function useDashboardPreview(blocks: () => VineyardBlock[]) {
  const selectedId = ref<string | null>(null);
  const zoom = ref(1);
  const selectedBlock = computed(() => blocks().find((block) => block.id === selectedId.value));
  function selectBlock(id: string) { selectedId.value = id; }
  function changeZoom(delta: number) { zoom.value = Math.min(1.6, Math.max(1, +(zoom.value + delta).toFixed(1))); }
  function resetView() { zoom.value = 1; selectedId.value = null; }
  return { selectedBlock, zoom, selectBlock, changeZoom, resetView };
}
