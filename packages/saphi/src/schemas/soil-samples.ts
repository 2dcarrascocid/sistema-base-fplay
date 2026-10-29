import { z } from 'zod';
import { codeSchema, entityIdSchema, paginationSchema } from './common.js';

export const sampleInstantSchema=z.iso.datetime({offset:true}).refine(value=>{
  const instant=new Date(value);const year=instant.getUTCFullYear();
  return Number.isFinite(instant.getTime())&&year>=1&&year<=9999&&(value.match(/\.(\d+)/)?.[1]?.length??0)<=3;
},'Use years 0001–9999 and at most millisecond precision')
  .transform(value=>new Date(value).toISOString());
export const createSoilSampleSchema=z.strictObject({
  code:codeSchema,plotId:entityIdSchema,samplingPointId:entityIdSchema.nullable().optional(),
  sampledAt:sampleInstantSchema,notes:z.string().trim().max(2000).nullable().optional(),
});
export const soilSampleQuerySchema=paginationSchema.extend({plotId:entityIdSchema.optional(),from:sampleInstantSchema,to:sampleInstantSchema})
  .refine(value=>value.from<value.to,{message:'from must precede to',path:['to']});
export type CreateSoilSampleInput=z.infer<typeof createSoilSampleSchema>;
