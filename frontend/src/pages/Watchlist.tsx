import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { KeyValue } from '../components/common/KeyValue';
import { ErrorState, LoadingRows, NoticeBanner, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getBriefing, getStats, getWatchlist } from '../services/api';
import { formatIndex, formatSigned } from '../utils/format';
import { classOf } from '../utils/classOf';

/** Module 07 — where rainfall moves the risk most, and what the region looks like today. */
export function Watchlist() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [limit, setLimit] = useState(25);

  const watchlist = useApiData(online ? (s) => getWatchlist(limit, s) : null, [limit], { enabled: online });
  const briefing = useApiData(online ? (s) => getBriefing('region', s) : null, ['region'], { enabled: online });
  const stats = useApiData(online ? (s) => getStats(s) : null, [], { enabled: online });

  const cells = watchlist.data?.cells ?? [];
  const withRisk = useMemo(() => cells.filter((c) => Number.isFinite(c.risk_forward)), [cells]);

  return (
    <div className="stack">
      <PageHeader
        module="07"
        kicker="Monitoring"
        title="Watchlist"
        description="Cells ranked by how far the forward rainfall assumption lifts them above their terrain-only baseline. This is a change view: it answers “where does rain matter most”, not “where is the terrain worst”."
        tags={
          watchlist.data ? (
            <>
              <span className="chip mono">scenario ×{watchlist.data.scenario_multiplier}</span>
              <DataClassTag dc="current" state={stats.data?.rainfall_mode === 'live' ? 'live' : 'offline'} stateLabel={(stats.data?.rainfall_mode ?? 'climatology').toUpperCase()} />
            </>
          ) : null
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          {stats.data && stats.data.rainfall_mode !== 'live' && (
            <NoticeBanner tone="warn" title="No live rainfall feed is reachable from this deployment">
              The trigger is the local climatological window for {stats.data.season.regime.replace(/_/g, ' ')} (month{' '}
              {stats.data.season.month}). Every figure below is labelled accordingly; nothing is presented as an
              observation. {stats.data.season.note}
            </NoticeBanner>
          )}

          <div className="grid-2">
            <Panel
              kicker="Ranking"
              title="Cells where the forward assumption changes the picture"
              tools={
                <span className="seg">
                  {[10, 25, 50, 100].map((n) => (
                    <button key={n} type="button" className={`seg__btn ${limit === n ? 'is-active' : ''}`} onClick={() => setLimit(n)}>
                      Top {n}
                    </button>
                  ))}
                </span>
              }
            >
              {watchlist.loading && <LoadingRows rows={8} label="Ranking cells" />}
              {watchlist.error && <ErrorState error={watchlist.error} onRetry={watchlist.refetch} />}
              {watchlist.data && (
                <div className="table-wrap table-wrap--tall">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cell</th>
                        <th className="num">Susceptibility</th>
                        <th className="num">Risk now</th>
                        <th className="num">Forward</th>
                        <th className="num">Change</th>
                        <th>Forward class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withRisk.map((cell) => (
                        <tr key={`${cell.latitude}-${cell.longitude}`}>
                          <td>
                            <Link className="row-button" to={`/location?lat=${cell.latitude.toFixed(4)}&lon=${cell.longitude.toFixed(4)}`}>
                              {cell.district}, {cell.state}
                            </Link>
                            <span className="table__sub mono">
                              {cell.latitude.toFixed(3)}, {cell.longitude.toFixed(3)}
                            </span>
                          </td>
                          <td className="num">{formatIndex(cell.susceptibility)}</td>
                          <td className="num">{formatIndex(cell.risk_now)}</td>
                          <td className="num">{formatIndex(cell.risk_forward)}</td>
                          <td className="num">{formatSigned(cell.delta)}</td>
                          <td>
                            <SeverityBadge category={classOf(cell.risk_forward)} compact />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="data-note">
                Ranked on the change between the terrain-only risk and the forward rainfall assumption, so a steep,
                already-critical slope can sit below a moderate slope whose threshold the assumed rain actually crosses.
              </div>
            </Panel>

            <div className="stack">
              <Panel
                kicker="Regional briefing"
                title={briefing.data?.scope === 'region' ? 'Situation summary' : 'Briefing'}
                tools={briefing.data ? <span className="chip mono">{briefing.data.generated_by}</span> : null}
              >
                {briefing.loading && <LoadingRows rows={5} label="Composing the briefing" />}
                {briefing.error && <ErrorState error={briefing.error} onRetry={briefing.refetch} compact />}
                {briefing.data && (
                  <>
                    <p className="briefing-text">{briefing.data.text}</p>
                    <div className="data-note">
                      {briefing.data.caveat}
                      <br />
                      Grounded on: {briefing.data.grounded_on.join(' · ')}
                    </div>
                  </>
                )}
              </Panel>

              <Panel kicker="Season" title="Why rainfall is treated as a trigger now">
                {stats.data && (
                  <KeyValue
                    items={[
                      { key: 'Month', value: String(stats.data.season.month) },
                      { key: 'Regime', value: stats.data.season.regime.replace(/_/g, ' ') },
                      { key: 'Trigger window active', value: stats.data.season.trigger_season_active ? 'yes' : 'no' },
                      { key: 'Scenario multiplier', value: watchlist.data ? `×${watchlist.data.scenario_multiplier}` : '—' },
                      { key: 'Probability of saturation', value: 'not modelled — see Methodology' },
                    ]}
                  />
                )}
                {stats.data && <div className="data-note">{stats.data.season.note}</div>}
              </Panel>

              <Panel kicker="Model" title="Build provenance">
                {stats.data && (
                  <KeyValue
                    items={[
                      { key: 'Cells', value: stats.data.region.cells.toLocaleString('en-IN') },
                      { key: 'Districts', value: String(stats.data.region.district_count) },
                      { key: 'Mean σ', value: stats.data.uncertainty.mean_sigma.toFixed(3) },
                      { key: 'Maximum σ', value: stats.data.uncertainty.max_sigma.toFixed(3) },
                      { key: 'Records in catalogue', value: String(stats.data.evidence.total_records) },
                    ]}
                  />
                )}
                <div className="data-note">
                  See the Model module for weights, rescaling and the full provenance table behind these numbers.
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
