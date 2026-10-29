import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { satelliteMapDataSchema,type SatelliteMapData } from '@base/saphi';
import { AppError } from '../src/lib/errors.js';
import type { SatelliteMapProvider } from '../src/saphi/integrations/satellite/satellite-map.port.js';
const configPath=fileURLToPath(new URL('../../../.local/saphi-gee.json',import.meta.url));
/** Development-only bridge. The internal token is never serialized to the browser or bundled for AWS. */
export const localGeeProvider:SatelliteMapProvider={
  async render(input):Promise<SatelliteMapData>{
    let token:string;
    try{const config=JSON.parse(await readFile(configPath,'utf8')) as {token?:string};
      if(!config.token||! /^[a-f0-9]{64}$/.test(config.token))throw new Error('Invalid local configuration');token=config.token;
    }catch{throw new AppError(503,'SATELLITE_PROVIDER_UNAVAILABLE');}
    const query=new URLSearchParams({index:input.index,start:input.start,end:input.end,cloud:String(input.cloud),bbox:input.bbox.join(',')});
    let response:Response;
    try{response=await fetch(`http://localhost:3001/dev/procesar-sentinel?${query}`,{
      headers:{'x-saphi-internal-token':token},redirect:'error',signal:AbortSignal.timeout(55_000),
    });}catch{throw new AppError(503,'SATELLITE_PROVIDER_UNAVAILABLE');}
    if(!response.ok){
      if(response.status===404)throw new AppError(404,'SATELLITE_NO_SCENES');
      if(response.status===503)throw new AppError(503,'SATELLITE_PROVIDER_CONFIGURATION');
      throw new AppError(502,'SATELLITE_PROVIDER_ERROR');
    }
    try{
      const data=satelliteMapDataSchema.parse(await response.json());
      if(data.index!==input.index||data.start!==input.start||data.endExclusive!==input.end||
        data.maxCloudPercentage!==input.cloud||data.bbox.some((n,i)=>n!==input.bbox[i]))throw new Error('Unexpected provider scope');
      return data;
    }catch{throw new AppError(502,'SATELLITE_PROVIDER_ERROR');}
  },
};
