import { AlertTriangle, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSystemStatus } from '../../context/SystemStatusContext';
import type { ApiError } from '../../types/api';

/* ---------------------------- Loading ---------------------------- */

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 className="spinner" size={size} aria-hidden="true" />;
}

export function LoadingRows({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <div className="loading-rows" role="status" aria-label={label ?? 'Loading'}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} style={{ width: `${88 - i * 12}%` }} />
      ))}
      <span className="loading-rows__label">{label ?? 'Loading…'}</span>
    </div>
  );
}

/* ----------------------------- Empty ----------------------------- */

interface EmptyStateProps {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, hint, icon, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'empty empty--compact' : 'empty'}>
      <div className="empty__icon">{icon ?? <span className="empty__dash">—</span>}</div>
      <div className="empty__title">{title}</div>
      {hint && <div className="empty__hint">{hint}</div>}
    </div>
  );
}

/* ----------------------------- Error ----------------------------- */

export function errorMessage(err: ApiError): string {
  switch (err.kind) {
    case 'network':
      return 'Backend unreachable. The data connection is unavailable.';
    case 'timeout':
      return 'The backend did not respond in time.';
    case 'http':
      if (err.status === 404) return 'This endpoint is not implemented on the backend yet (HTTP 404).';
      if (err.status === 501) return 'This endpoint is not implemented on the backend yet (HTTP 501).';
      return `Backend returned HTTP ${err.status ?? 'error'}.`;
    case 'parse':
      return 'The backend returned an unexpected payload.';
  }
}

interface ErrorStateProps {
  error: ApiError | null;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ error, onRetry, compact = false }: ErrorStateProps) {
  return (
    <div className={compact ? 'error-state error-state--compact' : 'error-state'} role="alert">
      <div className="error-state__icon">
        <AlertTriangle size={compact ? 14 : 18} aria-hidden="true" />
      </div>
      <div>
        <div className="error-state__title">{error ? errorMessage(error) : 'Request failed.'}</div>
        {error && <div className="error-state__hint mono">{error.message}</div>}
      </div>
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--small" onClick={onRetry}>
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

/* ---------------------------- Offline ---------------------------- */

interface OfflineNoticeProps {
  compact?: boolean;
  onRetry?: () => void;
}

/**
 * Professional offline state. States clearly that the interface shows no data
 * because the backend is unreachable — never substitutes placeholder data.
 */
export function OfflineNotice({ compact = false, onRetry }: OfflineNoticeProps) {
  const { baseUrl, apiStatus, recheck } = useSystemStatus();
  return (
    <div className={compact ? 'offline offline--compact' : 'offline'} role="status">
      <div className="offline__icon">
        <WifiOff size={compact ? 14 : 18} aria-hidden="true" />
      </div>
      <div className="offline__body">
        <div className="offline__title">Backend offline — data connection unavailable</div>
        <div className="offline__hint">
          Live data requires the NER-LandslideAI API at <span className="mono">{baseUrl}</span>. No
          data is simulated while offline. Connectivity is re-checked automatically every 30&nbsp;s.
        </div>
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => {
          recheck();
          onRetry?.();
        }}
        disabled={apiStatus === 'checking'}
      >
        {apiStatus === 'checking' ? <Spinner size={13} /> : <RefreshCw size={13} />} Retry now
      </button>
    </div>
  );
}

/* ----------------------------- Notice ---------------------------- */

interface NoticeBannerProps {
  tone?: 'info' | 'warn' | 'danger';
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}

export function NoticeBanner({ tone = 'info', title, children, icon }: NoticeBannerProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'info' ? 'note' : 'alert'}>
      <div className="notice__icon">{icon ?? <AlertTriangle size={16} aria-hidden="true" />}</div>
      <div>
        <div className="notice__title">{title}</div>
        {children && <div className="notice__body">{children}</div>}
      </div>
    </div>
  );
}
