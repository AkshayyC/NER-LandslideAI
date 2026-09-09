/**
 * Defensive response normalisation.
 *
 * The backend contract is still being finalised (api/main.py is a placeholder),
 * so every response is mapped conservatively into the typed shapes in
 * types/api.ts. Anything unrecognisable stays null/[] — the UI then shows an
 * honest "not reported" state. No value is ever invented here.
 */
import type {
  DataAvailability,
  DateRange,
  DistrictRiskRecord,
  DistrictInfo,
  HistoricalEvent,
  HistoricalSummary,
  RiskCategory,
  StateInfo,
  StatisticsSummary,
} from '../types/api';

/** Common envelope keys a FastAPI service might wrap lists in. */
const DEFAULT_WRAPPERS = ['data', 'results', 'items', 'records', 'features', 'payload'] as const;

export function asRecord(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

export function pickFirst(rec: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const v = rec[key];
    if (v !== undefined && v !== null) return v;
  }
  // One level of nesting (e.g. { model: { version } }).
  for (const key of keys) {
    for (const value of Object.values(rec)) {
      const nested = asRecord(value);
      if (nested && nested[key] !== undefined && nested[key] !== null) return nested[key];
    }
  }
  return undefined;
}

export function pickString(rec: Record<string, unknown>, keys: readonly string[]): string | null {
  const v = pickFirst(rec, keys);
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

export function pickNumber(rec: Record<string, unknown>, keys: readonly string[]): number | null {
  const v = pickFirst(rec, keys);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Find the first array in a payload: the payload itself, or under a wrapper key. */
export function findArray(raw: unknown, wrapperKeys: readonly string[] = DEFAULT_WRAPPERS): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  const rec = asRecord(raw);
  if (!rec) return null;
  for (const key of wrapperKeys) {
    const v = rec[key];
    if (Array.isArray(v)) return v;
  }
  return null;
}

/** Map a backend label onto the four canonical categories. Unknown → null. */
export function normalizeCategory(value: unknown): RiskCategory | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  switch (v) {
    case 'low':
    case 'very low':
    case 'vlow':
      return 'LOW';
    case 'moderate':
    case 'medium':
    case 'mod':
      return 'MODERATE';
    case 'high':
      return 'HIGH';
    case 'critical':
      return 'CRITICAL';
    default:
      return null;
  }
}

/**
 * Interpret a probability: values in [0,1] are used as-is; values in (1,100]
 * are interpreted as percentages. Out-of-range → null.
 */
export function normalizeProbability(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) return value;
    if (value > 1 && value <= 100) return value / 100;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value.replace('%', '').trim());
    if (Number.isFinite(n)) return normalizeProbability(n);
  }
  return null;
}

function normalizeDateValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value) && value > 1e9 && value < 2e12) {
    try {
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeDateRange(raw: unknown): DateRange | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const start = normalizeDateValue(raw[0]);
    const end = normalizeDateValue(raw[1]);
    if (start || end) return { start, end };
    return null;
  }
  const rec = asRecord(raw);
  if (!rec) return null;
  const start = pickString(rec, ['start', 'from', 'earliest', 'begin', 'min']);
  const end = pickString(rec, ['end', 'to', 'latest', 'max']);
  if (!start && !end) return null;
  return { start, end };
}

function isValidLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLon(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

/* ------------------------------------------------------------------ */
/* GET /api/states                                                     */
/* ------------------------------------------------------------------ */

export function normalizeStateList(raw: unknown): StateInfo[] | null {
  const arr = findArray(raw, ['states', 'data', 'results', 'items', 'records', 'regions']);
  if (!arr) return null;
  const states: StateInfo[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.trim().length > 0) {
      states.push({ name: item.trim(), code: null });
      continue;
    }
    const rec = asRecord(item);
    if (rec) {
      const name = pickString(rec, ['name', 'state', 'state_name', 'title', 'full_name']);
      if (name) {
        states.push({
          name,
          code: pickString(rec, ['code', 'state_code', 'abbr', 'abbreviation']),
        });
      }
    }
  }
  return states.length > 0 ? states : null;
}

/* ------------------------------------------------------------------ */
/* GET /api/districts/{state}                                          */
/* ------------------------------------------------------------------ */

