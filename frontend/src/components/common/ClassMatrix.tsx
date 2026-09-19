import { SEVERITY_META, SEVERITY_ORDER } from '../../constants/dataClasses';
import { formatShare } from '../../utils/format';
import type { ClassCounts } from '../../types/api';

interface ClassMatrixProps {
  counts: ClassCounts;
  total: number;
}

/** Stacked share-of-region bar plus the counts, one row per severity class. */
export function ClassMatrix({ counts, total }: ClassMatrixProps) {
  if (total <= 0) return null;
  return (
    <div>
      <div className="matrix" role="img" aria-label="Share of modelled cells by severity class">
        {SEVERITY_ORDER.map((category) => (
          <span
            key={category}
            className="matrix__seg"
            style={{ width: `${(counts[category] / total) * 100}%`, background: SEVERITY_META[category].color }}
            title={`${SEVERITY_META[category].label}: ${counts[category]} cells`}
          />
        ))}
      </div>
      <div className="matrix-legend">
        {SEVERITY_ORDER.map((category) => (
          <span className="matrix-legend__item" key={category}>
            <span className="matrix-legend__swatch" style={{ background: SEVERITY_META[category].color }} />
            {SEVERITY_META[category].label}
            <span className="matrix-legend__value">
              {counts[category].toLocaleString('en-IN')}
            </span>
            <span className="dim">{formatShare(counts[category] / total, 1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
