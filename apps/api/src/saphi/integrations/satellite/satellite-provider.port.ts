import type { SatelliteObservationReference, SatelliteQuery } from '@base/saphi';

/** Metadata only; no provider SDK, image processing, formulas or unsigned object URLs. */
export interface SatelliteProvider {
  listObservations(query: SatelliteQuery): Promise<ReadonlyArray<SatelliteObservationReference>>;
}
