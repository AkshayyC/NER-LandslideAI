import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { KeyValue } from '../components/common/KeyValue';
import { ClassMatrix } from '../components/common/ClassMatrix';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getMeta, getStats } from '../services/api';
import { formatCount, formatIndex } from '../utils/format';

/** Module 08 — what the model is made of, and what it is not. */
export function ModelInsights() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';

  const meta = useApiData(online ? (s) => getMeta(s) : null, [], { enabled: online });
  const stats = useApiData(online ? (s) => getStats(s) : null, [], { enabled: online });

  return (
    <div className="stack">
      <PageHeader
        module="08"
        kicker="Model card"
        title="Model"
        description="The complete configuration of the build serving this session: factor weights, the index transform, the rainfall trigger, evidence handling and data provenance — read from the running backend, not from a document."
        tags={
          meta.data ? (
            <>
              <span className="chip mono">{meta.data.model_id}</span>
              <span className="chip mono">v{meta.data.version}</span>
              <DataClassTag dc="susceptibility" state="live" />
            </>
          ) : null
        }
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          {meta.loading && <Panel><LoadingRows rows={6} label="Reading model configuration" /></Panel>}
          {meta.error && <Panel><ErrorState error={meta.error} onRetry={meta.refetch} /></Panel>}

          {meta.data && (
            <>
              <div className="grid-2">
                <Panel kicker="Structure" title="Weighted factors">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Factor</th>
                        <th className="num">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(meta.data.factors.weights).map(([id, weight]) => (
                        <tr key={id}>
                          <td>
                            {meta.data!.factors.labels[id] ?? id}
                            <span className="table__sub mono">{id}</span>
                          </td>
                          <td className="num">{weight.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          {meta.data.factors.gate}
                          <span className="table__sub mono">multiplier, not a summand</span>
                        </td>
                        <td className="num">gate</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="data-note">
                    The five weighted factors are normalised ranks; the elevation-band gate multiplies their weighted sum,
                    so low ground cannot inherit an alpine score.
                  </div>
                </Panel>

                <Panel kicker="Transform" title="Raw score to published index">
                  <KeyValue
                    items={[
                      { key: 'Form', value: 'index = clip(constant + scale × gate × Σ(wᵢ·fᵢ), floor, ceiling)' },
                      { key: 'Fit percentiles', value: meta.data.rescale.fit_percentiles ? meta.data.rescale.fit_percentiles.join(' / ') : 'not reported' },
                      { key: 'Low anchor', value: formatIndex(meta.data.rescale.raw_fit_low) },
                      { key: 'High anchor', value: formatIndex(meta.data.rescale.raw_fit_high) },
                      { key: 'Scale', value: meta.data.rescale.scale.toFixed(4) },
                      { key: 'Constant', value: meta.data.rescale.constant.toFixed(4) },
                      { key: 'Floor / ceiling', value: `${meta.data.rescale.index_floor} / ${meta.data.rescale.index_ceil}` },
                    ]}
                  />
                  <div className="data-note">
                    Because the index is an affine transform of a weighted sum, each factor’s contribution can be reported
                    exactly in index units — that is what the attribution bars on the Location module show.
                  </div>
                </Panel>
              </div>

              <div className="grid-3">
                <Panel kicker="Grid" title="Geometry">
                  <KeyValue
                    items={[
                      { key: 'Resolution', value: `${meta.data.grid.resolution_deg}°` },
                      { key: 'Envelope', value: meta.data.grid.envelope.map((v) => v.toFixed(2)).join(' – ') },
                      { key: 'Rows × columns', value: `${meta.data.grid.rows} × ${meta.data.grid.cols}` },
                      { key: 'Cells evaluated', value: formatCount(meta.data.grid.cells_in_region) },
                      { key: 'Cells in grid', value: formatCount(meta.data.grid.cells_total) },
                      { key: 'Built in', value: `${meta.data.build_seconds.toFixed(2)} s` },
                    ]}
                  />
                </Panel>

                <Panel kicker="Trigger" title="Rainfall model">
                  <KeyValue
                    items={[
                      { key: 'Terrain source', value: meta.data.terrain_source },
                      { key: 'Rainfall source', value: meta.data.rainfall_source },
                      { key: 'Rainfall mode', value: meta.data.rainfall_status.mode },
                      { key: 'Provider', value: meta.data.rainfall_status.provider },
                      { key: 'Cached points', value: String(meta.data.rainfall_status.cached_points) },
                      { key: 'Last success', value: meta.data.rainfall_status.last_success ?? 'never reached' },
                    ]}
                  />
                  <div className="data-note">
                    {meta.data.rainfall_status.last_error
                      ? `Live feed unavailable: ${meta.data.rainfall_status.last_error}. The engine falls back to the compiled station climatology and labels every response accordingly.`
                      : 'A live feed was reachable for this build.'}
                  </div>
                </Panel>

                <Panel kicker="Uncertainty" title="Stated-band heuristic">
                  {stats.data && (
                    <KeyValue
                      items={[
                        { key: 'Mean σ', value: stats.data.uncertainty.mean_sigma.toFixed(3) },
                        { key: 'Maximum σ', value: stats.data.uncertainty.max_sigma.toFixed(3) },
                        { key: 'Grade scale', value: 'A (best) to D' },
                        { key: 'Basis', value: 'terrain support, terrain variability, evidence density' },
                      ]}
                    />
                  )}
                  <div className="data-note">
                    σ is a heuristic band width, not a probability interval. It is reported so that a cell sitting in
                    terrain the surface barely constrains is visibly weaker evidence.
                  </div>
                </Panel>
              </div>

              {stats.data && (
                <div className="grid-3">
                  <Panel kicker="Distribution" title="Susceptibility classes">
                    <ClassMatrix counts={stats.data.susceptibility.class_counts} total={stats.data.region.cells} />
                    <div className="data-note">Mean {formatIndex(stats.data.susceptibility.mean)} · p90 {formatIndex(stats.data.susceptibility.p90)}</div>
                  </Panel>
                  <Panel kicker="Distribution" title="Risk with current rainfall">
                    <ClassMatrix counts={stats.data.risk_now.class_counts} total={stats.data.region.cells} />
                    <div className="data-note">Mean {formatIndex(stats.data.risk_now.mean)} · p90 {formatIndex(stats.data.risk_now.p90)}</div>
                  </Panel>
                  <Panel kicker="Distribution" title="Risk under the forward scenario">
                    <ClassMatrix counts={stats.data.risk_forward.class_counts} total={stats.data.region.cells} />
                    <div className="data-note">Mean {formatIndex(stats.data.risk_forward.mean)} · p90 {formatIndex(stats.data.risk_forward.p90)}</div>
                  </Panel>
                </div>
              )}

              <Panel kicker="Provenance" title="Where every layer comes from">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Kind</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.data?.provenance ?? {}).map(([key, entry]) => {
                      const record = entry as unknown as { title?: string; kind?: string; accuracy?: string };
                      return (
                        <tr key={key}>
                          <td>{record.title ?? key}</td>
                          <td>{record.kind ?? '—'}</td>
                          <td>{record.accuracy ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="data-note">
                  Imported files in this build: {meta.data.imported_files.length > 0 ? meta.data.imported_files.join(', ') : 'none — the shipped reference dataset is in use'}.
                </div>
              </Panel>

              <Panel kicker="Limits" title="What this model does not claim">
                <ul className="limit-list">
                  <li>Terrain is a generalised surface interpolated from control points, not a surveyed DEM. Slope-derived factors are relative indices, not engineering gradients.</li>
                  <li>The trigger uses a climatological window when no live feed is reachable; it is a planning assumption, and is labelled as such everywhere it appears.</li>
                  <li>Severity classes are ordinal bands on a relative index. They are not probabilities and carry no return period.</li>
                  <li>The evidence catalogue is a reference compilation of major events, not a complete inventory; absence of a record is not evidence of absence.</li>
                  <li>District assignment is a Voronoi approximation around headquarters, not an administrative boundary.</li>
                </ul>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
