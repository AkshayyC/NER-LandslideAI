import { Link } from 'react-router-dom';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { ClassMatrix } from '../components/common/ClassMatrix';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { KeyValue } from '../components/common/KeyValue';
import { DataClassTag } from '../components/common/DataClassTag';
import { BarList } from '../components/common/BarList';
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  NoticeBanner,
  OfflineNotice,
} from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getBriefing, getCorridors, getStats, getWatchlist } from '../services/api';
import { formatCount, formatIndex, formatShortDate } from '../utils/format';

/** Module 01 — regional state of the hazard, the season and the watchlist. */
export function CommandCenter() {
  const { apiStatus, health } = useSystemStatus();
  const online = apiStatus === 'online';

  const stats = useApiData(online ? (s) => getStats(s) : null, [], { enabled: online });
  const briefing = useApiData(online ? (s) => getBriefing('region', s) : null, ['region'], { enabled: online });
  const watchlist = useApiData(online ? (s) => getWatchlist(6, s) : null, [6], { enabled: online });
  const corridors = useApiData(online ? (s) => getCorridors(s) : null, [], { enabled: online });

  const summary = stats.data;

  return (
    <div className="stack">
      <PageHeader
        module="01"
        kicker="Situation"
        title="Command Center"
        description="Regional hazard state for the eight North Eastern states: what the terrain can do, what the rainfall is doing, and which places the combination puts at the top of the list."
        tags={
          <>
            {summary && (
              <span className="chip mono">
                {summary.season.regime.replace(/_/g, ' ')} · month {summary.season.month}
              </span>
            )}
            <span className="chip mono">
              rainfall: {summary?.rainfall_mode ?? health?.rainfall_mode ?? '—'}
            </span>
            {health && <span className="chip mono">grid built {formatShortDate(health.built_at)}</span>}
          </>
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          <div className="grid-4">
            <StatCard
              label="Modelled cells"
              value={summary ? formatCount(summary.region.cells) : '—'}
              sub={summary ? `${summary.region.cell_area_km2} km² per cell` : undefined}
              accent="var(--c-susceptibility)"
              tag={<DataClassTag dc="susceptibility" state="live" />}
            />
            <StatCard
              label="Mean susceptibility"
              value={formatIndex(summary?.susceptibility.mean)}
              sub="relative index, 0–1"
              accent="var(--c-susceptibility)"
            />
            <StatCard
              label="Mean risk now"
              value={formatIndex(summary?.risk_now.mean)}
              sub={
                summary
                  ? summary.rainfall_mode === 'live'
                    ? 'with observed 72 h rainfall'
                    : 'normal rainfall for this month'
                  : undefined
              }
              accent="var(--c-current)"
              tag={<DataClassTag dc="current" state={summary?.rainfall_mode === 'live' ? 'live' : 'offline'} stateLabel={summary?.rainfall_mode === 'live' ? 'OPEN-METEO' : 'CLIMATOLOGY'} />}
            />
            <StatCard
              label="Evidence records"
              value={summary ? formatCount(summary.evidence.total_records) : '—'}
              sub={summary ? `${Object.keys(summary.evidence.by_state).length} states represented` : undefined}
              accent="var(--c-historical)"
              tag={<DataClassTag dc="historical" state="live" />}
            />
          </div>

          <div className="grid-2">
            <Panel
              kicker="Distribution"
              title="Where the region sits on the scale"
              tools={<DataClassTag dc="susceptibility" state="live" />}
            >
              {stats.loading && <LoadingRows rows={3} label="Loading regional statistics" />}
              {stats.error && <ErrorState error={stats.error} onRetry={stats.refetch} compact />}
              {summary && (
                <div className="stack">
                  <div>
                    <div className="panel__kicker">Susceptibility · terrain only</div>
                    <ClassMatrix counts={summary.susceptibility.class_counts} total={summary.region.cells} />
                  </div>
                  <div>
                    <div className="panel__kicker">Risk with current rainfall</div>
                    <ClassMatrix counts={summary.risk_now.class_counts} total={summary.region.cells} />
                  </div>
                  <div>
                    <div className="panel__kicker">Risk under the forward assumption</div>
                    <ClassMatrix counts={summary.risk_forward.class_counts} total={summary.region.cells} />
                  </div>
                  <div className="data-note">
                    Classes are ordinal bands on a relative index (cuts 0.40 / 0.60 / 0.80), not event probabilities.{' '}
                    {summary.rainfall_mode === 'live'
                      ? '“Forward” adds the 72-hour forecast to the observed rainfall.'
                      : '“Forward” is a planning scenario: the configured multiplier applied to the local monthly mean, because no live rainfall feed is reachable from this deployment.'}
                  </div>
                </div>
              )}
            </Panel>

            <div className="stack">
              <Panel kicker="Narrative" title="Regional briefing" tools={<span className="chip mono">{briefing.data?.generated_by ?? '—'}</span>}>
                {briefing.loading && <LoadingRows rows={4} label="Composing briefing" />}
                {briefing.error && <ErrorState error={briefing.error} onRetry={briefing.refetch} compact />}
                {briefing.data && (
                  <>
                    <p className="briefing-text">{briefing.data.text}</p>
                    <div className="data-note">
                      {briefing.data.caveat} Grounded on: {briefing.data.grounded_on.join(', ')}.
                    </div>
                  </>
                )}
              </Panel>

              <Panel kicker="Model" title="Build and data provenance">
                {health && (
                  <KeyValue
                    columns={2}
                    items={[
                      { key: 'Model', value: health.model_id },
                      { key: 'Version', value: health.version },
                      { key: 'Cells in region', value: formatCount(health.grid_cells) },
                      { key: 'Factors', value: String(health.factor_count) },
                      { key: 'Rainfall mode', value: health.rainfall_mode },
                      {
                        key: 'Terrain source',
                        value: summary ? summary.region.states.length + ' states served' : '—',
                      },
                    ]}
                  />
                )}
                {summary && (
                  <div className="data-note">
                    Terrain from compiled control points (not a DEM); rainfall from station climatology.
                    Every factor is listed with its weight on the Model page.
                  </div>
                )}
              </Panel>
            </div>
          </div>

          <div className="grid-2">
            <Panel
              kicker="Watchlist"
              title="Cells where rain moves the needle most"
              tools={<Link className="row-button" to="/watchlist">All cells →</Link>}
            >
              {watchlist.loading && <LoadingRows rows={4} label="Ranking cells" />}
              {watchlist.error && <ErrorState error={watchlist.error} onRetry={watchlist.refetch} compact />}
              {watchlist.data && watchlist.data.cells.length === 0 && (
                <EmptyState title="No cells on the watchlist" hint="The ranking returned no cells for this configuration." />
              )}
              {watchlist.data && watchlist.data.cells.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>District</th>
                        <th className="num">Risk now</th>
                        <th className="num">Forward</th>
                        <th className="num">Change</th>
                        <th>Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlist.data.cells.map((cell) => (
                        <tr key={`${cell.latitude}-${cell.longitude}`}>
                          <td>
                            {cell.district}
                            <span className="table__sub mono">
                              {cell.latitude.toFixed(2)}, {cell.longitude.toFixed(2)}
                            </span>
                          </td>
                          <td className="num">{formatIndex(cell.risk_now)}</td>
                          <td className="num">{formatIndex(cell.risk_forward)}</td>
                          <td className="num">+{cell.delta.toFixed(3)}</td>
                          <td>
                            <SeverityBadge category={cell.risk_forward >= 0.8 ? 'CRITICAL' : cell.risk_forward >= 0.6 ? 'HIGH' : cell.risk_forward >= 0.4 ? 'MODERATE' : 'LOW'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="stack">
              <Panel kicker="Lifelines" title="Most exposed corridors" tools={<Link className="row-button" to="/lifelines">All corridors →</Link>}>
                {corridors.loading && <LoadingRows rows={4} label="Scoring corridors" />}
                {corridors.error && <ErrorState error={corridors.error} onRetry={corridors.refetch} compact />}
                {corridors.data && (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Corridor</th>
                        <th className="num">Criticality</th>
                        <th className="num">High+ share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...corridors.data]
                        .sort((a, b) => b.summary.share_high_or_above - a.summary.share_high_or_above)
                        .slice(0, 5)
                        .map((corridor) => (
                          <tr key={corridor.id}>
                            <td>
                              {corridor.name}
                              <span className="table__sub">{corridor.states.join(', ')}</span>
                            </td>
                            <td className="num">{corridor.criticality}/3</td>
                            <td className="num">{(corridor.summary.share_high_or_above * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel kicker="Evidence" title="Catalogue by trigger">
                {summary && (
                  <>
                    <BarList
                      items={Object.entries(summary.evidence.catalogue_by_trigger).map(([label, value]) => ({
                        label,
                        value: value ?? 0,
                      }))}
                      unit=" events"
                    />
                    <div className="data-note">
                      {formatCount(summary.evidence.total_records)} records inside a {summary.evidence.report_radius_km} km
                      reporting radius; evidence is resampled with a {summary.evidence.evidence_bandwidth_km} km kernel.
                      Earthquake-triggered events are catalogue context and are not modelled as rainfall triggers.
                    </div>
                  </>
                )}
              </Panel>

              {health && !health.immediate_actions && (
                <NoticeBanner tone="info" title="Research prototype">
                  {health.disclaimer} Outputs are model estimates on a generalised 0.04° grid; verify
                  against field observation before acting on them.
                </NoticeBanner>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
