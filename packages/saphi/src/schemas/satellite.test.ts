import { describe,it,expect } from 'vitest';
import { satelliteQuerySchema,satelliteAssetQuerySchema } from './satellite.js';
const query={plotId:'11111111-1111-4111-8111-111111111111',from:'2026-01-01T00:00:00Z',to:'2026-12-01T00:00:00Z'};
describe('satellite catalogue query contracts',()=>{
 it('requires a visible-parent identifier and an explicit half-open period',()=>{
  expect(satelliteQuerySchema.parse(query).limit).toBe(25);
  for(const value of [{},{...query,plotId:'bad'},{...query,to:query.from},{...query,from:'2026-01-01'},{...query,limit:101}])expect(satelliteQuerySchema.safeParse(value).success).toBe(false);
 });
 it('does not adopt the raw IoT 31 day limit or accept URLs/SQL as filters',()=>{
  expect(satelliteQuerySchema.safeParse(query).success).toBe(true);
  for(const extra of [{url:'https://example.test'},{bucket:'photos'},{key:'private'},{sort:'drop table'}])expect(satelliteQuerySchema.safeParse({...query,...extra}).success).toBe(false);
 });
 it('does not allow user-selected download destinations',()=>{
  expect(satelliteAssetQuerySchema.parse({})).toEqual({});
  for(const value of [{url:'https://example.test'},{key:'foo'},{expiresAt:'later'}])expect(satelliteAssetQuerySchema.safeParse(value).success).toBe(false);
 });
});
