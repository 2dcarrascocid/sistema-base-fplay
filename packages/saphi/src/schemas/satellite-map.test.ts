import {describe,it,expect} from 'vitest';
import {satelliteMapQuerySchema,satelliteMapDataSchema} from './satellite-map.js';
const query={plotId:'11111111-1111-4111-8111-111111111111',index:'NDVI',start:'2026-09-01',end:'2026-10-01'};
describe('scoped Sentinel map contract',()=>{
  it('accepts the two explicit spectral conventions and a bounded date interval',()=>{
    expect(satelliteMapQuerySchema.parse(query).cloud).toBe(30);
    expect(satelliteMapQuerySchema.parse({...query,index:'NDWI',cloud:'0'}).cloud).toBe(0);
    for(const change of [{index:'NDMI'},{plotId:'bad'},{cloud:101},{cloud:'NaN'},{end:query.start},
      {start:'2024-01-01'},{start:'2016-01-01'},{bbox:'0,0,1,1'},{companyId:query.plotId},{url:'https://example.test'}])
      expect(satelliteMapQuerySchema.safeParse({...query,...change}).success).toBe(false);
  });
  it('does not allow non-Google or credential-bearing tile URLs',()=>{
    const tile=satelliteMapDataSchema.shape.tileUrl;
    expect(tile.safeParse('https://earthengine.googleapis.com/v1/projects/test/maps/test/tiles/{z}/{x}/{y}').success).toBe(true);
    for(const url of ['http://earthengine.googleapis.com/{z}/{x}/{y}','https://example.test/{z}/{x}/{y}',
      'https://earthengine.googleapis.com.example.test/{z}/{x}/{y}','https://user:pass@earthengine.googleapis.com/{z}/{x}/{y}',
      'https://earthengine.googleapis.com/static'])expect(tile.safeParse(url).success).toBe(false);
  });
});
