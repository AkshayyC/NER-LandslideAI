import type { ReactNode } from 'react';

interface PanelProps {
  kicker?: string;
  title?: string;
  tools?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  variant?: 'default' | 'map';
  className?: string;
}

/** Glass panel — the base surface of the command-center layout. */
export function Panel({ kicker, title, tools, children, flush = false, variant = 'default', className = '' }: PanelProps) {
  return (
    <section className={`panel ${variant === 'map' ? 'panel--map' : ''} ${className}`.trim()}>
      {(kicker || title || tools) && (
        <header className="panel__header">
          <div>
            {kicker && <div className="panel__kicker">{kicker}</div>}
            {title && <h2 className="panel__title">{title}</h2>}
          </div>
          {tools && <div className="panel__tools">{tools}</div>}
        </header>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  );
}
