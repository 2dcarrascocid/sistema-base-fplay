import { describe, expect, it } from 'vitest';
import { dashboardQuerySchema } from './dashboard.js';
const period={from:'2026-10-01T00:00:00-03:00',to:'2026-10-02T00:00:00-03:00'};
describe('dashboard filters',()=>{
  it('normalizes instants and permits an optional plot',()=>{
    expect(dashboardQuerySchema.parse(period).from).toBe('2026-10-01T03:00:00.000Z');
    expect(dashboardQuerySchema.parse({...period,plotId:'11111111-1111-4111-8111-111111111111'}).plotId).toBeTruthy();
  });
  it('rejects ambiguous dates, empty or reversed periods and unsupported filters',()=>{
    for(const value of [{},{...period,to:period.from},{...period,from:period.to,to:period.from},{...period,from:'2026-10-01'},
      {...period,plotId:'bad'},{...period,farmId:'11111111-1111-4111-8111-111111111111'},{...period,limit:100000}])
      expect(dashboardQuerySchema.safeParse(value).success).toBe(false);
  });
});
