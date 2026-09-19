/**
 * HTTP client for the NER-LandslideAI API.
 *
 * The API and the UI are served from the same origin, so requests are relative
 * by default and no CORS negotiation happens at all. `VITE_API_BASE_URL` only
 * exists for the rare case of pointing the UI at a remote deployment.
 *
 * Every failure is typed (ApiError) so pages can distinguish "backend not
 * running" from "backend answered 500" from "backend sent junk".
 */
import { ApiError } from '../types/api';

function resolveBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, '');
  }
  return '';
}

/** Effective backend base URL. Empty string means "this origin". */
export const API_BASE_URL = resolveBaseUrl();

/** Human-readable location of the API, for status panels. */
export const API_DISPLAY_URL = API_BASE_URL || 'this origin (/api)';

export interface RequestOptions {
  /** Per-request timeout in milliseconds. Default 15000. */
  timeoutMs?: number;
  /** External abort signal (e.g. from useApiData on unmount). */
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 15000, signal } = opts;

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
      if (signal?.aborted) throw err;
      if (controller.signal.aborted) {
        throw new ApiError('timeout', `No answer within ${timeoutMs / 1000} s — ${path}`);
      }
      throw new ApiError('network', `Cannot reach the analysis engine (${path}).`);
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: unknown };
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        /* non-JSON error body — keep the status line */
      }
      throw new ApiError('http', detail, res.status);
    }

    const text = await res.text();
    if (!text.trim()) {
      throw new ApiError('parse', `Empty response body — ${path}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('parse', `Response was not JSON — ${path}`);
    }
  } finally {
    window.clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}
