import { DATA_CLASSES } from '../../constants/dataClasses';
import type { DataClass } from '../../constants/dataClasses';

type TagState = 'live' | 'pending' | 'planned' | 'offline' | 'builtin';

interface DataClassTagProps {
  dc: DataClass;
  /** Optional explicit state override; defaults to the class delivery status. */
  state?: TagState;
  stateLabel?: string;
}

const STATE_LABELS: Record<TagState, string> = {
  live: 'LIVE DATA',
  pending: 'PENDING',
  planned: 'PLANNED',
  offline: 'OFFLINE',
  builtin: 'BUILT-IN LIST',
};

/** Colored provenance tag — the single visual device that distinguishes
 * Historical / Susceptibility / Trigger / Current data across every page. */
export function DataClassTag({ dc, state, stateLabel }: DataClassTagProps) {
  const meta = DATA_CLASSES[dc];
  const effective: TagState = state ?? (meta.status === 'available' ? 'live' : meta.status === 'pending' ? 'pending' : 'planned');
  const label = stateLabel ?? STATE_LABELS[effective];
  return (
    <span className="dct" style={{ '--dct-color': meta.color } as React.CSSProperties}>
      <i className="dct__bar" aria-hidden="true" />
      <span className="dct__name">{meta.label.toUpperCase()}</span>
      <span className="dct__state">{label}</span>
    </span>
  );
}
