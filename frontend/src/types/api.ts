/**
 * Domain types for the NER-LandslideAI frontend.
 *
 * IMPORTANT — API CONTRACT NOTES
 * ------------------------------
 * The backend (api/main.py) is still under construction. The shapes below are
 * the contract this UI expects, and `services/normalize.ts` maps backend
 * responses into them defensively. Any field that cannot be recognised in a
 * backend response stays `null` and the UI renders an explicit
 * "not reported / unavailable" state.
 *
 * This frontend NEVER fabricates values: no synthetic landslide coordinates,
 * no simulated probabilities, no invented accuracy metrics.
 */

/** Canonical risk categories defined in docs/methodology.md. */
export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** A state of the Northeastern Region (NER) of India. */
export interface StateInfo {
  name: string;
  /** Abbreviation if provided by the backend (else null — UI uses built-in codes). */
  code: string | null;
}

export interface DistrictInfo {
  state: string;
  district: string;
}

/** A historical landslide inventory record with plausibly valid coordinates. */
export interface HistoricalEvent {
  id: string;
  latitude: number;
  longitude: number;
  /** ISO-ish date string as provided by the backend, if any. */
  date: string | null;
  label: string | null;
}

export interface DateRange {
  start: string | null;
  end: string | null;
}

/** Normalised response of GET /api/historical/{state}/{district}. */
export interface HistoricalSummary {
  state: string;
  district: string;
  /** Inventory record count as reported by the backend (null = not reported). */
  eventCount: number | null;
  dateRange: DateRange | null;
  /** Only events with plausibly valid coordinates (plotable on a map). */
  events: HistoricalEvent[];
  raw: unknown;
}

/** Normalised response of GET /api/susceptibility/{latitude}/{longitude}. */
export interface SusceptibilityResult extends LatLon {
  /** Model probability in [0, 1] (percent responses are converted). Null = not reported. */
  probability: number | null;
  /** Category as reported by the backend. Null = backend did not classify. */
  category: RiskCategory | null;
  modelVersion: string | null;
  generatedAt: string | null;
  raw: unknown;
}

/** Normalised response of GET /api/risk/{latitude}/{longitude} (trigger-aware risk). */
export interface RiskResult extends LatLon {
  susceptibilityProbability: number | null;
  susceptibilityCategory: RiskCategory | null;
  riskCategory: RiskCategory | null;
  /** Raw trigger block (e.g. rainfall trigger) if the backend provides one. */
  trigger: Record<string, unknown> | null;
  issuedAt: string | null;
  raw: unknown;
}

/** Normalised response of GET /api/statistics. */
export interface StatisticsSummary {
  totalEvents: number | null;
  byState: Array<{ state: string; count: number }> | null;
  dateRange: DateRange | null;
  raw: unknown;
}

/** boolean | null per coverage flag; null = backend did not report this flag. */
export type DataAvailability = Record<string, boolean | null>;

/** Normalised record of GET /api/district-risk (and /{state}). */
export interface DistrictRiskRecord {
  state: string;
  district: string;
  /**
   * Historical inventory count. Null (or 0 with no explicit records) means the
   * backend reports no inventory data for this district — which is NOT low risk.
   */
  inventoryCount: number | null;
  susceptibility: { probability: number | null; category: RiskCategory | null } | null;
  availability: DataAvailability | null;
  raw: unknown;
}

/** Normalised response of GET /api/health. */
export interface HealthSummary {
  statusLabel: string | null;
  modelLoaded: boolean | null;
  version: string | null;
  raw: unknown;
}

export type ApiStatus = 'checking' | 'online' | 'offline';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}
