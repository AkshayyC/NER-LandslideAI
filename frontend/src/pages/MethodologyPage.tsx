import {
  ArrowDown,
  BookOpen,
  CloudRain,
  Gem,
  MapPin,
  Mountain,
  Route,
  Shovel,
  TreePine,
  Waves,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { DATA_CLASS_LIST } from '../constants/dataClasses';

const SOURCES: Array<{ icon: typeof MapPin; name: string; detail: string }> = [
  {
    icon: MapPin,
    name: 'GSI landslide inventory',
    detail: 'Documented historical landslide events — location, date where available, event attributes. Provides positive examples and historical context.',
  },
  {
    icon: Mountain,
    name: 'Terrain / DEM',
    detail: 'Elevation and derived slope, aspect and other terrain characteristics representing geometric susceptibility.',
  },
  {
    icon: CloudRain,
    name: 'Rainfall',
    detail: 'Rainfall amounts with observation date/time and location — event and antecedent conditions associated with landsliding.',
  },
  {
    icon: Gem,
    name: 'Geology',
    detail: 'Lithology and structural context where reliable layers are available.',
  },
  {
    icon: Shovel,
    name: 'Soil',
    detail: 'Soil type/properties as a conditioning factor for slope failure.',
  },
  {
    icon: TreePine,
    name: 'Land cover & vegetation',
    detail: 'Cover type and vegetation state influencing slope stability.',
  },
  {
    icon: Waves,
    name: 'Hydrology / drainage',
    detail: 'Drainage characteristics and related hydrological context.',
  },
  {
    icon: Route,
    name: 'Roads & settlements',
    detail: 'Proximity to infrastructure — both a susceptibility factor and the reason inventory coverage is uneven.',
  },
];

/** MODULE 08 — the full methodology narrative: sources → features →
 * susceptibility + trigger → risk intelligence, with the four data classes
 * kept strictly apart. */
export function MethodologyPage() {
  return (
    <div className="page">
      <PageHeader
        module="08"
        kicker="METHODOLOGY"
        title="From evidence to risk intelligence"
        description="How NER-LandslideAI is designed to work end-to-end — and which parts are live, pending, or planned. Content mirrors docs/methodology.md and docs/data_sources.md."
        tags={
          <>
            <DataClassTag dc="historical" stateLabel="PAST" />
            <DataClassTag dc="susceptibility" stateLabel="STATIC" />
            <DataClassTag dc="trigger" />
            <DataClassTag dc="current" />
          </>
        }
      />

      <Panel kicker="PIPELINE" title="Data sources → risk intelligence" flush>
        <div className="flow">
          <div className="flow__stage">
            <div className="flow__stage-title mono">STAGE 1 · EVIDENCE & CONTEXT</div>
            <div className="src-grid">
              {SOURCES.map((s) => {
                const Icon = s.icon;
                return (
                  <div className="src-card" key={s.name}>
                    <div className="src-card__icon">
                      <Icon size={15} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="src-card__name">{s.name}</div>
                      <div className="src-card__desc">{s.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flow__arrow" aria-hidden="true">
            <ArrowDown size={18} />
          </div>

          <div className="flow__stage">
            <div className="flow__stage-title mono">STAGE 2 · FEATURE ENGINEERING</div>
            <div className="pipeline-node">
              <div className="pipeline-node__title">Feature construction — src/features/</div>
              <ul className="pipeline-node__list">
                <li>terrain derivatives: slope, aspect from DEM</li>
                <li>rainfall windows: event + antecedent accumulations</li>
                <li>environmental layers harmonised to a common grid/CRS</li>
                <li>background (non-landslide) sample construction</li>
              </ul>
            </div>
          </div>

          <div className="flow__arrow" aria-hidden="true">
            <ArrowDown size={18} />
          </div>

          <div className="flow__split">
            <div className="flow__stage">
              <div className="flow__stage-title mono">STAGE 3A · SUSCEPTIBILITY</div>
              <div className="pipeline-node pipeline-node--sus">
                <div className="pipeline-node__title">Susceptibility model (Random Forest / XGBoost)</div>
                <ul className="pipeline-node__list">
                  <li>spatially/temporally validated training</li>
                  <li>probability of landslide-prone conditions</li>
                  <li>STATIC — spatial predisposition only</li>
                </ul>
                <div className="pipeline-node__status">
                  <DataClassTag dc="susceptibility" />
                </div>
              </div>
            </div>
            <div className="flow__stage">
              <div className="flow__stage-title mono">STAGE 3B · RAINFALL TRIGGER</div>
              <div className="pipeline-node pipeline-node--pending">
                <div className="pipeline-node__title">Rainfall trigger module</div>
                <ul className="pipeline-node__list">
                  <li>event + antecedent rainfall vs calibrated thresholds</li>
                  <li>modulates susceptibility in time</li>
                </ul>
                <div className="pipeline-node__status">
                  <DataClassTag dc="trigger" />
                </div>
              </div>
            </div>
          </div>

          <div className="flow__arrow" aria-hidden="true">
            <ArrowDown size={18} />
          </div>

          <div className="flow__stage">
            <div className="flow__stage-title mono">STAGE 4 · RISK INTELLIGENCE</div>
            <div className="pipeline-node pipeline-node--risk">
              <div className="pipeline-node__title">Risk engine + early warning — src/risk_engine/</div>
              <ul className="pipeline-node__list">
                <li>probability + context → LOW / MODERATE / HIGH / CRITICAL</li>
                <li>trigger-aware, time-specific interpretation</li>
                <li>operational use only after validation & review</li>
              </ul>
              <div className="pipeline-node__status">
                <DataClassTag dc="current" />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel kicker="DEFINITIONS" title="The four classes — and how they differ">
        <div className="grid grid--4">
          {DATA_CLASS_LIST.map((dc) => (
            <div className="class-def" key={dc.key} style={{ '--class-color': dc.color } as React.CSSProperties}>
              <div className="class-def__head">
                <DataClassTag dc={dc.key} />
              </div>
              <div className="class-def__tagline">{dc.tagline}</div>
              <p className="class-def__desc">{dc.description}</p>
              <div className="class-def__status mono">{dc.statusLabel}</div>
            </div>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table table--classes">
            <thead>
              <tr>
                <th>Question</th>
                <th>Historical</th>
                <th>Susceptibility</th>
                <th>Trigger</th>
                <th>Current / Forecast</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>What it answers</td>
                <td>“Where have landslides been recorded?”</td>
                <td>“How prone is this place?”</td>
                <td>“Is the rain condition present now?”</td>
                <td>“What is the risk in this window?”</td>
              </tr>
              <tr>
                <td>Time domain</td>
                <td>Past</td>
                <td>Static (spatial)</td>
                <td>Now / recent</td>
                <td>Now / next hours–days</td>
              </tr>
              <tr>
                <td>Status here</td>
                <td>Backend data</td>
                <td>Backend data</td>
                <td colSpan={2} className="mono">
                  PENDING — NOT OPERATIONAL
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel kicker="DATA QUALITY" title="Every input is assessed before use">
        <p className="prose">
          Per <span className="mono">docs/data_sources.md</span>, each dataset entering the pipeline is
          evaluated for spatial coverage, temporal coverage, spatial and temporal resolution, missing
          values, coordinate reference system, and licensing/usage restrictions. Layers that fail the
          bar are excluded — they are never replaced by synthetic substitutes.
        </p>
        <div className="provenance-chips">
          <span className="chip">
            <BookOpen size={12} aria-hidden="true" /> registry: docs/data_sources.md
          </span>
          <span className="chip">model spec: docs/methodology.md</span>
          <span className="chip">pipeline code: src/data · src/features · src/models · src/risk_engine</span>
        </div>
      </Panel>

      <Panel kicker="DISCLAIMER" title="Status of this platform">
        <p className="prose">
          NER-LandslideAI is a research/hackathon prototype. It is <strong>not an operational
          emergency-warning system</strong>, and its outputs should not independently determine
          evacuation or emergency decisions. Susceptibility values are model estimates for research;
          alerting remains disabled until the rainfall trigger module is integrated and validated.
        </p>
      </Panel>
    </div>
  );
}
