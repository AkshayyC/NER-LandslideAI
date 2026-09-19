import { Panel } from '../components/common/Panel';
import { PageHeader } from '../components/common/PageHeader';
import { DataClassTag } from '../components/common/DataClassTag';
import { KeyValue } from '../components/common/KeyValue';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { ErrorState, LoadingRows, OfflineNotice } from '../components/common/states';
import { useApiData } from '../hooks/useApiData';
import { useSystemStatus } from '../context/SystemStatusContext';
import { getMethodology } from '../services/api';
import { SEVERITY_ORDER, SEVERITY_META } from '../constants/dataClasses';
import { formatIndex } from '../utils/format';

/** Module 09 — the definitions, straight from the running model. */
export function MethodologyPage() {
  const { apiStatus } = useSystemStatus();
  const online = apiStatus === 'online';
  const methodology = useApiData(online ? (s) => getMethodology(s) : null, [], { enabled: online });

  const data = methodology.data;
  const bands = (data?.severity_bands ?? {}) as Record<string, string | number>;
  const uncertainty = (data?.uncertainty ?? {}) as Record<string, string>;

  return (
    <div className="stack">
      <PageHeader
        module="09"
        kicker="Reference"
        title="Methodology"
        description="The model's own definition of its terms: what the index is, how the trigger ratio is formed, how the severity bands are cut, and how uncertainty is reported."
        tags={data ? <span className="chip mono">{data.model_id}</span> : null}
      />

      {apiStatus === 'offline' && <OfflineNotice />}

      {online && (
        <>
          {methodology.loading && <Panel><LoadingRows rows={6} label="Reading methodology" /></Panel>}
          {methodology.error && <Panel><ErrorState error={methodology.error} onRetry={methodology.refetch} /></Panel>}

          {data && (
            <>
              <Panel kicker="Index" title="What the susceptibility index is" tools={<DataClassTag dc="susceptibility" state="live" />}>
                <p className="prose mono formula">{data.index_transform.form}</p>
                <p className="prose">{data.index_transform.note}</p>
                <KeyValue
                  items={[
                    { key: 'Gate', value: data.index_transform.gate },
                    { key: 'Percentile fixing', value: data.index_transform.percentile_fixing },
                    { key: 'Low anchor (raw)', value: formatIndex(data.index_transform.detail.raw_fit_low) },
                    { key: 'High anchor (raw)', value: formatIndex(data.index_transform.detail.raw_fit_high) },
                    { key: 'Scale', value: data.index_transform.detail.scale.toFixed(4) },
                    { key: 'Constant', value: data.index_transform.detail.constant.toFixed(4) },
                  ]}
                />
              </Panel>

              <div className="grid-2">
                <Panel kicker="Trigger" title="Rainfall ratio and risk">
                  <table className="thr thr--left">
                    <tbody>
                      {Object.entries(data.trigger).map(([key, value]) => (
                        <tr key={key}>
                          <td>{key.replace(/_/g, ' ')}</td>
                          <td className="prose mono">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>

                <Panel kicker="Severity" title="Band definitions">
                  <div className="row band-row">
                    {SEVERITY_ORDER.map((category) => (
                      <span key={category} className="band-chip">
                        <SeverityBadge category={category} compact />
                        <span className="mono dim">
                          {bands[category] !== undefined ? String(bands[category]) : SEVERITY_META[category].label}
                        </span>
                      </span>
                    ))}
                  </div>
                  {bands.note && <div className="data-note">{String(bands.note)}</div>}
                  {!bands.note && (
                    <div className="data-note">
                      Bands are ordinal cuts on the relative index. A class is not a probability, and no return period is
                      implied.
                    </div>
                  )}
                </Panel>
              </div>

              <div className="grid-2">
                <Panel kicker="Uncertainty" title="How σ is derived">
                  {Object.entries(uncertainty).length > 0 ? (
                    <table className="thr thr--left">
                      <tbody>
                        {Object.entries(uncertainty).map(([key, value]) => (
                          <tr key={key}>
                            <td>{key.replace(/_/g, ' ')}</td>
                            <td className="prose">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="prose dim">The backend did not report an uncertainty block for this build.</p>
                  )}
                </Panel>

                <Panel kicker="Factors" title="Weighted terms">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Factor</th>
                        <th className="num">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.factors.map((factor) => (
                        <tr key={factor.id}>
                          <td>
                            {factor.label}
                            <span className="table__sub mono">{factor.id}</span>
                          </td>
                          <td className="num">{factor.weight.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </div>

              <Panel kicker="Provenance" title="Inputs and their standing">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.provenance).map(([key, value]) => (
                      <tr key={key}>
                        <td className="mono">{key}</td>
                        <td className="prose small">{typeof value === 'string' ? value : JSON.stringify(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              <Panel kicker="Limitations" title="Stated by the model itself">
                <ul className="limit-list">
                  {data.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
