import type { RiskCategory } from '../types/api';

/**
 * Severity bands, matching `config.CLASS_CUTS` on the backend (0.40 / 0.60 / 0.80).
 * Used only where the API returns a bare index without a class; every class the
 * backend computes itself is rendered as returned.
 */
export const RISK_CUTS = { MODERATE: 0.4, HIGH: 0.6, CRITICAL: 0.8 } as const;

export function classOf(index: number | null | undefined): RiskCategory | null {
  if (index === null || index === undefined || !Number.isFinite(index)) return null;
  if (index >= RISK_CUTS.CRITICAL) return 'CRITICAL';
  if (index >= RISK_CUTS.HIGH) return 'HIGH';
  if (index >= RISK_CUTS.MODERATE) return 'MODERATE';
  return 'LOW';
}
