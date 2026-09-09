import { useSystemStatus } from '../../context/SystemStatusContext';
import type { ApiStatus } from '../../types/api';

const LABELS: Record<ApiStatus, string> = {
  checking: 'API CHECKING',
  online: 'API ONLINE',
  offline: 'API OFFLINE',
};

/** Header pill + status LED reflecting backend connectivity. */
export function StatusPill() {
  const { apiStatus } = useSystemStatus();
  return (
    <span className={`status-pill status-pill--${apiStatus}`}>
      <i className="led" aria-hidden="true" />
      {LABELS[apiStatus]}
    </span>
  );
}
