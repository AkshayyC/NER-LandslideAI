import { SEVERITY_CUT_TEXT, SEVERITY_META } from '../../constants/dataClasses';
import { formatMm } from '../../utils/format';
import type { Thresholds } from '../../types/api';

const BANDS = ['MODERATE', 'HIGH', 'CRITICAL'] as const;

/**
 * Rainfall-threshold inversion.
 *
 * For each severity band: how much rain over 72 hours this slope needs, how far
 * today's intensity is from that number, and — when the terrain index alone
 * already sits in the band — an explicit "already" rather than a bare 0 mm.
 */
export function ThresholdTable({ thresholds }: { thresholds: Thresholds }) {
  return (
    <table className="thr">
      <thead>
        <tr>
          <th>Band</th>
          <th>72 h rainfall needed (mm)</th>
          <th>Margin vs now (mm)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {BANDS.map((band) => {
          const row = thresholds[band];
          const meta = SEVERITY_META[band];
          let status: string;
          if (row.reached_without_rain) status = 'already in band with no rain';
          else if (!row.plausible) status = 'beyond a plausible 72 h total';
          else if (row.exceeded) status = 'threshold already exceeded';
          else status = 'not yet reached';

          return (
            <tr key={band}>
              <td>
                <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                <span className="thr__flag"> {SEVERITY_CUT_TEXT[band]}</span>
              </td>
              <td>{row.reached_without_rain ? '0' : formatMm(row.rainfall_72h_mm)}</td>
              <td>{formatMm(row.margin_mm)}</td>
              <td className="thr__flag">{status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
