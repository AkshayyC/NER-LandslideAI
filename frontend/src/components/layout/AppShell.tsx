import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { TopBar } from './TopBar';
import { OfflineNotice } from '../common/states';
import { useSystemStatus } from '../../context/SystemStatusContext';

/** Application frame: sidebar (desktop) / top-nav (mobile), top readout bar,
 * offline banner, routed content, and the global research-prototype footer. */
export function AppShell() {
  const { apiStatus } = useSystemStatus();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <Sidebar />
      <MobileNav />

      <div className="app-frame">
        <TopBar />

        {apiStatus === 'offline' && (
          <div className="offline-banner">
            <OfflineNotice compact />
          </div>
        )}

        <main className="app-content" id="main-content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <span>
            NER-LandslideAI — research/hackathon prototype. <strong>Not an operational emergency-warning
            system.</strong>{' '}
          </span>
          <span>
            All data shown is served by the project backend; the interface never simulates or estimates
            values.
          </span>
        </footer>
      </div>
    </div>
  );
}
