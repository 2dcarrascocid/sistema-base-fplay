import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Notice {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}

/** Short-lived messages shown in a snackbar ("Usuario creado", errors…). */
export const useNotifyStore = defineStore('notify', () => {
  const current = ref<Notice | null>(null);
  let next = 1;

  function show(text: string, tone: Notice['tone'] = 'success'): void {
    current.value = { id: next++, text, tone };
  }

  function dismiss(): void {
    current.value = null;
  }

  return { current, show, dismiss };
});
