import { describe, expect, it } from 'vitest';
import { hasPermission, parsePermissionKey, permissionKey, ungrantablePermissions } from './permissions.js';

describe('permissionKey', () => {
  it('builds a key from valid codes', () => {
    expect(permissionKey('security.users', 'unlock')).toBe('security.users:unlock');
  });

  it('rejects malformed codes', () => {
    expect(() => permissionKey('Security.Users', 'view')).toThrow();
    expect(() => permissionKey('security.users', 'view:all')).toThrow();
  });
});

describe('parsePermissionKey', () => {
  it('parses valid keys', () => {
    expect(parsePermissionKey('config.menus:edit')).toEqual({ menuCode: 'config.menus', actionCode: 'edit' });
  });

  it('returns null for invalid keys', () => {
    expect(parsePermissionKey('config.menus')).toBeNull();
    expect(parsePermissionKey('a:b:c')).toBeNull();
    expect(parsePermissionKey('a:B')).toBeNull();
  });
});

describe('hasPermission', () => {
  const granted = new Set(['security.users:view']);

  it('superuser has every permission', () => {
    expect(hasPermission('superuser', new Set(), 'security.audit:export')).toBe(true);
  });

  it('others need the explicit permission', () => {
    expect(hasPermission('admin', granted, 'security.users:view')).toBe(true);
    expect(hasPermission('admin', granted, 'security.users:edit')).toBe(false);
    expect(hasPermission('client', granted, 'security.audit:view')).toBe(false);
  });
});

describe('ungrantablePermissions', () => {
  const adminGranted = new Set(['security.users:view', 'security.users:edit']);

  it('superuser can grant anything', () => {
    expect(ungrantablePermissions('superuser', new Set(), ['security.audit:view'])).toEqual([]);
  });

  it('admin cannot grant permissions they do not hold', () => {
    expect(
      ungrantablePermissions('admin', adminGranted, ['security.users:view', 'security.audit:view']),
    ).toEqual(['security.audit:view']);
  });

  it('client cannot grant anything', () => {
    expect(ungrantablePermissions('client', adminGranted, ['security.users:view'])).toEqual(['security.users:view']);
  });
});
