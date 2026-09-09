/**
 * Central HTTP client for the NER-LandslideAI backend.
 *
 * - Base URL comes from VITE_API_BASE_URL (default: http://127.0.0.1:8000).
 * - Every request has a timeout and supports external cancellation.
 * - Failures are typed (ApiError) so pages can render precise offline/error
 *   states instead of guessing.
 */
import { ApiError } from '../types/api';

function resolveBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8000';
}

/** Effective backend base URL (surfaced in the UI status panels). */
export const API_BASE_URL = resolveBaseUrl();

export interface RequestOptions {
  /** Per-request timeout in milliseconds. Default 8000. */
  timeoutMs?: number;
  /** External abort signal (e.g. from useApiData on unmount). */
  signal?: AbortSignal;
}

export async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const { timeoutMs = 8000, signal } = opts;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort);
  }

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (err) {
      // Distinguish an external cancel (caller went away) from real failures.
      if (signal?.aborted) throw err;
      if (controller.signal.aborted) {
        throw new ApiError('timeout', `Request timed out after ${timeoutMs} ms — ${path}`);
      }
      throw new ApiError(
        'network',
        `Cannot reach the backend at ${API_BASE_URL} (${path}). Is the API server running?`,
      );
    }

    if (!res.ok) {
      throw new ApiError('http', `Backend responded with HTTP ${res.status} — ${path}`, res.status);
    }

    const text = await res.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiError('parse', `Backend returned a non-JSON payload — ${path}`);
    }
  } finally {
    window.clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}
