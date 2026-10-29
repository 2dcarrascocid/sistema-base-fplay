/** References to the existing menu/action catalogue; no roles or grants are created here. */
export const SAPHI_MENUS = {
  companies: 'saphi.companies',
  memberships: 'saphi.memberships',
  farms: 'saphi.farms',
  plots: 'saphi.plots',
  samples: 'saphi.samples',
  laboratory: 'saphi.laboratory',
  devices: 'saphi.devices',
  telemetry: 'saphi.telemetry',
  satellite: 'saphi.satellite',
  irrigation: 'saphi.irrigation',
  indicators: 'saphi.indicators',
  dashboard: 'saphi.dashboard',
} as const;

/** Initial capabilities only. A constant is not a database permission or an authorization. */
export const SAPHI_PERMISSIONS = [
  'saphi.companies:view', 'saphi.companies:create', 'saphi.companies:edit',
  'saphi.memberships:view', 'saphi.memberships:edit',
  'saphi.farms:view', 'saphi.farms:create', 'saphi.farms:edit',
  'saphi.plots:view', 'saphi.plots:create', 'saphi.plots:edit',
  'saphi.samples:view', 'saphi.samples:create', 'saphi.samples:edit',
  'saphi.laboratory:view', 'saphi.laboratory:create', 'saphi.laboratory:edit',
  'saphi.devices:view', 'saphi.devices:create', 'saphi.devices:edit',
  'saphi.telemetry:view', 'saphi.satellite:view',
  'saphi.irrigation:view', 'saphi.irrigation:create', 'saphi.irrigation:edit',
  'saphi.indicators:view', 'saphi.dashboard:view',
] as const;

export type SaphiPermission = (typeof SAPHI_PERMISSIONS)[number];
