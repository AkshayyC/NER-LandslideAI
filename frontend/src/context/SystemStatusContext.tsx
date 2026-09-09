/**
 * Global backend connectivity status.
 *
 * Polls GET /api/health every 30 s and exposes the result to every page so the
 * UI can render explicit ONLINE / OFFLINE / CHECKING states. When the backend
 * is offline, pages gate their data queries and show professional offline
 * states — the UI never substitutes fabricated data.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { getHealth } from '../services/api';
import { API_BASE_URL } from '../services/client';
import type { ApiStatus, HealthSummary } from '../types/api';

const POLL_INTERVAL_MS = 30_000;

interface SystemStatusValue {
  apiStatus: ApiStatus;
  health: HealthSummary | null;
  lastChecked: Date | null;
  baseUrl: string;
  /** Force an immediate health check. */
  recheck: () => void;
}

const SystemStatusContext = createContext<SystemStatusValue | null>(null);

interface ProviderProps {
  children: ReactNode;
}

export function SystemStatusProvider({ children }: ProviderProps) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const busyRef = useRef(false);

  const check = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const h = await getHealth();
      setHealth(h);
      setApiStatus('online');
    } catch {
      setHealth(null);
      setApiStatus('offline');
    } finally {
      setLastChecked(new Date());
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  const value = useMemo<SystemStatusValue>(
    () => ({ apiStatus, health, lastChecked, baseUrl: API_BASE_URL, recheck: () => void check() }),
    [apiStatus, health, lastChecked, check],
  );

  return <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>;
}

export function useSystemStatus(): SystemStatusValue {
  const ctx = useContext(SystemStatusContext);
  if (!ctx) throw new Error('useSystemStatus must be used within SystemStatusProvider');
  return ctx;
}
