import type { ReactNode } from 'react';

interface KeyValueProps {
  items: Array<{ key: string; value: ReactNode; mono?: boolean }>;
  columns?: 1 | 2;
}

/** Dense mono readout rows — coordinates, IDs, timestamps. */
export function KeyValue({ items, columns = 1 }: KeyValueProps) {
  return (
    <dl className={`kv kv--${columns === 2 ? 'two' : 'one'}`}>
      {items.map((item) => (
        <div className="kv__row" key={item.key}>
          <dt className="kv__key">{item.key}</dt>
          <dd className={`kv__val ${item.mono !== false ? 'mono' : ''}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
