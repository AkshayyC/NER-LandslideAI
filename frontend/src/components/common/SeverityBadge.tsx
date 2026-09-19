import { SEVERITY_META } from '../../constants/dataClasses';
import type { RiskCategory } from '../../types/api';

interface SeverityBadgeProps {
  category: RiskCategory | null | undefined;
  /** Compact form drops the leading dot (for dense tables). */
  compact?: boolean;
}

/** Severity chip for the four canonical classes. */
export function SeverityBadge({ category, compact = false }: SeverityBadgeProps) {
  if (!category) {
    return <span className="class-tag" style={{ borderColor: 'var(--line-1)', color: 'var(--text-3)' }}>—</span>;
  }
  const meta = SEVERITY_META[category];
  return (
    <span
      className="class-tag"
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}12` }}
      title={meta.summary}
    >
      {!compact && <i className="sev-badge__dot" style={{ background: meta.color }} />}
      {meta.label}
    </span>
  );
}
