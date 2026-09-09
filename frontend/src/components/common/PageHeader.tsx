import type { ReactNode } from 'react';

interface PageHeaderProps {
  module?: string;
  kicker?: string;
  title: string;
  description?: string;
  tags?: ReactNode;
}

export function PageHeader({ module, kicker, title, description, tags }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__main">
        <div className="page-header__kicker">
          {module && <span className="page-header__module">{module}</span>}
          {kicker && <span>{kicker}</span>}
        </div>
        <h1 className="page-header__title">{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {tags && <div className="page-header__tags">{tags}</div>}
    </header>
  );
}
