import { formatPercent } from '../../utils/format';
import { SeverityBadge } from './SeverityBadge';
import type { RiskCategory } from '../../types/api';

interface ProbabilityGaugeProps {
  probability: number | null;
  category: RiskCategory | null;
}

/**
 * Continuous 0–100 % susceptibility readout. A smooth gradient track — not a
 * threshold ladder — so the gauge never implies category cut-offs that the
 * project has not calibrated yet.
 */
export function ProbabilityGauge({ probability, category }: ProbabilityGaugeProps) {
  const pct = probability !== null ? Math.min(100, Math.max(0, probability * 100)) : null;
  return (
    <div className="gauge">
      <div className="gauge__top">
        <span className="gauge__label">SUSCEPTIBILITY PROBABILITY</span>
        <span className="gauge__value mono">{formatPercent(probability)}</span>
      </div>
      <div className="gauge__track" role="img" aria-label={`Susceptibility probability ${formatPercent(probability)}`}>
        {pct !== null && <i className="gauge__marker" style={{ left: `${pct}%` }} aria-hidden="true" />}
      </div>
      <div className="gauge__scale mono" aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <div className="gauge__badge">
        <span className="gauge__badge-label">CATEGORY</span>
        <SeverityBadge category={category} />
      </div>
    </div>
  );
}
