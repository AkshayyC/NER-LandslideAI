import type { RiskCategory } from '../types/api';

/**
 * The four information classes. Keeping them explicit in the interface is what
 * stops historical evidence, model inference and rainfall-triggered risk from
 * being read as one number.
 */
export type DataClass = 'historical' | 'susceptibility' | 'trigger' | 'current';

export interface DataClassMeta {
  key: DataClass;
  label: string;
  color: string;
  tagline: string;
  description: string;
  status: 'available' | 'partial' | 'planned';
  statusLabel: string;
}

export const DATA_CLASSES: Record<DataClass, DataClassMeta> = {
  historical: {
    key: 'historical',
    label: 'Historical',
    color: '#9b8cff',
    tagline: 'Recorded events',
    description:
      'Documented landslide and GLOF events from the compiled reference catalogue. Facts about the past, used as evidence in the model.',
    status: 'available',
    statusLabel: 'Reference catalogue',
  },
  susceptibility: {
    key: 'susceptibility',
    label: 'Susceptibility',
    color: '#4cc2ff',
    tagline: 'Where slopes can fail',
    description:
      'Terrain, geology, rainfall load and historical evidence combined into a relative index. Static in time: it says where, not when.',
    status: 'available',
    statusLabel: 'Model output',
  },
  trigger: {
    key: 'trigger',
    label: 'Trigger',
    color: '#f5b544',
    tagline: 'Rain needed to fail',
    description:
      'Per-location rainfall threshold: the 72-hour total this slope needs to reach each severity band, inverted from the model rather than taken from a regional table.',
    status: 'available',
    statusLabel: 'Model output',
  },
  current: {
    key: 'current',
    label: 'Rainfall condition',
    color: '#f0645f',
    tagline: 'What the rain is doing now',
    description:
      'Observed and forecast rainfall from Open-Meteo when the deployment can reach it; otherwise the local climatological window for the current month, labelled as such.',
    status: 'partial',
    statusLabel: 'Live or climatology',
  },
};

export const DATA_CLASS_LIST: DataClassMeta[] = [
  DATA_CLASSES.historical,
  DATA_CLASSES.susceptibility,
  DATA_CLASSES.trigger,
  DATA_CLASSES.current,
];

/** Printed band edges, matching config.CLASS_CUTS on the backend. */
export const SEVERITY_CUT_TEXT: Record<RiskCategory, string> = {
  LOW: '< 0.40',
  MODERATE: '0.40 – 0.60',
  HIGH: '0.60 – 0.80',
  CRITICAL: '>= 0.80',
};

export interface SeverityMeta {
  label: string;
  color: string;
  summary: string;
}

/** Display metadata for the four severity bands (cuts: 0.40 / 0.60 / 0.80). */
export const SEVERITY_META: Record<RiskCategory, SeverityMeta> = {
  LOW: {
    label: 'Low',
    color: '#3ddc97',
    summary: 'Below the 0.40 cut on the relative index.',
  },
  MODERATE: {
    label: 'Moderate',
    color: '#e8c547',
    summary: 'Between the 0.40 and 0.60 cuts on the relative index.',
  },
  HIGH: {
    label: 'High',
    color: '#f59e0b',
    summary: 'Between the 0.60 and 0.80 cuts on the relative index.',
  },
  CRITICAL: {
    label: 'Critical',
    color: '#f4574d',
    summary: 'At or above the 0.80 cut on the relative index.',
  },
};

export const SEVERITY_ORDER: RiskCategory[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

/**
 * Single-hue ramp used by the map overlays, one entry per band. The classes
 * are ordinal, so the ramp steps rather than blending.
 */
export const SEVERITY_FILL: Record<RiskCategory, string> = {
  LOW: '#2f6b56',
  MODERATE: '#8a7a2c',
  HIGH: '#b4702a',
  CRITICAL: '#a83b34',
};
