/**
 * The response contract of the NER-LandslideAI API (nerls-hazard/2.0).
 *
 * These types mirror the FastAPI schemas one-to-one. Nothing here is inferred
 * defensively: the backend is the only source, and a field that is absent in a
 * response is a contract violation, not something to paper over. Values the
 * backend genuinely cannot report are `null` and the UI says so in words.
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type UncertaintyGrade = 'A' | 'B' | 'C' | 'D';

export type RainfallMode = 'live' | 'climatology' | 'disabled';

export type TriggerClass = 'rainfall' | 'earthquake' | 'glof' | 'cyclone' | 'other';

export interface ClassCounts {
  LOW: number;
  MODERATE: number;
  HIGH: number;
  CRITICAL: number;
}

export interface Distribution {
  mean: number;
  p90: number;
  class_counts: ClassCounts;
}

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** Typed transport failure. `kind` drives the offline copy in the UI. */
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

export type ApiStatus = 'checking' | 'online' | 'offline';

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */

export interface Health {
  status: string;
  engine: string;
  model_id: string;
  version: string;
  grid_cells: number;
  built_at: string;
  rainfall_mode: RainfallMode;
  rainfall_detail: string | null;
  retry_after_seconds: number;
  factor_count: number;
  immediate_actions: boolean;
  disclaimer: string;
}

export interface GridGeometry {
  resolution_deg: number;
  envelope: [number, number, number, number];
  rows: number;
  cols: number;
  cells_total: number;
  cells_in_region: number;
  cell_area_km2: number;
}

export interface Rescale {
  raw_fit_low: number;
  raw_fit_high: number;
  scale: number;
  constant: number;
  index_floor: number;
  index_ceil: number;
  fit_percentiles?: [number, number];
}

export interface SeasonContext {
  month: number;
  regime: string;
  trigger_season_active: boolean;
  note: string;
}

export interface EvidenceSummary {
  total_records: number;
  by_state: Record<string, number>;
  by_source: Record<string, number>;
  catalogue_by_trigger: Partial<Record<TriggerClass, number>>;
  evidence_bandwidth_km: number;
  report_radius_km: number;
}

export interface RainfallStatus {
  provider: string;
  endpoint: string;
  enabled: boolean;
  mode: RainfallMode;
  cached_points: number;
  ttl_seconds: number;
  last_error: string | null;
  last_success: string | null;
  retry_after_seconds: number;
}

export interface Meta {
  name: string;
  version: string;
  model_id: string;
  grid: GridGeometry;
  built_at: string;
  build_seconds: number;
  factors: {
    weights: Record<string, number>;
    labels: Record<string, string>;
    gate: string;
  };
  rescale: Rescale;
  season: SeasonContext;
  scenario_multiplier: number;
  terrain_source: string;
  rainfall_source: string;
  evidence: EvidenceSummary;
  imported_files: string[];
  grid_fields: Record<string, string>;
  class_cuts: Record<string, number | string>;
  rainfall_status: RainfallStatus;
}

