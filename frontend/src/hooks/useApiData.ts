/**
 * Generic GET-query hook with loading / error / data states.
 *
 * `enabled` lets pages gate queries on backend connectivity: when false, the
 * hook stays idle ("blocked") and the page renders an offline state. Retry is
 * exposed so banners can re-trigger both the health check and the query.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../types/api';

export type QueryStatus = 'idle' | 'waiting' | 'loading' | 'success' | 'error' | 'blocked';

export interface ApiQuery<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  status: QueryStatus;
  refetch: () => void;
}

export function useApiData<T>(
  fetcher: ((signal: AbortSignal) => Promise<T>) | null,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): ApiQuery<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [attempt, setAttempt] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled || !fetcher) {
      setStatus(() => (!fetcher ? 'idle' : enabled ? 'blocked' : 'blocked'));
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const result = await fetcherRef.current!(controller.signal);
        if (cancelled) return;
        setData(result);
        setStatus('success');
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        if (err instanceof ApiError) {
          setError(err);
        } else {
          setError(new ApiError('network', err instanceof Error ? err.message : 'Unknown error'));
        }
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, attempt, fetcher === null]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, error, loading: status === 'loading', status, refetch };
}