export function normalizeDistrictList(raw: unknown, state: string): DistrictInfo[] | null {
  const arr = findArray(raw, ['districts', 'data', 'results', 'items', 'records']);
  if (!arr) return null;
  const districts: DistrictInfo[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.trim().length > 0) {
      districts.push({ state, district: item.trim() });
      continue;
    }
    const rec = asRecord(item);
    if (rec) {
      const district = pickString(rec, ['district', 'district_name', 'name', 'title']);
      if (district) districts.push({ state, district });
    }
  }
  return districts.length > 0 ? districts : null;
}

/* ------------------------------------------------------------------ */
/* GET /api/historical/{state}/{district}                              */
/* ------------------------------------------------------------------ */

function normalizeEvent(item: unknown, index: number): HistoricalEvent | null {
  let latitude: number | null = null;
  let longitude: number | null = null;
  let date: string | null = null;
  let label: string | null = null;
  let id: string | null = null;

  const rec = asRecord(item);
  if (rec) {
    latitude = pickNumber(rec, ['latitude', 'lat']);
    longitude = pickNumber(rec, ['longitude', 'lon', 'lng']);
    date = pickString(rec, ['date', 'event_date', 'occurred_on', 'timestamp', 'year']);
    label = pickString(rec, ['location', 'place', 'locality', 'name', 'village', 'town']);
    id = pickString(rec, ['id', 'event_id', 'eventid', 'objectid']);

    // GeoJSON Feature support.
    const geometry = asRecord(rec.geometry);
    if ((latitude === null || longitude === null) && geometry) {
      const coords = geometry.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (isValidLon(lon)) longitude = lon;
        if (isValidLat(lat)) latitude = lat;
      }
    }
    const props = asRecord(rec.properties);
    if (props) {
      if (latitude === null) latitude = pickNumber(props, ['latitude', 'lat']);
      if (longitude === null) longitude = pickNumber(props, ['longitude', 'lon', 'lng']);
      if (date === null) date = pickString(props, ['date', 'event_date', 'occurred_on', 'timestamp', 'year']);
      if (label === null) label = pickString(props, ['location', 'place', 'locality', 'name']);
      if (id === null) id = pickString(props, ['id', 'event_id', 'objectid']);
    }
  }

  if (latitude === null || longitude === null) return null;
  if (!isValidLat(latitude) || !isValidLon(longitude)) return null;

  return {
    id: id ?? `evt-${index}`,
    latitude,
    longitude,
    date,
    label,
  };
}

