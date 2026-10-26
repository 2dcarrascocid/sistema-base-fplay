import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotifyStore } from '../stores/notify';
import { errorMessage } from '../utils/errors';

/**
 * Runs an API call with a loading flag; failures become a translated snackbar message.
 * Resolves to the result, or undefined when it failed.
 */
export function useApiAction() {
  const { t, te } = useI18n();
  const notify = useNotifyStore();
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function run<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
    loading.value = true;
    error.value = null;
    try {
      const result = await action();
      if (success) notify.show(success);
      return result;
    } catch (caught) {
      error.value = errorMessage(caught, t, te);
      notify.show(error.value, 'error');
      return undefined;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, run };
}
