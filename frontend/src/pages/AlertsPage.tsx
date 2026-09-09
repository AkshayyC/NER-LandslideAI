import { BellOff, CloudRain, RadioTower, Siren } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { EmptyState, NoticeBanner } from '../components/common/states';

interface ComponentStatus {
  component: string;
  role: string;
  status: 'PENDING' | 'PLANNED' | 'NOT IN SCOPE';
  note: string;
}

const PIPELINE: ComponentStatus[] = [
  {
    component: 'Rainfall observation feed',
    role: 'Live/observed rainfall for trigger evaluation',
    status: 'PENDING',
    note: 'Data source selected in docs/data_sources.md; API integration not yet built.',
  },
  {
    component: 'Rainfall forecast feed',
    role: 'Short-range forecast input for forward-looking triggers',
    status: 'PLANNED',
    note: 'Follows the observation feed; requires a licensed/operational forecast source.',
  },
  {
    component: 'Trigger threshold engine',
    role: 'Combines event + antecedent rainfall into trigger levels',
    status: 'PLANNED',
    note: 'Thresholds will be calibrated with the trained susceptibility model. No thresholds exist yet — none are assumed by this UI.',
  },
  {
    component: 'Alert issuance service',
    role: 'Emits watch/advisory/warning messages',
    status: 'PLANNED',
    note: 'Design stage; subject to validation and operational review.',
  },
  {
    component: 'Public dissemination',
    role: 'Delivery to end users (SMS/apps)',
    status: 'NOT IN SCOPE',
    note: 'Out of scope for this research prototype.',
  },
];

/** MODULE 07 — the interface shell for future rainfall-triggered warnings.
 * It is explicit everywhere: integration is PENDING and nothing here is an
 * operational warning. */
export function AlertsPage() {
  return (
    <div className="page">
      <PageHeader
        module="07"
        kicker="ALERTS / WARNING"
        title="Rainfall-triggered warning console"
        description="Interface prepared for the future trigger module. Today it intentionally shows no alerts and rates nothing."
        tags={
          <>
            <DataClassTag dc="trigger" />
            <DataClassTag dc="current" />
          </>
        }
      />

      <NoticeBanner tone="danger" title="Rainfall trigger integration pending" icon={<CloudRain size={16} />}>
        This console is <strong>not receiving any rainfall or trigger feed</strong> and cannot issue
        warnings. Historical susceptibility shown elsewhere in this platform must never be
        interpreted as an operational early warning.
      </NoticeBanner>

      <div className="alert-grid">
        <Panel kicker="LIVE FEED" title="Alert feed" tools={<span className="chip chip--muted mono">FEED: NOT CONNECTED</span>}>
          <EmptyState
            icon={<BellOff size={20} />}
            title="No operational alerts"
            hint={
              <>
                This console is not connected to a rainfall trigger feed. When the trigger module is
                integrated, advisory and warning messages will appear here with their validity window
                and issuing basis.
              </>
            }
          />
          <div className="alert-wireframe" aria-hidden="true">
            <div className="alert-wireframe__row">
              <span className="alert-wireframe__k">LEVEL</span>
              <span className="alert-wireframe__v">—</span>
            </div>
            <div className="alert-wireframe__row">
              <span className="alert-wireframe__k">AREA</span>
              <span className="alert-wireframe__v">—</span>
            </div>
            <div className="alert-wireframe__row">
              <span className="alert-wireframe__k">VALID</span>
              <span className="alert-wireframe__v">—</span>
            </div>
            <div className="alert-wireframe__row">
              <span className="alert-wireframe__k">BASIS</span>
              <span className="alert-wireframe__v">—</span>
            </div>
          </div>
          <div className="panel-footnote">
            Wireframe slots only — fields stay empty until a real issuance service exists.
          </div>
        </Panel>

        <div className="alert-rail">
          <Panel kicker="DESIGN INTENT" title="What the trigger module will add" tools={<Siren size={15} aria-hidden="true" />}>
            <p className="prose">
              Susceptibility says <em>where</em> landslides are plausible. Warnings need{' '}
              <em>when</em>: heavy or sustained rainfall acting on susceptible terrain. The planned
              trigger engine will combine event rainfall with antecedent conditions and modulate the
              susceptibility category into a time-specific advisory — with thresholds fixed during
              model calibration, never guessed by the interface.
            </p>
            <div className="trigger-chain mono">
              SUSCEPTIBILITY + RAINFALL TRIGGER → TIME-SPECIFIC RISK
            </div>
          </Panel>

          <Panel kicker="READINESS" title="Component status">
            <div className="table-wrap">
              <table className="table table--readiness">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {PIPELINE.map((c) => (
                    <tr key={c.component}>
                      <td>
                        <div className="readiness__name">
                          <RadioTower size={12} aria-hidden="true" /> {c.component}
                        </div>
                        <div className="readiness__note">{c.note}</div>
                      </td>
                      <td>
                        <span
                          className={`readiness-badge readiness-badge--${c.status.split(' ')[0].toLowerCase()}`}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
