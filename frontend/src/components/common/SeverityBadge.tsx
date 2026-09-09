import { SEVERITY_META, UNCLASSIFIED_META } from '../../constants/dataClasses';
import type { RiskCategory } from '../../types/api';

interface SeverityBadgeProps {
  category: RiskCategory | null;
  /** Show the "Unclassified" placeholder when null. */
  showUnclassified?: boolean;
}

/** Colored severity badge for the four canonical categories. */
export function SeverityBadge({ category, showUnclassified = true }: SeverityBadgeProps) {
  if (!category) {
    if (!showUnclassified) return <span className="sev-badge sev-badge--none">—</span>;
    const meta = UNCLASSIFIED_META;
    return (
      <span className="sev-badge" style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}>
        <i className="sev-badge__dot" style={{ background: meta.color }} />
        Unclassified
      </span>
    );
  }
  const meta = SEVERITY_META[category];
  return (
    <span
      className={`sev-badge sev-badge--${category.toLowerCase()}`}
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
    >
      <i className="sev-badge__dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
