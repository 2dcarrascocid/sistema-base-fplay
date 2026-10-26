import type { PermissionKey } from '@base/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { accountApi, authApi } from '../services/api';
import { configureAuth } from '../services/http';
import type { ChallengeName, LoginOutcome, Me } from '../services/types';

/** Refresh this many seconds before the access token expires. */
const REFRESH_MARGIN_SECONDS = 60;

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Session state. The access token is kept only in memory (never localStorage, never the URL);
 * the refresh token is an HttpOnly cookie the browser sends to /api/auth only.
 */
export const useSessionStore = defineStore('session', () => {
  const accessToken = ref<string | null>(null);
  const me = ref<Me | null>(null);
  const status = ref<SessionStatus>('unknown');
  /** Set when the session ended on its own (expired, revoked); the app shows a notice. */
  const lost = ref(false);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshing: Promise<boolean> | null = null;

  const role = computed(() => me.value?.role ?? null);
  const permissions = computed(() => new Set(me.value?.permissions ?? []));
  const pending = computed(() => me.value?.pending ?? { passwordChange: false, mfaSetup: false });

  /** UI hint only: the API checks every permission on every request. */
  function can(key: PermissionKey | string): boolean {
    return role.value === 'superuser' || permissions.value.has(key);
  }

  function schedule(expiresIn: number): void {
    clearTimeout(refreshTimer);
    const delay = Math.max(expiresIn - REFRESH_MARGIN_SECONDS, 15) * 1000;
    refreshTimer = setTimeout(() => void refresh(), delay);
  }

  function setToken(token: string, expiresIn: number): void {
    accessToken.value = token;
    schedule(expiresIn);
  }

  function clear(): void {
    clearTimeout(refreshTimer);
    accessToken.value = null;
    me.value = null;
    status.value = 'anonymous';
  }

  /** Single-flight refresh: concurrent 401s share one call. */
  function refresh(): Promise<boolean> {
    refreshing ??= authApi
      .refresh()
      .then((tokens) => {
        setToken(tokens.accessToken, tokens.expiresIn);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function loadMe(): Promise<void> {
    me.value = await accountApi.me();
    status.value = 'authenticated';
  }

  /** Restores a session from the refresh cookie (page load). */
  async function init(): Promise<void> {
    if (status.value !== 'unknown') return;
    if (await refresh()) {
      try {
        await loadMe();
        return;
      } catch {
        // fall through: treat as signed out
      }
    }
    clear();
  }

  async function finish(outcome: LoginOutcome): Promise<LoginOutcome> {
    if (outcome.status === 'authenticated') {
      lost.value = false;
      setToken(outcome.accessToken, outcome.expiresIn);
      await loadMe();
    }
    return outcome;
  }

  async function login(email: string, password: string, captchaToken: string): Promise<LoginOutcome> {
    return finish(await authApi.login(email, password, captchaToken));
  }

  async function answerChallenge(session: string, challenge: ChallengeName, answer: { code?: string; newPassword?: string }) {
    return finish(await authApi.challenge(session, challenge, answer));
  }

  /** After a federated login: the API set the refresh cookie; exchange it for an access token. */
  async function completeFederated(): Promise<boolean> {
    status.value = 'unknown';
    await init();
    return (status.value as SessionStatus) === 'authenticated';
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      lost.value = false;
      clear();
    }
  }

  function sessionLost(): void {
    if (status.value === 'authenticated') lost.value = true;
    clear();
  }

  /** Connects the HTTP client to this store (token, refresh on 401, session loss). */
  function attach(): void {
    configureAuth({ getToken: () => accessToken.value, refresh, onSessionLost: sessionLost });
  }

  return {
    accessToken,
    me,
    status,
    lost,
    role,
    permissions,
    pending,
    can,
    init,
    refresh,
    loadMe,
    login,
    answerChallenge,
    completeFederated,
    logout,
    sessionLost,
    attach,
  };
});
