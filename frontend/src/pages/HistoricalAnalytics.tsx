import { useMemo, useState } from 'react';
import { BarChart3, Database } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { StatCard } from '../components/common/StatCard';
import { BarList } from '../components/common/BarList';
import { EmptyState, ErrorState, LoadingRows, NoticeBanner, OfflineNotice } from '../components/common/states';
import { NERMap } from '../components/map/NERMap';
import { useApiData } from '../hooks/useApiData';
import { useStates } from '../hooks/useStates';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getDistricts, getHistorical, getStatistics } from '../services/api';
import { formatCount, formatShortDate, truncate } from '../utils/format';
import type { HistoricalEvent } from '../types/api';

/** MODULE 04 — historical analytics. Every number on this page originates
 * from the backend inventory; the page never estimates or extrapolates. */
export function HistoricalAnalytics() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const { states } = useStates();

  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');

  const stats = useApiData((signal) => getStatistics(signal), [online], { enabled: online });
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

  const events: HistoricalEvent[] = useMemo(() => historical.data?.events ?? [], [historical.data]);

  const byState = stats.data?.byState ?? null;
  const total = stats.data?.totalEvents ?? null;

  return (
    <div className="page">
      <PageHeader
        module="04"
        kicker="HISTORICAL ANALYTICS"
        title="Historical landslide inventory"
        description="Recorded past landslide events and aggregates served by the backend. Everything on this page is HISTORICAL data — it describes what happened, not what will."
        tags={<DataClassTag dc="historical" state={online ? 'live' : 'offline'} />}
      />

      <NoticeBanner tone="info" title="HISTORICAL DATA — scope statement">
        All counts, dates and coordinates come from the historical landslide inventory exposed by the
        backend (e.g. GSI-derived records). This console adds no estimates of its own; fields the
        backend does not report are shown as “not reported”.
      </NoticeBanner>

      <div className="grid grid--3">
        <StatCard
          label="Inventory records (region)"
          value={online && stats.loading ? '…' : formatCount(total)}
          accent="#8b7cf6"
          tag={<DataClassTag dc="historical" />}
          sub={total === null ? 'GET /api/statistics — awaiting backend data' : 'Region-wide aggregate'}
        />
        <StatCard
          label="Temporal coverage"
          value={stats.data?.dateRange?.start || stats.data?.dateRange?.end ? 'REPORTED' : '—'}
          accent="#8b7cf6"
          tag={<DataClassTag dc="historical" />}
          sub={
            stats.data?.dateRange
              ? `${formatShortDate(stats.data.dateRange.start)} → ${formatShortDate(stats.data.dateRange.end)}`
              : 'Backend did not report a coverage window'
          }
        />
        <StatCard
          label="States in aggregate"
          value={byState ? byState.length : '—'}
          accent="#8b7cf6"
          tag={<DataClassTag dc="historical" />}
          sub={byState ? 'Per-state breakdown available below' : 'Per-state breakdown not reported'}
        />
      </div>

      <div className="hist-grid">
        <Panel kicker="AGGREGATES" title="State-level statistics" tools={<DataClassTag dc="historical" />}>
          {!online ? (
            <OfflineNotice compact />
          ) : stats.loading ? (
            <LoadingRows label="Loading /api/statistics…" />
          ) : stats.error ? (
            <ErrorState error={stats.error} onRetry={stats.refetch} />
          ) : byState && byState.length > 0 ? (
            <BarList items={byState.map((s) => ({ label: s.state, value: s.count }))} unit=" rec." />
          ) : (
            <EmptyState
              icon={<BarChart3 size={18} />}
              title="No per-state aggregation returned"
              hint="The backend responded without a parseable by-state breakdown. Bars will render the moment it does — none are fabricated."
            />
          )}
        </Panel>

        <Panel kicker="DISTRICT QUERY" title="Historical summary by district">
          {!online ? (
            <OfflineNotice compact />
          ) : (
            <div className="hist-selectors">
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
                          ? '— backend returned no districts —'
                          : '— select district —'}
                  </option>
                  {(districts.data ?? []).map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {online && stateName && districtName && (
            <div className="hist-detail">
              {historical.loading ? (
                <LoadingRows label={`Querying /api/historical/${stateName}/${districtName}…`} />
              ) : historical.error ? (
                <ErrorState error={historical.error} onRetry={historical.refetch} compact />
              ) : historical.data ? (
                <>
                  <div className="hist-detail__figures">
                    <div>
                      <span className="hist-detail__num mono">{formatCount(historical.data.eventCount)}</span>
                      <span className="hist-detail__cap">inventory records</span>
                    </div>
                    <div>
                      <span className="hist-detail__num mono">{events.length}</span>
                      <span className="hist-detail__cap">with plottable coordinates</span>
                    </div>
                    <div>
                      <span className="hist-detail__num mono">
                        {historical.data.dateRange
                          ? `${formatShortDate(historical.data.dateRange.start)} → ${formatShortDate(historical.data.dateRange.end)}`
                          : '—'}
                      </span>
                      <span className="hist-detail__cap">reported coverage</span>
                    </div>
                  </div>
                  {events.length === 0 ? (
                    <div className="no-inventory-note">
                      <span className="no-inventory-badge">NO INVENTORY DATA</span>
                      <p>
                        No plottable landslide records were returned for {districtName}. This is a
                        statement about inventory coverage — <strong>not</strong> a low-risk rating.
                      </p>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Latitude</th>
                            <th>Longitude</th>
                            <th>Label</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.slice(0, 50).map((evt, i) => (
                            <tr key={`${evt.id}-${i}`}>
                              <td className="mono dim">{i + 1}</td>
                              <td className="mono">{evt.date ? truncate(evt.date, 24) : 'not reported'}</td>
                              <td className="mono">{evt.latitude.toFixed(5)}</td>
                              <td className="mono">{evt.longitude.toFixed(5)}</td>
                              <td>{evt.label ?? <span className="dim">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {events.length > 50 && (
                        <div className="table-footnote mono">
                          showing first 50 of {events.length} plottable records
                        </div>
                      )}
                    </div>
                  )}
                  <details className="raw-json">
                    <summary>Raw backend response</summary>
                    <pre className="mono">{JSON.stringify(historical.data.raw, null, 2)}</pre>
                  </details>
                </>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      {events.length > 0 && (
        <Panel
          variant="map"
          kicker="SPATIAL VIEW — HISTORICAL RECORDS ONLY"
          title={`Inventory points — ${districtName}, ${stateName}`}
          flush
        >
          <NERMap inventoryPoints={events} boundsKey={`hist-${stateName}-${districtName}-${events.length}`} />
        </Panel>
      )}

      <Panel kicker="INVENTORY PROVENANCE" title="About the historical inventory">
        <p className="prose">
          The historical inventory is a curated set of documented landslide occurrences — typically
          compiled by geological survey organisations (for this project, the GSI landslide inventory
          described in <span className="mono">docs/data_sources.md</span>) with location, and where
          available, event date and attributes.
        </p>
        <p className="prose">
          Inventory coverage is uneven: recorded events cluster where people, roads and surveys are.
          An area with few records may be under-surveyed rather than safe — the District Intelligence
          module marks such districts explicitly as <strong>NO INVENTORY DATA</strong> instead of
          rating them low risk.
        </p>
        <div className="provenance-chips">
          <span className="chip">
            <Database size={12} aria-hidden="true" /> fields expected: latitude · longitude · event
            date · attributes
          </span>
          <span className="chip">endpoint: GET /api/historical/{'{state}'}/{'{district}'}</span>
        </div>
      </Panel>
    </div>
  );
}
