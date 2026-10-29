import type { DeviceBinding, NormalizedMeasurement } from '@base/saphi';

/** Trusted adapter output, not a public request DTO. */
export interface VerifiedProviderIdentity {
  readonly providerAccountId: string;
  readonly verificationReference: string;
}

/** Transport authentication, binding and normalization remain independently replaceable. */
export interface TelemetryProvider {
  authenticate(envelope: unknown): Promise<VerifiedProviderIdentity>;
  resolveDevice(identity: VerifiedProviderIdentity, externalDeviceId: string): Promise<DeviceBinding>;
  normalizeMeasurement(payload: unknown, binding: DeviceBinding): Promise<NormalizedMeasurement[]>;
}
