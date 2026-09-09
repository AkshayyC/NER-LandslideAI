/**
 * Static reference data for the target region.
 *
 * Source: README.md / docs/data_sources.md — the eight states of the
 * Northeastern Region (NER) of India. This is the project's declared region of
 * interest, not scientific data.
 *
 * `approxCenter` values are approximate geographic centers of each state used
 * ONLY as map navigation reference markers. They are NOT landslide inventory
 * points and must never be presented as data.
 */

export interface NerState {
  name: string;
  code: string;
  approxCenter: [number, number]; // [lat, lon] — navigation reference only
}

export const NER_STATES: NerState[] = [
  { name: 'Arunachal Pradesh', code: 'AR', approxCenter: [28.2, 94.7] },
  { name: 'Assam', code: 'AS', approxCenter: [26.2, 92.9] },
  { name: 'Manipur', code: 'MN', approxCenter: [24.7, 93.9] },
  { name: 'Meghalaya', code: 'ML', approxCenter: [25.5, 91.4] },
  { name: 'Mizoram', code: 'MZ', approxCenter: [23.2, 92.9] },
  { name: 'Nagaland', code: 'NL', approxCenter: [26.1, 94.5] },
  { name: 'Sikkim', code: 'SK', approxCenter: [27.6, 88.5] },
  { name: 'Tripura', code: 'TR', approxCenter: [23.8, 91.7] },
];

/** Rough bounding box of the NER (lat/lon) used to frame the map. */
export const NER_BBOX: [[number, number], [number, number]] = [
  [21.7, 87.9], // southwest
  [28.7, 97.6], // northeast
];

/** Broad region-of-interest band shown as a hint in the Location Analysis form. */
export const NER_LAT_RANGE: [number, number] = [21.7, 28.7];
export const NER_LON_RANGE: [number, number] = [87.9, 97.6];

/** Basemap tiles (CARTO dark, built on OpenStreetMap data). */
export const BASEMAP_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';
