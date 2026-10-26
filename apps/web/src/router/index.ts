import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { resolveNavigation, type RouteMetaInfo } from './guards';

declare module 'vue-router' {
  interface RouteMeta extends RouteMetaInfo {
    layout?: 'auth' | 'app';
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('../views/auth/LoginView.vue'), meta: { public: true, guestOnly: true, layout: 'auth' } },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('../views/auth/RecoverView.vue'),
    meta: { public: true, layout: 'auth' },
  },
  { path: '/activate', name: 'activate', component: () => import('../views/auth/ActivateView.vue'), meta: { public: true, layout: 'auth' } },
  { path: '/register', name: 'register', component: () => import('../views/auth/RegisterView.vue'), meta: { public: true, guestOnly: true, layout: 'auth' } },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('../views/auth/FederatedCallbackView.vue'),
    meta: { public: true, layout: 'auth' },
  },

  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/account', name: 'account', component: () => import('../views/account/AccountView.vue') },
  {
    path: '/security/users',
    name: 'users',
    component: () => import('../views/security/UsersView.vue'),
    meta: { permission: 'security.users:view' },
  },
  {
    path: '/security/profiles',
    name: 'profiles',
    component: () => import('../views/security/ProfilesView.vue'),
    meta: { permission: 'security.profiles:view' },
  },
  {
    path: '/security/profiles/:id',
    name: 'profile',
    component: () => import('../views/security/ProfileDetailView.vue'),
    meta: { permission: 'security.profiles:view' },
  },
  {
    path: '/security/audit',
    name: 'audit',
    component: () => import('../views/security/AuditView.vue'),
    meta: { permission: 'security.audit:view' },
  },
  {
    path: '/config/settings',
    name: 'config-settings',
    component: () => import('../views/config/SettingsView.vue'),
    meta: { permission: 'config.settings:view' },
  },
  {
    path: '/config/menus',
    name: 'config-menus',
    component: () => import('../views/config/MenusView.vue'),
    meta: { permission: 'config.menus:view' },
  },
  {
    path: '/config/security-policy',
    name: 'config-security-policy',
    component: () => import('../views/config/SecurityPolicyView.vue'),
    meta: { permission: 'config.security_policy:view' },
  },
  {
    path: '/config/email-templates',
    name: 'config-email-templates',
    component: () => import('../views/config/EmailTemplatesView.vue'),
    meta: { permission: 'config.email_templates:view' },
  },
  { path: '/forbidden', name: 'forbidden', component: () => import('../views/ForbiddenView.vue') },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { public: true } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.init();
  return resolveNavigation(to, session);
});
