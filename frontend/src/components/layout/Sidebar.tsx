import { NavLink } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { NAV_ITEMS } from '../../constants/nav';
import { useSystemStatus } from '../../context/SystemStatusContext';

/** Command-center sidebar. Collapses to an icon rail at 1100px (CSS). */
export function Sidebar() {
  const { apiStatus } = useSystemStatus();

  return (
    <aside className="app-sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
            <rect width="32" height="32" rx="6" fill="rgba(76,194,255,0.08)" stroke="rgba(76,194,255,0.35)" />
            <path d="M5 24 L13 9 L18 17 L21 12 L27 24 Z" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M5 24 H27" stroke="var(--accent)" strokeWidth="1.2" opacity="0.55" />
          </svg>
        </span>
        <span className="brand-text">
          <span className="brand-name">
            NER<span className="brand-dash">-</span>LandslideAI
          </span>
          <span className="brand-sub">Landslide Intelligence · NE India</span>
        </span>
      </div>

      <nav className="side-nav" aria-label="Primary">
        <div className="side-nav__caption">MODULES</div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`.trim()}
              title={item.label}
            >
              <span className="side-nav__icon">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span className="side-nav__label">
                <span className="side-nav__module mono">{item.module}</span>
                {item.label}
              </span>
              <span className="side-nav__chev" aria-hidden="true" />
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className={`status-strip status-strip--${apiStatus}`}>
          <Activity size={13} aria-hidden="true" />
          <span className="mono">
            {apiStatus === 'online' ? 'DATA LINK ACTIVE' : apiStatus === 'offline' ? 'DATA LINK DOWN' : 'PROBING LINK'}
          </span>
          <i className="led" aria-hidden="true" />
        </div>
        <div className="sidebar-footer__meta">
          <span>RESEARCH PROTOTYPE</span>
          <span className="mono">UI 0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
