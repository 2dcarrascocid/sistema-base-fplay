import { describe, expect, it } from 'vitest';
import { parsePermissionKey } from '@base/shared';
import {
  SAPHI_MENUS, SAPHI_PERMISSIONS, companyRutSchema, companyScopeSchema,
  createFarmSchema, createPlotSchema, paginationSchema, positiveAreaSchema,
  updateFarmSchema, updatePlotSchema, versionSchema,
} from '../index.js';

const farmId = '11111111-1111-4111-8111-111111111111';

describe('shared structural contracts', () => {
  it('requires an explicit company scope and rejects caller authority claims', () => {
    expect(companyScopeSchema.parse({ companyId: farmId })).toEqual({ companyId: farmId });
    expect(companyScopeSchema.parse({companyId:'00000000-0000-0000-0000-000000000001'}).companyId).toBe('00000000-0000-0000-0000-000000000001');
    for (const input of [{}, { companyId: 'other' }, { companyId: farmId, role: 'superuser' }]) {
      expect(companyScopeSchema.safeParse(input).success).toBe(false);
    }
  });

  it('preserves area precision and rejects zero, negatives, exponents and overflow', () => {
    expect(positiveAreaSchema.parse('0.0001')).toBe('0.0001');
    expect(positiveAreaSchema.parse('9999999999.9999')).toBe('9999999999.9999');
    for (const value of ['0', '0.0000', '-1', '1e3', 'NaN', 'Infinity', '01', '1.00001', '10000000000', 5]) {
      expect(positiveAreaSchema.safeParse(value).success).toBe(false);
    }
  });

  it('bounds pagination without pretending to verify an opaque cursor', () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 25 });
    expect(paginationSchema.parse({ limit: '100', cursor: 'opaque' })).toEqual({ limit: 100, cursor: 'opaque' });
    for (const input of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: '' }, { sort: 'sql' }]) {
      expect(paginationSchema.safeParse(input).success).toBe(false);
    }
  });

  it('reuses canonical RUT validation', () => {
    expect(companyRutSchema.parse('12345678-5')).toBe('12345678-5');
    expect(companyRutSchema.safeParse('12.345.678-5').success).toBe(false);
    expect(companyRutSchema.safeParse('12345678-4').success).toBe(false);
  });

  it('limits optimistic versions to safely represented positive integers', () => {
    expect(versionSchema.parse(1)).toBe(1);
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
      expect(versionSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('master contracts', () => {
  it('accepts a farm without geometry and rejects company/identity injection', () => {
    expect(createFarmSchema.parse({ code: ' P1 ', name: ' Predio ', areaHa: '5.0000' })).toEqual({
      code: 'P1', name: 'Predio', areaHa: '5.0000', status: 'active',
    });
    for (const input of [
      { code: 'P1', name: 'Predio', companyId: farmId },
      { code: 'P1', name: '' }, { code: '', name: 'Predio' },
    ]) expect(createFarmSchema.safeParse(input).success).toBe(false);
  });

  it('requires a change and version, accepts explicit clearing and prohibits reparenting', () => {
    for (const input of [{ expectedVersion: 1 }, { name: 'Otro' }, { expectedVersion: 1, companyId: farmId }]) {
      expect(updateFarmSchema.safeParse(input).success).toBe(false);
    }
    for (const change of [{ name: 'Otro' }, { areaHa: null }, { status: 'inactive' }]) {
      expect(updateFarmSchema.safeParse({ expectedVersion: 1, ...change }).success).toBe(true);
    }
  });

  it('validates plot references without inventing agronomic rules', () => {
    expect(createPlotSchema.parse({ farmId, code: 'C1', name: 'Cuartel', plantingYear: 2099 }).plantingYear).toBe(2099);
    for (const input of [
      { farmId: 'invalid', code: 'C1', name: 'Cuartel' },
      { farmId, code: 'C1', name: 'Cuartel', plantingYear: 0 },
      { farmId, code: 'C1', name: 'Cuartel', plantingYear: 10000 },
    ]) expect(createPlotSchema.safeParse(input).success).toBe(false);
  });

  it('does not accept an empty plot change, unknown geometry or a different farm', () => {
    for (const input of [
      { expectedVersion: 1 }, { expectedVersion: 1, farmId }, { expectedVersion: 1, geometry: {} },
    ]) expect(updatePlotSchema.safeParse(input).success).toBe(false);
    expect(updatePlotSchema.parse({ expectedVersion: 1, grapeVariety: null }).grapeVariety).toBeNull();
  });

  it('references only existing-format menu/action keys without duplicate definitions', () => {
    expect(new Set(SAPHI_PERMISSIONS).size).toBe(SAPHI_PERMISSIONS.length);
    for (const permission of SAPHI_PERMISSIONS) {
      const parsed = parsePermissionKey(permission)!;
      expect(Object.values(SAPHI_MENUS)).toContain(parsed.menuCode);
      expect(['view', 'create', 'edit']).toContain(parsed.actionCode);
    }
  });
});
