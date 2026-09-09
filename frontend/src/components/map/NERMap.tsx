/**
 * NERMap — the core Leaflet map for Northeast India.
 *
 * Design honesty rules enforced here:
 * - Reference markers are approximate STATE CENTERS used for navigation only.
 *   They are clearly styled + labelled and never mixed with data points.
 * - Inventory points are rendered ONLY when the backend returned real records.
 * - A picked location is the user's own map click — displayed as-is.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { BASEMAP_ATTRIBUTION, BASEMAP_URL, NER_BBOX, NER_STATES } from '../../constants/region';
import type { HistoricalEvent, LatLon } from '../../types/api';

export type { LatLon };

/* --------------------------- icon factory --------------------------- */

function referenceIcon(name: string, code: string): L.DivIcon {
  return L.divIcon({
    className: 'ref-marker-wrap',
    html:
      `<span class="ref-marker" aria-hidden="true"></span>` +
      `<span class="ref-marker__label"><b>${code}</b>${escapeHtml(name)}</span>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function inventoryIcon(): L.DivIcon {
  return L.divIcon({
    className: 'inv-marker-wrap',
    html: '<span class="inv-marker" aria-hidden="true"></span>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function pickIcon(): L.DivIcon {
  return L.divIcon({
    className: 'pick-marker-wrap',
    html: '<span class="pick-marker" aria-hidden="true"></span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/* ------------------------------ helpers ------------------------------ */

function FitBounds({ boundsKey }: { boundsKey: string }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(NER_BBOX, { padding: [18, 18] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, map]);
  return null;
}

function FitPoints({ points, boundsKey }: { points: LatLon[]; boundsKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, map]);
  return null;
}

interface MapEventsProps {
  onPick?: (p: LatLon) => void;
  onHover?: (p: LatLon | null) => void;
}

function MapEvents({ onPick, onHover }: MapEventsProps) {
  const lastHover = useRef(0);
  useMapEvents({
    click(e) {
      onPick?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
    mousemove(e) {
      if (!onHover) return;
      const now = Date.now();
      if (now - lastHover.current < 90) return;
      lastHover.current = now;
      onHover({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
    mouseout() {
      onHover?.(null);
    },
  });
  return null;
}


/* ------------------------------- props ------------------------------- */

interface NERMapProps {
  /** Approximate state-center navigation markers (built-in region reference). */
  referenceMarkers?: boolean;
  /** Real inventory points returned by the backend. */
  inventoryPoints?: HistoricalEvent[];
  /** The user's picked/inspected location. */
  pickPoint?: LatLon | null;
  onPick?: (p: LatLon) => void;
  onHover?: (p: LatLon | null) => void;
  /** Change to re-fit the view to the current content. */
  boundsKey?: string;
  className?: string;
  children?: React.ReactNode;
}

export function NERMap({
  referenceMarkers = false,
  inventoryPoints = [],
  pickPoint = null,
  onPick,
  onHover,
  boundsKey = 'default',
  className = '',
  children,
}: NERMapProps) {
  return (
    <div className={`map-shell ${className}`.trim()}>
      <MapContainer
        bounds={NER_BBOX}
        boundsOptions={{ padding: [18, 18] }}
        minZoom={5}
        maxZoom={17}
        zoomControl={true}
        scrollWheelZoom
        className="map-canvas"
        attributionControl
      >
        <TileLayer url={BASEMAP_URL} attribution={BASEMAP_ATTRIBUTION} subdomains="abcd" />
        <FitBounds boundsKey={`${boundsKey}#init`} />
        {inventoryPoints.length > 0 && <FitPoints points={inventoryPoints} boundsKey={`${boundsKey}#pts`} />}
        <MapEvents onPick={onPick} onHover={onHover} />

        {referenceMarkers &&
          NER_STATES.map((s) => (
            <Marker
              key={`ref-${s.code}`}
              position={s.approxCenter}
              icon={referenceIcon(s.name, s.code)}
              keyboard={false}
              title={`${s.name} — reference center (navigation aid, not a data point)`}
            />
          ))}

        {inventoryPoints.map((evt, i) => (
          <Marker
            key={`inv-${evt.id}-${i}`}
            position={[evt.latitude, evt.longitude]}
            icon={inventoryIcon()}
            keyboard={false}
            title={
              evt.label
                ? `Historical inventory record — ${evt.label}`
                : 'Historical inventory record (backend data)'
            }
          >
            {/* Tooltip kept minimal: only backend-provided fields are shown. */}
          </Marker>
        ))}

        {pickPoint && (
          <Marker position={[pickPoint.latitude, pickPoint.longitude]} icon={pickIcon()} keyboard={false} />
        )}
        {children}
      </MapContainer>
    </div>
  );
}
