/**
 * Backend connectivity state, shared by every page.
 *
 * Polls GET /api/health every 30 s and exposes ONLINE / CHECKING / OFFLINE.
 * When the engine is unreachable the pages render an explicit offline state —
 * the UI never substitutes plausible-looking numbers.
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
import { API_DISPLAY_URL } from '../services/client';
import type { ApiStatus, Health } from '../types/api';

const POLL_INTERVAL_MS = 30_000;

interface SystemStatusValue {
  apiStatus: ApiStatus;
  health: Health | null;
  lastChecked: Date | null;
  baseUrl: string;
  recheck: () => void;
}

const SystemStatusContext = createContext<SystemStatusValue | null>(null);

export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [health, setHealth] = useState<Health | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const busyRef = useRef(false);

  const check = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setHealth(await getHealth());
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
    () => ({
      apiStatus,
      health,
      lastChecked,
      baseUrl: API_DISPLAY_URL,
      recheck: () => void check(),
    }),
    [apiStatus, health, lastChecked, check],
  );

  return <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>;
}

export function useSystemStatus(): SystemStatusValue {
  const ctx = useContext(SystemStatusContext);
  if (!ctx) throw new Error('useSystemStatus must be used within SystemStatusProvider');
  return ctx;
}
