export interface BarListItem {
  label: string;
  value: number;
}

interface BarListProps {
  items: BarListItem[];
  /** Rendered after each value (e.g. " events"). */
  unit?: string;
}

/**
 * Horizontal bar list for backend-provided aggregates. Renders nothing when
 * the list is empty — no bars are invented when statistics are unavailable.
 */
export function BarList({ items, unit = '' }: BarListProps) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="barlist">
      {items.map((item) => (
        <div className="barlist__row" key={item.label}>
          <span className="barlist__label" title={item.label}>
            {item.label}
          </span>
          <span className="barlist__track">
            <span className="barlist__fill" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </span>
          <span className="barlist__value mono">
            {item.value.toLocaleString('en-IN')}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
