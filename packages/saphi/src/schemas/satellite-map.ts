import { z } from 'zod';
import { entityIdSchema } from './common.js';
export const satelliteMapQuerySchema=z.strictObject({
  plotId:entityIdSchema,index:z.enum(['NDVI','NDWI']),start:z.iso.date(),end:z.iso.date(),
  cloud:z.coerce.number().finite().min(0).max(100).default(30),
}).refine(v=>v.start>='2017-03-28'&&v.start<v.end&&
  (Date.parse(v.end)-Date.parse(v.start))/86400000<=366,{message:'Use a 1–366 day period since 2017-03-28',path:['end']});
export type SatelliteMapQuery=z.infer<typeof satelliteMapQuerySchema>;
export const satelliteMapDataSchema=z.strictObject({
  tileUrl:z.string().max(4096).refine(value=>{
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='earthengine.googleapis.com'&&
      !url.username&&!url.password&&url.port===''&&['{z}','{x}','{y}'].every(part=>value.includes(part));}catch{return false;}
  }),
  index:z.enum(['NDVI','NDWI']),formula:z.string().max(100),collection:z.literal('COPERNICUS/S2_SR_HARMONIZED'),
  start:z.iso.date(),endExclusive:z.iso.date(),bbox:z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]),
  maxCloudPercentage:z.number().min(0).max(100),sceneCount:z.number().int().positive(),
  composite:z.literal('median_of_per_scene_indices'),
  visualization:z.strictObject({min:z.literal(-1),max:z.literal(1),palette:z.array(z.string().regex(/^[0-9a-fA-F]{6}$/)).min(2).max(10)}),
  attribution:z.string().max(200),note:z.string().max(500),
});
export type SatelliteMapData=z.infer<typeof satelliteMapDataSchema>;
export interface SatelliteMapDto extends SatelliteMapData {companyId:string;plotId:string;areaSource:'sampling_points_envelope'}
