import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Crosshair, MapPin, Search } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { ProbabilityGauge } from '../components/common/ProbabilityGauge';
import { EmptyState, ErrorState, LoadingRows, NoticeBanner, OfflineNotice, Spinner } from '../components/common/states';
import { NERMap } from '../components/map/NERMap';
import { MapLegend } from '../components/map/MapLegend';
import { useApiData } from '../hooks/useApiData';
import { useStates } from '../hooks/useStates';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getDistricts, getHistorical, getSusceptibility } from '../services/api';
import { formatCoord, formatShortDate } from '../utils/format';
import type { LatLon, SusceptibilityResult } from '../types/api';

/** MODULE 02 — interactive risk map. State → district navigation, map click
 * inspection, real inventory points when the backend serves them. */
export function RiskMapPage() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const { states, source: stateSource } = useStates();

  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [picked, setPicked] = useState<LatLon | null>(null);
  const [hover, setHover] = useState<LatLon | null>(null);
  const [inspection, setInspection] = useState<SusceptibilityResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  const districts = useApiData(
    (signal) => (stateName ? getDistricts(stateName, signal) : Promise.resolve(null)),
    [stateName, online],
    { enabled: online && stateName !== '' },
  );

  const historical = useApiData(
    (signal) =>
      stateName && districtName ? getHistorical(stateName, districtName, signal) : Promise.resolve(null),
    [stateName, districtName, online],
    { enabled: online && stateName !== '' && districtName !== '' },
  );

  const inventoryPoints = useMemo(() => historical.data?.events ?? [], [historical.data]);

  async function inspect() {
    if (!picked || !online) return;
    setInspecting(true);
    setInspectionError(null);
    setInspection(null);
    try {
      const result = await getSusceptibility(picked.latitude, picked.longitude);
      setInspection(result);
    } catch (err) {
      setInspectionError(err instanceof Error ? err.message : 'Susceptibility query failed.');
    } finally {
      setInspecting(false);
    }
  }

  function reset() {
    setStateName('');
    setDistrictName('');
  }

  return (
    <div className="page page--tall">
      <PageHeader
        module="02"
        kicker="RISK MAP"
        title="Interactive map — Northeast India"
        description="Select a state and district, inspect any location with a map click, and view historical inventory points the moment the backend serves them."
        tags={
          <>
            <DataClassTag dc="historical" state={online ? 'live' : 'offline'} />
            <DataClassTag dc="susceptibility" state={online ? 'live' : 'offline'} />
          </>
        }
      />

      <div className="map-page">
        <Panel
          variant="map"
          kicker="GEOGRAPHIC VIEW"
          title="NER susceptibility & inventory map"
          className="map-page__map"
          tools={
            <span className="chip mono">
              {hover ? `${hover.latitude.toFixed(4)}, ${hover.longitude.toFixed(4)}` : 'move cursor for coordinates'}
            </span>
          }
        >
          <NERMap
            referenceMarkers={inventoryPoints.length === 0}
            inventoryPoints={inventoryPoints}
            pickPoint={picked}
            onPick={setPicked}
            onHover={setHover}
            boundsKey={`${stateName}|${districtName}|${inventoryPoints.length}`}
          />
          <MapLegend inventoryCount={inventoryPoints.length > 0 ? inventoryPoints.length : null} />
        </Panel>

        <div className="map-rail">
          <Panel kicker="REGION SELECTION" title="State → District">
            {!online ? (
              <OfflineNotice compact />
            ) : (
              <>
                <label className="field">
                  <span className="field__label">State</span>
                  <select
                    className="input"
                    value={stateName}
                    onChange={(e) => {
                      setStateName(e.target.value);
                      setDistrictName('');
                    }}
                  >
                    <option value="">— select state —</option>
                    {states.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {stateSource === 'builtin' && (
                    <span className="field__hint">Built-in region list (GET /api/states unavailable)</span>
                  )}
                </label>

                <label className="field">
                  <span className="field__label">District</span>
                  <select
                    className="input"
                    value={districtName}
                    disabled={!stateName || districts.loading || !districts.data || districts.data.length === 0}
                    onChange={(e) => setDistrictName(e.target.value)}
                  >
                    <option value="">
                      {!stateName
                        ? '— select a state first —'
                        : districts.loading
                          ? 'loading districts…'
                          : !districts.data || districts.data.length === 0
                            ? '— no district list from backend —'
                            : '— select district —'}
                    </option>
                    {(districts.data ?? []).map((d) => (
                      <option key={d.district} value={d.district}>
                        {d.district}
                      </option>
                    ))}
                  </select>
                  <span className="field__hint">
                    District lists come from <span className="mono">GET /api/districts/{'{state}'}</span>
                  </span>
                </label>

                {(stateName || districtName) && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={reset}>
                    Clear selection
                  </button>
                )}
              </>
            )}
          </Panel>

          <Panel
            kicker="INVENTORY LAYER"
            title="Historical landslide points"
            tools={<DataClassTag dc="historical" />}
          >
            {!online ? (
              <OfflineNotice compact />
            ) : !stateName || !districtName ? (
              <EmptyState
                icon={<MapPin size={18} />}
                title="No district selected"
                hint="Choose a state and district to load its historical inventory points."
                compact
              />
            ) : historical.loading ? (
              <LoadingRows label={`Loading inventory for ${districtName}…`} />
            ) : historical.error ? (
              <ErrorState error={historical.error} onRetry={historical.refetch} compact />
            ) : historical.data && historical.data.events.length > 0 ? (
              <div className="inv-summary">
                <div className="inv-summary__count mono">{historical.data.eventCount ?? historical.data.events.length}</div>
                <div className="inv-summary__label">
                  inventory records for {districtName}
                  {historical.data.events.length !== (historical.data.eventCount ?? historical.data.events.length) && (
                    <> · {historical.data.events.length} with plottable coordinates</>
                  )}
                </div>
                {historical.data.dateRange && (
                  <div className="inv-summary__range mono">
                    {formatShortDate(historical.data.dateRange.start)} → {formatShortDate(historical.data.dateRange.end)}
                  </div>
                )}
              </div>
            ) : (
              <div className="no-inventory-note">
                <span className="no-inventory-badge">NO INVENTORY DATA</span>
                <p>
                  The backend returned no plottable landslide records for {districtName}. Absence of
                  inventory records is <strong>not</strong> evidence of low risk — it may reflect survey
                  coverage.
                </p>
              </div>
            )}
          </Panel>

          <Panel kicker="LOCATION INSPECTOR" title="Susceptibility at a point">
            <div className="inspect-coords mono">
              <Crosshair size={14} aria-hidden="true" />
              {picked ? formatCoord(picked.latitude, picked.longitude, 5) : 'click anywhere on the map'}
            </div>
            {picked && (
              <div className="inspect-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() => void inspect()}
                  disabled={!online || inspecting}
                >
                  {inspecting ? <Spinner size={13} /> : <Search size={13} />} Run susceptibility
                </button>
                <Link
                  className="btn btn--ghost btn--small"
                  to={`/location?lat=${picked.latitude.toFixed(6)}&lon=${picked.longitude.toFixed(6)}`}
                >
                  Open in Location Analysis <ArrowRight size={13} />
                </Link>
              </div>
            )}
            {!online && (
              <div className="panel-footnote">
                Susceptibility queries need the backend (<span className="mono">GET /api/susceptibility/{'{lat}'}/{'{lon}'}</span>).
              </div>
            )}
            {inspectionError && (
              <div className="error-state error-state--compact">
                <div className="error-state__title">{inspectionError}</div>
              </div>
            )}
            {inspection && (
              <div className="inspect-result">
                <ProbabilityGauge probability={inspection.probability} category={inspection.category} />
                {inspection.probability === null && inspection.category === null && (
                  <EmptyState
                    compact
                    title="No susceptibility fields recognised"
                    hint="The backend responded but did not include a parseable probability or category."
                  />
                )}
                {inspection.modelVersion && (
                  <div className="panel-footnote mono">model: {inspection.modelVersion}</div>
                )}
              </div>
            )}
          </Panel>

          <NoticeBanner tone="info" title="Reading the map">
            Shading-free basemap by design: with no district polygons served yet, the console renders
            point-based information only and refuses to imply areal coverage it does not have.
          </NoticeBanner>
        </div>
      </div>
    </div>
  );
}
