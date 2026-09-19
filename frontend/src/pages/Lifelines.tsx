import { useMemo, useState } from 'react';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { KeyValue } from '../components/common/KeyValue';
import { ProfileChart } from '../components/map/ProfileChart';
import { RegionMap } from '../components/map/RegionMap';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getCorridor, getCorridors, getOutline } from '../services/api';
import { formatIndex, formatKm, formatShare } from '../utils/format';

/** Module 05 — lifeline corridors scored along their length. */
export function Lifelines() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const corridors = useApiData(online ? (s) => getCorridors(s) : null, [], { enabled: online });
  const outline = useApiData(online ? (s) => getOutline(s) : null, [], { enabled: online });
  const detail = useApiData(
    online && selectedId ? (s) => getCorridor(selectedId, s) : null,
    [selectedId],
    { enabled: online && selectedId !== null },
  );

  const outlinePolys = useMemo(
    () => (outline.data?.polygons ?? []).map((ring) => ring.map(([lon, lat]) => [lat, lon] as [number, number])),
    [outline.data],
  );

  const rows = useMemo(
    () =>
      [...(corridors.data ?? [])].sort(
        (a, b) => b.criticality - a.criticality || b.summary.share_high_or_above - a.summary.share_high_or_above,
      ),
    [corridors.data],
  );

  return (
    <div className="stack">
      <PageHeader
        module="05"
        kicker="Exposure"
        title="Lifelines"
        description="Road and rail corridors sampled every two kilometres and scored against the hazard grid: how much of each corridor sits in the high bands, and where the worst segment is."
        tags={
          corridors.data ? (
            <>
              <span className="chip mono">{corridors.data.length} corridors</span>
              <DataClassTag dc="current" state="live" />
            </>
          ) : null
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <div className="lifeline-layout">
          <Panel
            kicker="Corridors"
            title="Ranked by criticality, then by exposure"
            className="lifeline-list"
          >
            {corridors.loading && <LoadingRows rows={6} label="Scoring corridors" />}
            {corridors.error && <ErrorState error={corridors.error} onRetry={corridors.refetch} />}
            {rows.length > 0 && (
              <div className="table-wrap table-wrap--tall">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Corridor</th>
                      <th className="num">Crit.</th>
                      <th className="num">Length</th>
                      <th className="num">High+ share</th>
                      <th className="num">Critical km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((corridor) => (
                      <tr key={corridor.id} className={selectedId === corridor.id ? 'is-selected' : ''}>
                        <td>
                          <button type="button" className="row-button" onClick={() => setSelectedId(corridor.id)}>
                            {corridor.name}
                          </button>
                          <span className="table__sub">
                            {corridor.mode === 'rail' ? 'Rail' : 'Road'} · {corridor.states.join(', ')}
                          </span>
                        </td>
                        <td className="num">{corridor.criticality}/3</td>
                        <td className="num">{formatKm(corridor.length_km, 0)}</td>
                        <td className="num">{formatShare(corridor.summary.share_high_or_above)}</td>
                        <td className="num">{formatKm(corridor.summary.km_in_critical, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="lifeline-detail stack">
            <Panel flush variant="map" className="lifeline-map">
              <RegionMap
                field={null}
                outline={outlinePolys}
                corridors={rows}
                highlight={
                  detail.data
                    ? [
                        {
                          label: `Worst ${detail.data.worst_segment.window_km} km window`,
                          latitude: detail.data.worst_segment.latitude,
                          longitude: detail.data.worst_segment.longitude,
                        },
                      ]
                    : []
                }
                picked={
                  detail.data
                    ? { latitude: detail.data.worst_segment.latitude, longitude: detail.data.worst_segment.longitude }
                    : null
                }
              />
            </Panel>

            {!selectedId && (
              <Panel kicker="Detail" title="Select a corridor">
                <p className="prose dim">
                  Every corridor is sampled along its published alignment. Selecting one shows its profile, its worst
                  eight-kilometre window and the isolation risk it carries.
                </p>
              </Panel>
            )}

            {selectedId && (
              <>
                <Panel
                  kicker={detail.data ? `${detail.data.mode} · ${detail.data.states.join(', ')}` : 'Corridor'}
                  title={detail.data?.name ?? 'Loading corridor'}
                  tools={detail.data ? <span className="chip mono">criticality {detail.data.criticality}/3</span> : null}
                >
                  {detail.loading && <LoadingRows rows={4} label="Loading corridor" />}
                  {detail.error && <ErrorState error={detail.error} onRetry={detail.refetch} compact />}
                  {detail.data && (
                    <>
                      <KeyValue
                        items={[
                          { key: 'Length', value: formatKm(detail.data.length_km) },
                          { key: 'Mean risk', value: formatIndex(detail.data.summary.mean_risk) },
                          { key: 'Maximum risk', value: formatIndex(detail.data.summary.max_risk) },
                          { key: 'High or above', value: `${formatKm(detail.data.summary.km_in_high_or_above)} (${formatShare(detail.data.summary.share_high_or_above)})` },
                          { key: 'Critical', value: formatKm(detail.data.summary.km_in_critical) },
                          { key: 'Isolation risk', value: formatIndex(detail.data.isolation_risk) },
                        ]}
                      />
                      <p className="prose dim small">{detail.data.criticality_note}</p>
                      <div className="data-note">{detail.data.isolation_note}</div>
                    </>
                  )}
                </Panel>

                {detail.data && (
                  <Panel
                    kicker="Worst segment"
                    title={`${detail.data.worst_segment.window_length_km.toFixed(1)} km window`}
                    tools={<SeverityBadge category={detail.data.worst_segment.class} />}
                  >
                    <KeyValue
                      items={[
                        { key: 'Coordinates', value: `${detail.data.worst_segment.latitude.toFixed(4)}, ${detail.data.worst_segment.longitude.toFixed(4)}` },
                        { key: 'Risk in window', value: formatIndex(detail.data.worst_segment.risk) },
                        { key: 'District', value: `${detail.data.worst_segment.district.district}, ${detail.data.worst_segment.district.state}` },
                        { key: 'Distance to HQ', value: formatKm(detail.data.worst_segment.district.distance_to_hq_km) },
                        { key: 'Uncertainty grade', value: detail.data.worst_segment.uncertainty_grade },
                        { key: 'Sampling resolution', value: formatKm(detail.data.grid_cell_resolution_km) },
                      ]}
                    />
                  </Panel>
                )}

                {detail.data && (
                  <Panel kicker="Profile" title="Risk along the corridor">
                    <ProfileChart profile={detail.data.profile} />
                    <div className="data-note">
                      Line: forward risk at each sample. Shaded band: the uncertainty interval at that sample. Distance is
                      measured along the sampled alignment, not the road centreline.
                    </div>
                  </Panel>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