export function normalizeHistorical(raw: unknown, state: string, district: string): HistoricalSummary {
  const rec = asRecord(raw);
  const eventCount = rec
    ? pickNumber(rec, [
        'event_count',
        'count',
        'total_events',
        'landslide_count',
        'historical_event_count',
        'num_events',
        'inventory_count',
        'total',
      ])
    : null;

  let dateRange: DateRange | null = null;
  if (rec) {
    for (const key of ['date_range', 'period', 'temporal_coverage', 'coverage']) {
      const v = rec[key];
      if (v !== undefined && v !== null) {
        dateRange = normalizeDateRange(v);
        if (dateRange) break;
      }
    }
  }

  const rawEvents = rec ? findArray(rec, ['events', 'records', 'items', 'points', 'landslides', 'data', 'features']) : null;
  const events: HistoricalEvent[] = [];
  if (rawEvents) {
    rawEvents.forEach((item, index) => {
      const evt = normalizeEvent(item, index);
      if (evt) events.push(evt);
    });
  }

  return {
    state,
    district,
    eventCount: eventCount !== null ? eventCount : rawEvents && rawEvents.length > 0 ? rawEvents.length : null,
    dateRange,
    events,
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* GET /api/statistics                                                 */
/* ------------------------------------------------------------------ */

export function normalizeStatistics(raw: unknown): StatisticsSummary {
  const rec = asRecord(raw);

  const totalEvents = rec
    ? pickNumber(rec, ['total_events', 'total', 'total_landslides', 'total_records', 'count', 'event_count'])
    : null;

  let byState: Array<{ state: string; count: number }> | null = null;
  if (rec) {
    for (const key of ['by_state', 'states', 'state_wise', 'per_state', 'state_statistics']) {
      const v = rec[key];
      if (v === undefined || v === null) continue;
      if (asRecord(v)) {
        const entries: Array<{ state: string; count: number }> = [];
        for (const [stateKey, countVal] of Object.entries(v as Record<string, unknown>)) {
          const count = typeof countVal === 'number' ? countVal : Number(countVal);
          if (Number.isFinite(count)) entries.push({ state: stateKey, count });
        }
        if (entries.length > 0) {
          byState = entries.sort((a, b) => b.count - a.count);
          break;
        }
      }
      const arr = findArray(v, []);
      if (arr) {
        const entries: Array<{ state: string; count: number }> = [];
        for (const item of arr) {
          const itemRec = asRecord(item);
          if (!itemRec) continue;
          const state = pickString(itemRec, ['state', 'state_name', 'name', 'state_ut']);
          const count = pickNumber(itemRec, ['count', 'events', 'event_count', 'total', 'value']);
          if (state && count !== null) entries.push({ state, count });
        }
        if (entries.length > 0) {
          byState = entries.sort((a, b) => b.count - a.count);
          break;
        }
      }
    }
  }

  let dateRange: DateRange | null = null;
  if (rec) {
    for (const key of ['date_range', 'period', 'temporal_coverage', 'coverage']) {
      const v = rec[key];
      if (v !== undefined && v !== null) {
        dateRange = normalizeDateRange(v);
        if (dateRange) break;
      }
    }
  }

  return { totalEvents, byState, dateRange, raw };
}

/* ------------------------------------------------------------------ */
/* GET /api/district-risk (and /{state})                               */
/* ------------------------------------------------------------------ */

function normalizeAvailability(rec: Record<string, unknown>): DataAvailability | null {
  for (const key of ['data_availability', 'availability', 'data_coverage', 'coverage', 'layers']) {
    const v = rec[key];
    const vRec = asRecord(v);
    if (vRec) {
      const out: DataAvailability = {};
      for (const [flagKey, flagVal] of Object.entries(vRec)) {
        if (typeof flagVal === 'boolean') out[flagKey] = flagVal;
        else if (flagVal === null) out[flagKey] = null;
        else if (typeof flagVal === 'string') {
          if (/^(true|yes|available|ok|ready|1)$/i.test(flagVal)) out[flagKey] = true;
          else if (/^(false|no|unavailable|missing|0)$/i.test(flagVal)) out[flagKey] = false;
          else out[flagKey] = null;
        } else if (typeof flagVal === 'number') out[flagKey] = flagVal > 0;
        else out[flagKey] = null;
      }
      return out;
    }
  }
  return null;
}

export function normalizeDistrictRiskList(
  raw: unknown,
  fallbackState: string | null,
): DistrictRiskRecord[] | null {
  const arr = findArray(raw, ['districts', 'data', 'results', 'items', 'records', 'risk']);
  if (!arr) return null;
  const out: DistrictRiskRecord[] = [];

  for (const item of arr) {
    const rec = asRecord(item);
    if (!rec) continue;
    const district = pickString(rec, ['district', 'district_name', 'name', 'title']);
    if (!district) continue;
    const state =
      pickString(rec, ['state', 'state_name', 'state_ut', 'region']) ?? fallbackState ?? 'Unknown';

    const inventoryCount = pickNumber(rec, [
      'historical_event_count',
      'inventory_count',
      'event_count',
      'landslide_count',
      'historical_count',
      'count',
      'total_events',
    ]);

    let susceptibility: DistrictRiskRecord['susceptibility'] = null;
    for (const key of ['susceptibility', 'model', 'model_output']) {
      const sRec = asRecord(rec[key]);
      if (sRec) {
        const probability = normalizeProbability(
          pickFirst(sRec, ['probability', 'susceptibility_probability', 'p_landslide', 'value', 'score']),
        );
        const category = normalizeCategory(
          pickFirst(sRec, ['category', 'risk_category', 'susceptibility_category', 'level', 'class', 'label']),
        );
        if (probability !== null || category !== null) {
          susceptibility = { probability, category };
          break;
        }
      }
    }
    if (!susceptibility) {
      const probability = normalizeProbability(
        pickFirst(rec, [
          'susceptibility_probability',
          'susceptibility',
          'probability',
          'risk_probability',
          'p_landslide',
        ]),
      );
      const category = normalizeCategory(
        pickFirst(rec, [
          'susceptibility_category',
          'risk_category',
          'category',
          'risk_level',
          'susceptibility_level',
        ]),
      );
      if (probability !== null || category !== null) susceptibility = { probability, category };
    }

    out.push({
      state,
      district,
      inventoryCount,
      susceptibility,
      availability: normalizeAvailability(rec),
      raw: rec,
    });
  }

  return out.length > 0 ? out : null;
}
