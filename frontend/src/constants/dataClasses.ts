import type { RiskCategory } from '../types/api';

/**
 * The four information classes used across the product. Keeping them as an
 * explicit design system makes it impossible to blur the line between
 * historical evidence, model inference, and (future) operational warning.
 */
export type DataClass = 'historical' | 'susceptibility' | 'trigger' | 'current';

export interface DataClassMeta {
  key: DataClass;
  label: string;
  color: string;
  tagline: string;
  description: string;
  /** Current delivery status of this class in the platform. */
  status: 'available' | 'pending' | 'planned';
  statusLabel: string;
}

export const DATA_CLASSES: Record<DataClass, DataClassMeta> = {
  historical: {
    key: 'historical',
    label: 'Historical',
    color: '#8b7cf6',
    tagline: 'Recorded past events',
    description:
      'Documented landslide events from the historical inventory (e.g. GSI records). Facts about the past — not a forecast.',
    status: 'available',
    statusLabel: 'Backend data',
  },
  susceptibility: {
    key: 'susceptibility',
    label: 'Susceptibility',
    color: '#4cc2ff',
    tagline: 'Spatial predisposition',
    description:
      'Model-estimated probability that a location is prone to landsliding given terrain, environmental and historical factors. Static in time — it does not say a landslide will occur today.',
    status: 'available',
    statusLabel: 'Backend data',
  },
  trigger: {
    key: 'trigger',
    label: 'Trigger',
    color: '#f5b544',
    tagline: 'Rainfall trigger condition',
    description:
      'Rainfall-based triggering information (event and antecedent rainfall) that modulates susceptibility into a time-specific warning level.',
    status: 'pending',
    statusLabel: 'Integration pending',
  },
  current: {
    key: 'current',
    label: 'Current / Forecast',
    color: '#f0645f',
    tagline: 'Time-specific risk',
    description:
      'Operational, time-specific risk intelligence combining susceptibility with live or forecast triggers. Not operational in this prototype.',
    status: 'planned',
    statusLabel: 'Not operational',
  },
};

export const DATA_CLASS_LIST: DataClassMeta[] = [
  DATA_CLASSES.historical,
  DATA_CLASSES.susceptibility,
  DATA_CLASSES.trigger,
  DATA_CLASSES.current,
];

export interface SeverityMeta {
  label: string;
  color: string;
  summary: string;
}

/** Display metadata for the four canonical categories (docs/methodology.md). */
export const SEVERITY_META: Record<RiskCategory, SeverityMeta> = {
  LOW: {
    label: 'Low',
    color: '#3ddc97',
    summary:
      'Terrain and environmental attributes at this location are consistent with comparatively lower landslide predisposition under the model.',
  },
  MODERATE: {
    label: 'Moderate',
    color: '#e8c547',
    summary:
      'Some contributing factors are present; the model estimates a middling predisposition relative to the training region.',
  },
  HIGH: {
    label: 'High',
    color: '#f59e0b',
    summary:
      'Several contributing factors align; the model estimates elevated predisposition relative to the training region.',
  },
  CRITICAL: {
    label: 'Critical',
    color: '#f4574d',
    summary:
      'The combination of factors most associated with historical landslide occurrence in the training region.',
  },
};

export const UNCLASSIFIED_META: SeverityMeta = {
  label: 'Unclassified',
  color: '#8fa1bd',
  summary: 'The backend did not return a category for this value.',
};

/** Endpoint surface wired by the API service (displayed in System Status). */
export const WIRED_ENDPOINTS: readonly string[] = [
  'GET /',
  'GET /api/health',
  'GET /api/states',
  'GET /api/districts/{state}',
  'GET /api/historical/{state}/{district}',
  'GET /api/susceptibility/{latitude}/{longitude}',
  'GET /api/risk/{latitude}/{longitude}',
  'GET /api/statistics',
  'GET /api/district-risk',
  'GET /api/district-risk/{state}',
];
