import { describe,it,expect } from 'vitest';
import { createSoilSampleSchema,soilSampleQuerySchema } from './soil-samples.js';
const body={code:'S1',plotId:'11111111-1111-4111-8111-111111111111',sampledAt:'2026-10-27T12:00:00-03:00'};
describe('soil sample contracts',()=>{
  it('normalizes explicit zone and accepts optional point/notes',()=>{
    expect(createSoilSampleSchema.parse(body).sampledAt).toBe('2026-10-27T15:00:00.000Z');
    expect(createSoilSampleSchema.parse({...body,notes:' Observación '} ).notes).toBe('Observación');
  });
  it('rejects missing timezone, nonfinite dates, unknown fields and excessive notes',()=>{
    for(const patch of [{sampledAt:'2026-10-27T12:00:00'},{sampledAt:'infinity'},{sampledAt:'0000-01-01T00:00:00Z'},{sampledAt:'2026-10-27T12:00:00.123456Z'},{plotId:'bad'},{notes:'x'.repeat(2001)},{results:[]}])
      expect(createSoilSampleSchema.safeParse({...body,...patch}).success).toBe(false);
  });
  it('validates period after normalizing offsets',()=>{
    expect(soilSampleQuerySchema.safeParse({from:'2026-10-27T12:00:00-03:00',to:'2026-10-27T14:00:00Z'}).success).toBe(false);
    expect(soilSampleQuerySchema.safeParse({from:'2026-10-27T12:00:00-03:00',to:'2026-10-27T15:00:01Z'}).success).toBe(true);
    expect(soilSampleQuerySchema.safeParse({}).success).toBe(false);
    expect(soilSampleQuerySchema.safeParse({from:'2026-10-27T15:00:00Z',to:'2026-10-27T15:00:00Z'}).success).toBe(false);
  });
});
