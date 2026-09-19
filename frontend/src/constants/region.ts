/**
 * Geographic constants for the North Eastern Region.
 *
 * The map draws a vector base (region outline + district headquarters read
 * from the API) instead of fetching raster tiles, so the console works on a
 * network with no access to external map services and never shows a broken
 * grey tile grid.
 */

/** [south, west] x [north, east] of the modelled envelope, from the backend. */
export const NER_BBOX: [[number, number], [number, number]] = [
  [21.8, 87.9],
  [29.6, 97.6],
];

/** Map view used when a page has nothing specific to frame. */
export const NER_CENTER: [number, number] = [25.9, 93.2];
export const NER_DEFAULT_ZOOM = 6;

export interface StateAnchor {
  code: string;
  name: string;
  /** Approximate administrative centre — a navigation aid, never a data point. */
  latitude: number;
  longitude: number;
}

export const STATE_ANCHORS: StateAnchor[] = [
  { code: 'AR', name: 'Arunachal Pradesh', latitude: 27.9, longitude: 94.6 },
  { code: 'AS', name: 'Assam', latitude: 26.3, longitude: 92.6 },
  { code: 'MN', name: 'Manipur', latitude: 24.7, longitude: 93.9 },
  { code: 'ML', name: 'Meghalaya', latitude: 25.5, longitude: 91.2 },
  { code: 'MZ', name: 'Mizoram', latitude: 23.3, longitude: 92.9 },
  { code: 'NL', name: 'Nagaland', latitude: 26.1, longitude: 94.5 },
  { code: 'SK', name: 'Sikkim', latitude: 27.5, longitude: 88.5 },
  { code: 'TR', name: 'Tripura', latitude: 23.8, longitude: 91.6 },
];

/** Grid envelope limits, as [lat, lon] pairs used by Leaflet. */
export const ENVELOPE_BOUNDS: [[number, number], [number, number]] = [
  [21.82, 87.92],
  [29.58, 97.58],
];
