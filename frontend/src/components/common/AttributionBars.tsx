import { formatIndex } from '../../utils/format';
import type { Attribution } from '../../types/api';

/**
 * Exact additive attribution.
 *
 * The index is an affine transform of a weighted sum, so each bar is the
 * factor's actual contribution in index units — not a sensitivity estimate.
 * A percentage readout is given for quick scanning; the numbers are what the
 * model added.
 */
export function AttributionBars({ attribution }: { attribution: Attribution }) {
  const { factors, residual } = attribution;
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 1e-6);

  return (
    <div className="attr">
      {factors.map((factor) => (
        <div className="attr__row" key={factor.factor}>
          <span className="attr__label">
            {factor.label}
            <span className="attr__weight mono">w {factor.weight.toFixed(2)}</span>
          </span>
          <span className="attr__track">
            <span
              className="attr__fill"
              style={{ width: `${Math.max(1.5, (Math.abs(factor.contribution) / max) * 100)}%` }}
            />
          </span>
          <span className="attr__value">
            {factor.contribution.toFixed(3)}
            <span className="dim"> · {factor.contribution_pct.toFixed(1)}%</span>
          </span>
        </div>
      ))}

      <div className="attr__residual">
        <span>
          constant <span className="mono">{residual.constant.toFixed(3)}</span>
        </span>
        <span>
          {residual.gate_label.toLowerCase()} <span className="mono">{residual.gate.toFixed(3)}</span>
        </span>
        <span>
          unclipped index <span className="mono">{formatIndex(residual.unclipped_index)}</span>
        </span>
        <span>
          {Math.abs(residual.clipped) < 1e-9 ? (
            <>contributions sum exactly to the index</>
          ) : (
            <>
              clipped by the 0–1 bound: <span className="mono">{residual.clipped.toFixed(4)}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
