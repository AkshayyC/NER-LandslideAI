import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crosshair, MapPin } from 'lucide-react';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { AttributionBars } from '../components/common/AttributionBars';
import { ThresholdTable } from '../components/common/ThresholdTable';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { KeyValue } from '../components/common/KeyValue';
import { RegionMap } from '../components/map/RegionMap';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getBriefing, getOutline, getPoint } from '../services/api';
import { NER_BBOX } from '../constants/region';
import { formatIndex, formatKm, formatMm } from '../utils/format';

const PRESETS = [
  { name: 'Gangtok', lat: 27.33, lon: 88.61 },
  { name: 'Sohra', lat: 25.27, lon: 91.73 },
  { name: 'Kohima', lat: 25.67, lon: 94.11 },
  { name: 'Lunglei', lat: 22.89, lon: 92.73 },
  { name: 'Tawang', lat: 27.59, lon: 91.86 },
  { name: 'Aizawl', lat: 23.73, lon: 92.72 },
  { name: 'Anini', lat: 28.80, lon: 95.90 },
  { name: 'Guwahati', lat: 26.14, lon: 91.74 },
];

/** Module 03 — one coordinate, decomposed to the unit. */
export function LocationAnalysis() {
  const [params, setParams] = useSearchParams();
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';

  const latParam = params.get('lat');
  const lonParam = params.get('lon');
  const [lat, setLat] = useState(latParam ?? '27.33');
  const [lon, setLon] = useState(lonParam ?? '88.61');
  const [scenario, setScenario] = useState('');

  useEffect(() => {
    if (latParam) setLat(latParam);
    if (lonParam) setLon(lonParam);
  }, [latParam, lonParam]);

  const latitude = Number(lat);
  const longitude = Number(lon);
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(scenario === '' ? 0 : Number(scenario));

  const point = useApiData(
    online && valid ? (s) => getPoint(latitude, longitude, scenario === '' ? undefined : Number(scenario), s) : null,
    [latitude, longitude, scenario],
    { enabled: online && valid },
  );
  const briefing = useApiData(
    online && valid ? (s) => getBriefing('point', s) : null,
    [latitude, longitude, scenario, point.data !== null],
    { enabled: online && valid && point.data !== null },
  );
  const outline = useApiData(online ? (s) => getOutline(s) : null, [], { enabled: online });

  const outlinePolys = useMemo(
    () => (outline.data?.polygons ?? []).map((ring) => ring.map(([lpLon, lpLat]) => [lpLat, lpLon] as [number, number])),
    [outline.data],
  );

  const apply = (nextLat: number, nextLon: number) => {
    setLat(nextLat.toFixed(4));
    setLon(nextLon.toFixed(4));
    setParams({ lat: nextLat.toFixed(4), lon: nextLon.toFixed(4) });
  };

  const analysis = point.data;

  return (
    <div className="stack">
      <PageHeader
        module="03"
        kicker="Point analysis"
        title="Location Analysis"
        description="One coordinate, fully decomposed: what the terrain is, how much each factor contributed to the index, how much rain the slope needs to change class, and how much the answer could move."
        tags={
          analysis ? (
            <>
              <SeverityBadge category={analysis.susceptibility.class} />
              <DataClassTag dc="trigger" state="live" stateLabel="THRESHOLDS" />
              <span className="chip mono">
                <MapPin size={11} aria-hidden="true" /> {analysis.location.district.district},{' '}
                {analysis.location.district.state}
              </span>
            </>
          ) : null
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          <Panel kicker="Coordinate" title="Inspect any point in the modelled region" className="coord-panel">
            <div className="coord-form">
              <label className="field">
                <span className="field__label">Latitude</span>
                <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
              </label>
              <label className="field">
                <span className="field__label">Longitude</span>
                <input className="input" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
              </label>
              <label className="field">
                <span className="field__label">Scenario (× monthly mean)</span>
                <input
                  className="input"
                  value={scenario}
                  placeholder="model default"
                  onChange={(e) => setScenario(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <button className="btn btn--primary" type="button" onClick={() => apply(Number(lat), Number(lon))} disabled={!valid}>
                <Crosshair size={13} aria-hidden="true" /> Analyse
              </button>
            </div>
            <div className="row presets">
              <span className="field__label">Presets</span>
              {PRESETS.map((preset) => (
                <button key={preset.name} type="button" className="btn btn--small" onClick={() => apply(preset.lat, preset.lon)}>
                  {preset.name}
                </button>
              ))}
            </div>
          </Panel>

          {!valid && <ErrorState error={null} compact />}
          {invalidRegion(latitude, longitude) && (
            <div className="notice notice--warn">
              <div className="notice__icon">!</div>
              <div>
                <div className="notice__title">Outside the modelled envelope</div>
                <div className="notice__body">
                  The grid covers {NER_BBOX[0][0]}–{NER_BBOX[1][0]}°N and {NER_BBOX[0][1]}–{NER_BBOX[1][1]}°E. Points outside it
                  are not extrapolated.
                </div>
              </div>
            </div>
          )}

          <div className="loc-layout">
            <div className="loc-layout__main stack">
              {point.loading && <Panel><LoadingRows rows={5} label="Evaluating the cell" /></Panel>}
              {point.error && (
                <Panel>
                  <ErrorState error={point.error} onRetry={point.refetch} />
                </Panel>
              )}

              {analysis && (
                <>
                  <div className="grid-2">
                    <Panel kicker="Terrain" title="What the surface is" tools={<DataClassTag dc="susceptibility" state="live" />}>
                      <KeyValue
                        items={[
                          { key: 'Elevation', value: `${analysis.terrain.elevation_m.toLocaleString('en-IN')} m` },
                          { key: 'Regional gradient', value: `${analysis.terrain.slope_m_per_km.toFixed(1)} m/km` },
                          { key: 'Gradient index', value: formatIndex(analysis.terrain.slope_index) },
                          { key: 'Relief in window', value: `${analysis.terrain.relief_km.toFixed(2)} km` },
                          { key: 'Relief index', value: formatIndex(analysis.terrain.relief_index) },
                          { key: 'Geological belt', value: analysis.terrain.geology_belt ?? 'not identified' },
                        ]}
                      />
                      <div className="data-note">{analysis.terrain.source}</div>
                    </Panel>

                    <Panel kicker="Rainfall" title="What the slope is under" tools={<DataClassTag dc="current" state={analysis.rainfall.mode === 'live' ? 'live' : 'offline'} stateLabel={analysis.rainfall.mode.toUpperCase()} />}>
                      <KeyValue
                        items={[
                          { key: 'Reference intensity, 72 h', value: `${formatMm(analysis.trigger.reference_intensity_mm)} mm` },
                          { key: 'Intensity now, 72 h', value: `${formatMm(analysis.trigger.intensity_now_mm)} mm` },
                          { key: 'Threshold for the current class', value: `${formatMm(analysis.trigger.threshold_intensity_mm)} mm` },
                          { key: 'Ratio to threshold (τ)', value: analysis.trigger.tau.toFixed(3) },
                          { key: 'Annual normal', value: `${formatMm(analysis.rainfall.annual_mm, 0)} mm` },
                          { key: 'This month’s normal', value: `${formatMm(analysis.rainfall.month_mean_mm)} mm` },
                        ]}
                      />
                      <div className="data-note">
                        {analysis.rainfall.mode === 'live'
                          ? 'Live Open-Meteo observation and forecast were reachable for this request.'
                          : analysis.rainfall.live.detail ?? 'No live feed is reachable; the climatological window is used and labelled as such.'}
                      </div>
                    </Panel>
                  </div>

                  <Panel
                    kicker="Decomposition"
                    title="Where the index comes from"
                    tools={<DataClassTag dc="susceptibility" state="live" stateLabel={analysis.attribution.exact ? 'EXACT' : 'CLIPPED'} />}
                  >
                    <AttributionBars attribution={analysis.attribution} />
                  </Panel>

                  <Panel
                    kicker="Trigger"
                    title="Rainfall thresholds by severity band"
                    tools={<DataClassTag dc="trigger" state="live" stateLabel="INVERTED" />}
                  >
                    <ThresholdTable thresholds={analysis.thresholds} />
                    <div className="data-note">
                      Thresholds invert the model at this cell: the 72-hour total that would place it in each band. Rows
                      marked “already in band” need no rain — the terrain index alone puts the cell there.
                    </div>
                  </Panel>

                  <div className="grid-2">
                    <Panel kicker="Risk" title="Now and under scenarios" tools={<DataClassTag dc="current" state="live" />}>
                      <div className="risk-now">
                        <span className="risk-now__value mono">{formatIndex(analysis.risk.now.value)}</span>
                        <SeverityBadge category={analysis.risk.now.class} />
                      </div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Scenario</th>
                            <th className="num">Rain, 72 h</th>
                            <th className="num">Risk</th>
                            <th>Class</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.scenarios.map((sc) => (
                            <tr key={sc.multiplier}>
                              <td>
                                {sc.label}
                                <span className="table__sub mono">×{sc.multiplier}</span>
                              </td>
                              <td className="num">{formatMm(sc.intensity_mm)} mm</td>
                              <td className="num">{formatIndex(sc.risk)}</td>
                              <td>
                                <SeverityBadge category={sc.class} compact />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Panel>

                    <Panel
                      kicker="Confidence"
                      title={`Grade ${analysis.uncertainty.grade}`}
                      tools={<span className="chip mono">σ {analysis.uncertainty.sigma.toFixed(3)}</span>}
                    >
                      <KeyValue
                        items={[
                          { key: 'Band now', value: `${formatIndex(analysis.uncertainty.band_now[0])} – ${formatIndex(analysis.uncertainty.band_now[1])}` },
                          { key: 'Classes reachable', value: analysis.uncertainty.band_class_possible.join(' – ') },
                          { key: 'Terrain support', value: formatKm(analysis.uncertainty.support_km) },
                          { key: 'Nearest recorded event', value: formatKm(analysis.uncertainty.nearest_evidence_km) },
                          { key: 'Records within report radius', value: String(analysis.provenance.records_nearby) },
                        ]}
                      />
                      <div className="data-note">{analysis.uncertainty.grade_meaning}</div>
                      <div className="data-note">{analysis.uncertainty.basis}</div>
                    </Panel>
                  </div>

                  <Panel kicker="Briefing" title="Plain-language summary">
                    {briefing.loading && <LoadingRows rows={3} label="Composing the summary" />}
                    {briefing.error && <ErrorState error={briefing.error} onRetry={briefing.refetch} compact />}
                    {briefing.data && (
                      <>
                        <p className="prose">{briefing.data.text}</p>
                        <div className="data-note">
                          {briefing.data.caveat} Source: <span className="mono">{briefing.data.generated_by}</span>.
                        </div>
                      </>
                    )}
                  </Panel>
                </>
              )}
            </div>

            <aside className="loc-layout__rail">
              <Panel flush variant="map" className="mini-map">
                <RegionMap
                  field={null}
                  outline={outlinePolys}
                  picked={valid ? { latitude, longitude } : null}
                />
              </Panel>
              {analysis && (
                <Panel kicker="Location" title="Where this cell sits">
                  <KeyValue
                    items={[
                      { key: 'Grid cell', value: `${analysis.location.cell.row} / ${analysis.location.cell.col}` },
                      { key: 'Cell size', value: `${analysis.location.cell.resolution_deg}°` },
                      { key: 'District', value: analysis.location.district.district },
                      { key: 'State', value: analysis.location.district.state },
                      { key: 'Distance to HQ', value: formatKm(analysis.location.district.distance_to_hq_km) },
                      { key: 'In region', value: analysis.location.in_region ? 'yes' : 'no' },
                    ]}
                  />
                  <div className="data-note">{analysis.location.district.assignment}</div>
                </Panel>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/** Cheap client-side guard so an obviously bad coordinate never hits the API. */
function invalidRegion(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
  return lat < NER_BBOX[0][0] || lat > NER_BBOX[1][0] || lon < NER_BBOX[0][1] || lon > NER_BBOX[1][1];
}
