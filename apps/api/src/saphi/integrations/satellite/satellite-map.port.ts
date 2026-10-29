import type { SatelliteMapData,SatelliteMapQuery } from '@base/saphi';
export interface SatelliteMapProvider {
  render(input:Omit<SatelliteMapQuery,'plotId'>&{bbox:[number,number,number,number]}):Promise<SatelliteMapData>;
}
