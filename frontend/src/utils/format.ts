/** Formatting helpers. All display values originate from the backend — these
 * functions only format; they never derive or substitute data. */

export function formatPercent(probability: number | null, digits = 1): string {
  if (probability === null || !Number.isFinite(probability)) return '—';
  return `${(probability * 100).toFixed(digits)}%`;
}

export function formatCoord(latitude: number | null, longitude: number | null, digits = 4): string {
  if (latitude === null || longitude === null) return '—';
  const latHem = latitude >= 0 ? 'N' : 'S';
  const lonHem = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(digits)}° ${latHem}, ${Math.abs(longitude).toFixed(digits)}° ${lonHem}`;
}

export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-IN');
}

export function formatShortDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTimeIST(date: Date, withSeconds = true): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

export function formatDateIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatRelativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—';
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/** Truncate long backend values for table cells. */
export function truncate(value: string, max = 42): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