export interface Statistics {
  region: {
    states: Array<{
      code: string;
      name: string;
      capital: string;
      area_km2: number;
      population_2011: number;
      districts: number;
    }>;
    district_count: number;
    cells: number;
    cell_area_km2: number;
  };
  susceptibility: Distribution;
  risk_now: Distribution;
  risk_forward: Distribution;
  uncertainty: { mean_sigma: number; max_sigma: number };
  evidence: EvidenceSummary;
  season: SeasonContext;
  rainfall_mode: RainfallMode;
  provenance: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Point analysis                                                      */
/* ------------------------------------------------------------------ */

export interface PointLocation {
  latitude: number;
  longitude: number;
  requested: { latitude: number; longitude: number };
  cell: { row: number; col: number; resolution_deg: number };
  in_region: boolean;
  district: {
    state: string;
    state_code: string;
    district: string;
    hq: string;
    population: number;
    distance_to_hq_km: number;
    assignment: string;
  };
}

export interface PointTerrain {
  elevation_m: number;
  slope_m_per_km: number;
  slope_index: number;
  relief_km: number;
  relief_index: number;
  geology_belt: string | null;
  source: string;
}

export interface LiveRainfall {
  available: boolean;
  past_72h_mm: number | null;
  forecast_24h_mm: number | null;
  forecast_72h_mm: number | null;
  source: string;
  detail: string | null;
  fetched_at: string | null;
}

export interface PointRainfall {
  mode: RainfallMode;
  annual_mm: number;
  month_mean_mm: number;
  live: LiveRainfall;
}

export interface AttributionFactor {
  factor: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  contribution_pct: number;
}

export interface Attribution {
  factors: AttributionFactor[];
  residual: {
    constant: number;
    gate: number;
    gate_label: string;
    unclipped_index: number;
    clipped: number;
  };
  exact: boolean;
}

export interface TriggerState {
  reference_intensity_mm: number;
  threshold_intensity_mm: number;
  intensity_now_mm: number;
  tau: number;
  rainfall_ratio_of_threshold: number;
}

export interface RiskNow {
  now: { value: number; class: RiskCategory };
  horizons: Record<
    string,
    { intensity_mm: number; risk: number; class: RiskCategory; tau: number }
  >;
}

export interface ClassThreshold {
  rainfall_72h_mm: number;
  margin_mm: number;
  exceeded: boolean;
  reached_without_rain: boolean;
  plausible: boolean;
}

export interface Thresholds {
  MODERATE: ClassThreshold;
  HIGH: ClassThreshold;
  CRITICAL: ClassThreshold;
  baseline_class: RiskCategory;
}

export interface PointUncertainty {
  sigma: number;
  band_now: [number, number];
  band_class_possible: [RiskCategory, RiskCategory];
  grade: UncertaintyGrade;
  grade_meaning: string;
  support_km: number;
  nearest_evidence_km: number | null;
  basis: string;
}

export interface Scenario {
  multiplier: number;
  label: string;
  intensity_mm: number;
  risk: number;
  class: RiskCategory;
}

export interface PointProvenance {
  terrain: string;
  rainfall: string;
  evidence: EvidenceSummary;
  records_nearby: number;
  reference_dataset: Record<string, string>;
}

export interface PointAnalysis {
  location: PointLocation;
  terrain: PointTerrain;
  rainfall: PointRainfall;
  susceptibility: { raw_score: number; index: number; class: RiskCategory };
  attribution: Attribution;
  trigger: TriggerState;
  risk: RiskNow;
  thresholds: Thresholds;
  uncertainty: PointUncertainty;
  scenarios: Scenario[];
  provenance: PointProvenance;
}


/* ------------------------------------------------------------------ */
/* Outline                                                             */
/* ------------------------------------------------------------------ */

export interface OutlineResponse {
  /** Generalised polygons as [lon, lat] rings. */
  polygons: Array<Array<[number, number]>>;
  caveat: string;
}

/* ------------------------------------------------------------------ */
/* Grid layers                                                         */
/* ------------------------------------------------------------------ */

export interface GridField {
  field: string;
  label: string;
  source_layer?: string;
  rows: number;
  cols: number;
  lat0: number;
  lon0: number;
  dlat: number;
  dlon: number;
  /** Row-major, `rows * cols` long; `null` marks a cell outside the region. */
  values: Array<number | null>;
  stats: { count: number; min: number; max: number; mean: number; p90: number };
  model_id: string;
  field_meaning: string;
}

/* ------------------------------------------------------------------ */
/* Districts, corridors, watchlist, evidence                           */
/* ------------------------------------------------------------------ */

export interface DistrictSummary {
  state: string;
  state_code: string;
  district: string;
  hq: string;
  population: number;
  population_apportioned: boolean;
  area_km2_approx: number;
  cells: number;
  susceptibility: { mean: number; max: number; class: RiskCategory };
  risk_now: { mean: number; max: number; class: RiskCategory };
  risk_forward: { mean: number; max: number; class: RiskCategory; high_share: number };
  uncertainty_sigma_mean: number;
  records_in_district: number;
  evidence_density_sum: number;
  exposure_index: number;
  exposure_note: string;
}

export interface DistrictDetail extends DistrictSummary {
  headquarters: {
    name: string;
    latitude: number;
    longitude: number;
    elevation_m: number | null;
  };
  point_analysis: PointAnalysis;
}

export interface Waypoint {
  latitude: number;
  longitude: number;
  name: string;
}

export interface CorridorSummary extends Record<string, unknown> {
  id: string;
  name: string;
  mode: string;
  states: string[];
  criticality: number;
  criticality_note: string;
  length_km: number;
  waypoints: Waypoint[];
  summary: {
    max_risk: number;
    mean_risk: number;
    max_susceptibility: number;
    km_in_high_or_above: number;
    km_in_critical: number;
    share_high_or_above: number;
  };
  worst_segment: {
    latitude: number;
    longitude: number;
    risk: number;
    class: RiskCategory;
    window_km: number;
    window_length_km: number;
    district: { district: string; state: string; distance_to_hq_km: number };
    uncertainty_grade: UncertaintyGrade;
  };
  isolation_risk: number;
  isolation_note: string;
  grid_cell_resolution_km: number;
}

export interface CorridorProfilePoint {
  distance_km: number;
  latitude: number;
  longitude: number;
  risk: number;
  susceptibility: number;
  sigma: number;
  passed: number;
}

export interface CorridorDetail extends CorridorSummary {
  profile: CorridorProfilePoint[];
}

export interface WatchlistCell extends LatLon {
  state: string;
  district: string;
  risk_now: number;
  risk_forward: number;
  delta: number;
  susceptibility: number;
  sigma: number;
}

export interface Watchlist {
  mode: SeasonContext;
  scenario_multiplier: number;
  count: number;
  cells: WatchlistCell[];
}

export interface EventRecord extends LatLon {
  id: string;
  date: string;
  place: string;
  state: string;
  state_code: string;
  district: string;
  trigger: TriggerClass;
  confidence: string;
  magnitude_note: string;
  summary: string;
  location_precision: string;
}

export interface Briefing {
  scope: string;
  text: string;
  generated_by: string;
  grounded_on: string[];
  caveat: string;
}

/* ------------------------------------------------------------------ */
/* Methodology                                                         */
/* ------------------------------------------------------------------ */

export interface Methodology {
  model_id: string;
  version: string;
  factors: Array<{ id: string; label: string; weight: number }>;
  index_transform: {
    form: string;
    gate: string;
    percentile_fixing: string;
    detail: Rescale;
    note: string;
  };
  trigger: Record<string, string>;
  severity_bands: Record<string, unknown>;
  uncertainty: Record<string, unknown>;
  provenance: Record<string, unknown>;
  limitations: string[];
}
