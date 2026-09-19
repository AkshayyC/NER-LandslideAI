/**
 * RegionMap — the console's map.
 *
 * There are no raster tiles: the base is the generalised region outline served
 * by the API, plus a graticule. That keeps the console working on a network with
 * no access to external map services. The hazard grid arrives as one row-major
 * array and is painted into a canvas at one pixel per cell, so ~20,000 cells
 * cost a single image overlay rather than 20,000 shapes.
 */
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import {
  ImageOverlay,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { NER_BBOX, NER_CENTER, NER_DEFAULT_ZOOM } from '../../constants/region';
import { rampForField } from '../../utils/mapColors';
import type { CorridorSummary, EventRecord, GridField, LatLon } from '../../types/api';

export type OutlinePolygon = Array<[number, number]>;

export interface HighlightPoint {
  label: string;
  latitude: number;
  longitude: number;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function hqIcon(name: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="hq-marker"></span><span class="hq-marker__label">${escapeHtml(name)}</span>`,
    iconSize: [5, 5],
    iconAnchor: [2.5, 2.5],
  });
}

function eventIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<span class="event-marker"></span>',
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}

function pickIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<span class="pick-marker"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function highlightIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<span class="highlight-marker"></span>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function ClickCatcher({ onPick }: { onPick?: (p: LatLon) => void }) {
  useMapEvents({
    click(event) {
      onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function ViewController({ focus, bounds }: { focus?: LatLon | null; bounds?: [[number, number], [number, number]] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView([focus.latitude, focus.longitude], Math.max(map.getZoom(), 9));
  }, [focus, map]);
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] });
  }, [bounds, map]);
  return null;
}

/** Paint a grid layer into a data URL, one pixel per cell, north side first. */
function paintGrid(field: GridField, opacity: number): { url: string; bounds: [[number, number], [number, number]] } | null {
  const { rows, cols, values } = field;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(cols, rows);
  const ramp = rampForField(field.field);
  const data = image.data;

  for (let row = 0; row < rows; row += 1) {
    // Grid row 0 is the southern edge; canvas row 0 must be the northern one.
    const sourceRow = rows - 1 - row;
    for (let col = 0; col < cols; col += 1) {
      const index = (row * cols + col) * 4;
      const value = values[sourceRow * cols + col];
      if (value === null || value === undefined || !Number.isFinite(value)) {
        data[index + 3] = 0;
        continue;
      }
      const hex = ramp.colorFor(value);
      const n = parseInt(hex.slice(1), 16);
      data[index] = (n >> 16) & 255;
      data[index + 1] = (n >> 8) & 255;
      data[index + 2] = n & 255;
      data[index + 3] = Math.round(255 * opacity);
    }
  }

  ctx.putImageData(image, 0, 0);
  return {
    url: canvas.toDataURL('image/png'),
    bounds: [
      [field.lat0 - field.dlat / 2, field.lon0 - field.dlon / 2],
      [field.lat0 + (rows - 0.5) * field.dlat, field.lon0 + (cols - 0.5) * field.dlon],
    ],
  };
}

interface RegionMapProps {
  field?: GridField | null;
  outline: OutlinePolygon[];
  corridors?: CorridorSummary[];
  events?: EventRecord[];
  headquarters?: Array<{ name: string; latitude: number; longitude: number }>;
  picked?: LatLon | null;
  highlight?: HighlightPoint[];
  focus?: LatLon | null;
  onPick?: (point: LatLon) => void;
  showGrid?: boolean;
  className?: string;
}

export function RegionMap({
  field = null,
  outline,
  corridors = [],
  events = [],
  headquarters = [],
  picked = null,
  highlight = [],
  focus = null,
  onPick,
  showGrid = true,
  className = '',
}: RegionMapProps) {
  const grid = useMemo(
    () => (field && showGrid ? paintGrid(field, 0.82) : null),
    [field, showGrid],
  );

  return (
    <div className={`map-wrap ${className}`.trim()}>
      <MapContainer
        center={NER_CENTER}
        zoom={NER_DEFAULT_ZOOM}
        minZoom={5}
        maxZoom={13}
        bounds={NER_BBOX}
        boundsOptions={{ padding: [16, 16] }}
        attributionControl={false}
        zoomControl
        preferCanvas
      >
        <ClickCatcher onPick={onPick} />
        <ViewController focus={focus} bounds={grid ? grid.bounds : null} />

        {outline.map((ring, index) => (
          <Polygon
            key={`outline-${index}`}
            positions={ring}
            pathOptions={{ color: '#3a4a5e', weight: 1, fill: true, fillColor: '#0d131c', fillOpacity: 0.85 }}
          />
        ))}

        {grid && <ImageOverlay url={grid.url} bounds={grid.bounds} opacity={0.85} />}

        {corridors.map((corridor) => (
          <Polyline
            key={corridor.id}
            positions={corridor.waypoints.map((w) => [w.latitude, w.longitude] as [number, number])}
            pathOptions={{
              color: corridor.criticality >= 3 ? '#7fd4ff' : '#4c8fb0',
              weight: corridor.criticality >= 3 ? 2.4 : 1.6,
              opacity: 0.9,
              dashArray: corridor.mode === 'rail' ? '4 3' : undefined,
            }}
          >
            <Tooltip sticky>{corridor.name}</Tooltip>
          </Polyline>
        ))}

        {headquarters.map((hq) => (
          <Marker
            key={`${hq.name}-${hq.latitude}-${hq.longitude}`}
            position={[hq.latitude, hq.longitude]}
            icon={hqIcon(hq.name)}
            interactive={false}
          />
        ))}

        {events.map((event) => (
          <Marker key={event.id} position={[event.latitude, event.longitude]} icon={eventIcon()}>
            <Tooltip>
              <strong>{event.date}</strong> — {event.place}
              <br />
              {event.trigger}
            </Tooltip>
          </Marker>
        ))}

        {highlight.map((point) => (
          <Marker key={`${point.label}-${point.latitude}`} position={[point.latitude, point.longitude]} icon={highlightIcon()}>
            <Tooltip>{point.label}</Tooltip>
          </Marker>
        ))}

        {picked && <Marker position={[picked.latitude, picked.longitude]} icon={pickIcon()} />}
      </MapContainer>
    </div>
  );
}
