import { Link } from 'react-router-dom';
import { ArrowRight, Database, MapPin, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { StatCard } from '../components/common/StatCard';
import { BarList } from '../components/common/BarList';
import { KeyValue } from '../components/common/KeyValue';
import { NoticeBanner, EmptyState, ErrorState, OfflineNotice, LoadingRows } from '../components/common/states';
import { NERMap } from '../components/map/NERMap';
import { MapLegend } from '../components/map/MapLegend';
import { DATA_CLASS_LIST } from '../constants/dataClasses';
import { NER_STATES } from '../constants/region';
import { WIRED_ENDPOINTS } from '../constants/dataClasses';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getRoot, getStatistics } from '../services/api';
import { formatCount, formatRelativeTime } from '../utils/format';
import { useClock } from '../hooks/useClock';
import type { LatLon } from '../types/api';
import { useState } from 'react';

/** MODULE 01 — region-wide overview. Honest by construction: every figure
 * comes from GET /api/statistics or /api/health; nothing is simulated. */
export function CommandCenter() {
  const { apiStatus, health, lastChecked, baseUrl, recheck } = useSystemStatus();
  const now = useClock(5000);
  const online = apiStatus === 'online';

  const stats = useApiData((signal) => getStatistics(signal), [online], { enabled: online });
  const root = useApiData((signal) => getRoot(signal), [online], { enabled: online });

  const [picked, setPicked] = useState<LatLon | null>(null);

  const byState = stats.data?.byState ?? null;
  const total = stats.data?.totalEvents ?? null;
  const rootBanner =
    typeof root.data === 'string' && root.data.trim().length > 0
      ? root.data.trim()
      : (() => {
          const rec =
            root.data && typeof root.data === 'object' && !Array.isArray(root.data)
              ? (root.data as Record<string, unknown>)
              : null;
          const msg = rec && typeof rec.message === 'string' ? rec.message : null;
          return msg && msg.length <= 140 ? msg : null;
        })();

  return (
    <div className="page">
      <PageHeader
        module="01"
        kicker="COMMAND CENTER"
        title="Northeast India Landslide Intelligence"
        description="Unified situational overview for the eight states of the Northeastern Region (NER): historical landslide evidence, terrain-informed susceptibility, and — pending integration — rainfall-triggered risk."
        tags={<DataClassTag dc="historical" />}
      />

      <NoticeBanner tone="warn" title="Prototype scope — read before interpreting any panel">
        This console distinguishes <strong>historical susceptibility</strong> (evidence + model inference)
        from <strong>current / forecast risk</strong> (requires the rainfall trigger, which is not yet
        integrated). Susceptibility is not an early warning.
      </NoticeBanner>

      {/* Risk / susceptibility overview cards — one per information class */}
      <div className="grid grid--4 class-cards">
        <StatCard
          label="Historical inventory"
          value={online && stats.loading ? '…' : total === null ? '—' : formatCount(total)}
          unit={total !== null ? 'records' : undefined}
          accent={DATA_CLASS_LIST[0].color}
          tag={<DataClassTag dc="historical" state={online ? 'live' : 'offline'} stateLabel={online ? 'BACKEND DATA' : 'OFFLINE'} />}
          sub={
            total === null
              ? 'Available once connected to the backend'
              : stats.data?.dateRange?.start || stats.data?.dateRange?.end
                ? `Coverage: ${stats.data.dateRange.start ?? '—'} → ${stats.data.dateRange.end ?? '—'}`
                : 'Coverage window not reported by backend'
          }
        />
        <StatCard
          label="Susceptibility model"
          value={
            health?.modelLoaded === true ? 'LOADED' : health?.modelLoaded === false ? 'NOT LOADED' : online ? 'REPORTED' : '—'
          }
          accent={DATA_CLASS_LIST[1].color}
          tag={<DataClassTag dc="susceptibility" state={online ? 'live' : 'offline'} stateLabel={online ? 'BACKEND DATA' : 'OFFLINE'} />}
          sub={
            online
              ? `GET /api/susceptibility/{lat}/{lon} — ${health?.modelLoaded === false ? 'backend reports no model artifact' : 'point queries enabled when backend responds'}`
              : 'Backend offline — queries disabled'
          }
        />
        <StatCard
          label="Rainfall trigger"
          value="PENDING"
          accent={DATA_CLASS_LIST[2].color}
          tag={<DataClassTag dc="trigger" />}
          sub="Rainfall observation/forecast feeds are not yet integrated; no trigger values exist to display"
        />
        <StatCard
          label="Current / forecast risk"
          value="NOT OPERATIONAL"
          accent={DATA_CLASS_LIST[3].color}
          tag={<DataClassTag dc="current" />}
          sub="Time-specific risk requires the trigger layer. Susceptibility must never be read as a live warning"
        />
      </div>

      {/* Map-dominant main area */}
      <div className="cc-main">
        <Panel
          variant="map"
          kicker="REGION VIEW — NORTHEAST INDIA"
          title="NER overview map"
          className="cc-map-panel"
          tools={
            <span className="chip mono">
              {picked ? `${picked.latitude.toFixed(4)}, ${picked.longitude.toFixed(4)}` : 'click map to inspect'}
            </span>
          }
        >
          <NERMap referenceMarkers pickPoint={picked} onPick={setPicked} boundsKey="cc" />
          <MapLegend showReferenceMarkers />
          {picked && (
            <div className="map-inspect">
              <span className="mono">
                {picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)}
              </span>
              <Link className="btn btn--small btn--primary" to={`/location?lat=${picked.latitude.toFixed(6)}&lon=${picked.longitude.toFixed(6)}`}>
                Analyze location <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </Panel>

        <div className="cc-rail">
          <Panel kicker="SYSTEM / API STATUS" title="Backend connection">
            <div className={`conn-row conn-row--${apiStatus}`}>
              <i className="led" aria-hidden="true" />
              <div>
                <div className="conn-row__state">
                  {apiStatus === 'online' ? 'Backend online' : apiStatus === 'offline' ? 'Backend offline / data connection unavailable' : 'Checking backend…'}
                </div>
                <div className="conn-row__meta mono">{baseUrl}</div>
              </div>
              <button type="button" className="btn btn--ghost btn--small" onClick={recheck} disabled={apiStatus === 'checking'}>
                <RefreshCw size={13} /> Recheck
              </button>
            </div>

            <KeyValue
              items={[
                { key: 'Health status', value: health?.statusLabel ?? (online ? 'reported' : 'unavailable') },
                {
                  key: 'Model artifact',
                  value:
                    health?.modelLoaded === true
                      ? 'LOADED'
                      : health?.modelLoaded === false
                        ? 'NOT LOADED'
                        : 'not reported',
                },
                { key: 'Backend version', value: health?.version ?? 'not reported' },
                { key: 'Last checked', value: formatRelativeTime(lastChecked, now) },
                { key: 'Service banner', value: rootBanner ?? (root.loading ? '…' : 'not reported') },
                { key: 'Wired endpoints', value: `${WIRED_ENDPOINTS.length} (see below)` },
              ]}
            />

            <details className="endpoint-list">
              <summary>Integration surface</summary>
              <ul className="mono">
                {WIRED_ENDPOINTS.map((ep) => (
                  <li key={ep}>{ep}</li>
                ))}
              </ul>
            </details>
          </Panel>

          <Panel
            kicker="HISTORICAL DATA"
            title="Historical landslide statistics"
            tools={<DataClassTag dc="historical" />}
          >
            {!online ? (
              <OfflineNotice compact />
            ) : stats.loading ? (
              <LoadingRows label="Loading statistics…" />
            ) : stats.error ? (
              <ErrorState error={stats.error} onRetry={stats.refetch} compact />
            ) : total === null && !byState ? (
              <EmptyState
                icon={<Database size={18} />}
                title="No statistics payload recognised"
                hint="The backend is online but /api/statistics did not return a parseable summary. Values will appear the moment it does."
              />
            ) : (
              <>
                <div className="stats-hero">
                  <span className="stats-hero__value mono">{formatCount(total)}</span>
                  <span className="stats-hero__label">inventory records{stats.data?.dateRange?.start ? ` · ${stats.data.dateRange.start} → ${stats.data?.dateRange.end ?? 'present'}` : ''}</span>
                </div>
                {byState && byState.length > 0 && (
                  <>
                    <div className="mini-caption">Records by state (backend aggregate)</div>
                    <BarList items={byState.map((s) => ({ label: s.state, value: s.count }))} />
                  </>
                )}
                {!byState && (
                  <EmptyState compact title="State-level breakdown not reported" hint="/api/statistics contained no per-state aggregation." />
                )}
              </>
            )}
          </Panel>
        </div>
      </div>

      {/* 8 NER states */}
      <Panel
        kicker="TARGET REGION"
        title="The eight states of the Northeastern Region"
        tools={<span className="chip mono">SOURCE: README / DOCS — PROJECT REGION DEFINITION</span>}
      >
        <div className="states-grid">
          {NER_STATES.map((state) => {
            const stat = byState?.find((s) => s.state.toLowerCase() === state.name.toLowerCase());
            return (
              <Link key={state.code} to={`/districts?state=${encodeURIComponent(state.name)}`} className="state-card">
                <div className="state-card__top">
                  <span className="state-card__code mono">{state.code}</span>
                  <MapPin size={13} aria-hidden="true" />
                </div>
                <div className="state-card__name">{state.name}</div>
                <div className="state-card__meta">
                  {online && stat ? (
                    <>
                      <DataClassTag dc="historical" stateLabel="HISTORICAL" />
                      <span className="mono">{formatCount(stat.count)} records</span>
                    </>
                  ) : (
                    <span className="state-card__awaiting">
                      {online ? 'awaiting /api/statistics data' : 'backend data unavailable'}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
        {!online && (
          <div className="panel-footnote">
            Per-state counts appear automatically once the backend is reachable. Offline the console
            shows only the built-in region definition — never substitute numbers.
          </div>
        )}
      </Panel>

      <NoticeBanner tone="info" title="How to read this command center" icon={<ShieldAlert size={16} />}>
        Historical panels describe the past. Susceptibility panels describe relative spatial
        predisposition. Neither is a forecast for today. Alerts remain disabled until the rainfall
        trigger module ships — see Modules 07 and 08.
      </NoticeBanner>
    </div>
  );
}
