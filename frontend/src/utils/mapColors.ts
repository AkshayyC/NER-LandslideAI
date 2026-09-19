import { SEVERITY_FILL } from '../constants/dataClasses';
import type { RiskCategory } from '../types/api';

/**
 * Stepped colour ramps for the grid overlays.
 *
 * Every ramp is a fixed set of bands, not a blend: a reader can match a colour
 * to a printed legend entry without guessing where a band starts. Continuous
 * layers use neutral-to-warm ramps; the risk layers use the severity palette.
 */

export interface RampBand {
  from: number;
  color: string;
  label: string;
}

const SEVERITY_RAMP: RampBand[] = [
  { from: 0.0, color: SEVERITY_FILL.LOW, label: '< 0.40' },
  { from: 0.4, color: SEVERITY_FILL.MODERATE, label: '0.40 – 0.60' },
  { from: 0.6, color: SEVERITY_FILL.HIGH, label: '0.60 – 0.80' },
  { from: 0.8, color: SEVERITY_FILL.CRITICAL, label: '>= 0.80' },
];

const DELTA_RAMP: RampBand[] = [
  { from: -1.0, color: '#254a63', label: 'risk falls' },
  { from: -0.02, color: '#1b2b38', label: 'no change' },
  { from: 0.02, color: '#5c5a34', label: 'slight rise' },
  { from: 0.06, color: '#8a6a2c', label: 'rise' },
  { from: 0.12, color: '#a8542f', label: 'large rise' },
];

const UNCERTAINTY_RAMP: RampBand[] = [
  { from: 0.0, color: '#2b4a5c', label: 'sigma < 0.05' },
  { from: 0.05, color: '#3d6473', label: '0.05 – 0.09' },
  { from: 0.09, color: '#5c7a70', label: '0.09 – 0.13' },
  { from: 0.13, color: '#8a7a4a', label: '>= 0.13' },
];

const ELEVATION_RAMP: RampBand[] = [
  { from: -200, color: '#16323c', label: '< 200 m' },
  { from: 200, color: '#1f4a44', label: '200 – 800 m' },
  { from: 800, color: '#4a6136', label: '800 – 1,800 m' },
  { from: 1800, color: '#7a6a3a', label: '1,800 – 3,000 m' },
  { from: 3000, color: '#8c8f96', label: '3,000 – 4,200 m' },
  { from: 4200, color: '#c9d2dc', label: '>= 4,200 m' },
];

const EVIDENCE_RAMP: RampBand[] = [
  { from: 0.0, color: '#1b2430', label: 'none nearby' },
  { from: 0.05, color: '#3a3560', label: 'weak' },
  { from: 0.2, color: '#57459c', label: 'moderate' },
  { from: 0.5, color: '#7b62d6', label: 'strong' },
  { from: 0.8, color: '#a68bff', label: 'very strong' },
];

export interface FieldRamp {
  bands: RampBand[];
  /** How the value maps onto band edges (identity for all current layers). */
  colorFor: (value: number) => string;
  unit: string;
}

function stepRamp(bands: RampBand[]): (value: number) => string {
  return (value: number) => {
    let color = bands[0].color;
    for (const band of bands) {
      if (value >= band.from) color = band.color;
      else break;
    }
    return color;
  };
}

export function rampForField(field: string): FieldRamp {
  switch (field) {
    case 'risk':
    case 'risk_forward':
    case 'susceptibility':
      return { bands: SEVERITY_RAMP, colorFor: stepRamp(SEVERITY_RAMP), unit: 'index' };
    case 'risk_delta':
      return { bands: DELTA_RAMP, colorFor: stepRamp(DELTA_RAMP), unit: 'risk change' };
    case 'uncertainty':
      return { bands: UNCERTAINTY_RAMP, colorFor: stepRamp(UNCERTAINTY_RAMP), unit: 'sigma' };
    case 'elevation':
      return { bands: ELEVATION_RAMP, colorFor: stepRamp(ELEVATION_RAMP), unit: 'm' };
    case 'evidence':
      return { bands: EVIDENCE_RAMP, colorFor: stepRamp(EVIDENCE_RAMP), unit: 'kernel' };
    default:
      return { bands: SEVERITY_RAMP, colorFor: stepRamp(SEVERITY_RAMP), unit: '' };
  }
}

export function severityColor(category: RiskCategory): string {
  return SEVERITY_FILL[category];
}
