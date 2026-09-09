import { BrainCircuit, CircleDot, GitBranch, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataClassTag } from '../components/common/DataClassTag';
import { NoticeBanner } from '../components/common/states';
import { useSystemStatus } from '../context/SystemStatusContext';
import type { RiskCategory } from '../types/api';

const PREDICTOR_GROUPS: Array<{ group: string; items: string[] }> = [
  { group: 'Rainfall', items: ['event rainfall', 'antecedent rainfall'] },
  { group: 'Terrain (DEM derivatives)', items: ['elevation', 'slope', 'aspect'] },
  { group: 'Environment', items: ['land cover', 'vegetation', 'soil', 'geology', 'drainage / hydrology'] },
  { group: 'Anthropogenic', items: ['roads', 'settlements'] },
  { group: 'History & space', items: ['historical landslide density', 'geographic location'] },
];

const METRICS: Array<{ name: string; what: string }> = [
  { name: 'Precision', what: 'Of the areas the model flags, how many truly have landslides.' },
  { name: 'Recall', what: 'Of the true historical landslides, how many the model recovers.' },
  { name: 'F1 Score', what: 'Balance of precision and recall in one figure.' },
  { name: 'ROC-AUC', what: 'Ranking ability across all thresholds.' },
  { name: 'PR-AUC', what: 'Ranking quality focused on the rare (landslide) class.' },
  { name: 'Confusion matrix', what: 'Full account of correct and incorrect calls per class.' },
];

const LIMITATIONS: string[] = [
  'This is a research/hackathon prototype — not an operational emergency-warning system.',
  'No trained model artifact ships with this interface; the UI displays only what the backend returns.',
  'Inventory coverage is uneven, so model skill is bounded by where landslides were actually recorded.',
  'Susceptibility is static: it does not answer “will a landslide occur today?” — that needs the rainfall trigger.',
  'Background (non-landslide) sampling strategy strongly influences apparent performance and is an active design decision.',
  'Category cut-offs (LOW → CRITICAL) are calibration decisions to be fixed during validation, not assumed by the UI.',
];

/** MODULE 06 — explains the registered methodology. Contains zero performance
 * numbers: metrics are named, never invented. */
export function ModelInsights() {
  const { health, apiStatus } = useSystemStatus();
  const modelLoaded = health?.modelLoaded;

  return (
    <div className="page">
      <PageHeader
        module="06"
        kicker="MODEL INSIGHTS"
        title="Susceptibility model — registered methodology"
        description="What the model is, what it learns from, how it is validated, and what it cannot tell you. No benchmark numbers appear anywhere on this page."
        tags={<DataClassTag dc="susceptibility" state={apiStatus === 'online' ? 'live' : 'offline'} />}
      />

      <NoticeBanner tone="warn" title="No trained model artifact is bundled with this interface" icon={<ShieldAlert size={16} />}>
        This page describes the methodology recorded in <span className="mono">docs/methodology.md</span>.
        Evaluation figures will be published only after training and spatial validation on the official
        dataset — the backend health probe currently reports the model artifact as{' '}
        <strong className="mono">
          {modelLoaded === true ? 'LOADED' : modelLoaded === false ? 'NOT LOADED' : 'NOT REPORTED'}
        </strong>
        .
      </NoticeBanner>

      <div className="grid grid--2">
        <Panel kicker="OBJECTIVE" title="What the model predicts">
          <p className="prose">
            A supervised binary classifier estimating the probability that a location is susceptible
            to landslide occurrence under given environmental conditions.
          </p>
          <div className="target-row">
            <div className="target-chip target-chip--pos mono">y = 1 · landslide occurrence</div>
            <div className="target-chip mono">y = 0 · non-landslide background</div>
          </div>
          <p className="prose">
            Background samples are carefully chosen non-event locations; the sampling strategy
            balances class imbalance against the risk of teaching the model to ignore plausible
            terrain.
          </p>
        </Panel>

        <Panel kicker="CANDIDATE MODELS" title="Algorithms under evaluation">
          <div className="model-card">
            <div className="model-card__head">
              <GitBranch size={15} aria-hidden="true" /> Random Forest
            </div>
            <p className="prose">
              An ensemble of decision trees over bootstrapped samples and feature subsets. Robust to
              heterogeneous terrain covariates, captures non-linear interactions (e.g. steep slope ×
              deforested land cover), and exposes feature importance for review.
            </p>
          </div>
          <div className="model-card">
            <div className="model-card__head">
              <GitBranch size={15} aria-hidden="true" /> XGBoost
            </div>
            <p className="prose">
              Gradient-boosted trees trained sequentially to correct residual errors. Typically strong
              on tabular geospatial features with careful regularisation; candidate for the final
              susceptibility estimator.
            </p>
          </div>
          <div className="panel-footnote">
            Model selection is decided by validation results on the official dataset — not by this UI.
          </div>
        </Panel>
      </div>

      <Panel kicker="FEATURE PIPELINE" title="Predictor variables">
        <p className="prose">
          Features follow the pipeline registered in <span className="mono">docs/methodology.md</span>{' '}
          and <span className="mono">docs/data_sources.md</span>. Rainfall and antecedent windows are
          engineered in <span className="mono">src/features/rainfall.py</span>; terrain derivatives
          (slope, aspect) in <span className="mono">src/features/terrain.py</span>.
        </p>
        <div className="predictor-grid">
          {PREDICTOR_GROUPS.map((g) => (
            <div className="predictor-group" key={g.group}>
              <div className="predictor-group__name">{g.group}</div>
              <div className="predictor-group__items">
                {g.items.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid--2">
        <Panel kicker="VALIDATION" title="Why spatial/temporal validation">
          <p className="prose">
            Randomly splitting landslide points into train/test sets leaks information: neighbouring
            points share terrain and rainfall history, so scores inflate. The project therefore
            evaluates with <strong>spatial and/or temporal hold-outs</strong> — training on some
            areas or periods and testing on disjoint ones — to measure how the model generalises to
            territory it has genuinely never seen.
          </p>
          <p className="prose">
            Only validation figures produced this way are meaningful; none exist in this repository
            yet, so none are displayed.
          </p>
        </Panel>

        <Panel kicker="EVALUATION" title="Metrics (names only — no values)">
          <ul className="metric-list">
            {METRICS.map((m) => (
              <li key={m.name}>
                <CircleDot size={13} aria-hidden="true" />
                <div>
                  <span className="metric-list__name">{m.name}</span>
                  <span className="metric-list__what">{m.what}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel kicker="RISK ENGINE" title="From probability to categories" tools={<DataClassTag dc="susceptibility" />}>
        <p className="prose">
          The ML probability is passed to a separate risk engine (<span className="mono">src/risk_engine/</span>)
          that converts model output and relevant environmental context into four prototype
          categories. Thresholds are calibration outputs, fixed during validation — the interface
          deliberately renders a continuous gauge until they are.
        </p>
        <div className="sev-row">
          {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as RiskCategory[]).map((c, i) => (
            <span key={c} className={`sev-chip sev-chip--${i}`}>
              {c}
            </span>
          ))}
        </div>
      </Panel>

      <Panel kicker="LIMITATIONS" title="What this system cannot do" tools={<BrainCircuit size={15} aria-hidden="true" />}>
        <ul className="limit-list">
          {LIMITATIONS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
