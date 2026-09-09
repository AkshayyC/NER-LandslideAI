import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crosshair, Locate, Search } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { ProbabilityGauge } from '../components/common/ProbabilityGauge';
import { KeyValue } from '../components/common/KeyValue';
import { EmptyState, ErrorState, NoticeBanner, OfflineNotice, Spinner } from '../components/common/states';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getRisk, getSusceptibility } from '../services/api';
import { NER_LAT_RANGE, NER_LON_RANGE } from '../constants/region';
import { formatCoord, formatPercent } from '../utils/format';
import { ApiError } from '../types/api';
import type { SusceptibilityResult } from '../types/api';

interface RecentLookup {
  latitude: number;
  longitude: number;
  probability: number | null;
  category: string | null;
}

function parseCoord(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** MODULE 03 — point susceptibility queries. The backend endpoint is called
 * exactly as specified: GET /api/susceptibility/{latitude}/{longitude}. */
export function LocationAnalysis() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [params] = useSearchParams();

  const [latText, setLatText] = useState(() => parseCoord(params.get('lat'))?.toString() ?? '');
  const [lonText, setLonText] = useState(() => parseCoord(params.get('lon'))?.toString() ?? '');
  const [result, setResult] = useState<SusceptibilityResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentLookup[]>([]);

  const [riskResult, setRiskResult] = useState<Awaited<ReturnType<typeof getRisk>> | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  useEffect(() => {
    const pLat = parseCoord(params.get('lat'));
    const pLon = parseCoord(params.get('lon'));
    if (pLat !== null && pLon !== null) {
      setLatText(String(pLat));
      setLonText(String(pLon));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const lat = parseCoord(latText);
  const lon = parseCoord(lonText);
  const latValid = lat !== null && lat >= -90 && lat <= 90;
  const lonValid = lon !== null && lon >= -180 && lon <= 180;
  const formValid = latValid && lonValid;

  const inRegion =
    lat !== null &&
    lon !== null &&
    lat >= NER_LAT_RANGE[0] &&
    lat <= NER_LAT_RANGE[1] &&
    lon >= NER_LON_RANGE[0] &&
    lon <= NER_LON_RANGE[1];

  async function run(queryLat: number, queryLon: number) {
    setBusy(true);
    setError(null);
    setResult(null);
    setRiskResult(null);
    setRiskError(null);
    try {
      const susceptibility = await getSusceptibility(queryLat, queryLon);
      setResult(susceptibility);
      setRecent((prev) =>
        [
          {
            latitude: queryLat,
            longitude: queryLon,
            probability: susceptibility.probability,
            category: susceptibility.category,
          },
          ...prev.filter((r) => r.latitude !== queryLat || r.longitude !== queryLon),
        ].slice(0, 5),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError('network', err instanceof Error ? err.message : 'Susceptibility query failed.'),
      );
      return;
    } finally {
      setBusy(false);
    }

    // Best-effort: current/forecast risk endpoint (expected pending).
    try {
      const risk = await getRisk(queryLat, queryLon);
      setRiskResult(risk);
    } catch (err) {
      setRiskError(err instanceof Error ? err.message : 'Risk endpoint unavailable.');
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formValid && lat !== null && lon !== null && !busy) void run(lat, lon);
  }

  return (
    <div className="page">
      <PageHeader
        module="03"
        kicker="LOCATION ANALYSIS"
        title="Point susceptibility analysis"
        description="Enter a latitude and longitude to query the backend susceptibility model for that exact location. Results are shown only when the backend answers."
        tags={<DataClassTag dc="susceptibility" state={online ? 'live' : 'offline'} />}
      />

      <div className="loc-grid">
        <div className="loc-left">
          <Panel kicker="QUERY" title="Coordinates">
            <form className="coord-form" onSubmit={onSubmit}>
              <div className="coord-form__row">
                <label className="field">
                  <span className="field__label">Latitude (°N, −90…90)</span>
                  <input
                    className={`input mono ${latText !== '' && !latValid ? 'input--invalid' : ''}`}
                    inputMode="decimal"
                    placeholder="e.g. 25.5788"
                    value={latText}
                    onChange={(e) => setLatText(e.target.value)}
                    aria-invalid={latText !== '' && !latValid}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Longitude (°E, −180…180)</span>
                  <input
                    className={`input mono ${lonText !== '' && !lonValid ? 'input--invalid' : ''}`}
                    inputMode="decimal"
                    placeholder="e.g. 91.8933"
                    value={lonText}
                    onChange={(e) => setLonText(e.target.value)}
                    aria-invalid={lonText !== '' && !lonValid}
                  />
                </label>
              </div>

              <div className="coord-form__actions">
                <button type="submit" className="btn btn--primary" disabled={!formValid || busy || !online}>
                  {busy ? <Spinner size={14} /> : <Search size={14} />} Query susceptibility
                </button>
                {!online && <span className="field__hint">Backend offline — queries are disabled.</span>}
              </div>

              <div className="coord-form__hint">
                <Locate size={13} aria-hidden="true" />
                Region of interest (Northeast India): approx.{' '}
                <span className="mono">
                  {NER_LAT_RANGE[0]}°–{NER_LAT_RANGE[1]}° N, {NER_LON_RANGE[0]}°–{NER_LON_RANGE[1]}° E
                </span>
                . Queries outside the band are still sent; the model is simply not trained for them.{' '}
                {inRegion ? 'Current input is inside the band.' : 'Current input is outside the band.'}
              </div>
            </form>
          </Panel>

          {recent.length > 0 && (
            <Panel kicker="SESSION" title="Recent lookups">
              <ul className="recent-list">
                {recent.map((r) => (
                  <li key={`${r.latitude},${r.longitude}`}>
                    <button
                      type="button"
                      className="recent-list__item"
                      onClick={() => {
                        setLatText(String(r.latitude));
                        setLonText(String(r.longitude));
                      }}
                    >
                      <span className="mono">{formatCoord(r.latitude, r.longitude)}</span>
                      <span className="recent-list__val mono">
                        {r.probability === null ? '—' : formatPercent(r.probability)}
                        {r.category ? ` · ${r.category}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="panel-footnote">Session-only history — nothing is stored server-side.</div>
            </Panel>
          )}
        </div>

        <div className="loc-right">
          <Panel
            kicker="RESULT"
            title="Susceptibility"
            tools={<DataClassTag dc="susceptibility" state={online ? 'live' : 'offline'} />}
          >
            {!online && !result ? (
              <OfflineNotice />
            ) : busy ? (
              <div className="loc-loading">
                <Spinner size={18} /> Querying GET /api/susceptibility/{'{lat}'}/{'{lon}'} …
              </div>
            ) : error ? (
              <ErrorState error={error.kind === 'network' || error.kind === 'timeout' || error.kind === 'http' || error.kind === 'parse' ? error : null} onRetry={() => lat !== null && lon !== null && void run(lat, lon)} />
            ) : !result ? (
              <EmptyState
                icon={<Crosshair size={18} />}
                title="No query yet"
                hint="Enter coordinates and run the query. The console will never display a probability that the backend did not compute."
              />
            ) : (
              <div className="loc-result">
                <div className="loc-result__coords mono">{formatCoord(result.latitude, result.longitude, 5)}</div>
                <ProbabilityGauge probability={result.probability} category={result.category} />
                <KeyValue
                  columns={2}
                  items={[
                    { key: 'Latitude', value: `${result.latitude}°` },
                    { key: 'Longitude', value: `${result.longitude}°` },
                    { key: 'Category', value: result.category ?? 'not reported' },
                    { key: 'Model version', value: result.modelVersion ?? 'not reported' },
                    { key: 'Generated at', value: result.generatedAt ?? 'not reported' },
                  ]}
                />
                <details className="raw-json">
                  <summary>Raw backend response</summary>
                  <pre className="mono">{JSON.stringify(result.raw, null, 2)}</pre>
                </details>
              </div>
            )}
          </Panel>

          <Panel kicker="INTERPRETATION" title="What this result means">
            <p className="prose">
              The susceptibility model estimates how prone a location is to landsliding based on
              terrain (elevation, slope, aspect), environmental context (land cover, geology, soil,
              hydrology, proximity to roads and settlements) and the surrounding history of recorded
              landslides. It is a <strong>spatial, relative measure</strong> — the model's estimate of
              predisposition compared with the region it was trained on.
            </p>
            <p className="prose">
              It does <strong>not</strong> predict that a landslide will happen today, tomorrow, or
              after any particular storm. Time-specific statements require the rainfall trigger module
              (integration pending). This tool is a research prototype and must not be used for
              evacuation or emergency decisions.
            </p>
          </Panel>

          <Panel
            kicker="CURRENT / FORECAST RISK"
            title="Trigger-aware risk"
            tools={<DataClassTag dc="current" />}
          >
            <NoticeBanner tone="warn" title="Rainfall trigger integration pending">
              {riskResult
                ? 'The /api/risk endpoint responded — recognised fields are shown below. Operational interpretation remains disabled in this prototype.'
                : 'The trigger-aware risk endpoint is wired (GET /api/risk/{lat}/{lon}) but no operational warning capability exists yet.'}
            </NoticeBanner>
            {riskResult ? (
              <KeyValue
                columns={2}
                items={[
                  { key: 'Susceptibility', value: formatPercent(riskResult.susceptibilityProbability) },
                  { key: 'Susceptibility cat.', value: riskResult.susceptibilityCategory ?? 'not reported' },
                  { key: 'Risk category', value: riskResult.riskCategory ?? 'not reported' },
                  { key: 'Issued at', value: riskResult.issuedAt ?? 'not reported' },
                  { key: 'Trigger block', value: riskResult.trigger ? 'present' : 'absent' },
                ]}
              />
            ) : (
              riskError && (
                <div className="panel-footnote mono">
                  last attempt: {riskError.length > 120 ? `${riskError.slice(0, 119)}…` : riskError}
                </div>
              )
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
