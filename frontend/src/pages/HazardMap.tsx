import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { StatCard } from '../components/common/StatCard';
import { KeyValue } from '../components/common/KeyValue';
import { RegionMap } from '../components/map/RegionMap';
import { MapLegend } from '../components/map/MapLegend';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getCorridors, getEvents, getGrid, getGridDelta, getMeta, getOutline } from '../services/api';
import type { LatLon } from '../types/api';
import { formatIndex } from '../utils/format';

const LAYERS = [
  { id: 'susceptibility', label: 'Susceptibility', dc: 'susceptibility' as const },
  { id: 'risk', label: 'Risk now', dc: 'current' as const },
  { id: 'risk_forward', label: 'Risk forward', dc: 'current' as const },
  { id: 'risk_delta', label: 'Risk change', dc: 'trigger' as const },
  { id: 'uncertainty', label: 'Uncertainty', dc: 'susceptibility' as const },
  { id: 'elevation', label: 'Elevation', dc: 'susceptibility' as const },
  { id: 'evidence', label: 'Recorded evidence', dc: 'historical' as const },
];

/** Module 02 — the hazard surface, layer by layer. */
export function HazardMap() {
  const navigate = useNavigate();
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [layer, setLayer] = useState('risk');
  const [picked, setPicked] = useState<LatLon | null>(null);
  const [showCorridors, setShowCorridors] = useState(true);
  const [showEvents, setShowEvents] = useState(false);

  const meta = useApiData(online ? (s) => getMeta(s) : null, [], { enabled: online });
  const outline = useApiData(online ? (s) => getOutline(s) : null, [], { enabled: online });
  const corridors = useApiData(online ? (s) => getCorridors(s) : null, [], { enabled: online });
  const events = useApiData(online ? (s) => getEvents(undefined, s) : null, [], { enabled: online });
  const grid = useApiData(online ? (s) => getGrid(layer, s) : null, [layer], { enabled: online });
  const delta = useApiData(online ? (s) => getGridDelta(s) : null, [], { enabled: online });

  const outlinePolys = useMemo(
    () => (outline.data?.polygons ?? []).map((ring) => ring.map(([lon, lat]) => [lat, lon] as [number, number])),
    [outline.data],
  );

  const active = LAYERS.find((item) => item.id === layer) ?? LAYERS[0];
  const stats = grid.data?.stats;

  return (
    <div className="stack">
      <PageHeader
        module="02"
        kicker="Hazard surface"
        title="Hazard Map"
        description="The modelled surface over all 130 districts, drawn from the grid the API serves. Every layer carries its own provenance line — live, modelled or reference data."
        tags={
          <>
            <DataClassTag dc={active.dc} state="live" stateLabel={layer.replace(/_/g, ' ').toUpperCase()} />
            {meta.data && (
              <span className="chip mono">
                {meta.data.grid.cells_in_region.toLocaleString('en-IN')} cells · {meta.data.grid.resolution_deg}° ·{' '}
                {meta.data.grid.cell_area_km2} km²
              </span>
            )}
          </>
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          <div className="map-layers">
            <span className="map-layers__label">Layer</span>
            <div className="seg seg--wrap">
              {LAYERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`seg__btn ${item.id === layer ? 'is-active' : ''}`}
                  onClick={() => setLayer(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="map-layers__toggles">
              <label className="check">
                <input type="checkbox" checked={showCorridors} onChange={(e) => setShowCorridors(e.target.checked)} /> Lifelines
              </label>
              <label className="check">
                <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} /> Events
              </label>
            </div>
          </div>

          <div className="grid-4">
            <StatCard
              label={grid.data?.label ?? 'Layer'}
              value={stats ? formatIndex(stats.mean) : '—'}
              sub="regional mean"
              accent="var(--c-susceptibility)"
            />
            <StatCard label="90th percentile" value={stats ? formatIndex(stats.p90) : '—'} sub="top decile" />
            <StatCard label="Maximum" value={stats ? formatIndex(stats.max) : '—'} sub="highest single cell" />
            <StatCard
              label="Cells in region"
              value={stats ? stats.count.toLocaleString('en-IN') : '—'}
              sub={stats ? `min ${formatIndex(stats.min)}` : undefined}
            />
          </div>

          <div className="map-layout">
            <Panel flush variant="map" className="map-panel">
              {grid.loading && (
                <div className="map-panel__placeholder">
                  <LoadingRows rows={4} label={`Loading ${active.label.toLowerCase()} layer`} />
                </div>
              )}
              {grid.error && <div className="map-panel__placeholder"><ErrorState error={grid.error} onRetry={grid.refetch} /></div>}
              {!grid.loading && !grid.error && (
                <div className="map-panel__canvas">
                  <RegionMap
                    field={grid.data}
                    outline={outlinePolys}
                    corridors={showCorridors ? corridors.data ?? [] : []}
                    events={showEvents ? events.data ?? [] : []}
                    picked={picked}
                    onPick={setPicked}
                  />
                  <MapLegend field={layer} fieldLabel={grid.data?.label ?? active.label} note={grid.data?.field_meaning} />
                </div>
              )}
            </Panel>

            <aside className="map-rail stack">
              <Panel kicker="Layer" title={active.label}>
                {grid.loading && <LoadingRows rows={3} label="Reading layer" />}
                {grid.data && <p className="prose">{grid.data.field_meaning}</p>}
                {layer === 'risk_delta' && delta.data && (
                  <KeyValue
                    items={[
                      { key: 'Mean change', value: formatIndex(delta.data.stats.mean) },
                      { key: 'Largest rise', value: formatIndex(delta.data.stats.max) },
                    ]}
                  />
                )}
              </Panel>

              <Panel kicker="Inspect" title={picked ? 'Selected coordinate' : 'Click the map'}>
                {picked ? (
                  <>
                    <KeyValue
                      items={[
                        { key: 'Latitude', value: picked.latitude.toFixed(4) },
                        { key: 'Longitude', value: picked.longitude.toFixed(4) },
                      ]}
                    />
                    <p className="prose dim small">
                      The layer value at a coordinate is computed by the backend, not read off the pixels. Open the full
                      analysis to see it decomposed.
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() =>
                        navigate(`/location?lat=${picked.latitude.toFixed(4)}&lon=${picked.longitude.toFixed(4)}`)
                      }
                    >
                      Compare in Location Analysis →
                    </button>
                  </>
                ) : (
                  <p className="prose dim">
                    Click anywhere on the map to pick a coordinate. The point marker is a read-out aid; every number
                    comes from the API.
                  </p>
                )}
              </Panel>

              <Panel kicker="Rainfall mode" title="What the risk layers assume">
                <KeyValue
                  items={[
                    { key: 'Mode', value: meta.data?.rainfall_status.mode ?? '—' },
                    { key: 'Provider', value: meta.data?.rainfall_status.provider ?? '—' },
                    { key: 'Last success', value: meta.data?.rainfall_status.last_success ?? 'never reached' },
                    { key: 'Scenario multiplier', value: meta.data ? `×${meta.data.scenario_multiplier}` : '—' },
                  ]}
                />
                <div className="data-note">
                  {meta.data?.rainfall_status.mode === 'live'
                    ? 'Risk-now layers use the observed 72-hour rainfall; forward layers add the forecast.'
                    : 'No live feed is reachable, so risk layers use the local climatological window and forward layers apply the scenario multiplier to it.'}
                </div>
              </Panel>

              <Panel kicker="Elsewhere" title="Continue">
                <div className="row">
                  <Link className="row-button" to="/watchlist">
                    Watchlist →
                  </Link>
                  <Link className="row-button" to="/lifelines">
                    Lifelines →
                  </Link>
                  <Link className="row-button" to="/model">
                    Model card →
                  </Link>
                </div>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
