import { matchPath, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../../constants/nav';
import { useSystemStatus } from '../../context/SystemStatusContext';
import { useClock } from '../../hooks/useClock';
import { formatDateIST, formatTimeIST } from '../../utils/format';
import { StatusPill } from '../common/StatusPill';

/** Top readout bar: current module, IST clock, connectivity pill. */
export function TopBar() {
  const { pathname } = useLocation();
  const { baseUrl } = useSystemStatus();
  const now = useClock();

  const current =
    NAV_ITEMS.find((item) =>
      item.path === '/' ? matchPath('/', pathname) : matchPath(item.path, pathname),
    ) ?? (matchPath('/location', pathname) ? NAV_ITEMS[2] : NAV_ITEMS[0]);

  return (
    <header className="app-topbar">
      <div className="topbar__crumb mono">
        <span>NER-LANDSLIDEAI</span>
        <span className="topbar__crumb-sep">/</span>
        <span>MODULE {current.module}</span>
        <span className="topbar__crumb-sep">/</span>
        <span className="topbar__crumb-current">{current.label.toUpperCase()}</span>
      </div>

      <div className="topbar__meta">
        <span className="chip chip--url mono" title={`Backend base URL: ${baseUrl}`}>
          {baseUrl}
        </span>
        <span className="clock" title="Indian Standard Time">
          <span className="clock__time mono">{formatTimeIST(now)}</span>
          <span className="clock__zone">
            IST
            <span className="clock__date">{formatDateIST(now)}</span>
          </span>
        </span>
        <StatusPill />
      </div>
    </header>
  );
}
