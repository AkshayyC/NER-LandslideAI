/**
 * One function per API endpoint. Nothing is transformed on the way in: the
 * shapes returned by the backend are the shapes the UI renders.
 */
import { request } from './client';
import type {
  Briefing,
  CorridorDetail,
  CorridorSummary,
  DistrictDetail,
  DistrictSummary,
  EventRecord,
  GridField,
  Health,
  Meta,
  Methodology,
  OutlineResponse,
  PointAnalysis,
  Statistics,
  Watchlist,
} from '../types/api';

/* -- system --------------------------------------------------------- */

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request<Health>('/api/health', { signal, timeoutMs: 8000 });
}

export function getMeta(signal?: AbortSignal): Promise<Meta> {
  return request<Meta>('/api/meta', { signal });
}

export function getMethodology(signal?: AbortSignal): Promise<Methodology> {
  return request<Methodology>('/api/methodology', { signal });
}

export function getStats(signal?: AbortSignal): Promise<Statistics> {
  return request<Statistics>('/api/stats', { signal });
}

/** Generalised region outline — the map base, so no tile server is needed. */
export function getOutline(signal?: AbortSignal): Promise<OutlineResponse> {
  return request<OutlineResponse>('/api/outline', { signal });
}

/* -- point analysis ------------------------------------------------- */

export function getPoint(
  latitude: number,
  longitude: number,
  scenario?: number,
  signal?: AbortSignal,
): Promise<PointAnalysis> {
  const params = new URLSearchParams({
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
  });
  if (scenario !== undefined) params.set('scenario', String(scenario));
  return request<PointAnalysis>(`/api/point?${params.toString()}`, { signal });
}

/* -- grid layers ---------------------------------------------------- */

export function getGrid(field: string, signal?: AbortSignal): Promise<GridField> {
  return request<GridField>(`/api/grid?field=${encodeURIComponent(field)}`, {
    signal,
    timeoutMs: 30000,
  });
}

export function getGridDelta(signal?: AbortSignal): Promise<GridField> {
  return request<GridField>('/api/grid/delta', { signal, timeoutMs: 30000 });
}

/* -- districts and lifelines ---------------------------------------- */

export function getDistricts(state?: string, signal?: AbortSignal): Promise<DistrictSummary[]> {
  const suffix = state ? `?state=${encodeURIComponent(state)}` : '';
  return request<{ count: number; districts: DistrictSummary[] }>(
    `/api/districts${suffix}`,
    { signal },
  ).then((payload) => payload.districts);
}

export function getDistrictDetail(
  state: string,
  district: string,
  signal?: AbortSignal,
): Promise<DistrictDetail> {
  return request<DistrictDetail>(
    `/api/districts/${encodeURIComponent(state)}/${encodeURIComponent(district)}`,
    { signal },
  );
}

export function getCorridors(signal?: AbortSignal): Promise<CorridorSummary[]> {
  return request<{ count: number; corridors: CorridorSummary[] }>('/api/corridors', {
    signal,
  }).then((payload) => payload.corridors);
}

export function getCorridor(id: string, signal?: AbortSignal): Promise<CorridorDetail> {
  return request<CorridorDetail>(`/api/corridors/${encodeURIComponent(id)}`, { signal });
}

/* -- watchlist, evidence, briefing ---------------------------------- */

export function getWatchlist(limit = 12, signal?: AbortSignal): Promise<Watchlist> {
  return request<Watchlist>(`/api/watchlist?limit=${limit}`, { signal });
}

export function getEvents(state?: string, signal?: AbortSignal): Promise<EventRecord[]> {
  const suffix = state ? `?state=${encodeURIComponent(state)}` : '';
  return request<{ count: number; events: EventRecord[] }>(`/api/events${suffix}`, {
    signal,
  }).then((payload) => payload.events);
}

export function getBriefing(
  scope: 'region' | 'district' | 'point',
  signal?: AbortSignal,
): Promise<Briefing> {
  return request<Briefing>(`/api/briefing?scope=${scope}`, { signal });
}
