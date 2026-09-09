/**
 * Central API service — one function per backend endpoint.
 *
 * Wired endpoints (all GET):
 *   /                                       → getRoot
 *   /api/health                             → getHealth
 *   /api/states                             → getStates
 *   /api/districts/{state}                  → getDistricts
 *   /api/historical/{state}/{district}      → getHistorical
 *   /api/susceptibility/{latitude}/{longitude} → getSusceptibility
 *   /api/risk/{latitude}/{longitude}        → getRisk
 *   /api/statistics                         → getStatistics
 *   /api/district-risk                      → getDistrictRisk
 *   /api/district-risk/{state}              → getDistrictRiskByState
 */
import { request } from './client';
import {
  asRecord,
  normalizeCategory,
  normalizeDateRange,
  normalizeDistrictList,
  normalizeDistrictRiskList,
  normalizeHistorical,
  normalizeProbability,
  normalizeStateList,
  normalizeStatistics,
  pickFirst,
  pickNumber,
  pickString,
} from './normalize';
import { ApiError } from '../types/api';
import type {
  DistrictInfo,
  DistrictRiskRecord,
  HealthSummary,
  HistoricalSummary,
  RiskCategory,
  RiskResult,
  StateInfo,
  StatisticsSummary,
  SusceptibilityResult,
} from '../types/api';

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */

/** GET / — used only to identify the service; may be unimplemented (404). */
export async function getRoot(signal?: AbortSignal): Promise<unknown> {
  return request('/', { signal, timeoutMs: 6000 });
}

export async function getHealth(signal?: AbortSignal): Promise<HealthSummary> {
  const raw = await request('/api/health', { signal, timeoutMs: 6000 });
  const rec = asRecord(raw);
  if (!rec) {
    return {
      statusLabel: typeof raw === 'string' && raw.trim() ? raw.trim() : null,
      modelLoaded: null,
      version: null,
      raw,
    };
  }
  const statusLabel = pickString(rec, ['status', 'state', 'health', 'service_status', 'message']);

  let modelLoaded: boolean | null = null;
  const modelRaw = pickFirst(rec, ['model_loaded', 'modelLoaded', 'model_ready', 'model_available']);
  if (typeof modelRaw === 'boolean') modelLoaded = modelRaw;
  else if (typeof modelRaw === 'string') {
    if (/^(true|loaded|yes|ok|ready|1)$/i.test(modelRaw)) modelLoaded = true;
    else if (/^(false|not_loaded|notloaded|no|missing|0)$/i.test(modelRaw)) modelLoaded = false;
  }

  const version = pickString(rec, ['version', 'model_version', 'api_version', 'build']);
  return { statusLabel, modelLoaded, version, raw: rec };
}

/* ------------------------------------------------------------------ */
/* Region                                                              */
/* ------------------------------------------------------------------ */

export async function getStates(signal?: AbortSignal): Promise<StateInfo[] | null> {
  const raw = await request('/api/states', { signal });
  return normalizeStateList(raw);
}

export async function getDistricts(state: string, signal?: AbortSignal): Promise<DistrictInfo[] | null> {
  const path = `/api/districts/${encodeURIComponent(state)}`;
  const raw = await request(path, { signal });
  return normalizeDistrictList(raw, state);
}

/* ------------------------------------------------------------------ */
/* Historical inventory                                                */
/* ------------------------------------------------------------------ */

export async function getHistorical(
  state: string,
  district: string,
  signal?: AbortSignal,
): Promise<HistoricalSummary> {
  const path = `/api/historical/${encodeURIComponent(state)}/${encodeURIComponent(district)}`;
  const raw = await request(path, { signal });
  return normalizeHistorical(raw, state, district);
}

/* ------------------------------------------------------------------ */
/* Model output                                                        */
/* ------------------------------------------------------------------ */

export async function getSusceptibility(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<SusceptibilityResult> {
  const path = `/api/susceptibility/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
  const raw = await request(path, { signal });
  const rec = asRecord(raw);

  const probability = rec
    ? normalizeProbability(
        pickFirst(rec, [
          'susceptibility_probability',
          'probability',
          'susceptibility',
          'p_landslide',
          'risk_probability',
          'score',
          'value',
        ]),
      )
    : null;
  const category: RiskCategory | null = rec
    ? normalizeCategory(
        pickFirst(rec, [
          'susceptibility_category',
          'category',
          'risk_category',
          'risk_level',
          'susceptibility_level',
          'class',
          'label',
        ]),
      )
    : null;

  return {
    latitude: rec ? (pickNumber(rec, ['latitude', 'lat']) ?? latitude) : latitude,
    longitude: rec ? (pickNumber(rec, ['longitude', 'lon', 'lng']) ?? longitude) : longitude,
    probability,
    category,
    modelVersion: rec ? pickString(rec, ['model_version', 'model', 'version']) : null,
    generatedAt: rec
      ? pickString(rec, ['generated_at', 'generated', 'timestamp', 'predicted_at', 'created_at'])
      : null,
    raw,
  };
}

export async function getRisk(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<RiskResult> {
  const path = `/api/risk/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
  const raw = await request(path, { signal });
  const rec = asRecord(raw);

  const susceptibility = rec ? asRecord(pickFirst(rec, ['susceptibility', 'model', 'model_output'])) : null;
  const trigger = rec ? asRecord(pickFirst(rec, ['trigger', 'rainfall_trigger', 'triggers'])) : null;

  return {
    latitude: rec ? (pickNumber(rec, ['latitude', 'lat']) ?? latitude) : latitude,
    longitude: rec ? (pickNumber(rec, ['longitude', 'lon', 'lng']) ?? longitude) : longitude,
    susceptibilityProbability: rec
      ? normalizeProbability(
          pickFirst(rec, [
            'susceptibility_probability',
            'probability',
            'p_landslide',
            ...(susceptibility ? ['probability'] : []),
          ]),
        )
      : null,
    susceptibilityCategory: rec
      ? normalizeCategory(pickFirst(rec, ['susceptibility_category', 'category', 'risk_level']))
      : null,
    riskCategory: rec
      ? normalizeCategory(pickFirst(rec, ['risk_category', 'risk_level', 'category', 'level']))
      : null,
    trigger,
    issuedAt: rec ? pickString(rec, ['issued_at', 'issued', 'timestamp', 'generated_at', 'valid_for']) : null,
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export async function getStatistics(signal?: AbortSignal): Promise<StatisticsSummary> {
  const raw = await request('/api/statistics', { signal });
  return normalizeStatistics(raw);
}

export async function getDistrictRisk(
  state: string | null,
  signal?: AbortSignal,
): Promise<DistrictRiskRecord[] | null> {
  const path = state ? `/api/district-risk/${encodeURIComponent(state)}` : '/api/district-risk';
  const raw = await request(path, { signal });
  const list = normalizeDistrictRiskList(raw, state);
  if (list) return list;

  // If a per-state query returns an object (not a list), fall back to
  // normalising the all-states endpoint so the UI stays usable.
  if (state) {
    try {
      const all = await request('/api/district-risk', { signal });
      const parsed = normalizeDistrictRiskList(all, null);
      if (parsed) return parsed.filter((r) => r.state === state);
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'timeout') throw err;
      // fall through
    }
  }
  return null;
}

export async function getDistrictRiskByState(
  state: string,
  signal?: AbortSignal,
): Promise<DistrictRiskRecord[] | null> {
  return getDistrictRisk(state, signal);
}

/** Convenience re-export for pages needing the range helper. */
export { normalizeDateRange };
