import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { KeyValue } from '../components/common/KeyValue';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getDistrictDetail, getDistricts } from '../services/api';
import type { DistrictSummary } from '../types/api';
import { formatCount, formatIndex, formatShare } from '../utils/format';

type SortKey = 'exposure' | 'risk' | 'susceptibility' | 'records';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'exposure', label: 'Exposure' },
  { id: 'risk', label: 'Mean risk now' },
  { id: 'susceptibility', label: 'Susceptibility' },
  { id: 'records', label: 'Records' },
];

/** Module 04 — every district, ranked and inspectable. */
export function DistrictIntelligence() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('exposure');
  const [selected, setSelected] = useState<DistrictSummary | null>(null);

  const districts = useApiData(online ? (s) => getDistricts(undefined, s) : null, [], { enabled: online });
  const detail = useApiData(
    online && selected ? (s) => getDistrictDetail(selected.state, selected.district, s) : null,
    [selected?.state, selected?.district],
    { enabled: online && selected !== null },
  );

  const rows = useMemo(() => {
    const list = districts.data ?? [];
    const needle = query.trim().toLowerCase();
    const filtered = list.filter((row) => {
      if (stateFilter && row.state !== stateFilter) return false;
      if (!needle) return true;
      return `${row.district} ${row.state} ${row.hq}`.toLowerCase().includes(needle);
    });
    const key = (row: DistrictSummary) =>
      sort === 'exposure'
        ? row.exposure_index
        : sort === 'risk'
          ? row.risk_now.mean
          : sort === 'susceptibility'
            ? row.susceptibility.mean
            : row.records_in_district;
    return [...filtered].sort((a, b) => key(b) - key(a));
  }, [districts.data, query, stateFilter, sort]);

  const states = useMemo(
    () => Array.from(new Set((districts.data ?? []).map((d) => d.state))).sort(),
    [districts.data],
  );

  return (
    <div className="stack">
      <PageHeader
        module="04"
        kicker="Administration"
        title="District Intelligence"
        description="District-level summaries for all 130 district headquarters: mean susceptibility and risk, the share of cells in the high bands, records on file, and a screening exposure index."
        tags={
          districts.data ? (
            <>
              <span className="chip mono">{districts.data.length} districts</span>
              <DataClassTag dc="susceptibility" state="live" />
            </>
          ) : null
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <div className="dist-layout">
          <Panel
            kicker="Ranking"
            title="Districts by score"
            className="dist-list"
            tools={
              <div className="row">
                <input
                  className="input"
                  placeholder="Search district or HQ"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select className="input" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                  <option value="">All states</option>
                  {states.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                <span className="seg">
                  {SORTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`seg__btn ${sort === option.id ? 'is-active' : ''}`}
                      onClick={() => setSort(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </span>
              </div>
            }
          >
            {districts.loading && <LoadingRows rows={6} label="Loading districts" />}
            {districts.error && <ErrorState error={districts.error} onRetry={districts.refetch} />}
            {districts.data && (
              <div className="table-wrap table-wrap--tall">
                <table className="table">
                  <thead>
                    <tr>
                      <th>District</th>
                      <th className="num">Susceptibility</th>
                      <th className="num">Risk now</th>
                      <th className="num">High+ share</th>
                      <th className="num">Records</th>
                      <th className="num">Exposure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.state}-${row.district}`}
                        className={selected?.district === row.district && selected?.state === row.state ? 'is-selected' : ''}
                      >
                        <td>
                          <button type="button" className="row-button" onClick={() => setSelected(row)}>
                            {row.district}
                          </button>
                          <span className="table__sub">
                            {row.state} · HQ {row.hq}
                          </span>
                        </td>
                        <td className="num">{formatIndex(row.susceptibility.mean)}</td>
                        <td className="num">
                          {formatIndex(row.risk_now.mean)}
                          <SeverityBadge category={row.risk_now.class} compact />
                        </td>
                        <td className="num">{formatShare(row.risk_forward.high_share)}</td>
                        <td className="num">{row.records_in_district}</td>
                        <td className="num">{formatCount(Math.round(row.exposure_index))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {districts.data && rows.length === 0 && (
              <p className="prose dim">No district matches the current filter.</p>
            )}
          </Panel>

          <aside className="dist-rail stack">
            {!selected && (
              <Panel kicker="Detail" title="Select a district">
                <p className="prose dim">
                  The table lists every district in the modelled region. Selecting one loads its cell-level summary and
                  the analysis of its headquarters.
                </p>
              </Panel>
            )}

            {selected && (
              <>
                <Panel kicker={`${selected.state} · ${selected.state_code}`} title={selected.district}>
                  {detail.loading && <LoadingRows rows={4} label="Loading district" />}
                  {detail.error && <ErrorState error={detail.error} onRetry={detail.refetch} compact />}
                  {detail.data && (
                    <>
                      <KeyValue
                        items={[
                          { key: 'Headquarters', value: detail.data.hq },
                          { key: 'Population', value: formatCount(detail.data.population) },
                          { key: 'Population estimated', value: detail.data.population_apportioned ? 'yes (post-2011 district)' : 'no (Census 2011)' },
                          { key: 'Modelled cells', value: formatCount(detail.data.cells) },
                          { key: 'Area (approx.)', value: `${formatCount(Math.round(detail.data.area_km2_approx))} km²` },
                          { key: 'Mean σ', value: detail.data.uncertainty_sigma_mean.toFixed(3) },
                        ]}
                      />
                      <div className="data-note">{detail.data.exposure_note}</div>
                    </>
                  )}
                </Panel>

                {detail.data && (
                  <>
                    <Panel kicker="Risk structure" title="Class mix inside the district">
                      <KeyValue
                        items={[
                          { key: 'Mean susceptibility', value: `${formatIndex(detail.data.susceptibility.mean)} (max ${formatIndex(detail.data.susceptibility.max)})` },
                          { key: 'Mean risk now', value: `${formatIndex(detail.data.risk_now.mean)} (max ${formatIndex(detail.data.risk_now.max)})` },
                          { key: 'Mean risk forward', value: `${formatIndex(detail.data.risk_forward.mean)} (max ${formatIndex(detail.data.risk_forward.max)})` },
                          { key: 'Cells in HIGH or above', value: formatShare(detail.data.risk_forward.high_share) },
                          { key: 'Records in district', value: String(detail.data.records_in_district) },
                          { key: 'Evidence density sum', value: detail.data.evidence_density_sum.toFixed(1) },
                        ]}
                      />
                    </Panel>

                    <Panel
                      kicker="Headquarters cell"
                      title={detail.data.hq}
                      tools={<SeverityBadge category={detail.data.point_analysis.risk.now.class} />}
                    >
                      <KeyValue
                        items={[
                          { key: 'Risk now', value: formatIndex(detail.data.point_analysis.risk.now.value) },
                          { key: 'Susceptibility', value: formatIndex(detail.data.point_analysis.susceptibility.index) },
                          { key: 'Elevation', value: `${detail.data.point_analysis.terrain.elevation_m.toLocaleString('en-IN')} m` },
                          { key: 'Gradient', value: `${detail.data.point_analysis.terrain.slope_m_per_km.toFixed(1)} m/km` },
                          { key: 'Uncertainty', value: `σ ${detail.data.point_analysis.uncertainty.sigma.toFixed(3)} · grade ${detail.data.point_analysis.uncertainty.grade}` },
                        ]}
                      />
                      <div className="data-note">
                        Analysed at {detail.data.point_analysis.location.latitude.toFixed(4)},{' '}
                        {detail.data.point_analysis.location.longitude.toFixed(4)} — the cell nearest the headquarters,
                        not the district mean above.
                      </div>
                      <Link
                        className="btn btn--small"
                        to={`/location?lat=${detail.data.point_analysis.location.latitude.toFixed(4)}&lon=${detail.data.point_analysis.location.longitude.toFixed(4)}`}
                      >
                        Open full analysis →
                      </Link>
                    </Panel>
                  </>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
