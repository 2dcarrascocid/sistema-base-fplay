/** Internal binding resolved from an authenticated provider, never from a caller's companyId. */
export interface DeviceBinding {
  readonly deviceId: string;
  readonly companyId: string;
  readonly providerAccountId: string;
  readonly bindingVersion: number;
}

/** Contract draft: metric/unit catalogues and clock tolerance still require client approval. */
export interface NormalizedMeasurement {
  schemaVersion: 1;
  providerCode: string;
  providerAccountId: string;
  externalDeviceId: string;
  deviceId: string;
  companyId: string;
  sourceMessageId: string;
  sampleIndex: number;
  metricCode: string;
  value: string;
  unitCode: string;
  observedAt: string;
  receivedAt: string;
  qualityCode?: string;
  payloadHash: string;
  bindingVersion: number;
}

export interface SatelliteQuery extends Pick<DeviceBinding, 'companyId'> {
  plotId: string;
  from: string;
  to: string;
}

export interface SatelliteObservationReference {
  providerCode: string;
  sourceObservationId: string;
  acquiredAt: string;
  licenceReference: string;
}
