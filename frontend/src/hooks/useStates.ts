/**
 * Region list hook.
 *
 * Prefers GET /api/states. While the backend is unavailable, falls back to the
 * project's built-in region definition (the eight NER states from README /
 * docs) so navigation keeps working. This is a *region definition*, not
 * scientific data, and the UI labels it as the built-in list.
 */
import { useApiData } from './useApiData';
import { getStates } from '../services/api';
import { NER_STATES } from '../constants/region';
import { useSystemStatus } from '../context/SystemStatusContext';
import type { StateInfo } from '../types/api';

export interface StatesResult {
  states: StateInfo[];
  source: 'backend' | 'builtin';
}

export function useStates(): StatesResult & { loading: boolean } {
  const { apiStatus } = useSystemStatus();
  const query = useApiData((signal) => getStates(signal), [apiStatus === 'online'], {
    enabled: apiStatus === 'online',
  });

  if (query.data && query.data.length > 0) {
    return { states: query.data, source: 'backend', loading: false };
  }
  return {
    states: NER_STATES.map((s) => ({ name: s.name, code: s.code })),
    source: 'builtin',
    loading: query.loading,
  };
}
