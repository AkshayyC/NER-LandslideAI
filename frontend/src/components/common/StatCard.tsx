import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  accent?: string;
  tag?: ReactNode;
}

/** Compact overview metric card. Renders "—" when no backend value exists. */
export function StatCard({ label, value, unit, sub, accent, tag }: StatCardProps) {
  return (
    <div className="stat-card" style={accent ? ({ '--stat-accent': accent } as React.CSSProperties) : undefined}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {tag}
      </div>
      <div className="stat-card__value">
        {value}
        {unit && <span className="stat-card__unit">{unit}</span>}
      </div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </div>
  );
}
