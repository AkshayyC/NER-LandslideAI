import { useMemo, useState } from 'react';
import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { BarList } from '../components/common/BarList';
import { KeyValue } from '../components/common/KeyValue';
import { RegionMap } from '../components/map/RegionMap';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getEvents, getOutline, getStats } from '../services/api';
import { formatShortDate } from '../utils/format';

const TRIGGER_ORDER = ['rainfall', 'earthquake', 'glof', 'cyclone', 'other'] as const;

/** Module 06 — the recorded event catalogue behind the historical factor. */
export function Evidence() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const [stateFilter, setStateFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');

  const events = useApiData(online ? (s) => getEvents(undefined, s) : null, [], { enabled: online });
  const outline = useApiData(online ? (s) => getOutline(s) : null, [], { enabled: online });
  const stats = useApiData(online ? (s) => getStats(s) : null, [], { enabled: online });

  const rows = useMemo(() => {
    const list = [...(events.data ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    return list.filter((event) => {
      if (stateFilter && event.state !== stateFilter) return false;
      if (triggerFilter && event.trigger !== triggerFilter) return false;
      return true;
    });
  }, [events.data, stateFilter, triggerFilter]);

  const states = useMemo(
    () => Array.from(new Set((events.data ?? []).map((e) => e.state))).sort(),
    [events.data],
  );

  const outlinePolys = useMemo(
    () => (outline.data?.polygons ?? []).map((ring) => ring.map(([lon, lat]) => [lat, lon] as [number, number])),
    [outline.data],
  );

  const triggered = (events.data ?? []).filter((e) => e.trigger === 'rainfall').length;

  return (
    <div className="stack">
      <PageHeader
        module="06"
        kicker="History"
        title="Evidence"
        description="The compiled catalogue of major recorded events used by the historical factor. Events are evidence about the past; they are never mixed into the rainfall trigger."
        tags={
          stats.data ? (
            <>
              <span className="chip mono">{stats.data.evidence.total_records} records</span>
              <DataClassTag dc="historical" state="live" />
            </>
          ) : null
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          <div className="grid-3">
            <Panel kicker="Catalogue" title="Composition">
              {stats.loading && <LoadingRows rows={4} label="Loading catalogue summary" />}
              {stats.error && <ErrorState error={stats.error} onRetry={stats.refetch} compact />}
              {stats.data && (
                <BarList
                  items={TRIGGER_ORDER.filter((t) => stats.data!.evidence.catalogue_by_trigger[t]).map((t) => ({
                    label: t.charAt(0).toUpperCase() + t.slice(1),
                    value: stats.data!.evidence.catalogue_by_trigger[t] ?? 0,
                  }))}
                  unit=" events"
                />
              )}
              <div className="data-note">
                Earthquake-triggered slides are recorded for context — regional shaking prepares slopes — but they are
                not modelled as rainfall triggers.
              </div>
            </Panel>

            <Panel kicker="Coverage" title="By state">
              {stats.data && (
                <BarList
                  items={Object.entries(stats.data.evidence.by_state)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, value]) => ({ label, value }))}
                  unit=" records"
                />
              )}
            </Panel>

            <Panel kicker="Method" title="How evidence enters the model">
              {stats.data && (
                <KeyValue
                  items={[
                    { key: 'Records in catalogue', value: String(stats.data.evidence.total_records) },
                    { key: 'Kernel bandwidth', value: `${stats.data.evidence.evidence_bandwidth_km} km` },
                    { key: 'Reporting radius', value: `${stats.data.evidence.report_radius_km} km` },
                    { key: 'Rainfall-triggered records', value: `${triggered} of ${stats.data.evidence.total_records}` },
                    { key: 'Factor weight', value: '0.12, applied as a density kernel' },
                  ]}
                />
              )}
              <div className="data-note">
                Each record contributes a weighted Gaussian kernel at its reported point. A record’s confidence sets its
                weight; the density is then converted to a percentile rank before it enters the index.
              </div>
            </Panel>
          </div>

          <div className="evidence-layout">
            <Panel flush variant="map" className="evidence-map">
              <RegionMap field={null} outline={outlinePolys} events={rows} />
            </Panel>

            <Panel
              kicker="Records"
              title={`${rows.length} events in view`}
              className="evidence-table"
              tools={
                <div className="row">
                  <select className="input" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                    <option value="">All states</option>
                    {states.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                  <select className="input" value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value)}>
                    <option value="">All triggers</option>
                    {TRIGGER_ORDER.map((trigger) => (
                      <option key={trigger} value={trigger}>
                        {trigger}
                      </option>
                    ))}
                  </select>
                </div>
              }
            >
              {events.loading && <LoadingRows rows={6} label="Loading catalogue" />}
              {events.error && <ErrorState error={events.error} onRetry={events.refetch} />}
              {events.data && (
                <div className="table-wrap table-wrap--tall">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Place</th>
                        <th>Trigger</th>
                        <th>Confidence</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((event) => (
                        <tr key={event.id}>
                          <td className="num">{formatShortDate(event.date)}</td>
                          <td>
                            {event.place}
                            <span className="table__sub">
                              {event.district}, {event.state} · {event.location_precision}
                            </span>
                          </td>
                          <td>{event.trigger}</td>
                          <td>{event.confidence}</td>
                          <td>
                            {event.magnitude_note}
                            <span className="table__sub">{event.summary}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {events.data && rows.length === 0 && <p className="prose dim">No event matches the current filter.</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
