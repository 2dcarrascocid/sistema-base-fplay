import { describe, expect, it } from 'vitest';
import { createCompanySchema, updateCompanySchema, membershipSchema, membershipPermissionsSchema,
  createSamplingPointSchema, updateSamplingPointSchema, permissionsSchema, pointSchema } from '../index.js';

const userId = '11111111-1111-4111-8111-111111111111';
describe('master administration contracts', () => {
  it('requires an existing-user reference, reason and canonical RUT for bootstrap', () => {
    const body = { rut:'12345678-5',legalName:'Empresa',initialUserId:userId,initialPermissions:['saphi.companies:view'],reason:'Alta autorizada' };
    expect(createCompanySchema.parse(body).legalName).toBe('Empresa');
    for (const patch of [{ rut:'12.345.678-5' },{ initialUserId:'bad' },{ reason:'' },{ contactEmail:'bad' },{ role:'superuser' }]) {
      expect(createCompanySchema.safeParse({...body,...patch}).success).toBe(false);
    }
  });
  it('accepts explicit contact clearing but requires a real versioned change', () => {
    expect(updateCompanySchema.parse({expectedVersion:1,reason:'Contacto',tradeName:null}).tradeName).toBeNull();
    expect(updateCompanySchema.safeParse({expectedVersion:1,reason:'Nada'}).success).toBe(false);
    expect(updateCompanySchema.safeParse({expectedVersion:1,reason:'Cambio',rut:'12345678-5'}).success).toBe(false);
  });
  it('distinguishes a new membership version from permission updates', () => {
    expect(membershipSchema.parse({expectedVersion:0,status:'active',reason:'Alta'}).expectedVersion).toBe(0);
    expect(membershipPermissionsSchema.safeParse({expectedVersion:0,permissions:[],reason:'Alta'}).success).toBe(false);
    expect(membershipPermissionsSchema.parse({expectedVersion:1,permissions:[],reason:'Retiro'}).permissions).toEqual([]);
  });
  it('rejects duplicated and foreign catalogue keys', () => {
    expect(permissionsSchema.parse(['saphi.farms:view'])).toEqual(['saphi.farms:view']);
    expect(permissionsSchema.safeParse(['saphi.farms:view','saphi.farms:view']).success).toBe(false);
    expect(permissionsSchema.safeParse(['security.users:view']).success).toBe(false);
  });
  it('validates points without accepting polygons, extra coordinates or missing changes', () => {
    const location = {type:'Point',coordinates:[-70,-33]};
    expect(createSamplingPointSchema.parse({plotId:userId,code:'P1',location}).location.coordinates).toEqual([-70,-33]);
    for (const invalid of [{type:'Point',coordinates:[181,0]},{type:'Point',coordinates:[0,-91]},
      {type:'Point',coordinates:[0,0,0]},{type:'Polygon',coordinates:[]},{...location,companyId:userId}]) {
      expect(pointSchema.safeParse(invalid).success).toBe(false);
    }
    expect(updateSamplingPointSchema.safeParse({expectedVersion:1}).success).toBe(false);
    expect(updateSamplingPointSchema.parse({expectedVersion:1,location}).location).toBeDefined();
    expect(updateSamplingPointSchema.parse({expectedVersion:1,status:'inactive'}).status).toBe('inactive');
  });
});
