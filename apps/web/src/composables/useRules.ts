import { useI18n } from 'vue-i18n';
import * as rules from '../utils/validation';
import type { Rule } from '../utils/validation';

/** Validation rules translated for Vuetify inputs (true or a message). */
export function useRules() {
  const { t } = useI18n();
  const wrap =
    (rule: Rule) =>
    (value: unknown): true | string => {
      const result = rule(value);
      return result === true ? true : t(result.key, result.params ?? {});
    };

  return {
    required: wrap(rules.required),
    email: wrap(rules.email),
    rut: wrap(rules.rut),
    phone: wrap(rules.phone),
    totp: wrap(rules.totp),
    max: (n: number) => wrap(rules.maxLength(n)),
    sameAs: (other: () => string) => wrap(rules.sameAs(other)),
  };
}
