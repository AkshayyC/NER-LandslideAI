import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, Search } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { EmptyState, ErrorState, LoadingRows, NoticeBanner, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getDistrictRisk } from '../services/api';
import { formatPercent } from '../utils/format';
import { NER_STATES } from '../constants/region';
import type { DistrictRiskRecord } from '../types/api';

const AVAIL_LABELS: Record<string, string> = {
  inventory: 'INVENTORY',
  historical: 'HISTORICAL',
  terrain: 'TERRAIN',
  dem: 'DEM',
  rainfall: 'RAINFALL',
  susceptibility: 'SUSCEPTIBILITY',
  model: 'MODEL',
};

function availabilityLabel(key: string): string {
  return AVAIL_LABELS[key.toLowerCase()] ?? key.replace(/_/g, ' ').toUpperCase();
}

/** MODULE 05 — district-level intelligence. Absence of inventory records is
 * always surfaced as NO INVENTORY DATA — never silently mapped to LOW risk. */
export function DistrictIntelligence() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [params, setParams] = useSearchParams();

  const stateFilter = params.get('state') ?? '';
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<DistrictRiskRecord | null>(null);

  const query = useApiData(
    (signal) => getDistrictRisk(stateFilter === '' ? null : stateFilter, signal),
    [stateFilter, online],
    { enabled: online },
  );

  const records = query.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) => r.district.toLowerCase().includes(q) || r.state.toLowerCase().includes(q),
    );
  }, [records, search]);

  function setState(next: string) {
    setExpanded(null);
    if (next === '') {
      params.delete('state');
      setParams(params, { replace: true });
    } else {
      setParams({ state: next }, { replace: true });
    }
  }

  const withInventory = records.filter((r) => (r.inventoryCount ?? 0) > 0).length;

  return (
    <div className="page">
      <PageHeader
        module="05"
        kicker="DISTRICT INTELLIGENCE"
        title="State → district coverage"
        description="Per-district historical inventory and model susceptibility as served by the backend, with explicit data-availability flags."
        tags={
          <>
            <DataClassTag dc="historical" state={online ? 'live' : 'offline'} />
            <DataClassTag dc="susceptibility" state={online ? 'live' : 'offline'} />
          </>
        }
      />

      <NoticeBanner tone="warn" title="Inventory gaps ≠ low risk">
        Districts without inventory records are labelled <strong>NO INVENTORY DATA</strong>. Missing
        records usually mean missing survey coverage, and this console never converts that absence
        into a LOW rating.
      </NoticeBanner>

      <Panel
        kicker="COVERAGE MATRIX"
        title={stateFilter ? `Districts — ${stateFilter}` : 'All districts (backend-wide)'}
        tools={
          <span className="chip mono">
            {online ? `${records.length} records · ${withInventory} with inventory` : 'offline'}
          </span>
        }
      >
        <div className="district-controls">
          <div className="chip-row" role="group" aria-label="Filter by state">
            <button
              type="button"
              className={`chip chip--filter ${stateFilter === '' ? 'is-active' : ''}`}
              onClick={() => setState('')}
              disabled={!online}
            >
              All states
            </button>
            {NER_STATES.map((s) => (
              <button
                key={s.code}
                type="button"
                className={`chip chip--filter ${stateFilter === s.name ? 'is-active' : ''}`}
                onClick={() => setState(s.name)}
                disabled={!online}
                title={`${s.name} — state/district navigation`}
              >
                <span className="mono">{s.code}</span> {s.name}
              </button>
            ))}
          </div>
          <label className="district-search">
            <Search size={14} aria-hidden="true" />
            <input
              className="input input--search mono"
              placeholder="filter districts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!online || records.length === 0}
            />
          </label>
        </div>

        {!online ? (
          <OfflineNotice
            onRetry={() => undefined}
          />
        ) : query.loading ? (
          <LoadingRows label="Loading /api/district-risk…" rows={6} />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Layers size={18} />}
            title="No district records returned"
            hint={
              stateFilter
                ? `GET /api/district-risk/${stateFilter} returned no parseable records. Try “All states” (GET /api/district-risk).`
                : 'GET /api/district-risk returned no parseable records. The matrix will populate when the backend serves district data.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--districts">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>State</th>
                    <th>Historical inventory</th>
                    <th>Susceptibility</th>
                    <th>Data availability</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const hasInventory = (r.inventoryCount ?? 0) > 0;
                    return (
                      <tr
                        key={`${r.state}-${r.district}`}
                        className={`district-row ${expanded?.district === r.district && expanded?.state === r.state ? 'is-expanded' : ''}`}
                        onClick={() => setExpanded((prev) => (prev === r ? null : r))}
                      >
                        <td className="district-name">{r.district}</td>
                        <td className="dim">{r.state}</td>
                        <td>
                          {hasInventory ? (
                            <span className="inv-count">
                              <span className="mono">{r.inventoryCount!.toLocaleString('en-IN')}</span>
                              <DataClassTag dc="historical" stateLabel="HISTORICAL" />
                            </span>
                          ) : (
                            <span
                              className="no-inventory-badge"
                              title="No inventory records reported — this is not a low-risk rating"
                            >
                              NO INVENTORY DATA
                            </span>
                          )}
                        </td>
                        <td>
                          {r.susceptibility ? (
                            <span className="sus-cell">
                              <SeverityBadge category={r.susceptibility.category} />
                              <span className="mono">{formatPercent(r.susceptibility.probability)}</span>
                            </span>
                          ) : (
                            <span className="chip chip--muted">not reported</span>
                          )}
                        </td>
                        <td>
                          <span className="avail-chips">
                            {r.availability
                              ? Object.entries(r.availability).map(([flag, val]) => (
                                  <span
                                    key={flag}
                                    className={`avail-chip avail-chip--${val === true ? 'yes' : val === false ? 'no' : 'unknown'}`}
                                    title={`${flag}: ${val === true ? 'available' : val === false ? 'not available' : 'not reported'}`}
                                  >
                                    {availabilityLabel(flag)} {val === true ? '✓' : val === false ? '✗' : '?'}
                                  </span>
                                ))
                              : r.inventoryCount !== null || r.susceptibility ? (
                                <span className="chip chip--muted">flags not reported</span>
                              ) : (
                                <span className="chip chip--muted">unknown</span>
                              )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="table-footnote">no districts match “{search}” in the current view</div>
            )}

            {expanded && (
              <aside className="detail-drawer" aria-label={`Details for ${expanded.district}`}>
                <header className="detail-drawer__head">
                  <div>
                    <div className="detail-drawer__district">{expanded.district}</div>
                    <div className="detail-drawer__state dim">{expanded.state}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => setExpanded(null)}
                  >
                    Close
                  </button>
                </header>
                <div className="detail-drawer__body">
                  {(expanded.inventoryCount ?? 0) > 0 ? (
                    <p className="prose">
                      Historical inventory: <strong>{expanded.inventoryCount}</strong> record(s) reported
                      by the backend.
                    </p>
                  ) : (
                    <div className="no-inventory-note">
                      <span className="no-inventory-badge">NO INVENTORY DATA</span>
                      <p className="prose">
                        The backend reports no historical inventory records for this district. This
                        does <em>not</em> imply low risk; it indicates the absence of inventory
                        coverage in the served dataset.
                      </p>
                    </div>
                  )}
                  {expanded.susceptibility && (
                    <p className="prose">
                      Susceptibility:{' '}
                      <strong>
                        {expanded.susceptibility.category ?? 'unclassified'}
                        {expanded.susceptibility.probability !== null
                          ? ` · ${formatPercent(expanded.susceptibility.probability)}`
                          : ''}
                      </strong>{' '}
                      — a model estimate of spatial predisposition, not a time-specific warning.
                    </p>
                  )}
                  <details className="raw-json">
                    <summary>Raw backend record</summary>
                    <pre className="mono">{JSON.stringify(expanded.raw, null, 2)}</pre>
                  </details>
                </div>
              </aside>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
